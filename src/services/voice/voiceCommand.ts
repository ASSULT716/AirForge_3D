//(조원호) 음성 최종 텍스트 → [Jev 원자 판단] → [코드 truth table] → 실행할 명령
// 빠른 조작(회전·재질·도구·하중)만 여기서 처리. 그 외 / Jev 실패 → Groq(executeNaturalCommand)로 넘김
import {
  extractAngleCandidates,
  extractDistanceCandidates,
  extractScaleCandidates,
  parseLoadKg,
  saysRadius,
  type AngleCandidate,
  type DistanceCandidate,
  type ScaleCandidate,
} from './koreanNumber';
import {
  AXIS_OPTION,
  EDIT_MODE_OPTION,
  DIRECTION_SIGN,
  MOVE_DIRECTION_OPTION,
  IS_COMMAND_NO,
  IS_COMMAND_YES,
  JEV_ENDPOINT,
  JEV_MODEL,
  JEV_TIMEOUT_MS,
  buildQuestions,
  buildState,
  type Axis,
  type Intent,
  type Material,
  type MoveDirection,
  type Tool,
  type VoiceEditMode,
} from './jevQuestions';

export type { Axis, Material, MoveDirection, Tool, VoiceEditMode } from './jevQuestions';

export type VoiceCommand =
  | { type: 'rotate'; axis: Axis; deg: number }
  | { type: 'set_material'; material: Material }
  | { type: 'set_tool'; tool: Tool }
  /** 손 편집 모드만 바꿈 ("면 크기 도구로") — 선택 없어도 됨 */
  | { type: 'set_mode'; mode: VoiceEditMode }
  | { type: 'set_load'; kg: number }
  /** meters null = 거리 안 말함 → 늘리기 모드로 바꾸고 손으로 끌게 안내 */
  | { type: 'push_pull'; dir: MoveDirection | null; meters: number | null; shrink: boolean }
  | { type: 'move'; dir: MoveDirection | null; meters: number | null }
  /** meters null = 옆에 붙여서 복사 */
  | { type: 'copy'; dir: MoveDirection | null; meters: number | null }
  | { type: 'delete' }
  /** meters null = 오프셋 모드로 바꾸고 손으로 끌게 */
  | { type: 'offset'; meters: number | null }
  /** factor null = 크기 모드로 바꾸고 손으로 끌게 */
  | { type: 'scale'; factor: number | null }
  | { type: 'draw'; shape: 'rect' | 'circle' }
  /** 원기둥 한쪽 면 반지름 비율 (0 = 뾰족). null = 면 크기 모드 */
  | { type: 'taper'; end: 'top' | 'bottom'; ratio: number | null }
  /** 둥근 물체 지름을 정확히 (meters = 지름, 반지름으로 말하면 x2). end = 그 끝면만 (원기둥) */
  | { type: 'diameter'; meters: number; end: 'top' | 'bottom' | null }
  /** 안쪽 파기 (meters null = 절반 깊이, through = 관통) */
  | { type: 'dig'; meters: number | null; through: boolean }
  | { type: 'undo' };

/** 선택된 구조물이 있어야 하는 명령 (없으면 AI 설계로 넘김) */
export const NEEDS_SELECTION: ReadonlySet<VoiceCommand['type']> = new Set(['push_pull', 'move', 'copy', 'delete', 'offset', 'scale', 'taper', 'diameter', 'dig']);

/** 값 없이 모드만 바꾸는 명령 ("면 크기", "늘려") → 선택 없어도 모드 전환. copy는 값 없어도 바로 복사라 제외 */
export function isModeOnly(c: VoiceCommand): boolean {
  switch (c.type) {
    case 'set_mode':
      return true;
    case 'taper':
      return c.ratio === null;
    case 'scale':
      return c.factor === null;
    case 'offset':
    case 'push_pull':
    case 'move':
      return c.meters === null;
    default:
      return false;
  }
}

export const EDIT_MODE_KO: Record<VoiceEditMode, string> = {
  pushpull: '늘리기',
  offset: '오프셋',
  taper: '면 크기',
  move: '이동',
  copy: '복사',
  scale: '크기',
};

