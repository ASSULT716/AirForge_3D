import {
  ArchitecturalDna,
  BuildingSpec,
  BuildingTemplateId,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  InteriorTheme,
  RoofStyle,
} from '../types/cad';

export interface ExtractedHouseStyle {
  templateId: BuildingTemplateId;
  roofStyle: RoofStyle;
  material: CadMaterial;
  accentMaterial: CadMaterial;
  roofMaterial: CadMaterial;
  wallColor: string;
  upperWallColor: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  openPlanRatio: number;
  gardenBoostRatio: number;
  styleSummary: string;
  tags: string[];
  dna: ArchitecturalDna;
  templates: BuildingTemplateOption[];
  analysisSource: 'vision-ai' | 'local-fallback';
  modelUsed: string;
}

const VALID_TEMPLATES: BuildingTemplateId[] = [
  'L-courtyard',
  'U-terrace',
  'stepped-wing',
  'twin-pavilion',
  'bridge-cantilever',
  'split-gable',
  'atrium-ring',
  'mono-loft',
  'courtyard-hanok',
  'stacked-cube',
];

const VALID_ROOFS: RoofStyle[] = [
  'flat-overhang',
  'gable',
  'shed',
  'butterfly',
  'split-gable',
  'hip-eaves',
];

const VALID_MATERIALS: CadMaterial[] = [
  'stucco',
  'wood',
  'concrete',
  'glass',
  'steel',
  'titanium',
  'carbon',
  'gold',
];

const VALID_INTERIORS: InteriorTheme[] = [
  'warm-wood',
  'minimal-gallery',
  'industrial-loft',
  'japandi',
];

const ROOF_LABEL_MAP: Record<RoofStyle, string> = {
  gable: '박공 지붕',
  shed: '모던 경사지붕',
  butterfly: '나비형 역경사지붕',
  'split-gable': '비대칭 스플릿 지붕',
  'flat-overhang': '캔틸레버 처마 평지붕',
  'hip-eaves': '깊은 처마 모임지붕',
};

const STRUCTURE_META: Record<
  BuildingTemplateId,
  {
    shortName: string;
    badge: string;
    defaultRoof: RoofStyle;
    openPlan: number;
    gardenMult: number;
    desc: (tone: string, roof: string, suffix: string) => string;
  }
