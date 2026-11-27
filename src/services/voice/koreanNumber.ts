//(조원호) 음성 텍스트 → 숫자 파싱 (하중 kg, 회전 각도 후보). 판단 없이 순수 계산만.

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const KO_DIGIT: Record<string, number> = {
  영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9,
};
const KO_UNIT: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };

/** "이백오십" → 250, "천" → 1000, "삼만" → 30000 */
export function parseKoreanNumber(s: string): number | null {
  let total = 0;
  let section = 0;
  let cur = 0;
  let seen = false;
  for (const ch of s) {
    if (ch in KO_DIGIT) {
      cur = KO_DIGIT[ch];
      seen = true;
    } else if (ch in KO_UNIT) {
      section += (cur || 1) * KO_UNIT[ch];
      cur = 0;
      seen = true;
    } else if (ch === '만') {
      total += (section + cur || 1) * 10000;
      section = 0;
      cur = 0;
      seen = true;
    } else {
      return null;
    }
  }
  return seen ? total + section + cur : null;
}

// ── 하중 ──
const UNIT_RE = '(킬로그램|킬로|키로|kg|㎏|kilograms?|kilos?|톤|ton)';
const LOAD_KEYWORD_RE = /(하중|무게|버티|버텨|견디|견뎌|로드|load)/i;

/**
 * 음성/텍스트에서 하중(kg) 추출. 못 찾으면 null.
 * allowBareNumber: 단위 없이 숫자만 있어도 허용 (직접 입력창용)
 */
export function parseLoadKg(text: string, allowBareNumber = false): number | null {
  const t = text.replace(/,/g, '').toLowerCase();
  const toKg = (n: number, unit: string) => (unit === '톤' || unit === 'ton' ? n * 1000 : n);

  const arabic = t.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIT_RE}`));
  if (arabic) return finalize(toKg(parseFloat(arabic[1]), arabic[2]));

  const korean = t.match(new RegExp(`([영공일이삼사오육륙칠팔구십백천만]+)\\s*${UNIT_RE}`));
  if (korean) {
    const n = parseKoreanNumber(korean[1]);
    if (n !== null) return finalize(toKg(n, korean[2]));
  }

  if (allowBareNumber || LOAD_KEYWORD_RE.test(t)) {
    const bare = t.match(/(\d+(?:\.\d+)?)/);
    if (bare) return finalize(parseFloat(bare[1]));
  }
  return null;

  function finalize(kg: number) {
    if (!Number.isFinite(kg) || kg <= 0) return null;
    return Math.round(clamp(kg, 1, 100000) * 10) / 10;
  }
}

// ── 회전 각도 후보 ──
export interface AngleCandidate {
  /** Jev Choice 옵션 이름 (내용을 설명하는 이름: deg_30) */
  key: string;
  deg: number;
  /** 원문에서 찾은 표현 (Jev criteria + HUD 표시용) */
  phrase: string;
}

/** 숫자 없이 각도를 뜻하는 표현. 긴 것부터 매칭 */
const ANGLE_PHRASES: Array<[RegExp, number]> = [
  [/반\s*의\s*반\s*바퀴|사\s*분\s*의\s*일\s*바퀴|4\s*분\s*의\s*1\s*바퀴/, 90],
  [/반\s*바퀴/, 180],
  [/한\s*바퀴|1\s*바퀴/, 360],
  [/직각/, 90],
  [/뒤집/, 180],
];

/**
 * 텍스트에서 각도 후보를 전부 뽑음 (중복 각도 제거).
 * "30도", "구십도", "반바퀴", "직각" 등. "도구"·"도면"의 "도"는 제외.
 */
export function extractAngleCandidates(text: string): AngleCandidate[] {
  const t = text.replace(/,/g, '');
  const out: AngleCandidate[] = [];
  const push = (deg: number, phrase: string) => {
    if (!Number.isFinite(deg) || deg <= 0 || deg > 3600) return;
    deg = Math.round(deg * 10) / 10;
    if (out.some((c) => c.deg === deg)) return;
    out.push({ key: `deg_${String(deg).replace('.', '_')}`, deg, phrase: phrase.trim() });
  };

  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*(?:도(?![구면])|°|degrees?)/gi)) push(parseFloat(m[1]), m[0]);
  for (const m of t.matchAll(/([영일이삼사오육칠팔구십백천]+)\s*도(?![구면])/g)) {
    const n = parseKoreanNumber(m[1]);
    if (n !== null) push(n, m[0]);
  }
  for (const [re, deg] of ANGLE_PHRASES) {
    const m = t.match(re);
    if (m) push(deg, m[0]);
  }
  return out;
}

// ── 거리 후보 (늘리기·이동·복사) ──
export interface DistanceCandidate {
  /** Jev Choice 옵션 이름 (m_1_5) */
  key: string;
  meters: number;
  phrase: string;
}

/** 칸 = 그리드 한 칸 (0.25m) */
const GRID_CELL_M = 0.25;
const NATIVE_COUNT: Record<string, number> = { 한: 1, 두: 2, 세: 3, 석: 3, 네: 4, 넉: 4, 다섯: 5, 여섯: 6 };
const METER_UNIT = '(미터|메터|메다|m(?![a-z])|센티미터|센티|센치|cm|밀리미터|밀리|mm)';
const unitToM = (u: string) => (/^(센티|센치|cm)/.test(u) ? 0.01 : /^(밀리|mm)/.test(u) ? 0.001 : 1);

/**
 * 텍스트에서 거리 후보를 전부 뽑음 (중복 제거). "2미터", "1.5m", "50센티", "이 미터", "반 미터", "세 칸"
 */
export function extractDistanceCandidates(text: string): DistanceCandidate[] {
  const t = text.replace(/,/g, '').toLowerCase();
  const out: DistanceCandidate[] = [];
  const push = (m: number, phrase: string) => {
    if (!Number.isFinite(m) || m <= 0 || m > 100) return;
    m = Math.round(m * 1000) / 1000;
    if (out.some((c) => c.meters === m)) return;
    out.push({ key: `m_${String(m).replace('.', '_')}`, meters: m, phrase: phrase.trim() });
  };
  for (const x of t.matchAll(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${METER_UNIT}`, 'g'))) push(parseFloat(x[1]) * unitToM(x[2]), x[0]);
  for (const x of t.matchAll(new RegExp(`([영일이삼사오육칠팔구십백]+)\\s*${METER_UNIT}`, 'g'))) {
    const n = parseKoreanNumber(x[1]);
    if (n !== null) push(n * unitToM(x[2]), x[0]);
  }
  const half = t.match(/반\s*(미터|m(?![a-z]))/);
  if (half) push(0.5, half[0]);
  for (const x of t.matchAll(/(\d+|한|두|세|석|네|넉|다섯|여섯)\s*칸/g)) {
    const n = /^\d+$/.test(x[1]) ? parseInt(x[1], 10) : NATIVE_COUNT[x[1]];
    if (n) push(n * GRID_CELL_M, x[0]);
  }
  return out;
}

