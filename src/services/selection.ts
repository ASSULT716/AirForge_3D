// (조원호) 손 선택: 커서가 가리킨 요소 → "구조물 단위" 선택 묶음 계산
// 단위 규칙 (docs/gesture-spec.md 4절)
//   1) 가리킨 요소의 groupName이 의미 있으면(예: "다리", "건물") 같은 그룹 전부
//   2) 빔으로 연결된 노드 덩어리(연결 요소) 전체
//   - "스케치"처럼 손으로 그린 건 전부 같은 이름이라 그룹 기준에서 제외 → 연결 덩어리만
import type { StructureState } from '../types/cad';

export type Vec3 = [number, number, number];

export interface Selection {
  /** 같은 묶음이면 같은 key (변경 감지용) */
  key: string;
  label: string;
  nodeIds: string[];
  beamIds: string[];
  solidIds: string[];
  /** 무게중심 (노드·솔리드 위치 평균) → 회전 중심 */
  center: Vec3;
}

export interface PickHit {
  kind: 'node' | 'beam' | 'solid';
  id: string;
}

/** 그룹 기준으로 묶지 않을 이름 (모든 손 스케치가 공유) */
const GENERIC_GROUPS = new Set(['스케치']);

const meaningful = (g?: string) => !!g && !GENERIC_GROUPS.has(g);

export function expandSelection(s: StructureState, hit: PickHit): Selection | null {
  const solids = s.solids ?? [];
  const nodeIds = new Set<string>();
  const solidIds = new Set<string>();

  let group: string | undefined;
  if (hit.kind === 'node') {
    const n = s.nodes.find((x) => x.id === hit.id);
    if (!n) return null;
    nodeIds.add(n.id);
    group = n.groupName;
  } else if (hit.kind === 'beam') {
    const b = s.beams.find((x) => x.id === hit.id);
    if (!b) return null;
    nodeIds.add(b.startNodeId);
    nodeIds.add(b.endNodeId);
    group = b.groupName;
  } else {
    const so = solids.find((x) => x.id === hit.id);
    if (!so) return null;
    solidIds.add(so.id);
    group = so.groupName;
  }

  if (meaningful(group)) {
    s.nodes.forEach((n) => n.groupName === group && nodeIds.add(n.id));
    s.beams.forEach((b) => {
      if (b.groupName === group) {
        nodeIds.add(b.startNodeId);
        nodeIds.add(b.endNodeId);
      }
    });
    solids.forEach((so) => so.groupName === group && solidIds.add(so.id));
  }

  // 빔으로 연결된 노드 전부 (BFS)
  const adj = new Map<string, string[]>();
  for (const b of s.beams) {
    (adj.get(b.startNodeId) ?? adj.set(b.startNodeId, []).get(b.startNodeId)!).push(b.endNodeId);
    (adj.get(b.endNodeId) ?? adj.set(b.endNodeId, []).get(b.endNodeId)!).push(b.startNodeId);
  }
  const queue = [...nodeIds];
  while (queue.length) {
    const id = queue.pop()!;
    for (const next of adj.get(id) ?? []) {
      if (!nodeIds.has(next)) {
        nodeIds.add(next);
        queue.push(next);
      }
    }
  }

  const beamIds = s.beams.filter((b) => nodeIds.has(b.startNodeId) && nodeIds.has(b.endNodeId)).map((b) => b.id);
  const label = meaningful(group) ? group! : solidIds.size && !nodeIds.size ? '솔리드' : '구조물';
  return build(s, label, [...nodeIds], beamIds, [...solidIds]);
}

/** 구조물이 바뀐 뒤(삭제·리셋) 남아 있는 요소만 유지. 하나도 없으면 null */
export function pruneSelection(s: StructureState, sel: Selection): Selection | null {
  const nodeSet = new Set(s.nodes.map((n) => n.id));
  const beamSet = new Set(s.beams.map((b) => b.id));
  const solidSet = new Set((s.solids ?? []).map((x) => x.id));
  const nodeIds = sel.nodeIds.filter((id) => nodeSet.has(id));
  const beamIds = sel.beamIds.filter((id) => beamSet.has(id));
  const solidIds = sel.solidIds.filter((id) => solidSet.has(id));
  if (!nodeIds.length && !solidIds.length) return null;
  return build(s, sel.label, nodeIds, beamIds, solidIds);
}

export function describeSelection(sel: Selection) {
  const parts = [
    sel.nodeIds.length && `노드 ${sel.nodeIds.length}`,
    sel.beamIds.length && `빔 ${sel.beamIds.length}`,
    sel.solidIds.length && `솔리드 ${sel.solidIds.length}`,
  ].filter(Boolean);
  return `${sel.label} (${parts.join(' · ')})`;
}

function build(s: StructureState, label: string, nodeIds: string[], beamIds: string[], solidIds: string[]): Selection {
  const pts: Vec3[] = [
    ...s.nodes.filter((n) => nodeIds.includes(n.id)).map((n) => n.position),
    ...(s.solids ?? []).filter((x) => solidIds.includes(x.id)).map((x) => x.position),
  ];
  const center: Vec3 = [0, 0, 0];
  for (const p of pts) for (let i = 0; i < 3; i++) center[i] += p[i] / (pts.length || 1);
  const key = [[...nodeIds].sort().join(','), [...solidIds].sort().join(',')].join('|');
  return { key, label, nodeIds, beamIds, solidIds, center };
}