> = {
  'L-courtyard': {
    shortName: 'L자 교차 중정',
    badge: 'L자 교차 중정 구조',
    defaultRoof: 'gable',
    openPlan: 1.05,
    gardenMult: 1.15,
    desc: (tone, roof, s) =>
      `${tone} 외피에 ${roof}을 결합하고 1·2층 매스를 직교 배치해 프라이빗 마당을 품은 ${s}`,
  },
  'U-terrace': {
    shortName: 'ㄷ자 아트리움',
    badge: 'ㄷ자 중정 3면 채광 구조',
    defaultRoof: 'shed',
    openPlan: 1.1,
    gardenMult: 1.28,
    desc: (tone, roof, s) =>
      `중앙 선큰 정원을 양쪽 윙이 감싸며 ${roof}과 깊은 테라스로 채광을 극대화한 ${tone} ${s}`,
  },
  'stepped-wing': {
    shortName: '스텝 테라스',
    badge: '층별 셋백 테라스 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.12,
    gardenMult: 1.2,
    desc: (tone, roof, s) =>
      `상층부로 갈수록 계단식 후퇴를 주어 각 층 전용 야외 데크와 ${roof}을 만든 ${tone} ${s}`,
  },
  'twin-pavilion': {
    shortName: '트윈 파빌리온',
    badge: '스카이브릿지 트윈동 구조',
    defaultRoof: 'butterfly',
    openPlan: 1.18,
    gardenMult: 1.18,
    desc: (tone, roof, s) =>
      `공용동과 침실동을 좌·우로 분리하고 유리 브릿지와 ${roof}으로 연결한 ${tone} ${s}`,
  },
  'bridge-cantilever': {
    shortName: '필로티 캔틸레버',
    badge: '필로티 캔틸레버 브릿지 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.24,
    gardenMult: 1.12,
    desc: (tone, roof, s) =>
      `1층 코어 위로 2층 매스를 과감히 돌출시켜 하부 피로티 마당과 ${roof}을 구현한 ${tone} ${s}`,
  },
  'split-gable': {
    shortName: '스플릿 듀얼박공',
    badge: '고측창 이중 박공 구조',
    defaultRoof: 'split-gable',
    openPlan: 1.15,
    gardenMult: 1.1,
    desc: (tone, roof, s) =>
      `높이가 다른 두 개의 경사 매스 사이에 고측창 채광 틈을 둔 ${tone} ${roof} ${s}`,
  },
  'atrium-ring': {
    shortName: '채광 아트리움',
    badge: '중앙 보이드 순환 구조',
    defaultRoof: 'gable',
    openPlan: 1.26,
    gardenMult: 1.22,
    desc: (tone, roof, s) =>
      `건물 중앙 수직 채광 아트리움을 중심으로 모든 실이 순환 배치된 ${tone} ${roof} ${s}`,
  },
  'mono-loft': {
    shortName: '모노 경사로프트',
    badge: '단경사 하이실링 로프트 구조',
    defaultRoof: 'shed',
    openPlan: 1.32,
    gardenMult: 1.05,
    desc: (tone, roof, s) =>
      `한 방향으로 높게 솟은 ${roof} 아래 복층급 개방 거실과 통창을 배치한 ${tone} ${s}`,
  },
  'courtyard-hanok': {
    shortName: '모던 처마 중정',
    badge: '깊은 처마·툇마루 중정 구조',
    defaultRoof: 'hip-eaves',
    openPlan: 1.08,
    gardenMult: 1.32,
    desc: (tone, roof, s) =>
      `깊게 내민 ${roof}과 남측 목재 툇마루 데크로 한국적 비례미를 현대화한 ${tone} ${s}`,
  },
  'stacked-cube': {
    shortName: '직교 적층 큐브',
    badge: '비대칭 회전 적층 매스 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.22,
    gardenMult: 1.08,
    desc: (tone, roof, s) =>
      `서로 다른 비율의 상·하층 볼륨을 어긋나게 쌓아 조각적 입면과 ${roof}을 만든 ${tone} ${s}`,
  },
};

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function isValidHex(c: unknown): c is string {
  return typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim());
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (v: number) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Vision API 전송 전 이미지를 최대 768px JPEG로 경량화 */
async function downscaleImageForVision(dataUrl: string, maxDim = 768): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height, 1));
      const w = Math.max(64, Math.round(img.width * scale));
      const h = Math.max(64, Math.round(img.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL('image/jpeg', 0.78));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/** Vision AI 프롬프트: 실제 건축물의 기하학·지붕·재료·창호·실내 DNA를 엄격한 JSON으로 추출 */
const VISION_ARCHITECT_PROMPT = `You are a licensed Korean senior architect and 3D CAD parametric modeling specialist.
Inspect ALL provided reference house images together (image 1 = primary exterior/facade, image 2 = secondary/roof/massing if present, image 3+ = interior/atmosphere if present).
Extract the TRUE architectural geometry, materials, roof shape, proportions, window-to-wall ratio, and interior feel so our 3D CAD engine can faithfully recreate a similar house.

Return ONLY valid JSON with this exact structure (no markdown, no explanation):
{
  "massingStyle": "L-courtyard" | "U-terrace" | "stepped-wing" | "twin-pavilion" | "bridge-cantilever" | "split-gable" | "atrium-ring" | "mono-loft" | "courtyard-hanok" | "stacked-cube",
  "roofStyle": "flat-overhang" | "gable" | "shed" | "butterfly" | "split-gable" | "hip-eaves",
  "roofPitchDeg": number (0 for flat-overhang, 12-36 for pitched roofs),
  "overhangScale": number (0.08 to 0.40, higher for deep eaves/hanok/cantilever),
  "windowWallRatio": number (0.25 to 0.85, e.g. 0.75 for floor-to-ceiling glass walls, 0.35 for punched windows),
  "floor1Material": "stucco" | "wood" | "concrete" | "glass" | "steel" | "titanium" | "carbon" | "gold",
  "upperMaterial": "stucco" | "wood" | "concrete" | "glass" | "steel" | "titanium" | "carbon" | "gold",
  "roofMaterial": "stucco" | "wood" | "concrete" | "glass" | "steel" | "titanium" | "carbon" | "gold",
  "wallColor": "#RRGGBB (accurate 1F exterior wall hex from photo)",
  "upperWallColor": "#RRGGBB (accurate upper floor exterior hex from photo)",
  "roofColor": "#RRGGBB (accurate roof hex from photo)",
  "interiorTheme": "warm-wood" | "minimal-gallery" | "industrial-loft" | "japandi",
  "interiorWallColor": "#RRGGBB",
  "interiorFloorColor": "#RRGGBB",
  "suggestedFloors": number (1 to 4),
  "hasCantilever": boolean,
  "hasPorchDeck": boolean,
  "gardenDensity": number (0.7 to 1.5),
  "architecturalNote": "한국어 한 문장으로 사진 속 건물의 실제 형태·지붕·외장재·분위기 요약"
}`;

function sanitizeDna(raw: Record<string, unknown>, fallback: ArchitecturalDna): ArchitecturalDna {
  const massingStyle = VALID_TEMPLATES.includes(raw.massingStyle as BuildingTemplateId)
    ? (raw.massingStyle as BuildingTemplateId)
    : fallback.massingStyle;
  const roofStyle = VALID_ROOFS.includes(raw.roofStyle as RoofStyle)
    ? (raw.roofStyle as RoofStyle)
    : fallback.roofStyle;
  const floor1Material = VALID_MATERIALS.includes(raw.floor1Material as CadMaterial)
    ? (raw.floor1Material as CadMaterial)
    : fallback.floor1Material;
  const upperMaterial = VALID_MATERIALS.includes(raw.upperMaterial as CadMaterial)
    ? (raw.upperMaterial as CadMaterial)
    : fallback.upperMaterial;
  const roofMaterial = VALID_MATERIALS.includes(raw.roofMaterial as CadMaterial)
    ? (raw.roofMaterial as CadMaterial)
    : fallback.roofMaterial;
  const interiorTheme = VALID_INTERIORS.includes(raw.interiorTheme as InteriorTheme)
    ? (raw.interiorTheme as InteriorTheme)
    : fallback.interiorTheme;

  return {
    massingStyle,
    roofStyle,
    roofPitchDeg:
      roofStyle === 'flat-overhang'
        ? 0
        : clamp(Number(raw.roofPitchDeg ?? fallback.roofPitchDeg) || 20, 8, 38),
    overhangScale: clamp(Number(raw.overhangScale ?? fallback.overhangScale) || 0.18, 0.06, 0.42),
    windowWallRatio: clamp(
      Number(raw.windowWallRatio ?? fallback.windowWallRatio) || 0.52,
      0.22,
      0.86
    ),
    floor1Material,
    upperMaterial,
    roofMaterial,
    wallColor: isValidHex(raw.wallColor) ? raw.wallColor : fallback.wallColor,
    upperWallColor: isValidHex(raw.upperWallColor) ? raw.upperWallColor : fallback.upperWallColor,
    roofColor: isValidHex(raw.roofColor) ? raw.roofColor : fallback.roofColor,
    interiorTheme,
    interiorWallColor: isValidHex(raw.interiorWallColor)
      ? raw.interiorWallColor
      : fallback.interiorWallColor,
    interiorFloorColor: isValidHex(raw.interiorFloorColor)
      ? raw.interiorFloorColor
      : fallback.interiorFloorColor,
    suggestedFloors: clamp(Math.round(Number(raw.suggestedFloors ?? fallback.suggestedFloors) || 2), 1, 5),
    hasCantilever:
      typeof raw.hasCantilever === 'boolean' ? raw.hasCantilever : fallback.hasCantilever,
    hasPorchDeck: typeof raw.hasPorchDeck === 'boolean' ? raw.hasPorchDeck : fallback.hasPorchDeck,
    gardenDensity: clamp(Number(raw.gardenDensity ?? fallback.gardenDensity) || 1.1, 0.6, 1.6),
    architecturalNote:
      typeof raw.architecturalNote === 'string' && raw.architecturalNote.trim()
        ? raw.architecturalNote.trim()
        : fallback.architecturalNote,
  };
}

/** 실제 Vision AI 호출 (OpenRouter Gemini Vision 우선, 없으면 Groq Vision 시도) */
async function callVisionArchitectAi(
  compressedUrls: string[],
  fallback: ArchitecturalDna
): Promise<{ dna: ArchitecturalDna; usedVision: boolean; modelUsed: string }> {
  const openRouterKey = import.meta.env.VITE_OPENROUTER_API_KEY;
  const groqKey = import.meta.env.VITE_GROQ_API_KEY;

  const contentParts: Array<
    { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }
  > = [{ type: 'text', text: VISION_ARCHITECT_PROMPT }];

  compressedUrls.slice(0, 4).forEach((url) => {
    contentParts.push({ type: 'image_url', image_url: { url } });
  });

  // 1순위: OpenRouter 멀티모달 Vision (기본: google/gemini-2.0-flash-001, .env의 VITE_VISION_MODEL로 변경 가능)
  if (openRouterKey && openRouterKey !== '여기에_API_키_입력') {
    const model = import.meta.env.VITE_VISION_MODEL || 'google/gemini-2.0-flash-001';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 700,
          messages: [{ role: 'user', content: contentParts }],
        }),
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const text: string = json?.choices?.[0]?.message?.content ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return {
            dna: sanitizeDna(parsed, fallback),
            usedVision: true,
            modelUsed: `OpenRouter (${model})`,
          };
        }
      }
    } catch {
      // 다음 공급자 또는 로컬 폴백으로 전환
    }
  }

  // 2순위: Groq Vision 엔드포인트 (.env에 VITE_GROQ_VISION_MODEL 지정 가능)
  if (groqKey && groqKey !== '여기에_API_키_입력') {
    const model =
      import.meta.env.VITE_GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16000);
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_completion_tokens: 700,
          response_format: { type: 'json_object' },
          messages: [{ role: 'user', content: contentParts }],
        }),
      });
      clearTimeout(timer);

      if (res.ok) {
        const json = await res.json();
        const text: string = json?.choices?.[0]?.message?.content ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          return {
            dna: sanitizeDna(parsed, fallback),
            usedVision: true,
            modelUsed: `Groq Vision (${model})`,
          };
        }
      }
    } catch {
      // 로컬 폴백으로 전환
    }
  }

  return {
    dna: fallback,
    usedVision: false,
    modelUsed: '로컬 구역·경사 추정 (Vision API 키 미설정)',
  };
}