export interface Interpretation {
  /**
   * execute: 바로 실행 / confirm: "맞나요?" 표시 후 대기 / ignore: 잡담이라 무시
   * forward: 빠른 조작이 아님 or Jev 실패 → Groq로 원문 전달
   */
  action: 'execute' | 'confirm' | 'ignore' | 'forward';
  command: VoiceCommand | null;
  /** HUD 표시용 해석 결과 ("Y축 +30° 회전") */
  label: string;
  /** Jev 실패 사유. "아니오"로 취급하지 않고 에러로 표시 */
  error?: string;
}

export interface InterpretContext {
  /** 축을 말하지 않았을 때 쓸 축 (직전 회전 축) */
  currentAxis: Axis;
}

const DEFAULT_ROTATE_DEG = 90;

const AXIS_KO: Record<Axis, string> = { x: 'X축', y: 'Y축', z: 'Z축' };
const MATERIAL_KO: Record<Material, string> = {
  steel: '강철',
  titanium: '티타늄',
  carbon: '카본',
  gold: '금',
  stucco: '스타코',
  wood: '나무',
  concrete: '콘크리트',
  glass: '유리',
  hologram: '홀로그램',
};
export const MOVE_DIR_KO: Record<MoveDirection, string> = {
  up: '위로',
  down: '아래로',
  left: '왼쪽으로',
  right: '오른쪽으로',
  front: '앞으로',
  back: '뒤로',
};
const meterKo = (m: number) => `${Math.round(m * 100) / 100}m`;

const TOOL_KO: Record<Tool, string> = { draw: '펜', erase: '지우개', move: '이동', deform: '왜곡', spray: '스프레이', select: '선택' };

export function describeCommand(c: VoiceCommand): string {
  switch (c.type) {
    case 'rotate':
      return `${AXIS_KO[c.axis]} ${c.deg >= 0 ? '+' : ''}${c.deg}° 회전`;
    case 'set_material':
      return `재질 → ${MATERIAL_KO[c.material]}`;
    case 'set_tool':
      return `도구 → ${TOOL_KO[c.tool]}`;
    case 'set_mode':
      return `${EDIT_MODE_KO[c.mode]} 모드`;
    case 'set_load':
      return `하중 ${c.kg}kg`;
    case 'push_pull': {
      const verb = c.shrink ? '줄이기' : '늘리기';
      return [c.dir && MOVE_DIR_KO[c.dir], c.meters !== null && meterKo(c.meters), verb].filter(Boolean).join(' ');
    }
    case 'move':
      return [c.dir && MOVE_DIR_KO[c.dir], c.meters !== null && meterKo(c.meters), '이동'].filter(Boolean).join(' ');
    case 'copy':
      return [c.dir && MOVE_DIR_KO[c.dir], c.meters !== null && meterKo(c.meters), '복사'].filter(Boolean).join(' ');
    case 'delete':
      return '삭제';
    case 'offset':
      return c.meters !== null ? `오프셋 ${meterKo(c.meters)}` : '오프셋';
    case 'scale':
      return c.factor !== null ? `크기 x${c.factor}` : '크기 조절';
    case 'draw':
      return c.shape === 'rect' ? '사각형 그리기' : '원 그리기';
    case 'taper':
      return `${c.end === 'top' ? '윗면' : '아랫면'} ${c.ratio === null ? '크기' : c.ratio === 0 ? '뾰족하게' : `x${c.ratio}`}`;
    case 'diameter':
      return `${c.end === 'top' ? '윗면 ' : c.end === 'bottom' ? '아랫면 ' : ''}지름 ${meterKo(c.meters)}`;
    case 'dig':
      return c.through ? '관통' : c.meters !== null ? `${meterKo(c.meters)} 파기` : '파기';
    case 'undo':
      return '되돌리기';
  }
}

// ─────────────────────────────────────────────────────────────
// Jev 호출
// ─────────────────────────────────────────────────────────────
interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number> }
interface NoulAnswer { type: 'noul'; noul: number }
export interface JevResponse { model: string; answers: Record<string, ChoiceAnswer | NoulAnswer> }

