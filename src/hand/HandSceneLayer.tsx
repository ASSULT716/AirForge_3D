// (조원호) Canvas 안 손 입력 레이어. SceneCanvas.tsx에는 <HandSceneLayer structure={structure} /> 한 줄만 둠.
// 손 커서 / 선택 피커·하이라이트 / 손 제스처 카메라(줌·팬·오빗)
// 카메라는 SceneCanvas의 <OrbitControls makeDefault>를 useThree().controls로 잡아서 조작 (CameraController 수정 불필요)
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { Billboard, Line } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import type { NodePoint, SolidPrimitive, StructureState } from '../types/cad';
import { cameraGesture, consumeCameraDrag, consumeCameraZoom } from '../services/cameraGesture';
import { expandSelection, type PickHit, type Selection } from '../services/selection';
import { setHover, useHandState, type SceneHandCursor } from './handStore';

const SELECT_GREEN = '#7dff8a';
const HOVER_YELLOW = '#ffd54a';
/** 커서 링에서 이 픽셀 이내면 가리킨 것으로 봄 */
const PICK_PX = 40;
const UP_VEC = new THREE.Vector3(0, 1, 0);

export default function HandSceneLayer({ structure }: { structure: StructureState }) {
  const { cursor, hover, selected } = useHandState();
  return (
    <>
      <HandCamera />
      <SelectionPicker cursor={cursor} structure={structure} />
      {/* 시뮬 중엔 노드가 움직여서 하이라이트 위치가 어긋남 → 정지 상태에서만 표시 */}
      {!structure.isSimulating && hover && hover.key !== selected?.key && (
        <SelectionHighlight structure={structure} sel={hover} color={HOVER_YELLOW} />
      )}
      {!structure.isSimulating && selected && <SelectionHighlight structure={structure} sel={selected} color={SELECT_GREEN} />}
      {cursor && <HandCursor cursor={cursor} nodes={structure.nodes} />}
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

/** 손 커서: 핀치 시 노드가 찍힐 위치. 기존 노드에 겹치면 초록(병합), 핀치 중이면 빨강 */
function HandCursor({ cursor, nodes }: { cursor: SceneHandCursor; nodes: NodePoint[] }) {
  const [x, y, z] = cursor.position;
  const onNode = nodes.some((n) => Math.hypot(n.position[0] - x, n.position[1] - y, n.position[2] - z) < 0.15);
  const color = cursor.selecting ? SELECT_GREEN : cursor.pinching ? '#ff1e42' : onNode ? '#39ff88' : '#00f3ff';
  const r = cursor.pinching ? 0.09 : 0.14;

  return (
    <group renderOrder={10}>
      <Billboard position={cursor.position}>
        <mesh>
          <ringGeometry args={[r, r + 0.025, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.95} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh>
          <circleGeometry args={[r, 40]} />
          <meshBasicMaterial color={color} transparent opacity={0.18} depthTest={false} toneMapped={false} />
        </mesh>
      </Billboard>

      {/* 깊이 가늠용: 바닥까지 수직선 + 바닥 그림자 링 */}
      {y > 0 && (
        <Line points={[cursor.position, [x, 0, z]]} color={color} lineWidth={1} dashed dashSize={0.06} gapSize={0.06} transparent opacity={0.5} />
      )}
      <mesh position={[x, 0.005, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.1, 0.13, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.45} toneMapped={false} />
      </mesh>

      {/* 다음 핀치로 생길 빔 미리보기 (선택 모드에선 안 보임) */}
      {cursor.linkFrom && !cursor.selecting && (
        <Line points={[cursor.linkFrom, cursor.position]} color={color} lineWidth={2} dashed dashSize={0.1} gapSize={0.07} transparent opacity={0.8} depthTest={false} />
      )}
    </group>
  );
}

/**
 * 선택 커서가 화면에서 가장 가까이 겹친 요소 찾기 (화면 좌표 기준).
 * 사용자는 3D 깊이가 아니라 "링이 물체 위에 보이는지"로 조준하므로 투영 후 픽셀 거리로 판단.
 */
function SelectionPicker({ cursor, structure }: { cursor: SceneHandCursor | null; structure: StructureState }) {
  const { camera, size } = useThree();
  const last = useRef<{ hitKey: string; selKey: string }>({ hitKey: '', selKey: '' });
  const v = useMemo(() => new THREE.Vector3(), []);

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

    /** 월드 → 화면 픽셀. 카메라 뒤면 null */
    const toPx = (p: readonly number[]): [number, number] | null => {
      v.set(p[0], p[1], p[2]).project(camera);
      if (v.z > 1) return null;
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    };
    const c = toPx(cursor.position);
    if (!c) return emit(null);

    let best: PickHit | null = null;
    let bestD = PICK_PX;
    const nodePx = new Map<string, [number, number] | null>();
    for (const n of structure.nodes) {
      const q = toPx(n.position);
      nodePx.set(n.id, q);
      if (!q) continue;
      const d = Math.hypot(q[0] - c[0], q[1] - c[1]);
      if (d < bestD) [bestD, best] = [d, { kind: 'node', id: n.id }];
    }
    for (const b of structure.beams) {
      const a = nodePx.get(b.startNodeId);
      const e = nodePx.get(b.endNodeId);
      if (!a || !e) continue;
      // 점-선분 거리 (노드보다 살짝 불리하게 → 끝점 근처에선 노드 우선)
      const dx = e[0] - a[0], dy = e[1] - a[1];
      const len2 = dx * dx + dy * dy || 1e-6;
      const t = Math.max(0, Math.min(1, ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / len2));
      const d = Math.hypot(a[0] + dx * t - c[0], a[1] + dy * t - c[1]) + 4;
      if (d < bestD) [bestD, best] = [d, { kind: 'beam', id: b.id }];
    }
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    for (const so of structure.solids ?? []) {
      const q = toPx(so.position);
      if (!q) continue;
      // 화면상 반경: 중심에서 카메라 오른쪽으로 (최대 스케일 × 0.8)만큼 떨어진 점까지
      const r3 = Math.max(...so.scale) * 0.8;
      const edge = toPx([so.position[0] + right.x * r3, so.position[1] + right.y * r3, so.position[2] + right.z * r3]);
      const rPx = edge ? Math.hypot(edge[0] - q[0], edge[1] - q[1]) : 0;
      const d = Math.max(0, Math.hypot(q[0] - c[0], q[1] - c[1]) - rPx) + 8;
      if (d < bestD) [bestD, best] = [d, { kind: 'solid', id: so.id }];
    }
    emit(best);
  });

  return null;
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
