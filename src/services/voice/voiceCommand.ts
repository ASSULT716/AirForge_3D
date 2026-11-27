//(조원호) 음성 최종 텍스트 → [Jev 원자 판단] → [코드 truth table] → 실행할 명령
// 빠른 조작(회전·재질·도구·하중)만 여기서 처리. 그 외 / Jev 실패 → Groq(executeNaturalCommand)로 넘김
import { extractAngleCandidates, parseLoadKg, type AngleCandidate } from './koreanNumber';
import {
  AXIS_OPTION,
  DIRECTION_SIGN,
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
  type Tool,
} from './jevQuestions';

export type { Axis, Material, Tool } from './jevQuestions';

export type VoiceCommand =
  | { type: 'rotate'; axis: Axis; deg: number }
  | { type: 'set_material'; material: Material }
  | { type: 'set_tool'; tool: Tool }
  | { type: 'set_load'; kg: number };

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
const TOOL_KO: Record<Tool, string> = { draw: '펜', erase: '지우개', move: '이동', deform: '왜곡', spray: '스프레이' };

export function describeCommand(c: VoiceCommand): string {
  switch (c.type) {
    case 'rotate':
      return `${AXIS_KO[c.axis]} ${c.deg >= 0 ? '+' : ''}${c.deg}° 회전`;
    case 'set_material':
      return `재질 → ${MATERIAL_KO[c.material]}`;
    case 'set_tool':
      return `도구 → ${TOOL_KO[c.tool]}`;
    case 'set_load':
      return `하중 ${c.kg}kg`;
  }
}

// ─────────────────────────────────────────────────────────────
// Jev 호출
// ─────────────────────────────────────────────────────────────
interface ChoiceAnswer { type: 'choice'; choice: string; probabilities: Record<string, number> }
interface NoulAnswer { type: 'noul'; noul: number }
export interface JevResponse { model: string; answers: Record<string, ChoiceAnswer | NoulAnswer> }

async function askJev(text: string, angles: AngleCandidate[]): Promise<JevResponse> {
  const body = { model: JEV_MODEL, state: buildState(text), questions: buildQuestions(angles) };
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
//   undo > 0.7                  → forward (되돌리기는 Groq)
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
): Interpretation {
  const p = noul(r, 'is_command');
  if (p < IS_COMMAND_NO) {
    return { action: 'ignore', command: null, label: `명령 아님 (${p.toFixed(2)})` };
  }
  if (noul(r, 'negated') > IS_COMMAND_YES) {
    return { action: 'ignore', command: null, label: '하지 말라는 말로 이해 → 무시' };
  }
  if (noul(r, 'undo') > IS_COMMAND_YES) return { action: 'forward', command: null, label: '되돌리기 → AI 설계로 전달' };
  const intent = choice(r, 'intent') as Intent | null;
  if (!intent) throw new Error('응답에 intent 없음');
  if (intent === 'other') return { action: 'forward', command: null, label: 'AI 설계로 전달' };

  const command = buildCommand(intent, r, text, angles, ctx);
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
): VoiceCommand | null {
  switch (intent) {
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
  try {
    const r = await askJev(text, angles);
    return decideFromJev(r, text, angles, ctx);
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