async function askJev(text: string, angles: AngleCandidate[], distances: DistanceCandidate[], scales: ScaleCandidate[]): Promise<JevResponse> {
  const body = { model: JEV_MODEL, state: buildState(text), questions: buildQuestions(angles, distances, scales) };
  console.debug('[voice] Jev 요청', body);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), JEV_TIMEOUT_MS);
  try {
    const res = await fetch(JEV_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 120)}`);
    const json = (await res.json()) as JevResponse;
    console.debug('[voice] Jev 응답', json);
    return json;
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`타임아웃 ${JEV_TIMEOUT_MS}ms`);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

const noul = (r: JevResponse, id: string) => {
  const a = r.answers?.[id];
  if (a?.type !== 'noul') throw new Error(`응답에 ${id} 없음`);
  return a.noul;
};
const choice = (r: JevResponse, id: string): string | null => {
  const a = r.answers?.[id];
  return a?.type === 'choice' ? a.choice : null;
};

// ─────────────────────────────────────────────────────────────
// Truth table: Jev 판단들 → 명령
//   is_command < 0.3            → ignore (잡담)
//   negated > 0.7               → ignore ("돌리지 마")
//   undo > 0.7                  → undo (손 편집 기록이 없으면 HandBridge가 Groq로 넘김)
//   intent = other              → forward (Groq)
//   인자 못 만듦 (하중 숫자 없음) → forward (Groq)
//   0.3 ≤ is_command ≤ 0.7      → confirm
//   is_command > 0.7            → execute
// ─────────────────────────────────────────────────────────────
export function decideFromJev(
  r: JevResponse,
  text: string,
  angles: AngleCandidate[],
  ctx: InterpretContext,
  distances: DistanceCandidate[] = [],
  scales: ScaleCandidate[] = [],
): Interpretation {
  const p = noul(r, 'is_command');
  if (p < IS_COMMAND_NO) {
    return { action: 'ignore', command: null, label: `명령 아님 (${p.toFixed(2)})` };
  }
  if (noul(r, 'negated') > IS_COMMAND_YES) {
    return { action: 'ignore', command: null, label: '하지 말라는 말로 이해 → 무시' };
  }
  if (noul(r, 'undo') > IS_COMMAND_YES) return { action: 'execute', command: { type: 'undo' }, label: '되돌리기' };
  const intent = choice(r, 'intent') as Intent | null;
  if (!intent) throw new Error('응답에 intent 없음');
  if (intent === 'other') return { action: 'forward', command: null, label: 'AI 설계로 전달' };

  const command = buildCommand(intent, r, text, angles, ctx, distances, scales);
  if (!command) return { action: 'forward', command: null, label: 'AI 설계로 전달 (인자 해석 실패)' };

  const label = describeCommand(command);
  if (p <= IS_COMMAND_YES) return { action: 'confirm', command, label: `이 명령 맞나요? ${label}` };
  return { action: 'execute', command, label };
}

function buildCommand(
  intent: Exclude<Intent, 'other'>,
  r: JevResponse,
  text: string,
  angles: AngleCandidate[],
  ctx: InterpretContext,
  distances: DistanceCandidate[],
  scales: ScaleCandidate[],
): VoiceCommand | null {
  const dir = () => MOVE_DIRECTION_OPTION[choice(r, 'move_direction') ?? 'not_specified'] ?? null;
  // 후보가 하나뿐이면 Jev가 not_specified를 골라도 그 값 (숫자는 코드가 뽑은 것만 씀)
  const meters = () => distances.find((d) => d.key === choice(r, 'distance'))?.meters ?? (distances.length === 1 ? distances[0].meters : null);
  // 지름·반지름을 말했는데 늘리기·크기·면 크기로 잡히면 지름으로 보정 (Jev intent가 늘려·줄여에 끌려가는 경우)
  if ((intent === 'push_pull' || intent === 'scale_part' || intent === 'taper_face') && /지름|직경/.test(text)) intent = 'set_diameter';
  switch (intent) {
    case 'push_pull':
      return { type: 'push_pull', dir: dir(), meters: meters(), shrink: choice(r, 'resize') === 'shrink' };
    case 'move_part':
      return { type: 'move', dir: dir(), meters: meters() };
    case 'copy_part':
      return { type: 'copy', dir: dir(), meters: meters() };
    case 'delete_part':
      return { type: 'delete' };
    case 'offset_face':
      return { type: 'offset', meters: meters() };
    case 'scale_part': {
      // 윗면·아랫면을 말했으면 전체 크기가 아니라 면 크기 (Jev intent가 배율 표현에 끌려가는 경우 보정)
      if ((choice(r, 'face_end') ?? 'not_specified') !== 'not_specified') return buildCommand('taper_face', r, text, angles, ctx, distances, scales);
      const f = scales.find((c) => c.key === choice(r, 'scale_factor'))?.factor ?? (scales.length === 1 ? scales[0].factor : null);
      return { type: 'scale', factor: f };
    }
    case 'draw_shape':
      return { type: 'draw', shape: choice(r, 'shape') === 'circle' ? 'circle' : 'rect' };
    case 'taper_face': {
      const end = choice(r, 'face_end') === 'bottom' ? 'bottom' : 'top';
      // 뾰족·원뿔 = 0, 배율 후보(절반 = 0.5, 두 배 = 2)는 지금 크기 기준이 아니라 원래 원기둥 기준 비율로
      const pointed = /뾰족|원뿔|꼭짓점/.test(text);
      const f = scales.find((c) => c.key === choice(r, 'scale_factor'))?.factor ?? (scales.length === 1 ? scales[0].factor : null);
      return { type: 'taper', end, ratio: pointed ? 0 : f };
    }
    case 'set_diameter': {
      const m = meters();
      if (m === null) return null;
      const end = choice(r, 'face_end');
      return { type: 'diameter', meters: saysRadius(text) ? m * 2 : m, end: end === 'top' || end === 'bottom' ? end : null };
    }
    case 'dig_hole':
      return { type: 'dig', meters: meters(), through: /뚫|관통|파이프/.test(text) };
    case 'rotate': {
      const axis = AXIS_OPTION[choice(r, 'axis') ?? 'not_specified'] ?? ctx.currentAxis;
      const picked = angles.find((a) => a.key === choice(r, 'amount'));
      const deg = picked?.deg ?? DEFAULT_ROTATE_DEG;
      const sign = DIRECTION_SIGN[choice(r, 'direction') ?? 'not_specified'] ?? 1;
      return { type: 'rotate', axis, deg: sign * deg };
    }
    case 'change_material': {
      const m = choice(r, 'material') as Material | null;
      return m && m in MATERIAL_KO ? { type: 'set_material', material: m } : null;
    }
    case 'change_tool': {
      // 편집 모드("면 크기 도구")가 잡히면 그림 도구보다 우선
      const mode = EDIT_MODE_OPTION[choice(r, 'edit_mode') ?? 'none'] ?? null;
      if (mode) return { type: 'set_mode', mode };
      const t = choice(r, 'tool') as Tool | null;
      return t && t in TOOL_KO ? { type: 'set_tool', tool: t } : null;
    }
    case 'set_load': {
      const kg = parseLoadKg(text, true);
      return kg === null ? null : { type: 'set_load', kg };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 진입점
// ─────────────────────────────────────────────────────────────
export async function interpretVoice(text: string, ctx: InterpretContext): Promise<Interpretation> {
  const angles = extractAngleCandidates(text);
  const distances = extractDistanceCandidates(text);
  const scales = extractScaleCandidates(text);
  try {
    const r = await askJev(text, angles, distances, scales);
    return decideFromJev(r, text, angles, ctx, distances, scales);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn('[voice] Jev 실패 → Groq', msg);
    return { action: 'forward', command: null, label: 'AI 설계로 전달', error: `Jev 실패: ${msg}` };
  }
}

/** 확인 대기 중일 때 다음 발화가 승인/취소인지 (짧은 대답만) */
export function parseConfirmReply(text: string): 'yes' | 'no' | null {
  const t = text.replace(/[\s.!?~]/g, '');
  if (t.length > 8) return null;
  if (/^(아니|아뇨|취소|됐어|하지마)/.test(t)) return 'no';
  if (/^(응|어|네|예|맞아|맞아요|그래|좋아|실행|해줘|오케이|ok)/i.test(t)) return 'yes';
  return null;
}
