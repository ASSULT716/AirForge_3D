// (조원호) 스케치업식 편집 연산 (순수 함수). 손 드래그·음성이 같은 연산을 씀 (docs/gesture-spec.md 7절)
//
//   solid_face : 솔리드 한 면을 법선 방향으로 밀고 당기기 (반대 면은 고정)
//   node_face  : 노드 구조물의 바운딩 박스 한 면에 있는 노드들을 밀고 당기기 (탑 높이 늘리기 등)
//   extrude    : 평면 구조물(바닥에 그린 도형 등)을 법선 방향으로 돌출 → 위·아래 + 세로 + 대각 빔 (트러스 삼각화)
//   move / copy: 선택 묶음을 한 축 방향으로 이동 / 복사본 이동
//   offset     : 박스 한 면 안쪽에 테두리를 남기고 안쪽 면을 만듦 (스케치업 오프셋)
//                → 박스를 박스 5개(안쪽 core + 테두리 4개, 모두 원래 깊이)로 쪼갬. 모양은 그대로
//                → 이후 core 면을 늘리기로 밀면 파이고(창문·문), 끝까지 밀면 관통(구멍), 당기면 튀어나옴
//
// 모든 연산은 "시작 시점 원본(base) + 거리 dist" → 결과. 드래그 중 매번 원본에 적용 → 오차 누적 없음
import * as THREE from 'three';
import type { BeamMember, LatheProfile, NodePoint, SolidPrimitive, StructureState } from '../types/cad';
import { DEFAULT_LATHE, LATHE_H, LATHE_R, boreGeometry, type LatheFace } from './latheShape';
import type { PickHit, Selection } from './selection';

export type Vec3 = [number, number, number];
export type AxisIdx = 0 | 1 | 2;
export type Sign = 1 | -1;

export const GRID = 0.25;
/** 면이 이보다 얇아지지 않게 (m) */
const MIN_EXTENT = 0.1;
/** 노드가 같은 면 위에 있다고 볼 거리 (m) */
const FACE_TOL = 0.05;
/** 평면 판정 허용 오차 (m) */
const PLANE_TOL = 0.03;

export type EditOp =
  | { kind: 'solid_face'; faces: Array<{ solidId: string; axis: AxisIdx; sign: Sign }> }
  | { kind: 'node_face'; nodeIds: string[]; axis: AxisIdx; sign: Sign }
  | { kind: 'extrude'; nodeIds: string[]; beamIds: string[]; normal: Vec3 }
  | { kind: 'move'; nodeIds: string[]; solidIds: string[]; dir: Vec3 }
  | { kind: 'copy'; nodeIds: string[]; beamIds: string[]; solidIds: string[]; dir: Vec3 }
  | { kind: 'offset'; solidId: string; axis: AxisIdx; sign: Sign }
  /** dist = 배율 - 1 (0 = 그대로). pivot = 선택 묶음 바닥 중심 (바닥에 붙은 채 커짐) */
  | { kind: 'scale'; nodeIds: string[]; solidIds: string[]; pivot: Vec3 }
  /** 사각형 그리기: 높이 y 평면 위 두 모서리 (x, z) → 얇은 박스 (dist는 1 = 생성) */
  | { kind: 'rect'; y: number; a: [number, number]; b: [number, number] }
  /** 원 그리기: 중심 (x, z) + 반지름 → 얇은 원기둥 */
  | { kind: 'circle'; y: number; center: [number, number]; radius: number }
  /** 원기둥 윗면/아랫면만 스케일 (스케치업 면 스케일). dist = 반지름 비율 변화량, base = 시작 비율 */
  | { kind: 'taper'; solidId: string; end: 'top' | 'bottom'; base: number }
  /** 원기둥 끝면 오프셋 = 안쪽 원 (dist = 테두리 두께 m) */
  | { kind: 'bore_offset'; solidId: string; end: 'top' | 'bottom' }
  /** 안쪽 원을 밀어 파기 (dist = 더 깊게 m, 끝까지 = 관통) */
  | { kind: 'bore'; solidId: string };

export type EditMode = 'pushpull' | 'offset' | 'move' | 'copy' | 'scale' | 'taper' | 'rect' | 'circle';
/** 면 스케일 비율 스냅 */
export const TAPER_STEP = 0.1;
/** 선택 없이 쓰는 그리기 모드 */
export const DRAW_MODES: ReadonlySet<EditMode> = new Set(['rect', 'circle']);
/** 새로 그린 도형 두께 (m) → 바로 윗면을 늘리기로 끌어 올림 */
export const DRAW_THICKNESS = 0.1;
/** 스케일 배율 스냅 */
export const SCALE_STEP = 0.1;

/** 오프셋 테두리 두께 스냅 (창틀 10~30cm 정도를 맞출 수 있게 그리드보다 촘촘히) */
export const OFFSET_STEP = 0.05;
/** 오프셋으로 만든 안쪽 면 솔리드 id 꼬리표 → 끝까지 밀면 관통(삭제) 허용 */
const CORE_TAG = '-core';
export const isCore = (id: string) => id.endsWith(CORE_TAG);

export const OP_LABEL: Record<EditOp['kind'], string> = {
  solid_face: '늘리기',
  node_face: '늘리기',
  extrude: '돌출',
  move: '이동',
  copy: '복사',
  offset: '오프셋',
  scale: '크기',
  taper: '면 크기',
  bore_offset: '오프셋',
  bore: '파기',
  rect: '사각형',
  circle: '원',
};

