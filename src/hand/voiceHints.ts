// (조원호) 지금 상태에서 말할 수 있는 음성 명령 추천 (안내 카드 칩)
// 명령어를 외우지 않아도 되도록: 선택한 물체 종류 · 모드 · 드래그 중 · 방금 편집 여부에 따라 바뀜.
// 여기 문구는 전부 실제로 해석되는 것만 (voiceCommand / Jev intent 기준)
import type { StructureState } from '../types/cad';
import type { Selection } from '../services/selection';
import type { EditMode } from '../services/sketchOps';

export interface HintContext {
  structure: StructureState;
  selected: Selection | null;
  editMode: EditMode;
  dragging: boolean;
  /** 방금(10초 안) 손·음성 편집 → 거리만 말해서 고치기 가능 */
  recentEdit: boolean;
  canUndo: boolean;
  /** "이 명령 맞나요?" 확인 대기 */
  confirming: boolean;
}

export interface VoiceHint {
  /** 말할 문장 (칩 클릭 = 이 문장을 말한 것과 같음) */
  say: string;
  /** 짧은 설명 (칩 툴팁) */
  why: string;
}

const h = (say: string, why: string): VoiceHint => ({ say, why });
/** 칩 최대 개수 (한눈에 보이게) */
const MAX_HINTS = 7;

export function voiceHints(c: HintContext): VoiceHint[] {
  const out: VoiceHint[] = [];
  const add = (...xs: VoiceHint[]) => out.push(...xs);

  if (c.confirming) return [h('응', '방금 명령 실행'), h('아니', '취소')];

  if (c.structure.isSimulating) {
    return [h('하중 300kg', '목표 하중 바꾸기'), h('AI로 보강해줘', '약한 곳 보강 (AI 설계)')];
  }

  // 드래그 중: 정확한 거리 (스케치업 치수 입력)
  if (c.dragging) {
    if (c.editMode === 'scale' || c.editMode === 'taper' || c.editMode === 'rect' || c.editMode === 'circle') return [];
    return [h('1미터', '정확히 1m로'), h('50센티', '정확히 0.5m로'), h('세 칸', '0.75m (그리드 3칸)')];
  }

  // 그리기 모드
  if (c.editMode === 'rect' || c.editMode === 'circle') {
    add(c.editMode === 'rect' ? h('원 그리기', '원으로 바꾸기') : h('사각형 그리기', '사각형으로 바꾸기'), h('늘리기 모드', '그리기 끝내기'));
    if (c.canUndo) add(h('되돌려', '방금 그린 것 취소'));
    return out;
  }

  // 방금 편집 → 거리만 말해서 고치기
  if (c.recentEdit) add(h('2미터', '방금 편집을 정확히 2m로 고침'));

  const sel = c.selected;
  if (!sel) {
    add(h('사각형 그리기', '바닥에 사각형 → 끌어 올려 박스'), h('원 그리기', '바닥에 원 → 끌어 올려 원기둥'), h('다리 만들어줘', 'AI가 구조물 설계'), h('하중 100kg', '목표 하중'));
    if (c.canUndo) add(h('되돌려', '방금 편집 취소'));
    return out.slice(0, MAX_HINTS);
  }

  // 선택한 것 종류
  const solids = (c.structure.solids ?? []).filter((x) => sel.solidIds.includes(x.id));
  const cyl = solids.find((x) => x.shape === 'cylinder');
  const box = solids.find((x) => x.shape === 'box');
  const nodesOnly = sel.nodeIds.length > 0 && solids.length === 0;

  // 모드별 먼저
  switch (c.editMode) {
    case 'move':
      add(h('오른쪽으로 1미터 옮겨', '카메라 기준 오른쪽'), h('위로 두 칸 올려', '0.5m 위로'));
      break;
    case 'copy':
      add(h('복사해', '옆에 붙여서 하나 더'), h('뒤로 3미터 복사해', '떨어뜨려 복사'));
      break;
    case 'scale':
      add(h('두 배로 키워', '전체 크기 x2'), h('절반으로 줄여', '전체 크기 x0.5'));
      break;
    case 'taper':
      add(h('뾰족하게', '윗면을 점으로 = 원뿔'), h('윗면 절반으로', '원뿔대'), h('윗면 두 배로', '접시처럼 벌어짐'));
      break;
    case 'offset':
      add(h('30센티 오프셋', '테두리 30cm 남기고 안쪽 면'));
      break;
  }

  // 물체 종류별
  if (cyl) {
    const bore = cyl.lathe?.bore;
    if (bore && bore.depth < 1) add(h('50센티 더 파줘', '구멍 더 깊게'), h('뚫어', '끝까지 관통 = 파이프'));
    else if (!bore) add(h('1미터 파줘', '안쪽 원 만들고 파기 = 컵'), h('20센티 오프셋', '안쪽 원만 그리기'));
    if (c.editMode !== 'taper') add(h('뾰족하게', '원뿔로'), h('윗면 절반으로', '원뿔대'));
    add(h('위로 1미터 늘려', '높이'));
  } else if (box) {
    add(h('위로 2미터 늘려', '높이 늘리기'), h('30센티 오프셋', '창문·문 테두리'), h('50센티 줄여', '높이 줄이기'));
  } else if (nodesOnly) {
    add(h('위로 1미터 늘려', '윗면 노드 올리기'), h('강철로 바꿔', '빔 재질'));
  }

  // 공통
  add(h('두 배로 키워', '전체 크기'), h('Y축으로 90도 돌려', '회전'), h('복사해', '하나 더'), h('유리로 바꿔', '재질'), h('지워', '삭제'));
  if (c.canUndo) add(h('되돌려', '방금 편집 취소'));

  // 중복 제거 + 개수 제한 (되돌려는 있으면 항상 마지막에 남김)
  const seen = new Set<string>();
  const uniq = out.filter((x) => (seen.has(x.say) ? false : (seen.add(x.say), true)));
  const undo = uniq.find((x) => x.say === '되돌려');
  const rest = uniq.filter((x) => x !== undo).slice(0, undo ? MAX_HINTS - 1 : MAX_HINTS);
  return undo ? [...rest, undo] : rest;
}
