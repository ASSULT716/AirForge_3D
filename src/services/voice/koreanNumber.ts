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
