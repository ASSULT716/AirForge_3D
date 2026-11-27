// (조원호) 음성 편집 명령(늘리기·이동·복사) → sketchOps 연산
// 방향("오른쪽으로")은 지금 카메라 기준 → 가장 가까운 월드 축으로 바꿈
import * as THREE from 'three';
import type { StructureState } from '../../types/cad';
import type { Selection } from '../selection';
import {
  GRID,
  canOffset,
  dominantAxis,
  moveOp,
  offsetOpOf,
  planeNormal,
  resolvePushPull,
  selectionSize,
  solidFaceFacing,
  endRadius,
  latheOf,
  ROUND_SHAPES,
  type EditOp,
  type FaceTarget,
  type Vec3,
} from '../sketchOps';
import { LATHE_R } from '../latheShape';
import type { MoveDirection, VoiceCommand } from './voiceCommand';

/** 화면 기준 방향 → 월드 축 (위·아래는 항상 Y, 좌우·앞뒤는 카메라 방향을 수평으로 눕혀서 가까운 축) */
export function dirToWorld(dir: MoveDirection, cameraQuat: readonly number[]): Vec3 {
  if (dir === 'up') return [0, 1, 0];
  if (dir === 'down') return [0, -1, 0];
  const q = new THREE.Quaternion(cameraQuat[0], cameraQuat[1], cameraQuat[2], cameraQuat[3]);
  // 카메라 로컬 +x = 화면 오른쪽, +z = 화면 밖(사용자 쪽)
  const local = dir === 'right' || dir === 'left' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const v = local.applyQuaternion(q);
  v.y = 0;
  const { axis, sign } = dominantAxis([v.x, 0, v.z]);
  const s = dir === 'left' || dir === 'back' ? -sign : sign;
  const out: Vec3 = [0, 0, 0];
  out[axis] = s;
  return out;
}

export type EditVoiceCommand = Extract<VoiceCommand, { type: 'push_pull' | 'move' | 'copy' }>;

/**
 * 음성 오프셋: 방금 가리킨 면(hovered)이 박스 면이면 그 면, 아니면 선택된 첫 박스에서 카메라를 보는 면
 */
export function voiceOffsetOp(
  s: StructureState,
  sel: Selection,
  hovered: FaceTarget | null,
  cameraQuat: readonly number[],
): EditOp | null {
  if (canOffset(s, hovered) && sel.solidIds.includes(hovered.op.faces[0].solidId)) return offsetOpOf(hovered, s);
  const cyl = (s.solids ?? []).find((x) => sel.solidIds.includes(x.id) && x.shape === 'cylinder' && !x.lathe?.bore);
  const box = (s.solids ?? []).find((x) => sel.solidIds.includes(x.id) && x.shape === 'box');
  if (!box && cyl) return { kind: 'bore_offset', solidId: cyl.id, end: latheOf(cyl).top > 0.05 ? 'top' : 'bottom' };
  if (!box) return null;
  const q = new THREE.Quaternion(cameraQuat[0], cameraQuat[1], cameraQuat[2], cameraQuat[3]);
  const toViewer = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const f = solidFaceFacing(box, [toViewer.x, toViewer.y, toViewer.z]);
  return { kind: 'offset', solidId: box.id, axis: f.axis, sign: f.sign };
}

