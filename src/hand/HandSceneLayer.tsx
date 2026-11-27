// (조원호) Canvas 안 손 입력 레이어. SceneCanvas.tsx에는 <HandSceneLayer structure={structure} /> 한 줄만 둠.
// 손 커서 / 선택 피커·하이라이트 / 손 제스처 카메라(줌·팬·오빗)
// 카메라는 SceneCanvas의 <OrbitControls makeDefault>를 useThree().controls로 잡아서 조작 (CameraController 수정 불필요)
import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { SolidPrimitive, StructureState } from '../types/cad';
import { cameraGesture, consumeCameraDrag, consumeCameraZoom } from '../services/cameraGesture';
import { expandSelection, type PickHit, type Selection } from '../services/selection';
import {
  DRAW_MODES,
  GRID,
  OFFSET_STEP,
  SCALE_STEP,
  scaleOp,
  solidAxisWorld,
  TAPER_STEP,
  canOffset,
  canTaper,
  isCore,
  describeOp,
  latheOf,
  taperOpOf,
  dominantAxis,
  maxOffset,
  moveOp,
  offsetOpOf,
  resolvePushPull,
  snapDist,
  type EditMode,
  type EditOp,
  type FaceTarget,
  type PickDetail,
  type Vec3,
} from '../services/sketchOps';
import { handStore, setHover, useHandState, type SceneHandCursor } from './handStore';
import { editBus, notePick, recentPick } from './editBus';
import { boreGeometry, latheFaceAt, latheGeometry } from '../services/latheShape';

const SELECT_GREEN = '#7dff8a';
const HOVER_YELLOW = '#ffd54a';
const UP_VEC = new THREE.Vector3(0, 1, 0);
/** 손 줌 거리 한계 (m) */
const ZOOM_MIN_DIST = 1.2;
const ZOOM_MAX_DIST = 50;
/** SceneCanvas 안개 기본값 (멀리 빼면 구조물이 안개에 묻히지 않게 카메라 거리 따라 밀어냄) */
const FOG_NEAR = 18;
const FOG_FAR = 40;

export default function HandSceneLayer({ structure }: { structure: StructureState }) {
  const { cursor, hover, selected, editMode, face, drag } = useHandState();
  return (
    <>
      <HandCamera />
      <SelectionPicker cursor={cursor} structure={structure} hover={hover} selected={selected} editMode={editMode} />
      <DragController structure={structure} />
      {!structure.isSimulating && selected && face && !drag && <FacePreview face={face} mode={editMode} />}
      {!structure.isSimulating && <BoreRings structure={structure} />}
      {/* 시뮬 중엔 노드가 움직여서 하이라이트 위치가 어긋남 → 정지 상태에서만 표시 */}
      {!structure.isSimulating && hover && hover.key !== selected?.key && (
        <SelectionHighlight structure={structure} sel={hover} color={HOVER_YELLOW} />
      )}
      {!structure.isSimulating && selected && <SelectionHighlight structure={structure} sel={selected} color={SELECT_GREEN} />}
      {!structure.isSimulating && selected && <SelectionAxes structure={structure} sel={selected} />}
      {cursor && <HandCursor cursor={cursor} hovering={!!hover} />}
    </>
  );
}

/** 손 제스처 줌(양손 벌리기/모으기) + 팬·오빗 ("장면을 잡고 끄는" 느낌) */
function HandCamera() {
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  useFrame((_, delta) => {
    // 손 회전의 화면 축 → 월드 축 변환용 (HandTracker는 Canvas 밖이라 여기서 공유)
    const cq = camera.quaternion;
    cameraGesture.cameraQuat = [cq.x, cq.y, cq.z, cq.w];

    const ctrl = controls;
    if (!ctrl) return;

    // 멀리 빼도 구조물이 보이게: 안개 시작·끝을 카메라 거리 뒤로 (가까우면 원래 값)
    const fog = scene.fog;
    if (fog instanceof THREE.Fog) {
      const dist = camera.position.distanceTo(ctrl.target);
      fog.near = Math.max(FOG_NEAR, dist + 8);
      fog.far = Math.max(FOG_FAR, dist * 2.5);
    }

    const zoomLog = consumeCameraZoom(Math.min(delta, 0.05));
    if (zoomLog !== 0) {
      const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(-zoomLog), ZOOM_MIN_DIST, ZOOM_MAX_DIST));
      camera.position.copy(ctrl.target).add(offset);
      ctrl.update();
    }

    const drag = consumeCameraDrag();
    if (drag.panX || drag.panY) {
      // 손을 화면 폭만큼 옮기면 장면도 (타깃 거리에서 보이는) 화면 폭만큼 이동
      const dist = camera.position.distanceTo(ctrl.target);
      const persp = camera as THREE.PerspectiveCamera;
      const visH = 2 * dist * Math.tan(THREE.MathUtils.degToRad((persp.fov ?? 45) / 2));
      const visW = visH * (persp.aspect ?? 16 / 9);
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
      const move = right.multiplyScalar(-drag.panX * visW).add(up.multiplyScalar(drag.panY * visH));
      camera.position.add(move);
      ctrl.target.add(move);
      ctrl.update();
    }
    if (drag.yawDeg || drag.pitchDeg) {
      const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
      const sph = new THREE.Spherical().setFromVector3(offset);
      sph.theta -= THREE.MathUtils.degToRad(drag.yawDeg);
      sph.phi = THREE.MathUtils.clamp(sph.phi - THREE.MathUtils.degToRad(drag.pitchDeg), 0.15, Math.PI / 2 - 0.04);
      offset.setFromSpherical(sph);
      camera.position.copy(ctrl.target).add(offset);
      ctrl.update();
    }
  });

  return null;
}

/** 커서 링 반지름 (px). 화면에서 항상 같은 크기 = 보조 판정 반경 */
const CURSOR_RING_PX = 14;
/** 링을 그릴 카메라로부터 거리 (near보다 멀면 아무 값이나 같음. 화면 고정 크기로 보정하므로) */
const CURSOR_DRAW_DIST = 2;
/** 보조 판정에서 지금 hover 중인 요소에 주는 이점 (px) → 경계에서 깜빡임 방지 */
const HOVER_STICKY_PX = 6;