// ─────────────────────────────────────────────────────────────
// 작은 유틸
// ─────────────────────────────────────────────────────────────
const AXES: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0, 0, 1],
];
const round4 = (v: number) => {
  const r = Math.round(v * 1e4) / 1e4;
  return r === 0 ? 0 : r;
};
const r3 = (p: readonly number[]): Vec3 => [round4(p[0]), round4(p[1]), round4(p[2])];
const add = (a: readonly number[], b: readonly number[], k = 1): Vec3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scaleV = (a: readonly number[], k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
export const snapDist = (d: number, step = GRID) => {
  const r = Math.round(d / step) * step;
  return r === 0 ? 0 : round4(r);
};

/** 가장 큰 성분 축 + 부호 */
export function dominantAxis(v: readonly number[]): { axis: AxisIdx; sign: Sign } {
  const a = [0, 1, 2].reduce((best, i) => (Math.abs(v[i]) > Math.abs(v[best]) ? i : best), 0) as AxisIdx;
  return { axis: a, sign: v[a] >= 0 ? 1 : -1 };
}

/** 단위 축 벡터 (축 + 부호) */
export const axisVec = (axis: AxisIdx, sign: Sign = 1): Vec3 => scaleV(AXES[axis], sign);

// ─────────────────────────────────────────────────────────────
// 솔리드 크기 (SceneCanvas 지오메트리 기준 scale 1일 때 바운딩 박스)
// ─────────────────────────────────────────────────────────────
const BASE_EXTENT: Record<SolidPrimitive['shape'], Vec3> = {
  box: [1, 1, 1],
  sphere: [1.6, 1.6, 1.6],
  cylinder: [1.4, 1.2, 1.4],
  cone: [1.6, 1.4, 1.6],
  torus: [1.9, 1.9, 0.5],
  gable_wall: [1, 1, 1],
  wedge_wall: [1, 1, 1],
};
export const solidExtent = (so: SolidPrimitive): Vec3 => {
  const b = BASE_EXTENT[so.shape] ?? BASE_EXTENT.box;
  return [b[0] * so.scale[0], b[1] * so.scale[1], b[2] * so.scale[2]];
};
const solidQuat = (so: SolidPrimitive) => {
  const [x, y, z] = so.rotation ?? [0, 0, 0];
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
};
/** 솔리드 로컬 축 → 월드 방향 */
export function solidAxisWorld(so: SolidPrimitive, axis: AxisIdx, sign: Sign): Vec3 {
  const v = new THREE.Vector3(...axisVec(axis, sign)).applyQuaternion(solidQuat(so));
  return [v.x, v.y, v.z];
}
/** 월드 방향과 가장 가까운 솔리드 로컬 면 */
export function solidFaceFacing(so: SolidPrimitive, worldDir: readonly number[]): { axis: AxisIdx; sign: Sign } {
  const v = new THREE.Vector3(...worldDir).applyQuaternion(solidQuat(so).invert());
  return dominantAxis([v.x, v.y, v.z]);
}

// ─────────────────────────────────────────────────────────────
// 평면 판정 (노드들이 한 평면 위에 있으면 법선 반환)
// ─────────────────────────────────────────────────────────────
export function planeNormal(points: Vec3[]): Vec3 | null {
  if (points.length < 3) return null;
  const p0 = points[0];
  let p1 = points[1];
  let far = 0;
  for (const p of points) {
    const d = Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]);
    if (d > far) [far, p1] = [d, p];
  }
  if (far < 1e-3) return null;
  const e1 = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  let best = new THREE.Vector3();
  let bestLen = 0;
  for (const p of points) {
    const c = new THREE.Vector3().crossVectors(e1, new THREE.Vector3(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]));
    if (c.length() > bestLen) [bestLen, best] = [c.length(), c];
  }
  // 거의 일직선 (넓이가 너무 작음)
  if (bestLen < far * 0.05) return null;
  const n = best.normalize();
  for (const p of points) {
    if (Math.abs(n.dot(new THREE.Vector3(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]))) > PLANE_TOL) return null;
  }
  // 축에 거의 평행하면 정확히 축으로 (그리드 위 도형)
  const { axis, sign } = dominantAxis([n.x, n.y, n.z]);
  if (Math.abs([n.x, n.y, n.z][axis]) > 0.985) return axisVec(axis, 1);
  // 부호: 큰 성분이 +가 되게 (y면 위쪽)
  return sign > 0 ? [n.x, n.y, n.z] : [-n.x, -n.y, -n.z];
}

// ─────────────────────────────────────────────────────────────
// 늘리기 대상 해석: 선택 + 가리킨 지점 → 연산 · 표시용 면 정보
// ─────────────────────────────────────────────────────────────
export interface PickDetail extends PickHit {
  /** 레이가 맞은 월드 좌표 */
  point: Vec3;
  /** 솔리드 지오메트리 로컬 법선 (솔리드만) */
  normalLocal?: Vec3;
  /** 회전체 원기둥에서 맞은 면 (구멍 안쪽이면 'bore') */
  latheFace?: LatheFace;
}

export interface FaceTarget {
  op: EditOp;
  /** 화살표 시작점 = 면 중심 */
  center: Vec3;
  /** 끄는 방향 (월드 단위 벡터, + = 바깥) */
  dir: Vec3;
  /** 면 사각형 (반쪽 길이 벡터 u, v). 돌출은 없음 */
  quad?: { u: Vec3; v: Vec3 };
  /** 둥근 면 (원기둥 끝면·구멍): 반지름 (m). 법선 = dir */
  circle?: number;
  /** 같은 면이면 같은 key (리렌더 최소화) */
  key: string;
}

function nodeBounds(nodes: NodePoint[]) {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const n of nodes) {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], n.position[i]);
      max[i] = Math.max(max[i], n.position[i]);
    }
  }
  return { min, max };
}

