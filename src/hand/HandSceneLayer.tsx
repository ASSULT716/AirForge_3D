// (조원호) Canvas 안 손 입력 레이어. SceneCanvas.tsx에는 <HandSceneLayer structure={structure} /> 한 줄만 둠.
// 손 커서 / 선택 피커·하이라이트 / 손 제스처 카메라(줌·팬·오빗)
// 카메라는 SceneCanvas의 <OrbitControls makeDefault>를 useThree().controls로 잡아서 조작 (CameraController 수정 불필요)
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { SolidPrimitive, StructureState } from '../types/cad';
import { cameraGesture, consumeCameraDrag, consumeCameraZoom } from '../services/cameraGesture';
import { expandSelection, type PickHit, type Selection } from '../services/selection';
import { setHover, useHandState, type SceneHandCursor } from './handStore';

const SELECT_GREEN = '#7dff8a';
const HOVER_YELLOW = '#ffd54a';
const UP_VEC = new THREE.Vector3(0, 1, 0);

export default function HandSceneLayer({ structure }: { structure: StructureState }) {
  const { cursor, hover, selected } = useHandState();
  return (
    <>
      <HandCamera />
      <SelectionPicker cursor={cursor} structure={structure} hover={hover} />
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
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;

  useFrame((_, delta) => {
    // 손 회전의 화면 축 → 월드 축 변환용 (HandTracker는 Canvas 밖이라 여기서 공유)
    const cq = camera.quaternion;
    cameraGesture.cameraQuat = [cq.x, cq.y, cq.z, cq.w];

    const ctrl = controls;
    if (!ctrl) return;

    const zoomLog = consumeCameraZoom(Math.min(delta, 0.05));
    if (zoomLog !== 0) {
      const offset = new THREE.Vector3().subVectors(camera.position, ctrl.target);
      offset.setLength(THREE.MathUtils.clamp(offset.length() * Math.exp(-zoomLog), 1.2, 18.0));
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
}: {
  cursor: SceneHandCursor | null;
  structure: StructureState;
  hover: Selection | null;
}) {
  const { camera, size } = useThree();
  const last = useRef<{ hitKey: string; selKey: string }>({ hitKey: '', selKey: '' });
  const tmp = useMemo(() => ({ v: new THREE.Vector3(), ndc: new THREE.Vector2(), ray: new THREE.Raycaster() }), []);
  const proxies = useMemo(() => buildPickProxies(structure), [structure]);

  useFrame(() => {
    const emit = (hit: PickHit | null) => {
      const hitKey = hit ? `${hit.kind}:${hit.id}` : '';
      if (hitKey === last.current.hitKey) return;
      last.current.hitKey = hitKey;
      const sel = hit ? expandSelection(structure, hit) : null;
      const selKey = sel?.key ?? '';
      if (selKey === last.current.selKey) return;
      last.current.selKey = selKey;
      setHover(sel);
    };
    if (!cursor?.selecting || structure.isSimulating) return emit(null);

    const { v, ndc, ray } = tmp;
    // 1) 정확 판정: 커서 중심을 지나는 레이에 맨 앞으로 맞은 메시
    ray.setFromCamera(toNdc(cursor.screen, ndc), camera);
    const hits = ray.intersectObjects(proxies, false);
    if (hits.length) return emit(hits[0].object.userData.pick as PickHit);

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
    emit(best);
  });

  return null;
}

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
    const geo = SOLID_GEO[so.shape] ?? SOLID_GEO.box;
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

function SolidShape({ shape }: { shape: SolidPrimitive['shape'] }) {
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
              <SolidShape shape={so.shape} />
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
      <Html position={[0, -0.35, 0]} center zIndexRange={[40, 0]} style={{ pointerEvents: 'none' }}>
        <div className="whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-cyan-200">
          예: "Y축으로 90도 돌려줘" / "X축 반바퀴"
        </div>
      </Html>
    </group>
  );
}