/** 오프라인/API 실패 시 구역 분할(상단 지붕 / 중상단 2F / 하단 1F / 좌우 대칭성) 로컬 휴리스틱 폴백 */
async function buildLocalFallbackDna(dataUrls: string[]): Promise<ArchitecturalDna> {
  const firstUrl = dataUrls[0];
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const size = 96;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve({
          massingStyle: 'L-courtyard',
          roofStyle: 'gable',
          roofPitchDeg: 22,
          overhangScale: 0.2,
          windowWallRatio: 0.55,
          floor1Material: 'stucco',
          upperMaterial: 'wood',
          roofMaterial: 'steel',
          wallColor: '#f5f2eb',
          upperWallColor: '#c89b6e',
          roofColor: '#3f3f46',
          interiorTheme: 'warm-wood',
          interiorWallColor: '#faf7f2',
          interiorFloorColor: '#c89b6e',
          suggestedFloors: 2,
          hasCantilever: false,
          hasPorchDeck: true,
          gardenDensity: 1.1,
          architecturalNote: '웜 스타코와 우드 포인트가 어우러진 모던 주택 (로컬 추정)',
        });
        return;
      }

      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size).data;

      const sampleZone = (x0: number, y0: number, x1: number, y1: number) => {
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        let wood = 0;
        let dark = 0;
        let glass = 0;
        let green = 0;
        for (let y = y0; y < y1; y++) {
          for (let x = x0; x < x1; x++) {
            const i = (y * size + x) * 4;
            const pr = data[i];
            const pg = data[i + 1];
            const pb = data[i + 2];
            r += pr;
            g += pg;
            b += pb;
            n++;
            if (pr > pg + 14 && pg > pb + 10 && pr > 80) wood++;
            if (pr < 75 && pg < 80 && pb < 95) dark++;
            if (pb > pr + 12 && pb > 110) glass++;
            if (pg > pr + 10 && pg > pb + 10 && pg > 55) green++;
          }
        }
        const safe = Math.max(1, n);
        return {
          hex: rgbToHex(r / safe, g / safe, b / safe),
          luma: (r + g + b) / (3 * safe),
          woodRatio: wood / safe,
          darkRatio: dark / safe,
          glassRatio: glass / safe,
          greenRatio: green / safe,
        };
      };

      const roofZone = sampleZone(20, 14, 76, 36);
      const upperZone = sampleZone(22, 36, 74, 58);
      const lowerZone = sampleZone(22, 58, 74, 80);
      const fullZone = sampleZone(0, 0, size, size);

      const pickMat = (z: ReturnType<typeof sampleZone>): CadMaterial => {
        if (z.woodRatio > 0.16) return 'wood';
        if (z.glassRatio > 0.22) return 'glass';
        if (z.darkRatio > 0.28) return 'steel';
        if (z.luma < 145) return 'concrete';
        return 'stucco';
      };

      const floor1Material = pickMat(lowerZone);
      const upperMaterial = pickMat(upperZone);
      const roofMaterial: CadMaterial = roofZone.woodRatio > 0.15 ? 'wood' : 'steel';
      const roofStyle: RoofStyle =
        roofZone.darkRatio > 0.22
          ? 'gable'
          : roofZone.luma > 185
          ? 'flat-overhang'
          : 'shed';

      const massingStyle: BuildingTemplateId =
        fullZone.greenRatio > 0.18
          ? 'U-terrace'
          : upperMaterial !== floor1Material
          ? 'stacked-cube'
          : lowerZone.glassRatio > 0.18
          ? 'bridge-cantilever'
          : 'L-courtyard';

      const interiorTheme: InteriorTheme =
        upperMaterial === 'wood' || floor1Material === 'wood'
          ? 'warm-wood'
          : floor1Material === 'concrete' || floor1Material === 'steel'
          ? 'industrial-loft'
          : 'minimal-gallery';

      resolve({
        massingStyle,
        roofStyle,
        roofPitchDeg: roofStyle === 'flat-overhang' ? 0 : 22,
        overhangScale: roofStyle === 'gable' ? 0.22 : 0.18,
        windowWallRatio: clamp(0.38 + fullZone.glassRatio * 1.4, 0.35, 0.78),
        floor1Material,
        upperMaterial,
        roofMaterial,
        wallColor: lowerZone.hex,
        upperWallColor: upperZone.hex,
        roofColor: roofZone.luma > 180 ? '#475569' : roofZone.hex,
        interiorTheme,
        interiorWallColor: interiorTheme === 'industrial-loft' ? '#e2e8f0' : '#faf7f2',
        interiorFloorColor: interiorTheme === 'industrial-loft' ? '#94a3b8' : '#c89b6e',
        suggestedFloors: img.height > img.width * 1.1 ? 3 : 2,
        hasCantilever: upperMaterial !== floor1Material,
        hasPorchDeck: fullZone.greenRatio > 0.12 || floor1Material === 'wood',
        gardenDensity: clamp(0.95 + fullZone.greenRatio * 2.2, 0.85, 1.45),
        architecturalNote: `로컬 구역 추정: 1F ${floor1Material.toUpperCase()} · 상층 ${upperMaterial.toUpperCase()} · ${ROOF_LABEL_MAP[roofStyle]} (정밀 분석을 위해 .env에 VITE_OPENROUTER_API_KEY 또는 VITE_GROQ_API_KEY 설정 권장)`,
      });
    };
    img.onerror = () => {
      resolve({
        massingStyle: 'L-courtyard',
        roofStyle: 'gable',
        roofPitchDeg: 22,
        overhangScale: 0.2,
        windowWallRatio: 0.55,
        floor1Material: 'stucco',
        upperMaterial: 'wood',
        roofMaterial: 'steel',
        wallColor: '#f5f2eb',
        upperWallColor: '#c89b6e',
        roofColor: '#3f3f46',
        interiorTheme: 'warm-wood',
        interiorWallColor: '#faf7f2',
        interiorFloorColor: '#c89b6e',
        suggestedFloors: 2,
        hasCantilever: false,
        hasPorchDeck: true,
        gardenDensity: 1.1,
        architecturalNote: '모던 웜 스타코·우드 단독주택 기본 추정',
      });
    };
    img.src = firstUrl;
  });
}