/** 화면 좌표(0~1) → NDC */
const toNdc = (screen: readonly [number, number], out: THREE.Vector2) => out.set(screen[0] * 2 - 1, 1 - screen[1] * 2);

/**
 * 손 커서: 마우스 포인터처럼 화면에 고정된 링 (깊이 없음).
 * 카메라가 움직여도 화면 위치·크기가 그대로이도록 매 프레임 카메라 앞에 다시 배치.
 */
function HandCursor({ cursor, hovering }: { cursor: SceneHandCursor; hovering: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { camera, size } = useThree();
  const tmp = useMemo(() => ({ ndc: new THREE.Vector2(), ray: new THREE.Raycaster() }), []);

  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    tmp.ray.setFromCamera(toNdc(cursor.screen, tmp.ndc), camera);
    g.position.copy(tmp.ray.ray.origin).addScaledVector(tmp.ray.ray.direction, CURSOR_DRAW_DIST);
    g.quaternion.copy(camera.quaternion);
    // 거리 CURSOR_DRAW_DIST에서 1px에 해당하는 월드 길이 (원근 카메라 기준)
    const persp = camera as THREE.PerspectiveCamera;
    const pxWorld = (2 * CURSOR_DRAW_DIST * Math.tan(THREE.MathUtils.degToRad((persp.fov ?? 45) / 2))) / size.height;
    g.scale.setScalar(pxWorld);
  });

  const color = cursor.pinching ? '#ff1e42' : hovering ? HOVER_YELLOW : SELECT_GREEN;
  const r = cursor.pinching ? CURSOR_RING_PX * 0.65 : CURSOR_RING_PX;
  return (
    <group ref={ref} renderOrder={10}>
      <mesh renderOrder={10}>
        <ringGeometry args={[r, r + 2.5, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} toneMapped={false} />
      </mesh>
      {/* 정확 판정 지점 (레이가 지나가는 점) */}
      <mesh renderOrder={10}>
        <circleGeometry args={[2, 16]} />
        <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} toneMapped={false} />
      </mesh>
      <mesh renderOrder={10}>
        <circleGeometry args={[r, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthTest={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/**
 * 마우스처럼 선택: 카메라 → 커서 화면 좌표로 레이를 쏴서 맨 앞에 맞은 요소를 고름.
 * SceneCanvas 메시와 같은 크기·형태의 보이지 않는 피킹용 메시(씬에 추가 안 함)에 레이캐스트.
 * 노드·빔은 화면에서 몇 픽셀밖에 안 되므로, 정확히 안 맞으면 커서 링 안에 들어온 노드·빔으로 보조 판정.
 */
function SelectionPicker({
  cursor,
  structure,
  hover,
  selected,
  editMode,
}: {
  cursor: SceneHandCursor | null;
  structure: StructureState;
  hover: Selection | null;
  selected: Selection | null;
  editMode: EditMode;
}) {
  const { camera, size } = useThree();
  const last = useRef<{ hitKey: string; selKey: string }>({ hitKey: '', selKey: '' });
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), ndc: new THREE.Vector2(), ray: new THREE.Raycaster() }), []);
  const proxies = useMemo(() => buildPickProxies(structure), [structure]);

  useFrame(() => {
    // 드래그 중엔 가리킨 대상·면 고정 (커서가 끌려가며 다른 걸 가리켜도 무시)
    if (editBus.drag) return;
    const emit = (hit: PickDetail | null) => {
      notePick(hit);
      updateFace(hit);
      const hitKey = hit ? `${hit.kind}:${hit.id}` : '';
      if (hitKey === last.current.hitKey) return;
      last.current.hitKey = hitKey;
      const sel = hit ? expandSelection(structure, hit) : null;
      const selKey = sel?.key ?? '';
      if (selKey === last.current.selKey) return;
      last.current.selKey = selKey;
      setHover(sel);
    };
    // 선택된 구조물 위면 핀치로 늘릴 면 계산 (늘리기 모드). 같은 면이면 store 안 건드림
    const updateFace = (hit: PickDetail | null) => {
      const prev = handStore.get().face;
      let next: FaceTarget | null = null;
      if (hit && selected && (editMode === 'pushpull' || editMode === 'offset' || editMode === 'taper') && inSelection(selected, hit)) {
        next = resolvePushPull(structure, selected, hit);
        // 오프셋 = 박스 면·원기둥 끝면, 면 크기 = 원기둥 끝면
        if (editMode === 'offset') next = canOffset(structure, next) ? { ...next, key: `of:${next.key}` } : null;
        if (editMode === 'taper') next = canTaper(structure, next) ? { ...next, key: `tp:${next.key}` } : null;
      }
      if ((prev?.key ?? '') !== (next?.key ?? '') || (next && prev && prev.center.join() !== next.center.join())) {
        handStore.set({ face: next });
      }
    };
    if (!cursor?.selecting || structure.isSimulating) return emit(null);

    const { v, ndc, ray } = tmp;
    // 1) 정확 판정: 커서 중심을 지나는 레이에 맨 앞으로 맞은 메시
    ray.setFromCamera(toNdc(cursor.screen, ndc), camera);
    const hits = ray.intersectObjects(proxies, false);
    if (hits.length) {
      const h = hits[0];
      const pick = h.object.userData.pick as PickHit;
      const n = h.face?.normal;
      let normalLocal: Vec3 | undefined = pick.kind === 'solid' && n ? [n.x, n.y, n.z] : undefined;
      let latheFace: PickDetail['latheFace'];
      // 회전체 원기둥: 법선이 모서리에서 섞이므로 맞은 점 위치로 면 판정 (구멍 안쪽 = bore)
      const so = pick.kind === 'solid' ? (structure.solids ?? []).find((x) => x.id === pick.id) : undefined;
      if (so?.shape === 'cylinder' && so.lathe) {
        const local = h.object.worldToLocal(h.point.clone());
        latheFace = latheFaceAt(so.lathe, local);
        normalLocal = latheFace === 'top' ? [0, 1, 0] : latheFace === 'bottom' ? [0, -1, 0] : [local.x, 0, local.z];
      }
      return emit({ ...pick, point: [h.point.x, h.point.y, h.point.z], normalLocal, latheFace });
    }

    // 2) 보조 판정: 커서 링 반경 안의 노드·빔 (얇아서 정확히 맞추기 어려움)
    const toPx = (p: readonly number[]): [number, number] | null => {
      v.set(p[0], p[1], p[2]).project(camera);
      if (v.z > 1) return null;
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    };
    const c = [cursor.screen[0] * size.width, cursor.screen[1] * size.height];
    const hoverNodes = new Set(hover?.nodeIds);
    // 지금 hover 중인 구조물의 요소면 살짝 가깝게 쳐줌 (경계에서 왔다갔다 방지)
    const sticky = (nodeId: string) => (hoverNodes.has(nodeId) ? HOVER_STICKY_PX : 0);

    let best: PickHit | null = null;
    let bestD = CURSOR_RING_PX;
    const nodePx = new Map<string, [number, number] | null>();
    for (const n of structure.nodes) {
      const q = toPx(n.position);
      nodePx.set(n.id, q);
      if (!q) continue;
      const d = Math.hypot(q[0] - c[0], q[1] - c[1]) - sticky(n.id);
      if (d < bestD) [bestD, best] = [d, { kind: 'node', id: n.id }];
    }
    for (const b of structure.beams) {
      const a = nodePx.get(b.startNodeId);
      const e = nodePx.get(b.endNodeId);
      if (!a || !e) continue;
      const dx = e[0] - a[0], dy = e[1] - a[1];
      const len2 = dx * dx + dy * dy || 1e-6;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2));
      // 끝점 근처에선 노드 우선 (+2)
      const d = Math.hypot(a[0] + dx * t - c[0], a[1] + dy * t - c[1]) + 2 - sticky(b.startNodeId);
      if (d < bestD) [bestD, best] = [d, { kind: 'beam', id: b.id }];
    }
    if (!best) return emit(null);
    const b = best as PickHit;
    // 보조 판정은 맞은 점이 없음 → 노드 위치 / 빔 중점
    let point: Vec3 = [0, 0, 0];
    if (b.kind === 'node') point = [...(structure.nodes.find((n) => n.id === b.id)?.position ?? point)] as Vec3;
    else {
      const beam = structure.beams.find((x) => x.id === b.id);
      const a = structure.nodes.find((n) => n.id === beam?.startNodeId)?.position;
      const e = structure.nodes.find((n) => n.id === beam?.endNodeId)?.position;
      if (a && e) point = [(a[0] + e[0]) / 2, (a[1] + e[1]) / 2, (a[2] + e[2]) / 2];
    }
    emit({ ...b, point });
  });

  return null;
}