/** 원기둥 끝면 반지름 비율 */
export const latheOf = (so: SolidPrimitive): LatheProfile => so.lathe ?? DEFAULT_LATHE;
/** 원기둥 끝면 실제 반지름 (m, x 스케일 기준) */
export const endRadius = (so: SolidPrimitive, end: 'top' | 'bottom') => LATHE_R * so.scale[0] * latheOf(so)[end];

function solidFaceTarget(so: SolidPrimitive, axis: AxisIdx, sign: Sign): FaceTarget {
  const ext = solidExtent(so);
  const n = solidAxisWorld(so, axis, sign);
  const [ua, va] = ([0, 1, 2] as AxisIdx[]).filter((i) => i !== axis);
  if (so.shape === 'cylinder' && axis === 1) {
    return {
      op: { kind: 'solid_face', faces: [{ solidId: so.id, axis, sign }] },
      center: add(so.position, n, ext[axis] / 2),
      dir: n,
      circle: endRadius(so, sign > 0 ? 'top' : 'bottom'),
      key: `sf:${so.id}:${axis}:${sign}`,
    };
  }
  return {
    op: { kind: 'solid_face', faces: [{ solidId: so.id, axis, sign }] },
    center: add(so.position, n, ext[axis] / 2),
    dir: n,
    quad: { u: scaleV(solidAxisWorld(so, ua, 1), ext[ua] / 2), v: scaleV(solidAxisWorld(so, va, 1), ext[va] / 2) },
    key: `sf:${so.id}:${axis}:${sign}`,
  };
}

function nodeFaceTarget(nodes: NodePoint[], axis: AxisIdx, sign: Sign): FaceTarget {
  const { min, max } = nodeBounds(nodes);
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  center[axis] = sign > 0 ? max[axis] : min[axis];
  const [ua, va] = ([0, 1, 2] as AxisIdx[]).filter((i) => i !== axis);
  return {
    op: { kind: 'node_face', nodeIds: nodes.map((n) => n.id), axis, sign },
    center,
    dir: axisVec(axis, sign),
    quad: { u: axisVec(ua, 1).map((v) => (v * (max[ua] - min[ua])) / 2) as Vec3, v: axisVec(va, 1).map((v) => (v * (max[va] - min[va])) / 2) as Vec3 },
    key: `nf:${axis}:${sign}`,
  };
}

/**
 * 늘리기(푸시풀) 대상.
 *   - 솔리드를 가리킴 → 그 솔리드의 가리킨 면
 *   - 노드·빔을 가리킴: 평면 구조물 → 돌출 / 입체 → 가리킨 점에서 가장 가까운 바운딩 박스 면
 * preferDir: 음성처럼 가리킨 점 없이 방향으로 면을 고를 때 (월드 방향)
 */
export function resolvePushPull(
  s: StructureState,
  sel: Selection,
  hit: PickDetail | null,
  preferDir?: Vec3,
): FaceTarget | null {
  const solids = (s.solids ?? []).filter((x) => sel.solidIds.includes(x.id));
  const nodes = s.nodes.filter((n) => sel.nodeIds.includes(n.id));

  // 솔리드 면
  const hitSolid = hit?.kind === 'solid' ? solids.find((x) => x.id === hit.id) : undefined;
  if (hitSolid && hit?.latheFace === 'bore' && hitSolid.lathe?.bore) return boreTarget(hitSolid);
  const solidOnly = !nodes.length && solids.length > 0;
  if (hitSolid || (solidOnly && !hit)) {
    const so = hitSolid ?? solids[0];
    const face = preferDir
      ? solidFaceFacing(so, preferDir)
      : hitSolid && hit?.normalLocal
        ? dominantAxis(hit.normalLocal)
        : ({ axis: 1, sign: 1 } as const);
    const t = solidFaceTarget(so, face.axis, face.sign);
    // 음성: 선택된 솔리드 전부 같은 방향 면으로
    if (preferDir && solids.length > 1) {
      t.op = { kind: 'solid_face', faces: solids.map((x) => ({ solidId: x.id, ...solidFaceFacing(x, preferDir) })) };
    }
    return t;
  }
  if (!nodes.length) return null;

  // 평면 → 돌출 (방향이 평면 안쪽이면 돌출 대신 면 늘리기)
  const n = planeNormal(nodes.map((x) => x.position));
  if (n && (!preferDir || Math.abs(dot(preferDir, n)) > 0.7)) {
    const normal = preferDir && dot(preferDir, n) < 0 ? scaleV(n, -1) : n;
    return {
      op: { kind: 'extrude', nodeIds: nodes.map((x) => x.id), beamIds: sel.beamIds, normal },
      center: sel.center,
      dir: normal,
      key: `ex:${sel.key}:${normal.map((v) => v.toFixed(2)).join(',')}`,
    };
  }

  // 입체 → 바운딩 박스 면
  if (preferDir) {
    const { axis, sign } = dominantAxis(preferDir);
    return nodeFaceTarget(nodes, axis, sign);
  }
  const { min, max } = nodeBounds(nodes);
  const p = hit?.point ?? sel.center;
  let best: { axis: AxisIdx; sign: Sign; d: number } = { axis: 1, sign: 1, d: Infinity };
  // 모서리 노드처럼 두 면에 똑같이 가까우면 윗면/아랫면 우선 (높이 늘리기가 가장 흔함)
  for (const axis of [1, 0, 2] as AxisIdx[]) {
    if (max[axis] - min[axis] < FACE_TOL) continue; // 두께 없는 축은 면 아님
    for (const sign of [1, -1] as Sign[]) {
      const d = Math.abs(p[axis] - (sign > 0 ? max[axis] : min[axis]));
      if (d < best.d) best = { axis, sign, d };
    }
  }
  return nodeFaceTarget(nodes, best.axis, best.sign);
}