const MAT_TONE_KO: Record<CadMaterial, string> = {
  stucco: '웜 스타코',
  wood: '내추럴 우드',
  concrete: '노출콘크리트',
  glass: '파노라마 글라스',
  hologram: '라이트 글라스',
  steel: '징크 스틸',
  titanium: '티타늄 메탈',
  carbon: '다크 카본',
  gold: '샴페인 메탈',
};

/** 추출된 ArchitecturalDna를 1안(직결안)으로 삼아 서로 완전히 다른 10종의 디자인 템플릿 생성 */
export function buildTenTemplatesFromDna(
  dna: ArchitecturalDna,
  category: Exclude<DesignCategory, '3D 디자인'>,
  isPhotoDerived: boolean
): BuildingTemplateOption[] {
  const catSuffix =
    category === '단독주택'
      ? '하우스'
      : category === '공동주택'
      ? '레지던스'
      : category === '업무·상업시설'
      ? '파빌리온'
      : '아트센터';

  const orderedIds: BuildingTemplateId[] = [
    dna.massingStyle,
    ...VALID_TEMPLATES.filter((id) => id !== dna.massingStyle),
  ];

  const roofCycle: RoofStyle[] = [
    dna.roofStyle,
    'gable',
    'shed',
    'flat-overhang',
    'butterfly',
    'split-gable',
    'hip-eaves',
    'gable',
    'shed',
    'flat-overhang',
  ];

  const interiorCycle: InteriorTheme[] = [
    dna.interiorTheme,
    'warm-wood',
    'japandi',
    'minimal-gallery',
    'industrial-loft',
    'warm-wood',
    'minimal-gallery',
    'japandi',
    'warm-wood',
    'industrial-loft',
  ];

  const interiorPalette: Record<InteriorTheme, { wall: string; floor: string }> = {
    'warm-wood': { wall: '#f8f0e5', floor: '#c48f5a' },
    'minimal-gallery': { wall: '#f8fafc', floor: '#cbd5e1' },
    japandi: { wall: '#faf6ef', floor: '#d6b48c' },
    'industrial-loft': { wall: '#e2e8f0', floor: '#8d99ae' },
  };

  return orderedIds.map((tplId, idx) => {
    const meta = STRUCTURE_META[tplId];
    const roof: RoofStyle = idx === 0 ? dna.roofStyle : meta.defaultRoof || roofCycle[idx];
    const iTheme = interiorCycle[idx];
    const iPal = idx === 0
      ? { wall: dna.interiorWallColor, floor: dna.interiorFloorColor }
      : interiorPalette[iTheme];

    // 1안은 사진 DNA 직결, 2~10안은 사진의 주 재질/색감을 계승하면서 상·하층 재질·지붕·매스를 다양화
    const primaryMat: CadMaterial =
      idx === 0
        ? dna.floor1Material
        : idx % 3 === 1
        ? dna.upperMaterial
        : idx % 3 === 2
        ? dna.floor1Material
        : dna.floor1Material === 'wood'
        ? 'stucco'
        : 'wood';

    const accentMat: CadMaterial =
      idx === 0
        ? dna.upperMaterial
        : idx % 2 === 1
        ? dna.floor1Material === primaryMat
          ? 'wood'
          : dna.floor1Material
        : 'glass';

    const toneLabel =
      idx === 0
        ? `${MAT_TONE_KO[dna.floor1Material]}·${MAT_TONE_KO[dna.upperMaterial]}`
        : MAT_TONE_KO[primaryMat];

    const name =
      idx === 0 && isPhotoDerived
        ? `[사진 직결] ${toneLabel} ${meta.shortName} ${catSuffix}`
        : `${toneLabel} ${meta.shortName} ${catSuffix}`;

    return {
      id: tplId,
      name,
      subtitle:
        idx === 0 && isPhotoDerived
          ? dna.architecturalNote
          : meta.desc(toneLabel, ROOF_LABEL_MAP[roof], catSuffix),
      concept: `${name} (${ROOF_LABEL_MAP[roof]})`,
      roofStyle: roof,
      roofPitchDeg:
        roof === 'flat-overhang'
          ? 0
          : idx === 0
          ? dna.roofPitchDeg
          : roof === 'gable' || roof === 'hip-eaves'
          ? 24
          : 16,
      overhangScale:
        idx === 0
          ? dna.overhangScale
          : tplId === 'courtyard-hanok'
          ? 0.36
          : roof === 'flat-overhang'
          ? 0.24
          : 0.18,
      windowWallRatio:
        idx === 0
          ? dna.windowWallRatio
          : tplId === 'mono-loft' || tplId === 'twin-pavilion'
          ? 0.74
          : 0.52,
      primaryMaterial: primaryMat,
      accentMaterial: accentMat,
      roofMaterial: idx === 0 ? dna.roofMaterial : roof === 'flat-overhang' ? 'wood' : 'steel',
      wallColor: idx === 0 ? dna.wallColor : idx % 2 === 0 ? dna.wallColor : dna.upperWallColor,
      upperWallColor: idx === 0 ? dna.upperWallColor : dna.wallColor,
      roofColor: dna.roofColor,
      interiorTheme: iTheme,
      interiorWallColor: iPal.wall,
      interiorFloorColor: iPal.floor,
      openPlanRatio: meta.openPlan,
      gardenMultiplier: idx === 0 ? dna.gardenDensity : meta.gardenMult,
      hasCantilever: idx === 0 ? dna.hasCantilever : tplId === 'bridge-cantilever' || tplId === 'stacked-cube',
      hasPorchDeck: idx === 0 ? dna.hasPorchDeck : tplId === 'courtyard-hanok' || tplId === 'L-courtyard',
      structureBadge: meta.badge,
      roofBadge: ROOF_LABEL_MAP[roof],
      isPhotoDerived,
    };
  });
}