const inSelection = (sel: Selection, hit: PickHit) =>
  hit.kind === 'node' ? sel.nodeIds.includes(hit.id) : hit.kind === 'beam' ? sel.beamIds.includes(hit.id) : sel.solidIds.includes(hit.id);

// 피킹용 공유 지오메트리 (SceneCanvas 렌더 크기와 동일하게)
const PICK_GEO = {
  node: new THREE.SphereGeometry(0.05, 8, 8),
  fixedNode: new THREE.BoxGeometry(0.11, 0.11, 0.11),
  beam: new THREE.CylinderGeometry(1, 1, 1, 8), // 반지름은 scale로
};
const SOLID_GEO: Record<SolidPrimitive['shape'], THREE.BufferGeometry> = {
  sphere: new THREE.SphereGeometry(0.8, 16, 16),
  cone: new THREE.ConeGeometry(0.8, 1.4, 16),
  cylinder: new THREE.CylinderGeometry(0.7, 0.7, 1.2, 16),
  torus: new THREE.TorusGeometry(0.7, 0.25, 12, 24),
  box: new THREE.BoxGeometry(1, 1, 1),
  // 박공벽·쐐기벽: 피킹은 단위 박스로 근사 (SceneCanvas ExtrudeGeometry 바운딩과 동일)
  gable_wall: new THREE.BoxGeometry(1, 1, 1),
  wedge_wall: new THREE.BoxGeometry(1, 1, 1),
};
// 레이캐스트는 material.side만 봄 → 안쪽에서 쏴도 맞도록 양면
const PICK_MAT = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });

function buildPickProxies(s: StructureState): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const add = (geo: THREE.BufferGeometry, pick: PickHit, setup: (m: THREE.Mesh) => void) => {
    const m = new THREE.Mesh(geo, PICK_MAT);
    setup(m);
    m.userData.pick = pick;
    m.updateMatrixWorld(true);
    out.push(m);
  };
  const nodeMap = new Map(s.nodes.map((n) => [n.id, n]));
  for (const n of s.nodes) {
    add(n.isFixed ? PICK_GEO.fixedNode : PICK_GEO.node, { kind: 'node', id: n.id }, (m) => m.position.set(...n.position));
  }
  for (const b of s.beams) {
    const n1 = nodeMap.get(b.startNodeId);
    const n2 = nodeMap.get(b.endNodeId);
    if (!n1 || !n2) continue;
    const { mid, length, quat } = beamTransform(new THREE.Vector3(...n1.position), new THREE.Vector3(...n2.position));
    const r = b.radius ?? 0.032;
    add(PICK_GEO.beam, { kind: 'beam', id: b.id }, (m) => {
      m.position.copy(mid);
      m.quaternion.copy(quat);
      m.scale.set(r, length, r);
    });
  }
  for (const so of s.solids ?? []) {
    const geo = so.shape === 'cylinder' && so.lathe ? latheGeometry(so.lathe) : (SOLID_GEO[so.shape] ?? SOLID_GEO.box);
    add(geo, { kind: 'solid', id: so.id }, (m) => {
      m.position.set(...so.position);
      m.scale.set(...so.scale);
      const [rx, ry, rz] = so.rotation ?? [0, 0, 0];
      m.rotation.set(rx, ry, rz);
    });
  }
  return out;
}