// ─────────────────────────────────────────────────────────────
// 적용
// ─────────────────────────────────────────────────────────────
export interface OpResult {
  next: StructureState;
  /** 실제 적용된 거리 (최소 두께·지면 제한으로 줄어들 수 있음) */
  dist: number;
  /** 적용 후 선택할 요소 (복사본·돌출 포함한 덩어리) */
  focus?: PickHit;
  /** 안쪽 면을 끝까지 밀어 구멍이 뚫림 */
  through?: boolean;
}

const isFixedAt = (p: Vec3) => p[1] <= 0.05;

export function applyOp(base: StructureState, op: EditOp, dist: number, sid: string): OpResult {
  if (dist === 0) return { next: base, dist: 0 };
  switch (op.kind) {
    case 'solid_face':
      return pushPullSolids(base, op, dist);
    case 'node_face':
      return pushPullNodes(base, op, dist);
    case 'extrude':
      return extrude(base, op, dist, sid);
    case 'move':
      return translate(base, op.nodeIds, op.solidIds, op.dir, dist);
    case 'copy':
      return copy(base, op, dist, sid);
    case 'offset':
      return offsetSolid(base, op, dist, sid);
    case 'scale':
      return scaleSelection(base, op, dist);
    case 'rect':
    case 'circle':
      return drawShape(base, op, sid);
    case 'taper':
    case 'bore_offset':
    case 'bore':
      return editLathe(base, op, dist);
  }
}

/** 원기둥 단면 편집 (면 스케일 · 안쪽 원 · 파기) */
function editLathe(s: StructureState, op: Extract<EditOp, { kind: 'taper' | 'bore_offset' | 'bore' }>, dist: number): OpResult {
  const so = (s.solids ?? []).find((x) => x.id === op.solidId);
  if (!so || so.shape !== 'cylinder') return { next: s, dist: 0 };
  const lathe = { ...latheOf(so), ...(so.lathe?.bore ? { bore: { ...so.lathe.bore } } : {}) };
  let applied = dist;
  if (op.kind === 'taper') {
    // 구멍이 시작된 면은 0까지 줄이면 구멍이 사라짐 → 0.1까지만
    const min = lathe.bore?.from === op.end ? TAPER_STEP : 0;
    const next = Math.min(3, Math.max(min, round4(op.base + dist)));
    applied = round4(next - op.base);
    lathe[op.end] = next;
    // 두 끝이 다 0이면 형태가 사라짐
    if (lathe.top === 0 && lathe.bottom === 0) return { next: s, dist: 0 };
  } else if (op.kind === 'bore_offset') {
    const R = endRadius(so, op.end);
    if (R <= 0) return { next: s, dist: 0 };
    const w = Math.min(dist, R - 0.025);
    if (w <= 0) return { next: s, dist: 0 };
    applied = round4(w);
    lathe.bore = { from: op.end, wall: round4(w / R), depth: 0 };
  } else {
    if (!lathe.bore) return { next: s, dist: 0 };
    const H = LATHE_H * so.scale[1];
    const depth = Math.min(1, Math.max(0, lathe.bore.depth + dist / H));
    applied = round4((depth - lathe.bore.depth) * H);
    lathe.bore = { ...lathe.bore, depth: depth > 0.995 ? 1 : round4(depth) };
  }
  const plain = lathe.top === 1 && lathe.bottom === 1 && !lathe.bore;
  return {
    next: { ...s, solids: (s.solids ?? []).map((x) => (x.id === so.id ? { ...so, lathe: plain ? undefined : lathe } : x)) },
    dist: applied,
    through: op.kind === 'bore' && lathe.bore?.depth === 1,
  };
}

/** 그룹 이름 "박스 3" 처럼 아직 안 쓴 번호 */
function freshGroup(s: StructureState, prefix: string) {
  const used = new Set([...(s.solids ?? []).map((x) => x.groupName), ...s.nodes.map((n) => n.groupName)]);
  let k = 1;
  while (used.has(`${prefix} ${k}`)) k++;
  return `${prefix} ${k}`;
}

/** 사각형 크기 (그리드 스냅된 두 모서리) */
export const rectSize = (op: Extract<EditOp, { kind: 'rect' }>) => [Math.abs(op.b[0] - op.a[0]), Math.abs(op.b[1] - op.a[1])] as const;

function drawShape(s: StructureState, op: Extract<EditOp, { kind: 'rect' | 'circle' }>, sid: string): OpResult {
  const y = round4(op.y + DRAW_THICKNESS / 2);
  let so: SolidPrimitive;
  if (op.kind === 'rect') {
    const [w, d] = rectSize(op);
    if (w < GRID || d < GRID) return { next: s, dist: 0 };
    so = {
      id: `${sid}-box`,
      shape: 'box',
      position: r3([(op.a[0] + op.b[0]) / 2, y, (op.a[1] + op.b[1]) / 2]),
      scale: r3([w, DRAW_THICKNESS, d]),
      groupName: freshGroup(s, '박스'),
    };
  } else {
    if (op.radius < GRID) return { next: s, dist: 0 };
    const b = BASE_EXTENT.cylinder;
    so = {
      id: `${sid}-cyl`,
      shape: 'cylinder',
      position: r3([op.center[0], y, op.center[1]]),
      scale: r3([(op.radius * 2) / b[0], DRAW_THICKNESS / b[1], (op.radius * 2) / b[2]]),
      groupName: freshGroup(s, '원기둥'),
    };
  }
  so = { ...so, material: s.activeMaterial, isFixed: op.y <= 0.05 };
  return { next: { ...s, solids: [...(s.solids ?? []), so] }, dist: 1, focus: { kind: 'solid', id: so.id } };
}