/** 거리가 있는 음성 편집 → 연산 + 거리. 대상 면을 못 찾으면 error */
export function voiceEditOp(
  s: StructureState,
  sel: Selection,
  cmd: EditVoiceCommand,
  cameraQuat: readonly number[],
): { op: EditOp; dist: number } | { error: string } {
  if (cmd.type === 'push_pull') {
    if (cmd.meters === null) return { error: '거리 없음' };
    let prefer: Vec3 | undefined = cmd.dir ? dirToWorld(cmd.dir, cameraQuat) : undefined;
    // 방향 안 말함: 평면 구조물은 법선(돌출), 그 외는 위로
    if (!prefer) {
      const pts = s.nodes.filter((n) => sel.nodeIds.includes(n.id)).map((n) => n.position);
      const planar = !sel.solidIds.length && planeNormal(pts);
      if (!planar) prefer = [0, 1, 0];
    }
    const target = resolvePushPull(s, sel, null, prefer);
    if (!target) return { error: '늘릴 면을 찾지 못했어요' };
    return { op: target.op, dist: cmd.shrink ? -cmd.meters : cmd.meters };
  }

  const dir = dirToWorld(cmd.dir ?? (cmd.type === 'move' ? 'up' : 'right'), cameraQuat);
  let meters = cmd.meters;
  if (meters === null) {
    if (cmd.type === 'move') return { error: '거리 없음' };
    // 복사 기본: 그 방향 크기 + 0.5m 띄워서 옆에 (그리드 칸 단위로 올림)
    const size = selectionSize(s, sel)[dominantAxis(dir).axis];
    meters = Math.ceil((size + 0.5) / GRID) * GRID;
  }
  return { op: moveOp(sel, dir, cmd.type === 'copy'), dist: meters };
}

/**
 * 음성 면 크기 / 파기 (선택된 첫 원기둥).
 *   taper: ratio = 그 면 반지름 비율 목표 (0 = 뾰족)
 *   dig  : 안쪽 원이 없으면 pre로 기본 테두리 오프셋 먼저 (반지름의 15%, 최대 0.15m)
 */
export function voiceLatheOp(
  s: StructureState,
  sel: Selection,
  cmd: Extract<VoiceCommand, { type: 'taper' | 'dig' }>,
): { op: EditOp; dist: number; pre?: { op: EditOp; dist: number } } | { error: string } {
  const cyl = (s.solids ?? []).find((x) => sel.solidIds.includes(x.id) && x.shape === 'cylinder');
  if (!cyl) return { error: '원기둥을 먼저 선택하세요 (원 그리기로 만들 수 있어요)' };
  const lathe = latheOf(cyl);
  if (cmd.type === 'taper') {
    const base = lathe[cmd.end];
    return { op: { kind: 'taper', solidId: cyl.id, end: cmd.end, base }, dist: (cmd.ratio ?? base) - base };
  }
  const H = 1.2 * cyl.scale[1];
  const remaining = lathe.bore ? (1 - lathe.bore.depth) * H : H;
  const dist = cmd.through ? remaining + 0.01 : Math.min(cmd.meters ?? H / 2, remaining + 0.01);
  if (lathe.bore) return { op: { kind: 'bore', solidId: cyl.id }, dist };
  const end = lathe.top > 0.05 ? 'top' : 'bottom';
  const R = endRadius(cyl, end);
  return {
    pre: { op: { kind: 'bore_offset', solidId: cyl.id, end }, dist: Math.min(0.15, R * 0.15) },
    op: { kind: 'bore', solidId: cyl.id },
    dist,
  };
}

/**
 * 음성 지름 (선택된 첫 둥근 물체).
 *   end 없음: 전체 지름 (원기둥·원뿔·구)
 *   end 있음: 원기둥 그 끝면만 = 면 크기 비율로 환산 (윗면 지름 1미터 → 원뿔대)
 */
export function voiceDiameterOp(
  s: StructureState,
  sel: Selection,
  cmd: Extract<VoiceCommand, { type: 'diameter' }>,
): { op: EditOp; dist: number } | { error: string } {
  const round = (s.solids ?? []).filter((x) => sel.solidIds.includes(x.id) && ROUND_SHAPES.has(x.shape));
  if (cmd.end) {
    const cyl = round.find((x) => x.shape === 'cylinder');
    if (!cyl) return { error: '윗면·아랫면 지름은 원기둥만 돼요' };
    const base = latheOf(cyl)[cmd.end];
    const ratio = cmd.meters / 2 / (LATHE_R * cyl.scale[0]);
    return { op: { kind: 'taper', solidId: cyl.id, end: cmd.end, base }, dist: ratio - base };
  }
  if (!round[0]) return { error: '지름은 원기둥·원뿔·구만 돼요 (원 그리기로 원기둥을 만들 수 있어요)' };
  return { op: { kind: 'diameter', solidId: round[0].id }, dist: cmd.meters };
}
