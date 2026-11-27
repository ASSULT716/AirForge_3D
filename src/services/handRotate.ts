// (조원호) 움켜쥐기 회전: 손 방향 → 축 잠금 → 월드 축 회전 (docs/gesture-spec.md 5절)
//
// 좌표계
//   MediaPipe worldLandmarks: x = 카메라 영상 오른쪽(거울 아님), y = 아래, z = 카메라에서 멀어짐(= 사용자 쪽)
//   뷰(사용자) 좌표: x = 사용자 오른쪽, y = 위, z = 사용자 쪽(화면 밖)  →  (-x, -y, +z)
//   두 축 반전 = 180° 회전이라 손잡이 방향(오른손 좌표계)이 유지됨 → 손 회전이 그대로 화면 회전
import * as THREE from 'three';
import type { NodePoint, SolidPrimitive, StructureState } from '../types/cad';

export type Axis = 'x' | 'y' | 'z';
type Vec3 = [number, number, number];
interface P3 {
  x: number;
  y: number;
  z: number;
}

const VIEW_AXES = [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)];
const AXIS_NAMES: Axis[] = ['x', 'y', 'z'];

const toView = (p: P3) => new THREE.Vector3(-p.x, -p.y, p.z);

/**
 * 손 방향 쿼터니언 (뷰 좌표). 손가락 모양과 무관하게 손바닥 뼈대(손목·검지MCP·중지MCP·새끼MCP)만 사용
 * → 움켜쥐든 펴든 같은 방향이면 같은 값
 */
export function handQuat(w: P3[]): THREE.Quaternion {
  const wrist = toView(w[0]);
  const across = toView(w[17]).sub(toView(w[5])).normalize(); // 검지MCP → 새끼MCP
  const along = toView(w[9]).sub(wrist); // 손목 → 중지MCP
  const normal = new THREE.Vector3().crossVectors(across, along).normalize();
  const up = new THREE.Vector3().crossVectors(normal, across).normalize(); // along을 across에 직교화
  const m = new THREE.Matrix4().makeBasis(across, up, normal);
  return new THREE.Quaternion().setFromRotationMatrix(m);
}

/** q를 뷰 축 i 방향 성분(twist)만 남긴 회전각 (도, 부호 = 오른손 법칙) */
export function twistDeg(q: THREE.Quaternion, i: number): number {
  const v = [q.x, q.y, q.z][i];
  const w = q.w;
  // q와 -q는 같은 회전 → w ≥ 0 쪽으로 맞춤
  const s = w < 0 ? -1 : 1;
  return THREE.MathUtils.radToDeg(2 * Math.atan2(v * s, w * s));
}

/** 축 잠금 판정: 가장 큰 성분이 lockDeg 이상이고 두 번째보다 ratio배 이상이면 그 축 (뷰 축 번호) */
export function pickAxis(twists: number[], lockDeg: number, ratio: number): number | null {
  const abs = twists.map(Math.abs);
  const order = [0, 1, 2].sort((a, b) => abs[b] - abs[a]);
  const [first, second] = order;
  if (abs[first] < lockDeg) return null;
  if (abs[first] < abs[second] * ratio) return null;
  return first;
}

/** 뷰 축 → 카메라 방향 반영 → 가장 가까운 월드 축 + 부호 */
export function viewAxisToWorld(viewAxis: number, cameraQuat: readonly number[]): { axis: Axis; sign: 1 | -1 } {
  const cq = new THREE.Quaternion(cameraQuat[0], cameraQuat[1], cameraQuat[2], cameraQuat[3]);
  const v = VIEW_AXES[viewAxis].clone().applyQuaternion(cq);
  const comps = [v.x, v.y, v.z];
  const i = [0, 1, 2].reduce((best, k) => (Math.abs(comps[k]) > Math.abs(comps[best]) ? k : best), 0);
  return { axis: AXIS_NAMES[i], sign: comps[i] >= 0 ? 1 : -1 };
}

export const snapDeg = (deg: number, step: number) => Math.round(deg / step) * step;

/**
 * 회전 중 걸림(디텐트): step 배수 ±hold 안에서는 그 배수에 붙어 있고,
 * 벗어나면 남은 구간을 늘려서 다음 배수까지 이어줌 (연속·단조 → 튀지 않음)
 *   hold=4, step=15: 손 11°~19° → 15° 고정, 19°~22.5° → 15°~22.5°로 빠르게 넘어감
 */