/** 선택 묶음 바닥 중심 (스케일 기준점) */
export function selectionPivot(s: StructureState, sel: Selection): Vec3 {
  let minY = Infinity;
  for (const n of s.nodes) if (sel.nodeIds.includes(n.id)) minY = Math.min(minY, n.position[1]);
  for (const so of s.solids ?? []) if (sel.solidIds.includes(so.id)) minY = Math.min(minY, so.position[1] - solidExtent(so)[1] / 2);
  return [sel.center[0], Number.isFinite(minY) ? minY : sel.center[1], sel.center[2]];
}

export function scaleOp(s: StructureState, sel: Selection): EditOp {
  return { kind: 'scale', nodeIds: sel.nodeIds, solidIds: sel.solidIds, pivot: selectionPivot(s, sel) };
}

function scaleSelection(s: StructureState, op: Extract<EditOp, { kind: 'scale' }>, dist: number): OpResult {
  const f = Math.max(SCALE_STEP, round4(1 + dist));
  const nodeIds = new Set(op.nodeIds);
  const solidIds = new Set(op.solidIds);
  const p = op.pivot;
  const at = (x: readonly number[]) => r3([p[0] + (x[0] - p[0]) * f, p[1] + (x[1] - p[1]) * f, p[2] + (x[2] - p[2]) * f]);
  return {
    next: {
      ...s,
      nodes: s.nodes.map((n) => {
        if (!nodeIds.has(n.id)) return n;
        const q = at(n.position);
        // 바닥에 붙은 노드는 계속 지지, 공중 앵커는 유지
        return { ...n, position: q, isFixed: n.isFixed || isFixedAt(q) };
      }),
      solids: (s.solids ?? []).map((so) => (solidIds.has(so.id) ? { ...so, position: at(so.position), scale: r3(scaleV(so.scale, f)) } : so)),
    },
    dist: round4(f - 1),
  };
}

/** 오프셋 가능한 면인지 (박스만: 다른 도형은 면이 평평하지 않음) */
type SolidFaceTarget = FaceTarget & { op: Extract<EditOp, { kind: 'solid_face' }> };

/** 오프셋 가능한 면: 박스 면 / 원기둥 윗면·아랫면 (구멍이 아직 없을 때) */
export function canOffset(s: StructureState, t: FaceTarget | null): t is SolidFaceTarget {
  if (!t || t.op.kind !== 'solid_face' || t.op.faces.length !== 1) return false;
  const f = t.op.faces[0];
  const so = (s.solids ?? []).find((x) => x.id === f.solidId);
  if (so?.shape === 'box') return true;
  return so?.shape === 'cylinder' && f.axis === 1 && !so.lathe?.bore && latheOf(so)[f.sign > 0 ? 'top' : 'bottom'] > 0.05;
}
export function offsetOpOf(t: SolidFaceTarget, s?: StructureState): EditOp {
  const f = t.op.faces[0];
  const so = s?.solids?.find((x) => x.id === f.solidId);
  if (so?.shape === 'cylinder' || t.circle !== undefined) return { kind: 'bore_offset', solidId: f.solidId, end: f.sign > 0 ? 'top' : 'bottom' };
  return { kind: 'offset', solidId: f.solidId, axis: f.axis, sign: f.sign };
}

/** 면 스케일 가능한 면: 원기둥 윗면·아랫면 */
export function canTaper(s: StructureState, t: FaceTarget | null): t is SolidFaceTarget {
  if (!t || t.op.kind !== 'solid_face' || t.op.faces.length !== 1) return false;
  const f = t.op.faces[0];
  return f.axis === 1 && (s.solids ?? []).find((x) => x.id === f.solidId)?.shape === 'cylinder';
}
export function taperOpOf(s: StructureState, t: SolidFaceTarget): EditOp {
  const f = t.op.faces[0];
  const so = (s.solids ?? []).find((x) => x.id === f.solidId)!;
  const end = f.sign > 0 ? 'top' : 'bottom';
  return { kind: 'taper', solidId: so.id, end, base: latheOf(so)[end] };
}

/** 구멍 바닥 (밀면 더 깊게) */
function boreTarget(so: SolidPrimitive): FaceTarget {
  const lathe = so.lathe!;
  const g = boreGeometry(lathe)!;
  const q = solidQuat(so);
  const local = new THREE.Vector3(0, g.floorY * so.scale[1], 0).applyQuaternion(q);
  const deeper = solidAxisWorld(so, 1, lathe.bore!.from === 'top' ? -1 : 1);
  return {
    op: { kind: 'bore', solidId: so.id },
    center: r3(add(so.position, [local.x, local.y, local.z])),
    dir: deeper,
    circle: g.innerAt(g.floorY) * so.scale[0],
    key: `bo:${so.id}`,
  };
}

/** 오프셋 최대 두께: 안쪽 면이 최소 5cm는 남게 */
export function maxOffset(so: SolidPrimitive, axis: AxisIdx) {
  if (so.shape === 'cylinder' && axis === 1) return Math.max(0, Math.min(endRadius(so, 'top') || Infinity, endRadius(so, 'bottom') || Infinity) - 0.025);
  const ext = solidExtent(so);
  const [ua, va] = ([0, 1, 2] as AxisIdx[]).filter((i) => i !== axis);
  return Math.max(0, Math.min(ext[ua], ext[va]) / 2 - 0.025);
}

