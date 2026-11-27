//(조원호) 음성 최종 텍스트 → [Jev 원자 판단] → [코드 truth table] → 실행할 명령
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
  | { type: 'select_axis'; axis: Axis }
  | { type: 'set_material'; material: Material }
  | { type: 'set_tool'; tool: Tool }
  | { type: 'set_load'; kg: number };

export interface Interpretation {
  /** execute: 바로 실행 / confirm: HUD에 "맞나요?" 표시만 / ignore: 무시 */
  action: 'execute' | 'confirm' | 'ignore';
  command: VoiceCommand | null;
  /** HUD 표시용 해석 결과 ("Y축 +30° 회전") */
  label: string;
  source: 'jev' | 'fallback';
  /** Jev 실패 사유 (fallback으로 넘어간 경우). "아니오"로 취급하지 않고 에러로 표시 */
  error?: string;
}

export interface InterpretContext {
  /** 축을 말하지 않았을 때 쓸 현재 선택 축 */
  currentAxis: Axis;
}

const DEFAULT_ROTATE_DEG = 90;

const AXIS_KO: Record<Axis, string> = { x: 'X축', y: 'Y축', z: 'Z축' };
const MATERIAL_KO: Record<Material, string> = { steel: '강철', wood: '나무', aluminum: '알루미늄', concrete: '콘크리트' };
const TOOL_KO: Record<Tool, string> = { draw: '그리기', erase: '지우개', select: '선택', brush: '브러시' };

export function describeCommand(c: VoiceCommand): string {
  switch (c.type) {
    case 'rotate':
      return `${AXIS_KO[c.axis]} ${c.deg >= 0 ? '+' : ''}${c.deg}° 회전`;
    case 'select_axis':
      return `회전축 → ${AXIS_KO[c.axis]}`;
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
interface JevResponse { model: string; answers: Record<string, ChoiceAnswer | NoulAnswer> }

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
  const a = r.answers[id];
  if (a?.type !== 'noul') throw new Error(`응답에 ${id} 없음`);
  return a.noul;
};
const choice = (r: JevResponse, id: string): string | null => {
  const a = r.answers[id];
  return a?.type === 'choice' ? a.choice : null;
};

// ─────────────────────────────────────────────────────────────
// Truth table: Jev 판단들 → 명령
// ─────────────────────────────────────────────────────────────
export function decideFromJev(
  r: JevResponse,
  text: string,
  angles: AngleCandidate[],
  ctx: InterpretContext,
): Interpretation {
  const p = noul(r, 'is_command');
  const intent = choice(r, 'intent') as Intent | null;
  if (p < IS_COMMAND_NO || !intent) {
    return { action: 'ignore', command: null, label: `명령 아님 (${p.toFixed(2)})`, source: 'jev' };
  }

  const command = buildCommand(intent, r, text, angles, ctx);
  if (!command) {
    return { action: 'ignore', command: null, label: `하중 숫자를 못 찾음: "${text}"`, source: 'jev' };
  }
  const label = describeCommand(command);
  if (p <= IS_COMMAND_YES) {
    return { action: 'confirm', command, label: `이 명령 맞나요? ${label}`, source: 'jev' };
  }
  return { action: 'execute', command, label, source: 'jev' };
}

function buildCommand(
  intent: Intent,
  r: JevResponse,
  text: string,
  angles: AngleCandidate[],
  ctx: InterpretContext,
): VoiceCommand | null {
  const axis = AXIS_OPTION[choice(r, 'axis') ?? 'not_specified'] ?? null;
  switch (intent) {
    case 'rotate': {
      const amountKey = choice(r, 'amount');
      const picked = angles.find((a) => a.key === amountKey);
      const deg = picked?.deg ?? DEFAULT_ROTATE_DEG;
      const sign = DIRECTION_SIGN[choice(r, 'direction') ?? 'not_specified'] ?? 1;
      return { type: 'rotate', axis: axis ?? ctx.currentAxis, deg: sign * deg };
    }
    case 'select_axis':
      return { type: 'select_axis', axis: axis ?? ctx.currentAxis };
    case 'change_material':
      return { type: 'set_material', material: choice(r, 'material') as Material };
    case 'change_tool':
      return { type: 'set_tool', tool: choice(r, 'tool') as Tool };
    case 'set_load': {
      const kg = parseLoadKg(text, true);
      return kg === null ? null : { type: 'set_load', kg };
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Fallback: 정규식·키워드 파서 (Jev 실패/타임아웃 시)
// ─────────────────────────────────────────────────────────────
const MATERIAL_RE: Array<[RegExp, Material]> = [
  [/강철|스틸|철/, 'steel'],
  [/나무|목재|우드/, 'wood'],
  [/알루미늄/, 'aluminum'],
  [/콘크리트|시멘트/, 'concrete'],
];
const TOOL_RE: Array<[RegExp, Tool]> = [
  [/지우개|지우기|지워|삭제/, 'erase'],
  [/브러시|브러쉬|붓|스케치/, 'brush'],
  [/선택/, 'select'],
  [/그리기|그릴|그리는|펜/, 'draw'],
];
const AXIS_RE: Array<[RegExp, Axis]> = [
  [/x\s*축|엑스\s*축|가로\s*축/i, 'x'],
  [/y\s*축|와이\s*축|세로\s*축|수직\s*축/i, 'y'],
  [/z\s*축|제트\s*축|지\s*축|깊이/i, 'z'],
];
const ROTATE_RE = /돌려|돌리|회전|뒤집|바퀴/;

export function fallbackParse(text: string, ctx: InterpretContext, error?: string): Interpretation {
  const t = text.toLowerCase();
  const done = (command: VoiceCommand | null): Interpretation =>
    command
      ? { action: 'execute', command, label: describeCommand(command), source: 'fallback', error }
      : { action: 'ignore', command: null, label: `인식 못 함: "${text}"`, source: 'fallback', error };

  const kg = parseLoadKg(t, false);
  if (kg !== null) return done({ type: 'set_load', kg });

  const axis = AXIS_RE.find(([re]) => re.test(t))?.[1] ?? null;
  if (ROTATE_RE.test(t)) {
    const angles = extractAngleCandidates(t);
    const deg = angles[0]?.deg ?? DEFAULT_ROTATE_DEG;
    const sign = /반\s*시계|시계\s*반대|왼쪽/.test(t) ? 1 : /시계|오른쪽/.test(t) ? -1 : 1;
    return done({ type: 'rotate', axis: axis ?? ctx.currentAxis, deg: sign * deg });
  }
  const material = MATERIAL_RE.find(([re]) => re.test(t))?.[1];
  if (material) return done({ type: 'set_material', material });
  const tool = TOOL_RE.find(([re]) => re.test(t))?.[1];
  if (tool) return done({ type: 'set_tool', tool });
  if (axis) return done({ type: 'select_axis', axis });
  return done(null);
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
    console.warn('[voice] Jev 실패 → fallback', msg);
    return fallbackParse(text, ctx, `Jev 실패: ${msg}`);
  }
}