/**
 * 거리만 말한 발화인지 ("2미터", "1.5m로", "50센티만") → 미터. 다른 말이 섞여 있으면 null.
 * 드래그 중·직후에 정확한 값 지정용 (스케치업 치수 입력칸). Jev 거치지 않음
 */
export function parseBareDistance(text: string): number | null {
  const c = extractDistanceCandidates(text);
  if (c.length !== 1) return null;
  const rest = text
    .toLowerCase()
    .replace(c[0].phrase, '')
    .replace(/(으로|로|만큼|정도|쯤|만|더|요|해줘|해|[\s.!?~])/g, '');
  return rest === '' ? c[0].meters : null;
}

// ── 배율 후보 (크기 조절) ──
export interface ScaleCandidate {
  key: string;
  factor: number;
  phrase: string;
}
const NATIVE_TIMES: Record<string, number> = { 두: 2, 세: 3, 네: 4, 다섯: 5 };

/** "2배", "1.5배", "두 배", "절반", "반으로" → 배율 */
export function extractScaleCandidates(text: string): ScaleCandidate[] {
  const t = text.replace(/,/g, '');
  const out: ScaleCandidate[] = [];
  const push = (f: number, phrase: string) => {
    if (!Number.isFinite(f) || f <= 0 || f > 10 || f === 1) return;
    f = Math.round(f * 100) / 100;
    if (out.some((c) => c.factor === f)) return;
    out.push({ key: `x_${String(f).replace('.', '_')}`, factor: f, phrase: phrase.trim() });
  };
  for (const x of t.matchAll(/(\d+(?:\.\d+)?)\s*배/g)) push(parseFloat(x[1]), x[0]);
  for (const x of t.matchAll(/(두|세|네|다섯)\s*배/g)) push(NATIVE_TIMES[x[1]], x[0]);
  const half = t.match(/절반|반\s*(으로|만|크기)/);
  if (half) push(0.5, half[0]);
  return out;
}