function offsetSolid(s: StructureState, op: Extract<EditOp, { kind: 'offset' }>, width: number, sid: string): OpResult {
  const so = (s.solids ?? []).find((x) => x.id === op.solidId);
  if (!so || so.shape !== 'box') return { next: s, dist: 0 };
  const w = round4(Math.min(width, maxOffset(so, op.axis)));
  if (w <= 0) return { next: s, dist: 0 };
  const ext = solidExtent(so);
  const a = op.axis;
  const [ua, va] = ([0, 1, 2] as AxisIdx[]).filter((i) => i !== a);
  const q = solidQuat(so);
  /** 로컬 오프셋·크기 → 조각 솔리드 (회전은 원래 그대로) */
  const piece = (id: string, local: Vec3, size: Vec3): SolidPrimitive => {
    const off = new THREE.Vector3(...local).applyQuaternion(q);
    return { ...so, id, position: r3(add(so.position, [off.x, off.y, off.z])), scale: r3(size) };
  };
  const sz = (u: number, v: number): Vec3 => {
    const out: Vec3 = [0, 0, 0];
    out[a] = ext[a];
    out[ua] = u;
    out[va] = v;
    return out;
  };
  const at = (u: number, v: number): Vec3 => {
    const out: Vec3 = [0, 0, 0];
    out[ua] = u;
    out[va] = v;
    return out;
  };
  const [Eu, Ev] = [ext[ua], ext[va]];
  // 한 덩어리로 선택되도록 그룹 이름 (원래 이름이 있으면 유지)
  const named = so.groupName && so.groupName !== '스케치';
  const used = new Set((s.solids ?? []).map((x) => x.groupName));
  let k = 1;
  while (used.has(`박스 ${k}`)) k++;
  const groupName = named ? so.groupName : `박스 ${k}`;
  const pieces = [
    piece(`${sid}${CORE_TAG}`, at(0, 0), sz(Eu - 2 * w, Ev - 2 * w)),
    piece(`${sid}-f0`, at(0, Ev / 2 - w / 2), sz(Eu, w)),
    piece(`${sid}-f1`, at(0, -(Ev / 2 - w / 2)), sz(Eu, w)),
    piece(`${sid}-f2`, at(Eu / 2 - w / 2, 0), sz(w, Ev - 2 * w)),
    piece(`${sid}-f3`, at(-(Eu / 2 - w / 2), 0), sz(w, Ev - 2 * w)),
  ].map((x) => ({ ...x, groupName }));
  const solids = (s.solids ?? []).flatMap((x) => (x.id === so.id ? pieces : [x]));
  return { next: { ...s, solids }, dist: w, focus: { kind: 'solid', id: pieces[0].id } };
}

function pushPullSolids(s: StructureState, op: Extract<EditOp, { kind: 'solid_face' }>, dist: number): OpResult {
  let applied = dist;
  const faces = new Map(op.faces.map((f) => [f.solidId, f]));
  const removed = new Set<string>();
  const solids = (s.solids ?? []).map((so) => {
    const f = faces.get(so.id);
    if (!f) return so;
    const base = BASE_EXTENT[so.shape] ?? BASE_EXTENT.box;
    const ext = solidExtent(so);
    const n = solidAxisWorld(so, f.axis, f.sign);
    // 오프셋 안쪽 면은 끝까지 밀면 관통 (스케치업처럼 면이 반대편에 닿으면 구멍)
    if (isCore(so.id) && dist <= -(ext[f.axis] - 0.05)) {
      removed.add(so.id);
      applied = -ext[f.axis];
      return so;
    }
    // 둥근 면: 원기둥·원뿔 옆면 → 반지름 (가리킨 면이 d만큼 이동, 중심 고정) / 구 → 전체 반지름
    const radial = (so.shape === 'cylinder' || so.shape === 'cone') && f.axis !== 1;
    if (radial || so.shape === 'sphere') {
      const axes: AxisIdx[] = so.shape === 'sphere' ? [0, 1, 2] : [0, 2];
      const minExt = Math.min(...axes.map((i) => ext[i]));
      const d = Math.max((MIN_EXTENT - minExt) / 2, dist);
      applied = d;
      const scale = [...so.scale] as Vec3;
      for (const i of axes) scale[i] = round4((ext[i] + 2 * d) / base[i]);
      return { ...so, scale };
    }
    let d = Math.max(MIN_EXTENT - ext[f.axis], dist);
    // 아랫면을 지면 밑으로 내리지 않음 (원래 지면 위에 있던 경우만)
    if (n[1] < -0.9) {
      const bottom = so.position[1] - ext[1] / 2;
      if (bottom >= -0.01) d = Math.min(d, bottom);
    }
    applied = d;
    const scale = [...so.scale] as Vec3;
    scale[f.axis] = round4((ext[f.axis] + d) / base[f.axis]);
    // 구멍 있는 원기둥 높이 변경: 구멍 바닥 위치는 그대로 (구멍 쪽 면을 당기면 그만큼 깊어짐)
    let lathe = so.lathe;
    if (so.shape === 'cylinder' && f.axis === 1 && lathe?.bore && lathe.bore.depth < 1) {
      const fromSide = (lathe.bore.from === 'top' ? 1 : -1) === f.sign;
      const depthAbs = lathe.bore.depth * ext[1] + (fromSide ? d : 0);
      lathe = { ...lathe, bore: { ...lathe.bore, depth: round4(Math.min(1, Math.max(0, depthAbs / (ext[1] + d)))) } };
    }
    return { ...so, scale, position: r3(add(so.position, n, d / 2)), lathe };
  });
  return { next: { ...s, solids: solids.filter((x) => !removed.has(x.id)) }, dist: round4(applied), through: removed.size > 0 };
}