/** 메인 엔트리: 여러 장의 참조 사진 → Vision AI 건축 DNA 추출 → 10종 맞춤형 템플릿 생성 */
export async function analyzeMultipleHousePhotosAndAdaptSpec(
  dataUrls: string[],
  currentSpec: BuildingSpec,
  lockedKeys: Partial<Record<string, boolean>> = {}
): Promise<{
  adaptedSpec: BuildingSpec;
  extracted: ExtractedHouseStyle;
}> {
  const validUrls = dataUrls.filter(Boolean);
  const compressed = await Promise.all(
    validUrls.slice(0, 4).map((url) => downscaleImageForVision(url, 768))
  );

  const fallbackDna = await buildLocalFallbackDna(compressed);
  const { dna, usedVision, modelUsed } = await callVisionArchitectAi(compressed, fallbackDna);

  const category: Exclude<DesignCategory, '3D 디자인'> =
    currentSpec.usageType === '3D 디자인' ? '단독주택' : currentSpec.usageType;

  const tenTemplates = buildTenTemplatesFromDna(dna, category, true);
  const firstTpl = tenTemplates[0];

  const tags = Array.from(
    new Set([
      usedVision ? 'Vision AI 정밀추출' : '로컬 추정모드',
      `1F:${dna.floor1Material.toUpperCase()}`,
      `상층:${dna.upperMaterial.toUpperCase()}`,
      `${ROOF_LABEL_MAP[dna.roofStyle]} ${dna.roofPitchDeg}°`,
      `창호비 ${Math.round(dna.windowWallRatio * 100)}%`,
    ])
  );

  const extracted: ExtractedHouseStyle = {
    templateId: firstTpl.id,
    roofStyle: dna.roofStyle,
    material: dna.floor1Material,
    accentMaterial: dna.upperMaterial,
    roofMaterial: dna.roofMaterial,
    wallColor: dna.wallColor,
    upperWallColor: dna.upperWallColor,
    roofColor: dna.roofColor,
    interiorTheme: dna.interiorTheme,
    interiorWallColor: dna.interiorWallColor,
    interiorFloorColor: dna.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    gardenBoostRatio: dna.gardenDensity,
    styleSummary: dna.architecturalNote,
    tags,
    dna,
    templates: tenTemplates,
    analysisSource: usedVision ? 'vision-ai' : 'local-fallback',
    modelUsed,
  };

  const nextFloors = !lockedKeys.floors ? dna.suggestedFloors : currentSpec.floors;
  const floorHeightAvg = currentSpec.heightMeters / Math.max(1, currentSpec.floors);
  const nextHeight =
    !lockedKeys.heightMeters && nextFloors !== currentSpec.floors
      ? Number((nextFloors * floorHeightAvg).toFixed(1))
      : currentSpec.heightMeters;
  const nextTotalArea =
    !lockedKeys.totalFloorAreaSqm && nextFloors !== currentSpec.floors
      ? Math.round(currentSpec.buildingAreaSqm * nextFloors)
      : currentSpec.totalFloorAreaSqm;
  const nextGardenArea = !lockedKeys.gardenAreaSqm
    ? Math.min(
        Math.round(currentSpec.siteAreaSqm * 0.55),
        Math.max(0, Math.round(currentSpec.gardenAreaSqm * dna.gardenDensity))
      )
    : currentSpec.gardenAreaSqm;

  const adaptedSpec: BuildingSpec = {
    ...currentSpec,
    usageType: category,
    templateId: firstTpl.id,
    selectedTemplateName: firstTpl.name,
    dynamicTemplates: tenTemplates,
    architecturalDna: dna,
    roofStyle: dna.roofStyle,
    roofPitchDeg: dna.roofPitchDeg,
    overhangScale: dna.overhangScale,
    windowWallRatio: dna.windowWallRatio,
    accentMaterial: dna.upperMaterial,
    roofMaterial: dna.roofMaterial,
    interiorTheme: dna.interiorTheme,
    interiorWallColor: dna.interiorWallColor,
    interiorFloorColor: dna.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    floors: nextFloors,
    heightMeters: nextHeight,
    totalFloorAreaSqm: nextTotalArea,
    gardenAreaSqm: nextGardenArea,
    customWallColor: dna.wallColor,
    customUpperWallColor: dna.upperWallColor,
    customRoofColor: dna.roofColor,
    styleSummary: dna.architecturalNote,
    photoCount: validUrls.length,
    analysisSource: usedVision ? 'vision-ai' : 'local-fallback',
    designConcept: `${dna.architecturalNote} · ${firstTpl.name}`,
  };

  return { adaptedSpec, extracted };
}