export function detentDeg(deg: number, step: number, hold: number): number {
  const k = snapDeg(deg, step);
  const d = deg - k;
  const half = step / 2;
  if (Math.abs(d) <= hold) return k;
  return k + Math.sign(d) * ((Math.abs(d) - hold) * half) / (half - hold);
}

// ─────────────────────────────────────────────────────────────
// App 쪽: 회전 세션 (잡은 순간 원본 저장 → 매번 원본에 적용 → 오차 누적 없음)
// ─────────────────────────────────────────────────────────────
export interface RotateSession {
  center: Vec3;
  nodes: Map<string, NodePoint>;
  solids: Map<string, SolidPrimitive>;
}

export function startSession(s: StructureState, nodeIds: string[], solidIds: string[]): RotateSession {
  const nodes = new Map(s.nodes.filter((n) => nodeIds.includes(n.id)).map((n) => [n.id, n]));
  const solids = new Map((s.solids ?? []).filter((x) => solidIds.includes(x.id)).map((x) => [x.id, x]));
  const pts = [...[...nodes.values()].map((n) => n.position), ...[...solids.values()].map((x) => x.position)];
  const center: Vec3 = [0, 0, 0];
  for (const p of pts) for (let i = 0; i < 3; i++) center[i] += p[i] / (pts.length || 1);
  return { center, nodes, solids };
}

const GRID = 0.25;
const snapGrid = (v: number) => {
  const r = Math.round(v / GRID) * GRID;
  return r === 0 ? 0 : r;
};
const round4 = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
};

/**
 * 원본(세션)에 axis 기준 deg 회전 적용한 구조물 반환.
 * final: 확정 단계 → 90° 배수면 0.25 그리드 재스냅
 * isFixed는 그대로 유지 (프리셋 다리처럼 공중 벽체 앵커(y=1)도 있어서 높이로 재계산하면 지지점이 사라짐)
 * 회전으로 바닥(y<0) 아래로 내려가면 전체를 위로 올림
 */
export function applySession(s: StructureState, ses: RotateSession, axis: Axis, deg: number, final: boolean): StructureState {
  const q = new THREE.Quaternion().setFromAxisAngle(VIEW_AXES[AXIS_NAMES.indexOf(axis)], THREE.MathUtils.degToRad(deg));
  const c = new THREE.Vector3(...ses.center);
  const rot = (p: Vec3): Vec3 => {
    const v = new THREE.Vector3(...p).sub(c).applyQuaternion(q).add(c);
    return [v.x, v.y, v.z];
  };

  const nodePos = new Map<string, Vec3>();
  ses.nodes.forEach((n, id) => nodePos.set(id, rot(n.position)));
  const solidPos = new Map<string, Vec3>();
  ses.solids.forEach((x, id) => solidPos.set(id, rot(x.position)));

  // 바닥 아래로 내려간 만큼 전체를 올림 (노드 기준. 솔리드는 중심 기준이라 제외)
  const minY = Math.min(0, ...[...nodePos.values()].map((p) => p[1]));
  const lift = -minY;
  const onGrid = final && Math.abs(deg) % 90 === 0;
  const fix = (p: Vec3): Vec3 => {
    const lifted: Vec3 = [p[0], p[1] + lift, p[2]];
    return lifted.map((v) => (onGrid ? snapGrid(v) : round4(v))) as Vec3;
  };

  return {
    ...s,
    nodes: s.nodes.map((n) => {
      const p = nodePos.get(n.id);
      if (!p) return n;
      return { ...n, position: fix(p) };
    }),
    solids: (s.solids ?? []).map((x) => {
      const p = solidPos.get(x.id);
      const orig = ses.solids.get(x.id);
      if (!p || !orig) return x;
      const r0 = orig.rotation ?? [0, 0, 0];
      const qs = new THREE.Quaternion().setFromEuler(new THREE.Euler(r0[0], r0[1], r0[2]));
      const e = new THREE.Euler().setFromQuaternion(q.clone().multiply(qs));
      return { ...x, position: fix(p), rotation: [round4(e.x), round4(e.y), round4(e.z)] };
    }),
  };
}