function pushPullNodes(s: StructureState, op: Extract<EditOp, { kind: 'node_face' }>, dist: number): OpResult {
  const ids = new Set(op.nodeIds);
  const nodes = s.nodes.filter((n) => ids.has(n.id));
  const { axis, sign } = op;
  const coords = nodes.map((n) => n.position[axis]);
  const face = sign > 0 ? Math.max(...coords) : Math.min(...coords);
  const onFace = new Set(nodes.filter((n) => Math.abs(n.position[axis] - face) < FACE_TOL).map((n) => n.id));
  // 안쪽으로 밀 때 바로 안쪽 노드층을 넘지 않게 (빔이 뒤집히지 않도록)
  const inner = nodes.filter((n) => !onFace.has(n.id)).map((n) => n.position[axis]);
  let d = dist;
  if (inner.length) {
    const nearest = sign > 0 ? Math.max(...inner) : Math.min(...inner);
    d = Math.max(d, -(Math.abs(face - nearest) - GRID));
  }
  // 지면 아래 금지
  if (axis === 1 && sign < 0) d = Math.min(d, face);
  if (axis === 1 && sign > 0) d = Math.max(d, -face);
  if (d === 0) return { next: s, dist: 0 };
  return {
    next: {
      ...s,
      nodes: s.nodes.map((n) => {
        if (!onFace.has(n.id)) return n;
        const p = [...n.position] as Vec3;
        p[axis] = round4(p[axis] + sign * d);
        return { ...n, position: p };
      }),
    },
    dist: round4(d),
  };
}

function extrude(s: StructureState, op: Extract<EditOp, { kind: 'extrude' }>, dist: number, sid: string): OpResult {
  const ids = new Set(op.nodeIds);
  const src = s.nodes.filter((n) => ids.has(n.id));
  const n = op.normal;
  // 복사본이 지면 아래로 가지 않게
  let d = dist;
  for (const x of src) {
    const y = x.position[1];
    if (n[1] > 1e-6) d = Math.max(d, -y / n[1]);
    if (n[1] < -1e-6) d = Math.min(d, y / -n[1]);
  }
  d = round4(d);
  if (Math.abs(d) < 1e-3) return { next: s, dist: 0 };

  const copyId = (id: string) => `${sid}-n-${id}`;
  const newNodes: NodePoint[] = src.map((x) => {
    const p = r3(add(x.position, n, d));
    return { ...x, id: copyId(x.id), position: p, isFixed: isFixedAt(p), role: x.role ?? 'primary' };
  });
  const beamSet = new Set(op.beamIds);
  const srcBeams = s.beams.filter((b) => beamSet.has(b.id));
  const style = srcBeams[0] ?? null;
  const mk = (id: string, a: string, b: string, like: BeamMember | null): BeamMember => ({
    id,
    groupName: like?.groupName ?? src[0]?.groupName,
    startNodeId: a,
    endNodeId: b,
    stress: 0,
    material: like?.material,
    radius: like?.radius,
    color: like?.color,
    role: like?.role ?? 'primary',
  });
  const newBeams: BeamMember[] = [];
  // 윗면(복사된 빔) + 대각 빔 (사각형 옆면마다 하나 → 삼각형 2개로 강성)
  for (const b of srcBeams) {
    newBeams.push(mk(`${sid}-b-${b.id}`, copyId(b.startNodeId), copyId(b.endNodeId), b));
    newBeams.push(mk(`${sid}-d-${b.id}`, b.startNodeId, copyId(b.endNodeId), b));
  }
  // 세로 빔 (원본 노드 → 복사 노드)
  for (const x of src) newBeams.push(mk(`${sid}-v-${x.id}`, x.id, copyId(x.id), style));

  return {
    next: { ...s, nodes: [...s.nodes, ...newNodes], beams: [...s.beams, ...newBeams] },
    dist: d,
    focus: src[0] ? { kind: 'node', id: src[0].id } : undefined,
  };
}

/** 선택 묶음 중 가장 낮은 점 (노드 높이, 솔리드 아랫면) */
function lowestY(s: StructureState, nodeIds: Set<string>, solidIds: Set<string>) {
  let y = Infinity;
  for (const n of s.nodes) if (nodeIds.has(n.id)) y = Math.min(y, n.position[1]);
  for (const so of s.solids ?? []) if (solidIds.has(so.id)) y = Math.min(y, so.position[1] - solidExtent(so)[1] / 2);
  return y;
}

/** dir 방향 dist 이동량 (지면 아래로 못 내려가게 y만 제한) */
function clampDelta(s: StructureState, nodeIds: Set<string>, solidIds: Set<string>, dir: Vec3, dist: number) {
  const delta = scaleV(dir, dist);
  const low = lowestY(s, nodeIds, solidIds);
  if (Number.isFinite(low) && low >= -0.01 && low + delta[1] < 0) {
    const k = dir[1] !== 0 ? -low / dir[1] : 0;
    return scaleV(dir, round4(k));
  }
  return delta;
}

function translate(s: StructureState, nodeIdList: string[], solidIdList: string[], dir: Vec3, dist: number): OpResult {
  const nodeIds = new Set(nodeIdList);
  const solidIds = new Set(solidIdList);
  const delta = clampDelta(s, nodeIds, solidIds, dir, dist);
  return {
    next: {
      ...s,
      nodes: s.nodes.map((n) => {
        if (!nodeIds.has(n.id)) return n;
        const p = r3(add(n.position, delta));
        // 수평 이동은 지지 유지 (다리 공중 앵커 보존), 높이가 바뀌면 지면 기준으로 다시
        return { ...n, position: p, isFixed: delta[1] === 0 ? n.isFixed : isFixedAt(p) };
      }),
      solids: (s.solids ?? []).map((so) => (solidIds.has(so.id) ? { ...so, position: r3(add(so.position, delta)) } : so)),
    },
    dist: round4(dot(delta, dir)),
  };
}