// SceneCanvas 내부 함수와 동일 (공유 파일 export 안 건드리려고 복제)
function beamTransform(p1: THREE.Vector3, p2: THREE.Vector3) {
  const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
  const diff = new THREE.Vector3().subVectors(p2, p1);
  const length = Math.max(0.005, diff.length());
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, diff.clone().normalize());
  return { mid, length, quat };
}

function SolidShape({ shape, lathe }: { shape: SolidPrimitive['shape']; lathe?: SolidPrimitive['lathe'] }) {
  if (shape === 'cylinder' && lathe) return <primitive object={latheGeometry(lathe)} attach="geometry" dispose={null} />;
  if (shape === 'sphere') return <sphereGeometry args={[0.8, 24, 24]} />;
  if (shape === 'cone') return <coneGeometry args={[0.8, 1.4, 20]} />;
  if (shape === 'cylinder') return <cylinderGeometry args={[0.7, 0.7, 1.2, 24]} />;
  if (shape === 'torus') return <torusGeometry args={[0.7, 0.25, 16, 32]} />;
  return <boxGeometry args={[1, 1, 1]} />;
}

/** 선택·hover 표시: 원래 메시 위에 반투명 발광 껍데기를 덧그림 (기존 렌더링 코드는 그대로) */
function SelectionHighlight({ structure, sel, color }: { structure: StructureState; sel: Selection; color: string }) {
  const nodeSet = new Set(sel.nodeIds);
  const beamSet = new Set(sel.beamIds);
  const solidSet = new Set(sel.solidIds);
  const nodeMap = new Map(structure.nodes.map((n) => [n.id, n]));
  const mat = <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} toneMapped={false} />;

  return (
    <group>
      {structure.nodes
        .filter((n) => nodeSet.has(n.id))
        .map((n) => (
          <mesh key={n.id} position={n.position}>
            <sphereGeometry args={[0.15, 16, 16]} />
            {mat}
          </mesh>
        ))}
      {structure.beams
        .filter((b) => beamSet.has(b.id))
        .map((b) => {
          const n1 = nodeMap.get(b.startNodeId);
          const n2 = nodeMap.get(b.endNodeId);
          if (!n1 || !n2) return null;
          const { mid, length, quat } = beamTransform(new THREE.Vector3(...n1.position), new THREE.Vector3(...n2.position));
          const r = (b.radius ?? 0.04) * 2.4;
          return (
            <mesh key={b.id} position={mid} quaternion={quat} scale={[1, length, 1]}>
              <cylinderGeometry args={[r, r, 1, 12]} />
              {mat}
            </mesh>
          );
        })}
      {(structure.solids ?? [])
        .filter((so) => solidSet.has(so.id))
        .map((so) => (
          <group key={so.id} position={so.position} scale={so.scale} rotation={so.rotation ?? [0, 0, 0]}>
            <mesh scale={[1.06, 1.06, 1.06]}>
              <SolidShape shape={so.shape} lathe={so.lathe} />
              <meshBasicMaterial color={color} wireframe transparent opacity={0.8} toneMapped={false} />
            </mesh>
          </group>
        ))}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// 선택 시 회전축 표시: 무게중심(회전 중심)에서 X/Y/Z 화살표 + "X축" 라벨 → 음성으로 축 이름 말하기 쉽게
// ─────────────────────────────────────────────────────────────
const AXIS_GIZMO: Array<{ name: string; color: string; dir: THREE.Vector3 }> = [
  { name: 'X축', color: '#ff5566', dir: new THREE.Vector3(1, 0, 0) },
  { name: 'Y축', color: '#55ff88', dir: new THREE.Vector3(0, 1, 0) },
  { name: 'Z축', color: '#4d9bff', dir: new THREE.Vector3(0, 0, 1) },
];

function SelectionAxes({ structure, sel }: { structure: StructureState; sel: Selection }) {
  const c = new THREE.Vector3(...sel.center);
  // 화살표 길이: 선택 묶음 크기 + 여유 (작은 구조물도 보이게 최소 1m)
  const nodeSet = new Set(sel.nodeIds);
  const solidSet = new Set(sel.solidIds);
  let radius = 0;
  for (const n of structure.nodes) if (nodeSet.has(n.id)) radius = Math.max(radius, c.distanceTo(new THREE.Vector3(...n.position)));
  for (const so of structure.solids ?? []) {
    if (!solidSet.has(so.id)) continue;
    const half = Math.max(...so.scale) / 2;
    radius = Math.max(radius, c.distanceTo(new THREE.Vector3(...so.position)) + half);
  }
  const len = Math.max(1, radius + 0.6);

  return (
    <group position={c} renderOrder={1000}>
      {AXIS_GIZMO.map(({ name, color, dir }) => {
        const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, dir);
        const mat = <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={0.9} toneMapped={false} />;
        return (
          <group key={name} quaternion={quat}>
            {/* 음수 방향은 흐리게 (축이 양쪽으로 관통한다는 표시) */}
            <mesh position={[0, -len / 2, 0]} renderOrder={1000}>
              <cylinderGeometry args={[0.012, 0.012, len, 6]} />
              <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={0.3} toneMapped={false} />
            </mesh>
            <mesh position={[0, len / 2, 0]} renderOrder={1000}>
              <cylinderGeometry args={[0.025, 0.025, len, 8]} />
              {mat}
            </mesh>
            <mesh position={[0, len + 0.09, 0]} renderOrder={1000}>
              <coneGeometry args={[0.07, 0.18, 12]} />
              {mat}
            </mesh>
            <Html position={[0, len + 0.35, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
              <div
                style={{ color, borderColor: color }}
                className="whitespace-nowrap rounded border bg-black/70 px-1.5 py-0.5 font-mono text-[12px] font-bold"
              >
                {name}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

// ─────────────────────────────────────────────────────────────
// 핀치 드래그 편집 (스케치업 푸시풀 · 이동 · 복사)
//   거리 = 카메라→커서 레이와 "끄는 축 직선" 사이 최근접점의 직선 위 위치 차이 (스케치업과 같은 방식)
//   → 화면 비율이 아니라 실제 미터 단위로 커서 밑 면이 따라옴. 0.25m 스냅이라 20fps 떨림에도 안정
// ─────────────────────────────────────────────────────────────
/** 이만큼(px) 끌어야 편집 시작 (핀치만 하고 놓으면 선택만) */
const DRAG_ARM_PX = 12;
/** 이동·복사: 이만큼 끌면 끄는 방향과 가장 가까운 월드 축으로 고정 */
const DRAG_AXIS_PX = 24;
/** 놓는 순간 손가락 벌리며 커서가 흔들림 → 이만큼 이전 거리로 확정 */
const RELEASE_LOOKBACK_MS = 110;
/** 끄는 축이 시선과 거의 평행(면이 카메라를 정면으로 봄)이면 손 위아래 이동으로 대신 */
const PARALLEL_DOT = 0.96;

const AXIS_COLOR = ['#ff5566', '#55ff88', '#4d9bff'];
const dirColor = (d: Vec3) => {
  const { axis } = dominantAxis(d);
  return Math.abs(d[axis]) > 0.98 ? AXIS_COLOR[axis] : '#ff9f43';
};

interface DragSession {
  id: number;
  mode: EditMode;
  sel: Selection;
  origin: Vec3;
  /** 축 정해지기 전 (이동·복사) null */
  dir: Vec3 | null;
  op: EditOp | null;
  /** 시선과 평행 → 화면 세로 이동으로 거리 */
  parallel: boolean;
  /** 오프셋: 커서가 가리키는 면 위 점 → 가장 가까운 테두리까지 거리 */
  plane: { center: Vec3; normal: Vec3; u: Vec3; v: Vec3; radius?: number; max: number } | null;
  /** 거리 스냅 단위 (오프셋 안쪽 면은 얇은 벽 안에서 파야 하므로 5cm) */
  step: number;
  /** 그리기: 그릴 평면 높이 + 시작 모서리(그리드 스냅) */
  draw: { y: number; a: [number, number] } | null;
  /** 스케일·면 크기: 기준 중심의 화면 위치(px) */
  scalePx: [number, number] | null;
  /** 면 크기 (원기둥 끝면 비율) */
  taper: boolean;
  t0: number;
  armed: boolean;
  dist: number;
  hist: Array<{ t: number; d: number }>;
}

interface DragViewState {
  origin: Vec3;
  dir: Vec3 | null;
  dist: number;
  label: string;
  /** 오프셋: 축 안내선 없이 라벨만 */
  flat: boolean;
}

function DragController({ structure }: { structure: StructureState }) {
  const { camera, size } = useThree();
  const ses = useRef<DragSession | null>(null);
  const [view, setView] = useState<DragViewState | null>(null);
  const tmp = useMemo(() => ({ ndc: new THREE.Vector2(), ray: new THREE.Raycaster(), v: new THREE.Vector3() }), []);

  /** 화면 좌표(0~1)의 레이와 직선(origin + dir·t)의 최근접점 t */
  const lineParam = (screen: readonly [number, number], origin: Vec3, dir: Vec3) => {
    tmp.ray.setFromCamera(toNdc(screen, tmp.ndc), camera);
    const R = tmp.ray.ray.direction;
    const O = tmp.ray.ray.origin;
    const D = new THREE.Vector3(...dir);
    const w = new THREE.Vector3(...origin).sub(O);
    const b = D.dot(R);
    const denom = 1 - b * b;
    if (denom < 1e-4) return 0;
    return (b * R.dot(w) - D.dot(w)) / denom;
  };
  /** 시선과 평행한 축: 손을 화면 위로 = +, 원점 깊이에서 1px = 몇 m */
  const verticalParam = (screen: readonly [number, number], start: readonly [number, number], origin: Vec3) => {
    const persp = camera as THREE.PerspectiveCamera;
    const depth = camera.position.distanceTo(new THREE.Vector3(...origin));
    const mPerPx = (2 * depth * Math.tan(THREE.MathUtils.degToRad((persp.fov ?? 45) / 2))) / size.height;
    return -(screen[1] - start[1]) * size.height * mPerPx;
  };
  const isParallel = (origin: Vec3, dir: Vec3) => {
    const toCam = camera.position.clone().sub(new THREE.Vector3(...origin)).normalize();
    return Math.abs(toCam.dot(new THREE.Vector3(...dir))) > PARALLEL_DOT;
  };
  const toPx = (p: readonly number[]): [number, number] => {
    tmp.v.set(p[0], p[1], p[2]).project(camera);
    return [((tmp.v.x + 1) / 2) * size.width, ((1 - tmp.v.y) / 2) * size.height];
  };

  const setLine = (s: DragSession, dir: Vec3, start: readonly [number, number]) => {
    s.dir = dir;
    s.parallel = isParallel(s.origin, dir);
    s.t0 = s.parallel ? 0 : lineParam(start, s.origin, dir);
  };

  const publish = (s: DragSession, applied: number, through = false) => {
    const label = s.op ? describeOp(s.op, applied, through) : '끄는 방향으로 축 정하는 중';
    handStore.set({ drag: { label, dist: applied, waiting: !s.op } });
    setView({ origin: s.plane ? s.plane.center : s.origin, dir: s.dir, dist: s.plane ? 0 : applied, label, flat: !!s.plane });
  };
  /** 커서 레이 ∩ 수평면 y → (x, z). 평면을 못 맞추면 null */
  const groundPoint = (screen: readonly [number, number], y: number): [number, number] | null => {
    tmp.ray.setFromCamera(toNdc(screen, tmp.ndc), camera);
    const { origin: O, direction: R } = tmp.ray.ray;
    if (Math.abs(R.y) < 1e-4) return null;
    const t = (y - O.y) / R.y;
    if (t < 0) return null;
    return [O.x + R.x * t, O.z + R.z * t];
  };
  const g = (v: number) => snapDist(v);
  /** 커서 레이 ∩ 면 평면 → 가장 가까운 테두리까지 거리 (면 밖이면 0) */
  const offsetParam = (screen: readonly [number, number], pl: NonNullable<DragSession['plane']>) => {
    tmp.ray.setFromCamera(toNdc(screen, tmp.ndc), camera);
    const R = tmp.ray.ray.direction;
    const n = new THREE.Vector3(...pl.normal);
    const denom = R.dot(n);
    if (Math.abs(denom) < 1e-3) return 0;
    const c = new THREE.Vector3(...pl.center);
    const t = c.clone().sub(tmp.ray.ray.origin).dot(n) / denom;
    const q = tmp.ray.ray.origin.clone().addScaledVector(R, t).sub(c);
    // 원형 면: 테두리까지 = 반지름 - 중심에서 거리
    if (pl.radius !== undefined) return Math.max(0, pl.radius - q.sub(n.clone().multiplyScalar(q.dot(n))).length());
    const U = new THREE.Vector3(...pl.u);
    const V = new THREE.Vector3(...pl.v);
    const hu = U.length();
    const hv = V.length();
    const w = Math.min(hu - Math.abs(q.dot(U) / hu), hv - Math.abs(q.dot(V) / hv));
    return Math.max(0, w);
  };

  useFrame(() => {
    const inp = editBus.drag;
    let s = ses.current;

    // 새 드래그 시작
    if (inp && !inp.ended && (!s || s.id !== inp.id)) {
      const { selected, editMode } = handStore.get();
      // 그리기 (선택 없이): 가리킨 솔리드 윗면 위에, 아니면 바닥(y=0)에
      if (DRAW_MODES.has(editMode) && !structure.isSimulating) {
        const hit = recentPick();
        let y = 0;
        if (hit?.kind === 'solid' && hit.normalLocal) {
          const so = (structure.solids ?? []).find((x) => x.id === hit.id);
          const { axis, sign } = dominantAxis(hit.normalLocal);
          if (so && solidAxisWorld(so, axis, sign)[1] > 0.9) y = Math.round(hit.point[1] * 1e4) / 1e4;
        }
        const p = groundPoint(inp.start, y);
        if (!p) {
          editBus.drag = null;
          return;
        }
        const a: [number, number] = [g(p[0]), g(p[1])];
        s = {
          id: inp.id, mode: editMode, sel: selected!, origin: [a[0], y, a[1]], dir: [0, 1, 0], op: null,
          parallel: false, plane: null, step: GRID, draw: { y, a }, scalePx: null, taper: false, t0: 0, armed: true, dist: 0, hist: [],
        };
        ses.current = s;
        editBus.onEdit?.({ phase: 'start', op: null, dist: 0 });
        handStore.set({ face: null, drag: { label: editMode === 'rect' ? '끌어서 사각형' : '끌어서 원 (중심에서 바깥으로)', dist: 0, waiting: true } });
        return;
      }
      if (!selected || structure.isSimulating) {
        editBus.drag = null;
        return;
      }
      const hitRaw = recentPick();
      const hit = hitRaw && inSelection(selected, hitRaw) ? hitRaw : null;
      s = {
        id: inp.id,
        mode: editMode,
        sel: selected,
        origin: hit?.point ?? selected.center,
        dir: null,
        op: null,
        parallel: false,
        plane: null,
        step: GRID,
        draw: null,
        scalePx: null,
        taper: false,
        t0: 0,
        armed: false,
        dist: 0,
        hist: [],
      };
      if (editMode === 'pushpull') {
        const target = resolvePushPull(structure, selected, hit);
        if (!target) {
          editBus.drag = null;
          return;
        }
        s.op = target.op;
        if (target.op.kind === 'solid_face' && target.op.faces.some((f) => isCore(f.solidId))) s.step = OFFSET_STEP;
        setLine(s, target.dir, inp.start);
      } else if (editMode === 'scale') {
        s.op = scaleOp(structure, selected);
        s.dir = [0, 1, 0];
        s.origin = selected.center;
        s.scalePx = toPx(selected.center);
      } else if (editMode === 'taper') {
        const target = hit ? resolvePushPull(structure, selected, hit) : null;
        if (!canTaper(structure, target)) {
          editBus.drag = null;
          return;
        }
        s.op = taperOpOf(structure, target);
        s.dir = target.dir;
        s.origin = target.center;
        s.scalePx = toPx(target.center);
        s.taper = true;
      } else if (editMode === 'offset') {
        const target = hit ? resolvePushPull(structure, selected, hit) : null;
        if (!canOffset(structure, target) || (!target.quad && target.circle === undefined)) {
          editBus.drag = null;
          return;
        }
        const so = (structure.solids ?? []).find((x) => x.id === target.op.faces[0].solidId)!;
        s.op = offsetOpOf(target, structure);
        s.dir = target.dir;
        s.plane = {
          center: target.center,
          normal: target.dir,
          u: target.quad?.u ?? [0, 0, 0],
          v: target.quad?.v ?? [0, 0, 0],
          radius: target.circle,
          max: maxOffset(so, target.op.faces[0].axis),
        };
      }
      ses.current = s;
      editBus.onEdit?.({ phase: 'start', op: s.op, dist: 0 });
      handStore.set({ face: null });
      publish(s, 0);
      return;
    }
    if (!s) return;

    const now = performance.now();
    // 놓음 (또는 버스가 비워짐) → 확정
    if (!inp || inp.id !== s.id || inp.ended) {
      const target = now - RELEASE_LOOKBACK_MS;
      let d = s.dist;
      for (let i = s.hist.length - 1; i >= 0; i--) {
        if (s.hist[i].t <= target) {
          d = s.hist[i].d;
          break;
        }
        if (i === 0) d = s.hist[0].d;
      }
      // 말로 지정한 거리(m)는 그리기·스케일엔 해당 없음
      if (editBus.overrideDist !== null && !s.draw && !s.scalePx) d = editBus.overrideDist;
      editBus.onEdit?.({ phase: 'end', op: s.op, dist: s.op ? d : 0 });
      ses.current = null;
      if (editBus.drag?.id === s.id) editBus.drag = null;
      editBus.overrideDist = null;
      handStore.set({ drag: null });
      setView(null);
      return;
    }

    const cur = inp.screen;
    const startPx: [number, number] = [inp.start[0] * size.width, inp.start[1] * size.height];
    const curPx: [number, number] = [cur[0] * size.width, cur[1] * size.height];
    const moved = Math.hypot(curPx[0] - startPx[0], curPx[1] - startPx[1]);

    // 그리기: 시작 모서리 ~ 커서 (그리드 스냅). 도형이 바뀔 때만 미리보기 갱신
    if (s.draw) {
      const p = groundPoint(cur, s.draw.y);
      if (!p) return;
      const b: [number, number] = [g(p[0]), g(p[1])];
      const { y, a } = s.draw;
      const op: EditOp =
        s.mode === 'rect'
          ? { kind: 'rect', y, a, b }
          : { kind: 'circle', y, center: a, radius: g(Math.hypot(p[0] - a[0], p[1] - a[1])) };
      const key = JSON.stringify(op);
      if (s.op && JSON.stringify(s.op) === key) return;
      const res = editBus.onEdit?.({ phase: 'update', op, dist: 1 });
      s.op = op;
      s.dist = res && res.dist ? 1 : 0;
      s.hist.push({ t: now, d: s.dist });
      const label = s.dist ? describeOp(op, 1) : s.mode === 'rect' ? '한 칸(0.25m) 이상 끌기' : '반지름 0.25m 이상 끌기';
      handStore.set({ drag: { label, dist: s.dist, waiting: !s.dist } });
      const c: Vec3 = op.kind === 'rect' ? [(a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2] : [a[0], y, a[1]];
      setView({ origin: c, dir: [0, 1, 0], dist: 0, label, flat: true });
      return;
    }

    // 면 크기: 면 중심에서 커서까지 화면 거리 비율 → 반지름 비율 (0 = 뾰족)
    if (s.taper && s.scalePx && s.op?.kind === 'taper') {
      const r0 = Math.hypot(startPx[0] - s.scalePx[0], startPx[1] - s.scalePx[1]);
      const r1 = Math.hypot(curPx[0] - s.scalePx[0], curPx[1] - s.scalePx[1]);
      const base = s.op.base;
      const f = r0 > 30 ? r1 / r0 : 1 - (curPx[1] - startPx[1]) / 200;
      // 시작이 뾰족(0)이면 배율 대신 늘어난 만큼 더함
      let next = moved < DRAG_ARM_PX ? base : base > 0.05 ? base * f : f - 1;
      next = THREE.MathUtils.clamp(Math.round(next / TAPER_STEP) * TAPER_STEP, 0, 3);
      const d = Math.round((next - base) * 100) / 100;
      s.hist.push({ t: now, d });
      while (s.hist.length && now - s.hist[0].t > 600) s.hist.shift();
      if (d === s.dist && view) return;
      s.dist = d;
      const res = editBus.onEdit?.({ phase: 'update', op: s.op, dist: d });
      const label = describeOp(s.op, res ? res.dist : d);
      handStore.set({ drag: { label, dist: d, waiting: false } });
      setView({ origin: s.origin, dir: [0, 1, 0], dist: 0, label, flat: true });
      return;
    }

    // 스케일: 선택 중심에서 커서까지 화면 거리 비율 (잡은 점이 중심에 너무 가까우면 손 위아래로)
    if (s.scalePx && s.op) {
      const r0 = Math.hypot(startPx[0] - s.scalePx[0], startPx[1] - s.scalePx[1]);
      const r1 = Math.hypot(curPx[0] - s.scalePx[0], curPx[1] - s.scalePx[1]);
      let f = r0 > 30 ? r1 / r0 : 1 - (curPx[1] - startPx[1]) / 200;
      if (moved < DRAG_ARM_PX) f = 1;
      f = THREE.MathUtils.clamp(Math.round(f / SCALE_STEP) * SCALE_STEP, SCALE_STEP, 10);
      const d = Math.round((f - 1) * 100) / 100;
      s.hist.push({ t: now, d });
      while (s.hist.length && now - s.hist[0].t > 600) s.hist.shift();
      if (d === s.dist) return;
      s.dist = d;
      const res = editBus.onEdit?.({ phase: 'update', op: s.op, dist: d });
      const applied = res ? res.dist : d;
      const label = describeOp(s.op, applied);
      handStore.set({ drag: { label, dist: applied, waiting: false } });
      setView({ origin: s.origin, dir: [0, 1, 0], dist: 0, label, flat: true });
      return;
    }

    // 이동·복사: 끄는 방향과 화면에서 가장 나란한 월드 축
    if (!s.dir && moved > DRAG_AXIS_PX) {
      const o = toPx(s.origin);
      const v = [curPx[0] - startPx[0], curPx[1] - startPx[1]];
      let bestAxis = 0;
      let bestCos = -1;
      for (let i = 0; i < 3; i++) {
        const e = toPx(s.origin.map((x, k) => x + (k === i ? 1 : 0)));
        const sv = [e[0] - o[0], e[1] - o[1]];
        const len = Math.hypot(sv[0], sv[1]);
        if (len < 8) continue; // 화면에서 거의 점으로 보이는 축 (시선 방향)
        const cos = Math.abs((sv[0] * v[0] + sv[1] * v[1]) / (len * moved));
        if (cos > bestCos) [bestCos, bestAxis] = [cos, i];
      }
      const dir: Vec3 = [0, 0, 0];
      dir[bestAxis] = 1;
      setLine(s, dir, inp.start);
      s.op = moveOp(s.sel, dir, s.mode === 'copy');
      s.armed = true;
    }
    if (!s.dir || !s.op) return;
    if (!s.armed && moved > DRAG_ARM_PX) s.armed = true;

    let d = 0;
    if (editBus.overrideDist !== null) d = editBus.overrideDist;
    else if (s.armed && s.plane) {
      d = Math.min(snapDist(offsetParam(cur, s.plane), OFFSET_STEP), s.plane.max);
    } else if (s.armed) {
      const t = s.parallel ? verticalParam(cur, inp.start, s.origin) : lineParam(cur, s.origin, s.dir) - s.t0;
      d = snapDist(THREE.MathUtils.clamp(t, -30, 30), s.step);
    }
    s.hist.push({ t: now, d });
    while (s.hist.length && now - s.hist[0].t > 600) s.hist.shift();
    if (d === s.dist && view?.dir) return;
    s.dist = d;
    const res = editBus.onEdit?.({ phase: 'update', op: s.op, dist: d });
    publish(s, res ? res.dist : d, res?.through);
  });

  if (!view || !view.dir) return null;
  if (view.flat) {
    return (
      <Html position={view.origin} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded border border-[#ff9f43] bg-black/80 px-2 py-0.5 font-mono text-[14px] font-bold tabular-nums text-[#ff9f43]">
          {view.label}
        </div>
      </Html>
    );
  }
  return <DragGuide view={view} />;
}

/** 드래그 안내: 끄는 축 직선(양방향, 흐리게) + 시작점 → 현재 거리 화살표 + 치수 라벨 */
function DragGuide({ view }: { view: DragViewState }) {
  const dir = new THREE.Vector3(...view.dir!);
  const color = dirColor(view.dir!);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, dir);
  const o = new THREE.Vector3(...view.origin);
  const end = o.clone().addScaledVector(dir, view.dist);
  const mid = o.clone().addScaledVector(dir, view.dist / 2);
  const len = Math.abs(view.dist);
  const mat = (opacity: number) => <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={opacity} toneMapped={false} />;
  return (
    <group renderOrder={1001}>
      {/* 축 안내선 (양쪽 6m) */}
      <mesh position={o} quaternion={quat} renderOrder={1001}>
        <cylinderGeometry args={[0.008, 0.008, 12, 6]} />
        {mat(0.35)}
      </mesh>
      {len > 0 && (
        <mesh position={mid} quaternion={quat} renderOrder={1001}>
          <cylinderGeometry args={[0.03, 0.03, len, 8]} />
          {mat(0.95)}
        </mesh>
      )}
      <mesh position={o} renderOrder={1001}>
        <sphereGeometry args={[0.05, 12, 12]} />
        {mat(0.95)}
      </mesh>
      <Html position={end} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <div
          style={{ color, borderColor: color }}
          className="-translate-y-6 whitespace-nowrap rounded border bg-black/80 px-2 py-0.5 font-mono text-[14px] font-bold tabular-nums"
        >
          {view.label}
        </div>
      </Html>
    </group>
  );
}

/** 늘리기 모드에서 선택된 구조물을 가리키면: 늘어날 면(반투명) + 바깥 방향 화살표 + 안내 */
function FacePreview({ face, mode }: { face: FaceTarget; mode: EditMode }) {
  const offset = mode === 'offset';
  const color = dirColor(face.dir);
  const c = new THREE.Vector3(...face.center);
  const dir = new THREE.Vector3(...face.dir);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP_VEC, dir);
  const arrowLen = 0.7;
  const mat = (opacity: number) => <meshBasicMaterial color={color} depthTest={false} depthWrite={false} transparent opacity={opacity} side={THREE.DoubleSide} toneMapped={false} />;

  const quadGeo = useMemo(() => {
    if (!face.quad) return null;
    const u = new THREE.Vector3(...face.quad.u);
    const v = new THREE.Vector3(...face.quad.v);
    const pts = [u.clone().add(v), u.clone().sub(v), u.clone().negate().sub(v), u.clone().negate().add(v)];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    return g;
  }, [face]);
  const label =
    mode === 'taper'
      ? '핀치로 끌기 = 면 크기 (가운데로 = 뾰족, 밖으로 = 벌어짐)'
      : offset
        ? '핀치로 안쪽으로 끌기 = 테두리 남기고 안쪽 면'
        : face.op.kind === 'bore'
          ? '핀치로 밀기 = 파기 (끝까지 = 관통)'
          : face.op.kind === 'extrude'
            ? '핀치로 끌기 = 입체로 돌출'
            : '핀치로 끌기 = 면 늘리기';
  return (
    <group renderOrder={1001}>
      {quadGeo && (
        <mesh position={c} geometry={quadGeo} renderOrder={1001}>
          {mat(0.28)}
        </mesh>
      )}
      {face.circle !== undefined && face.circle > 0.01 && (
        <group position={c} quaternion={quat}>
          {/* 원형 면: 링 + 반투명 원판 (circleGeometry는 XY 평면 → 법선 Y로 눕힘) */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1001}>
            <circleGeometry args={[face.circle, 40]} />
            {mat(0.25)}
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} renderOrder={1001}>
            <ringGeometry args={[face.circle * 0.96, face.circle, 48]} />
            {mat(0.95)}
          </mesh>
        </group>
      )}
      <group position={c} quaternion={quat}>
        <mesh position={[0, arrowLen / 2, 0]} renderOrder={1001}>
          <cylinderGeometry args={[0.025, 0.025, arrowLen, 8]} />
          {mat(0.95)}
        </mesh>
        <mesh position={[0, arrowLen + 0.08, 0]} renderOrder={1001}>
          <coneGeometry args={[0.08, 0.18, 12]} />
          {mat(0.95)}
        </mesh>
      </group>
      <Html position={c.clone().addScaledVector(dir, arrowLen + 0.35)} center zIndexRange={[60, 0]} style={{ pointerEvents: 'none' }}>
        <div style={{ color, borderColor: color }} className="whitespace-nowrap rounded border bg-black/75 px-1.5 py-0.5 font-mono text-[12px] font-bold">
          {label}
        </div>
      </Html>
    </group>
  );
}

/** 깊이 0인 안쪽 원(오프셋만 하고 아직 안 민 것)은 모양 변화가 없어서 보이지 않음 → 테두리 선으로 표시 */
function BoreRings({ structure }: { structure: StructureState }) {
  const rings = (structure.solids ?? []).filter((so) => so.shape === 'cylinder' && so.lathe?.bore && so.lathe.bore.depth < 0.01);
  if (!rings.length) return null;
  return (
    <>
      {rings.map((so) => {
        const g = boreGeometry(latheOf(so))!;
        const r = g.innerAt(g.endY);
        return (
          <group key={so.id} position={so.position} scale={so.scale} rotation={so.rotation ?? [0, 0, 0]}>
            <mesh position={[0, g.endY + (so.lathe!.bore!.from === 'top' ? 0.002 : -0.002), 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r * 0.97, r, 48]} />
              <meshBasicMaterial color="#0f172a" side={THREE.DoubleSide} toneMapped={false} />
            </mesh>
          </group>
        );
      })}
    </>
  );
}