const GENERIC_GROUPS = new Set(['스케치']);

function copy(s: StructureState, op: Extract<EditOp, { kind: 'copy' }>, dist: number, sid: string): OpResult {
  const nodeIds = new Set(op.nodeIds);
  const solidIds = new Set(op.solidIds);
  const beamIds = new Set(op.beamIds);
  const delta = clampDelta(s, nodeIds, solidIds, op.dir, dist);
  // 복사본은 따로 선택되도록 그룹 이름을 바꿈 ("다리" → "다리 복사")
  const rename = (g?: string) => (g && !GENERIC_GROUPS.has(g) ? `${g} 복사` : g);
  const nid = (id: string) => `${sid}-c-${id}`;
  const nodes = s.nodes
    .filter((n) => nodeIds.has(n.id))
    .map((n) => {
      const p = r3(add(n.position, delta));
      return { ...n, id: nid(n.id), groupName: rename(n.groupName), position: p, isFixed: delta[1] === 0 ? n.isFixed : isFixedAt(p) };
    });
  const beams = s.beams
    .filter((b) => beamIds.has(b.id) && nodeIds.has(b.startNodeId) && nodeIds.has(b.endNodeId))
    .map((b) => ({ ...b, id: `${sid}-c-${b.id}`, groupName: rename(b.groupName), startNodeId: nid(b.startNodeId), endNodeId: nid(b.endNodeId), stress: 0 }));
  const solids = (s.solids ?? [])
    .filter((so) => solidIds.has(so.id))
    .map((so) => ({ ...so, id: `${sid}-c-${so.id}`, groupName: rename(so.groupName), position: r3(add(so.position, delta)) }));
  const focus: PickHit | undefined = nodes[0] ? { kind: 'node', id: nodes[0].id } : solids[0] ? { kind: 'solid', id: solids[0].id } : undefined;
  return {
    next: { ...s, nodes: [...s.nodes, ...nodes], beams: [...s.beams, ...beams], solids: [...(s.solids ?? []), ...solids] },
    dist: round4(dot(delta, op.dir)),
    focus,
  };
}

/** 선택 삭제 (노드에 붙은 빔도 같이) */
export function deleteSelection(s: StructureState, sel: Selection): StructureState {
  const nodeIds = new Set(sel.nodeIds);
  const solidIds = new Set(sel.solidIds);
  const beamIds = new Set(sel.beamIds);
  return {
    ...s,
    nodes: s.nodes.filter((n) => !nodeIds.has(n.id)),
    beams: s.beams.filter((b) => !beamIds.has(b.id) && !nodeIds.has(b.startNodeId) && !nodeIds.has(b.endNodeId)),
    solids: (s.solids ?? []).filter((x) => !solidIds.has(x.id)),
  };
}

/** 선택 묶음 바운딩 박스 크기 (복사 기본 간격용) */
export function selectionSize(s: StructureState, sel: Selection): Vec3 {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  const grow = (p: readonly number[], half: readonly number[] = [0, 0, 0]) => {
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], p[i] - half[i]);
      max[i] = Math.max(max[i], p[i] + half[i]);
    }
  };
  for (const n of s.nodes) if (sel.nodeIds.includes(n.id)) grow(n.position);
  for (const so of s.solids ?? []) if (sel.solidIds.includes(so.id)) grow(so.position, scaleV(solidExtent(so), 0.5));
  return [0, 1, 2].map((i) => (Number.isFinite(max[i] - min[i]) ? max[i] - min[i] : 0)) as Vec3;
}

export function moveOp(sel: Selection, dir: Vec3, copyIt: boolean): EditOp {
  return copyIt
    ? { kind: 'copy', nodeIds: sel.nodeIds, beamIds: sel.beamIds, solidIds: sel.solidIds, dir }
    : { kind: 'move', nodeIds: sel.nodeIds, solidIds: sel.solidIds, dir };
}

/** HUD 표시: "늘리기 +1.25 m" */
export function describeOp(op: EditOp, dist: number, through = false) {
  if (through) return `관통 ${Math.abs(dist).toFixed(2)} m`;
  if (op.kind === 'offset') return `오프셋 ${dist.toFixed(2)} m`;
  if (op.kind === 'scale') return `크기 x${(1 + dist).toFixed(1)}`;
  if (op.kind === 'rect') {
    const [w, d] = rectSize(op);
    return `사각형 ${w.toFixed(2)} x ${d.toFixed(2)} m`;
  }
  if (op.kind === 'circle') return `원 반지름 ${op.radius.toFixed(2)} m`;
  if (op.kind === 'taper') {
    const r = Math.max(0, op.base + dist);
    return `${op.end === 'top' ? '윗면' : '아랫면'} x${r.toFixed(1)}${r === 0 ? ' (뾰족)' : ''}`;
  }
  if (op.kind === 'bore_offset') return `안쪽 원 테두리 ${dist.toFixed(2)} m`;
  if (op.kind === 'bore') return `파기 ${dist >= 0 ? '+' : ''}${dist.toFixed(2)} m`;
  const label = op.kind === 'solid_face' || op.kind === 'node_face' ? (dist < 0 ? '줄이기' : '늘리기') : OP_LABEL[op.kind];
  return `${label} ${dist >= 0 ? '+' : ''}${dist.toFixed(2)} m`;
}
