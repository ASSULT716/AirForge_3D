import {
  ArchitecturalDna,
  BuildingSpec,
  BuildingTemplateId,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  ElementMaterialSpec,
  GlazingSpec,
  InsulationSpec,
  InteriorTheme,
  RoofStyle,
  StructuralSystemId,
} from '../types/cad';
import {
  resolveSafeStructuralSystem,
  STRUCTURAL_SYSTEM_DB,
} from '../utils/structuralPhysics';

export interface ExtractedHouseStyle {
  templateId: BuildingTemplateId;
  roofStyle: RoofStyle;
  structuralSystem: StructuralSystemId;
  elementMaterials: ElementMaterialSpec;
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
  materialBreakdown: string[];
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

const VALID_SYSTEMS: StructuralSystemId[] = [
  'rc_frame',
  'steel_frame',
  'heavy_timber',
  'hybrid_rc_steel',
];

const VALID_GLAZINGS: GlazingSpec[] = ['double_lowe', 'triple_lowe', 'curtain_wall'];

const VALID_INSULATIONS: InsulationSpec[] = [
  'eps_150',
  'pf_board_120',
  'mineral_wool_150',
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

const MAT_TONE_KO: Record<CadMaterial, string> = {
  stucco: '스타코플렉스(외단열)',
  wood: '적삼목/탄화목 사이딩',
  concrete: '노출콘크리트',
  glass: '로이 커튼월 유리',
  hologram: '로이 유리 파사드',
  steel: '리얼징크/스틸패널',
  titanium: '티타늄 아연판',
  carbon: '세라믹 복합패널',
  gold: '아노다이징 알루미늄',
};

const GLAZING_LABEL_KO: Record<GlazingSpec, string> = {
  double_lowe: '이중 로이 시스템 창호',
  triple_lowe: '독일식 삼중 로이 시스템 창호',
  curtain_wall: '알루미늄 삼중 로이 커튼월',
};

const INSULATION_LABEL_KO: Record<InsulationSpec, string> = {
  eps_150: '비드법 2종 외단열(EPS 150T)',
  pf_board_120: '고성능 페놀폼 단열재(PF 120T)',
  mineral_wool_150: '불연 미네랄울 단열재(150T)',
};

const STRUCTURE_META: Record<
  BuildingTemplateId,
  {
    shortName: string;
    badge: string;
    defaultRoof: RoofStyle;
    openPlan: number;
    gardenMult: number;
    desc: (tone: string, roof: string, sysName: string, suffix: string) => string;
  }
> = {
  'L-courtyard': {
    shortName: 'L자 교차 중정',
    badge: 'L자 교차 중정 구조',
    defaultRoof: 'gable',
    openPlan: 1.05,
    gardenMult: 1.15,
    desc: (tone, roof, sys, s) =>
      `${sys} 골조에 ${tone} 외피와 ${roof}을 결합해 프라이빗 마당을 품은 ${s}`,
  },
  'U-terrace': {
    shortName: 'ㄷ자 아트리움',
    badge: 'ㄷ자 중정 3면 채광 구조',
    defaultRoof: 'shed',
    openPlan: 1.1,
    gardenMult: 1.28,
    desc: (tone, roof, sys, s) =>
      `${sys} 기반 양쪽 윙이 선큰 정원을 감싸며 ${roof}으로 채광을 극대화한 ${tone} ${s}`,
  },
  'stepped-wing': {
    shortName: '스텝 테라스',
    badge: '층별 셋백 테라스 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.12,
    gardenMult: 1.2,
    desc: (tone, roof, sys, s) =>
      `${sys} 단차 구조로 층별 야외 데크와 ${roof}을 안정적으로 구현한 ${tone} ${s}`,
  },
  'twin-pavilion': {
    shortName: '트윈 파빌리온',
    badge: '스카이브릿지 트윈동 구조',
    defaultRoof: 'butterfly',
    openPlan: 1.18,
    gardenMult: 1.18,
    desc: (tone, roof, sys, s) =>
      `공용동과 침실동을 분리하고 ${sys} 브릿지와 ${roof}으로 연결한 ${tone} ${s}`,
  },
  'bridge-cantilever': {
    shortName: '필로티 캔틸레버',
    badge: '필로티 캔틸레버 브릿지 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.24,
    gardenMult: 1.12,
    desc: (tone, roof, sys, s) =>
      `${sys} 1층 코어 위로 2층 매스를 구조 보강 돌출시킨 ${tone} ${roof} ${s}`,
  },
  'split-gable': {
    shortName: '스플릿 듀얼박공',
    badge: '고측창 이중 박공 구조',
    defaultRoof: 'split-gable',
    openPlan: 1.15,
    gardenMult: 1.1,
    desc: (tone, _roof, sys, s) =>
      `${sys} 위에 높이가 다른 두 경사 매스와 고측창 채광 틈을 둔 ${tone} ${s}`,
  },
  'atrium-ring': {
    shortName: '채광 아트리움',
    badge: '중앙 보이드 순환 구조',
    defaultRoof: 'gable',
    openPlan: 1.26,
    gardenMult: 1.22,
    desc: (tone, roof, sys, s) =>
      `${sys} 순환 골조 중앙에 수직 채광 아트리움과 ${roof}을 배치한 ${tone} ${s}`,
  },
  'mono-loft': {
    shortName: '모노 경사로프트',
    badge: '단경사 하이실링 로프트 구조',
    defaultRoof: 'shed',
    openPlan: 1.32,
    gardenMult: 1.05,
    desc: (tone, roof, sys, s) =>
      `${sys} 장스팬 골조와 ${roof} 아래 복층급 개방 거실을 배치한 ${tone} ${s}`,
  },
  'courtyard-hanok': {
    shortName: '모던 처마 중정',
    badge: '깊은 처마·툇마루 중정 구조',
    defaultRoof: 'hip-eaves',
    openPlan: 1.08,
    gardenMult: 1.32,
    desc: (tone, roof, sys, s) =>
      `${sys} 구조에 깊은 ${roof}과 남측 툇마루 데크를 결합한 ${tone} ${s}`,
  },
  'stacked-cube': {
    shortName: '직교 적층 큐브',
    badge: '비대칭 회전 적층 매스 구조',
    defaultRoof: 'flat-overhang',
    openPlan: 1.22,
    gardenMult: 1.08,
    desc: (tone, _roof, sys, s) =>
      `${sys} 기둥·보 그리드 위로 상·하층 볼륨을 교차 적층한 ${tone} ${s}`,
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

/**
 * 유리 단독 주택·무골조 목조 고층 등 비현실적 조합을 공학적으로 보정하여
 * 실제 주 구조체 + 불투명 스팬드럴 외장재 + 창호/단열 명세를 강제 구성
 */
function buildSafeElementMaterials(params: {
  usageType: DesignCategory;
  floors: number;
  floor1Material: CadMaterial;
  upperMaterial: CadMaterial;
  roofMaterial: CadMaterial;
  windowWallRatio: number;
  requestedSystem?: StructuralSystemId;
  requestedGlazing?: GlazingSpec;
  requestedInsulation?: InsulationSpec;
}): {
  elementMaterials: ElementMaterialSpec;
  safeWindowRatio: number;
  materialBreakdown: string[];
} {
  const {
    usageType,
    floors,
    floor1Material,
    upperMaterial,
    roofMaterial,
    windowWallRatio,
    requestedSystem,
    requestedGlazing,
    requestedInsulation,
  } = params;

  const isGlassDominant =
    floor1Material === 'glass' ||
    upperMaterial === 'glass' ||
    windowWallRatio >= 0.65;

  const structuralSystem = resolveSafeStructuralSystem({
    usageType,
    floors,
    windowWallRatio: isGlassDominant ? Math.max(0.72, windowWallRatio) : windowWallRatio,
    primaryMaterial: floor1Material,
    requestedSystem,
  });

  // 유리가 주재질로 뽑히더라도 불투명 구조 스팬드럴/코어 외장재는 반드시 콘크리트·징크 스틸로 지정
  const exteriorCladding: CadMaterial =
    floor1Material === 'glass' || floor1Material === 'hologram'
      ? structuralSystem === 'steel_frame'
        ? 'steel'
        : 'concrete'
      : floor1Material;

  const upperCladding: CadMaterial =
    upperMaterial === 'glass' || upperMaterial === 'hologram'
      ? 'steel'
      : upperMaterial;

  const safeRoofMaterial: CadMaterial =
    roofMaterial === 'glass' || roofMaterial === 'hologram' ? 'steel' : roofMaterial;

  const safeWindowRatio = isGlassDominant
    ? clamp(Math.max(0.7, windowWallRatio), 0.68, 0.82)
    : clamp(windowWallRatio, 0.28, 0.66);

  const glazingSpec: GlazingSpec =
    requestedGlazing && VALID_GLAZINGS.includes(requestedGlazing)
      ? requestedGlazing
      : isGlassDominant
      ? 'curtain_wall'
      : floors >= 3 || structuralSystem === 'heavy_timber'
      ? 'triple_lowe'
      : 'double_lowe';

  const insulationSpec: InsulationSpec =
    requestedInsulation && VALID_INSULATIONS.includes(requestedInsulation)
      ? requestedInsulation
      : structuralSystem === 'steel_frame' || structuralSystem === 'hybrid_rc_steel'
      ? 'mineral_wool_150'
      : exteriorCladding === 'concrete' || exteriorCladding === 'wood'
      ? 'pf_board_120'
      : 'eps_150';

  const foundationMaterial: 'rc_mat' | 'rc_footing' =
    floors >= 3 || structuralSystem === 'hybrid_rc_steel' ? 'rc_mat' : 'rc_footing';

  const sysInfo = STRUCTURAL_SYSTEM_DB[structuralSystem];
  const materialBreakdown = [
    `주구조 골조: ${sysInfo.nameKo} (${sysInfo.codeRef})`,
    `기초 구조: ${foundationMaterial === 'rc_mat' ? '철근콘크리트 매트기초(온통기초)' : '철근콘크리트 독립·줄기초'}`,
    `1층 외벽: ${MAT_TONE_KO[exteriorCladding]}`,
    `상층 외벽: ${MAT_TONE_KO[upperCladding]}`,
    `창호/유리: ${GLAZING_LABEL_KO[glazingSpec]} (창호비 ${Math.round(safeWindowRatio * 100)}%)`,
    `단열/지붕: ${INSULATION_LABEL_KO[insulationSpec]} · 지붕 ${MAT_TONE_KO[safeRoofMaterial]}`,
  ];

  return {
    elementMaterials: {
      structuralSystem,
      foundationMaterial,
      exteriorCladding,
      upperCladding,
      roofMaterial: safeRoofMaterial,
      glazingSpec,
      insulationSpec,
    },
    safeWindowRatio,
    materialBreakdown,
  };
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

const VISION_ARCHITECT_PROMPT = `You are a licensed Korean structural engineer & senior architect.
Inspect ALL provided reference house photos together (photo 1 = exterior/facade, photo 2 = roof/massing if present, photo 3+ = interior if present).
Do NOT just guess colors. Identify the REAL load-bearing structural system, opaque facade cladding materials, glazing system, insulation, roof geometry, and proportions.
CRITICAL STRUCTURAL RULE:
- A house with extensive floor-to-ceiling glass MUST use "steel_frame" or "hybrid_rc_steel" as structuralSystem, "curtain_wall" as glazingSpec, high windowWallRatio (0.70~0.82), and solid opaque spandrel/core materials ("concrete" or "steel") for floor1Material/upperMaterial (NEVER glass-only without structural frame).
- A wood-clad house of 1-3 floors uses "heavy_timber" or "rc_frame" with wood siding; 4+ floors MUST use "rc_frame" or "hybrid_rc_steel".

Return ONLY valid JSON with this exact schema (no markdown, no extra text):
{
  "massingStyle": "L-courtyard" | "U-terrace" | "stepped-wing" | "twin-pavilion" | "bridge-cantilever" | "split-gable" | "atrium-ring" | "mono-loft" | "courtyard-hanok" | "stacked-cube",
  "structuralSystem": "rc_frame" | "steel_frame" | "heavy_timber" | "hybrid_rc_steel",
  "roofStyle": "flat-overhang" | "gable" | "shed" | "butterfly" | "split-gable" | "hip-eaves",
  "roofPitchDeg": number (0 for flat-overhang, 12-36 for pitched),
  "overhangScale": number (0.08 to 0.40),
  "windowWallRatio": number (0.25 to 0.82),
  "glazingSpec": "double_lowe" | "triple_lowe" | "curtain_wall",
  "insulationSpec": "eps_150" | "pf_board_120" | "mineral_wool_150",
  "floor1Material": "stucco" | "wood" | "concrete" | "steel" | "titanium" | "carbon" | "gold" | "glass",
  "upperMaterial": "stucco" | "wood" | "concrete" | "steel" | "titanium" | "carbon" | "gold" | "glass",
  "roofMaterial": "steel" | "wood" | "concrete" | "stucco" | "titanium",
  "wallColor": "#RRGGBB",
  "upperWallColor": "#RRGGBB",
  "roofColor": "#RRGGBB",
  "interiorTheme": "warm-wood" | "minimal-gallery" | "industrial-loft" | "japandi",
  "interiorWallColor": "#RRGGBB",
  "interiorFloorColor": "#RRGGBB",
  "suggestedFloors": number (1 to 4),
  "hasCantilever": boolean,
  "hasPorchDeck": boolean,
  "gardenDensity": number (0.7 to 1.5),
  "architecturalNote": "한국어 한 문장으로 사진 속 건물의 주구조(RC/철골/중목)·외장재·창호·지붕 특징 요약"
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
  const structuralSystem = VALID_SYSTEMS.includes(raw.structuralSystem as StructuralSystemId)
    ? (raw.structuralSystem as StructuralSystemId)
    : fallback.structuralSystem;
  const glazingSpec = VALID_GLAZINGS.includes(raw.glazingSpec as GlazingSpec)
    ? (raw.glazingSpec as GlazingSpec)
    : fallback.glazingSpec;
  const insulationSpec = VALID_INSULATIONS.includes(raw.insulationSpec as InsulationSpec)
    ? (raw.insulationSpec as InsulationSpec)
    : fallback.insulationSpec;
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
      0.24,
      0.82
    ),
    structuralSystem,
    glazingSpec,
    insulationSpec,
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
    suggestedFloors: clamp(
      Math.round(Number(raw.suggestedFloors ?? fallback.suggestedFloors) || 2),
      1,
      5
    ),
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
          max_tokens: 750,
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
      // 다음 공급자 또는 로컬 폴백
    }
  }

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
          max_completion_tokens: 750,
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
      // 로컬 폴백
    }
  }

  return {
    dna: fallback,
    usedVision: false,
    modelUsed: '로컬 구역·자재 추정 (Vision API 키 미설정)',
  };
}

/** 오프라인/API 미연결 시에도 실제 구조체와 자재 조합을 판별하는 로컬 구역 분석기 */
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
          structuralSystem: 'rc_frame',
          glazingSpec: 'double_lowe',
          insulationSpec: 'eps_150',
          roofStyle: 'gable',
          roofPitchDeg: 22,
          overhangScale: 0.2,
          windowWallRatio: 0.52,
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
          architecturalNote: 'RC 라멘조 기반 스타코·적삼목 우드 복합 주택',
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

      const glassDominant =
        lowerZone.glassRatio > 0.22 ||
        upperZone.glassRatio > 0.24 ||
        fullZone.glassRatio > 0.25;

      const pickOpaqueCladding = (z: ReturnType<typeof sampleZone>): CadMaterial => {
        if (z.woodRatio > 0.16) return 'wood';
        if (z.darkRatio > 0.26) return 'steel';
        if (z.luma < 145) return 'concrete';
        return 'stucco';
      };

      const floor1Material = glassDominant ? 'concrete' : pickOpaqueCladding(lowerZone);
      const upperMaterial = glassDominant ? 'steel' : pickOpaqueCladding(upperZone);
      const roofMaterial: CadMaterial = roofZone.woodRatio > 0.15 ? 'wood' : 'steel';

      const suggestedFloors = img.height > img.width * 1.1 ? 3 : 2;
      const structuralSystem: StructuralSystemId = glassDominant
        ? 'steel_frame'
        : floor1Material === 'wood' && suggestedFloors <= 3
        ? 'heavy_timber'
        : floor1Material === 'steel'
        ? 'hybrid_rc_steel'
        : 'rc_frame';

      const roofStyle: RoofStyle =
        roofZone.darkRatio > 0.22
          ? 'gable'
          : roofZone.luma > 185
          ? 'flat-overhang'
          : 'shed';

      const massingStyle: BuildingTemplateId = glassDominant
        ? 'twin-pavilion'
        : fullZone.greenRatio > 0.18
        ? 'U-terrace'
        : upperMaterial !== floor1Material
        ? 'stacked-cube'
        : 'L-courtyard';

      const interiorTheme: InteriorTheme =
        upperMaterial === 'wood' || floor1Material === 'wood'
          ? 'warm-wood'
          : glassDominant || floor1Material === 'concrete'
          ? 'industrial-loft'
          : 'minimal-gallery';

      const windowWallRatio = glassDominant
        ? clamp(0.7 + fullZone.glassRatio * 0.4, 0.7, 0.82)
        : clamp(0.38 + fullZone.glassRatio * 1.1, 0.34, 0.62);

      const sysName = STRUCTURAL_SYSTEM_DB[structuralSystem].nameKo;

      resolve({
        massingStyle,
        structuralSystem,
        glazingSpec: glassDominant ? 'curtain_wall' : 'double_lowe',
        insulationSpec:
          structuralSystem === 'steel_frame' ? 'mineral_wool_150' : 'eps_150',
        roofStyle,
        roofPitchDeg: roofStyle === 'flat-overhang' ? 0 : 22,
        overhangScale: roofStyle === 'gable' ? 0.22 : 0.18,
        windowWallRatio,
        floor1Material,
        upperMaterial,
        roofMaterial,
        wallColor: glassDominant ? '#cbd5e1' : lowerZone.hex,
        upperWallColor: glassDominant ? '#94a3b8' : upperZone.hex,
        roofColor: roofZone.luma > 180 ? '#475569' : roofZone.hex,
        interiorTheme,
        interiorWallColor: interiorTheme === 'industrial-loft' ? '#e2e8f0' : '#faf7f2',
        interiorFloorColor: interiorTheme === 'industrial-loft' ? '#94a3b8' : '#c89b6e',
        suggestedFloors,
        hasCantilever: glassDominant || upperMaterial !== floor1Material,
        hasPorchDeck: fullZone.greenRatio > 0.12 || floor1Material === 'wood',
        gardenDensity: clamp(0.95 + fullZone.greenRatio * 2.2, 0.85, 1.45),
        architecturalNote: `${sysName} 골조 · 1F ${MAT_TONE_KO[floor1Material]} · 상층 ${MAT_TONE_KO[upperMaterial]} · ${
          glassDominant ? '삼중 로이 커튼월' : '시스템 로이 창호'
        } · ${ROOF_LABEL_MAP[roofStyle]}`,
      });
    };
    img.onerror = () => {
      resolve({
        massingStyle: 'L-courtyard',
        structuralSystem: 'rc_frame',
        glazingSpec: 'double_lowe',
        insulationSpec: 'eps_150',
        roofStyle: 'gable',
        roofPitchDeg: 22,
        overhangScale: 0.2,
        windowWallRatio: 0.52,
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
        architecturalNote: 'RC 라멘조 기반 웜 스타코·우드 단독주택',
      });
    };
    img.src = firstUrl;
  });
}

/** 추출된 ArchitecturalDna + 안전 구조 시스템 기반으로 10종 디자인 템플릿 생성 */
export function buildTenTemplatesFromDna(
  dna: ArchitecturalDna,
  category: Exclude<DesignCategory, '3D 디자인'>,
  floors: number,
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
    const roof: RoofStyle = idx === 0 ? dna.roofStyle : meta.defaultRoof;
    const iTheme = interiorCycle[idx];
    const iPal =
      idx === 0
        ? { wall: dna.interiorWallColor, floor: dna.interiorFloorColor }
        : interiorPalette[iTheme];

    const candidatePrimary: CadMaterial =
      idx === 0
        ? dna.floor1Material
        : idx % 3 === 1
        ? dna.upperMaterial
        : idx % 3 === 2
        ? dna.floor1Material
        : dna.floor1Material === 'wood'
        ? 'stucco'
        : 'wood';

    const candidateUpper: CadMaterial =
      idx === 0
        ? dna.upperMaterial
        : idx % 2 === 1
        ? dna.floor1Material === candidatePrimary
          ? 'wood'
          : dna.floor1Material
        : 'steel';

    const candidateWwr =
      idx === 0
        ? dna.windowWallRatio
        : tplId === 'mono-loft' || tplId === 'twin-pavilion'
        ? 0.72
        : 0.52;

    const safe = buildSafeElementMaterials({
      usageType: category,
      floors,
      floor1Material: candidatePrimary,
      upperMaterial: candidateUpper,
      roofMaterial: idx === 0 ? dna.roofMaterial : roof === 'flat-overhang' ? 'wood' : 'steel',
      windowWallRatio: candidateWwr,
      requestedSystem: idx === 0 ? dna.structuralSystem : undefined,
      requestedGlazing: idx === 0 ? dna.glazingSpec : undefined,
      requestedInsulation: idx === 0 ? dna.insulationSpec : undefined,
    });

    const sysShort =
      safe.elementMaterials.structuralSystem === 'rc_frame'
        ? 'RC 라멘조'
        : safe.elementMaterials.structuralSystem === 'steel_frame'
        ? 'H-Beam 철골조'
        : safe.elementMaterials.structuralSystem === 'heavy_timber'
        ? '중목 집성재조'
        : 'RC+철골 복합조';

    const toneLabel = `${MAT_TONE_KO[safe.elementMaterials.exteriorCladding].split('(')[0]}`;
    const name =
      idx === 0 && isPhotoDerived
        ? `[사진 직결] ${sysShort} ${meta.shortName} ${catSuffix}`
        : `${toneLabel} ${meta.shortName} ${catSuffix}`;

    return {
      id: tplId,
      name,
      subtitle:
        idx === 0 && isPhotoDerived
          ? dna.architecturalNote
          : meta.desc(toneLabel, ROOF_LABEL_MAP[roof], sysShort, catSuffix),
      concept: `${name} (${sysShort} · ${ROOF_LABEL_MAP[roof]})`,
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
      windowWallRatio: safe.safeWindowRatio,
      structuralSystem: safe.elementMaterials.structuralSystem,
      glazingSpec: safe.elementMaterials.glazingSpec,
      primaryMaterial: safe.elementMaterials.exteriorCladding,
      accentMaterial: safe.elementMaterials.upperCladding,
      roofMaterial: safe.elementMaterials.roofMaterial,
      wallColor: idx === 0 ? dna.wallColor : idx % 2 === 0 ? dna.wallColor : dna.upperWallColor,
      upperWallColor: idx === 0 ? dna.upperWallColor : dna.wallColor,
      roofColor: dna.roofColor,
      interiorTheme: iTheme,
      interiorWallColor: iPal.wall,
      interiorFloorColor: iPal.floor,
      openPlanRatio: meta.openPlan,
      gardenMultiplier: idx === 0 ? dna.gardenDensity : meta.gardenMult,
      hasCantilever:
        idx === 0
          ? dna.hasCantilever
          : tplId === 'bridge-cantilever' || tplId === 'stacked-cube',
      hasPorchDeck:
        idx === 0
          ? dna.hasPorchDeck
          : tplId === 'courtyard-hanok' || tplId === 'L-courtyard',
      structureBadge: `${sysShort} · ${meta.badge}`,
      roofBadge: ROOF_LABEL_MAP[roof],
      materialTags: [
        sysShort,
        `1F ${MAT_TONE_KO[safe.elementMaterials.exteriorCladding].split('/')[0]}`,
        `창호 ${Math.round(safe.safeWindowRatio * 100)}%`,
      ],
      isPhotoDerived,
    };
  });
}

/** 메인 엔트리: 여러 장의 사진 → Vision AI 구조·자재 DNA 추출 → 안전 골조 강제 적용 + 10종 템플릿 생성 */
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
  const { dna: rawDna, usedVision, modelUsed } = await callVisionArchitectAi(
    compressed,
    fallbackDna
  );

  const category: Exclude<DesignCategory, '3D 디자인'> =
    currentSpec.usageType === '3D 디자인' ? '단독주택' : currentSpec.usageType;

  const nextFloors = !lockedKeys.floors ? rawDna.suggestedFloors : currentSpec.floors;

  // 안전 공학 보정: 유리 단독·무골조 차단 + 실제 주구조/외장/창호/단열 명세 확정
  const safeBuild = buildSafeElementMaterials({
    usageType: category,
    floors: nextFloors,
    floor1Material: rawDna.floor1Material,
    upperMaterial: rawDna.upperMaterial,
    roofMaterial: rawDna.roofMaterial,
    windowWallRatio: rawDna.windowWallRatio,
    requestedSystem: rawDna.structuralSystem,
    requestedGlazing: rawDna.glazingSpec,
    requestedInsulation: rawDna.insulationSpec,
  });

  const finalDna: ArchitecturalDna = {
    ...rawDna,
    structuralSystem: safeBuild.elementMaterials.structuralSystem,
    glazingSpec: safeBuild.elementMaterials.glazingSpec,
    insulationSpec: safeBuild.elementMaterials.insulationSpec,
    floor1Material: safeBuild.elementMaterials.exteriorCladding,
    upperMaterial: safeBuild.elementMaterials.upperCladding,
    roofMaterial: safeBuild.elementMaterials.roofMaterial,
    windowWallRatio: safeBuild.safeWindowRatio,
    materialBreakdown: safeBuild.materialBreakdown,
  };

  const tenTemplates = buildTenTemplatesFromDna(finalDna, category, nextFloors, true);
  const firstTpl = tenTemplates[0];
  const sysInfo = STRUCTURAL_SYSTEM_DB[safeBuild.elementMaterials.structuralSystem];

  const tags = Array.from(
    new Set([
      usedVision ? 'Vision AI 정밀추출' : '로컬 자재추정',
      sysInfo.nameKo.split(' ')[0],
      `1F:${MAT_TONE_KO[safeBuild.elementMaterials.exteriorCladding].split('(')[0]}`,
      `창호:${GLAZING_LABEL_KO[safeBuild.elementMaterials.glazingSpec].split(' ')[0]} ${Math.round(
        safeBuild.safeWindowRatio * 100
      )}%`,
      `${ROOF_LABEL_MAP[finalDna.roofStyle]} ${finalDna.roofPitchDeg}°`,
    ])
  );

  const extracted: ExtractedHouseStyle = {
    templateId: firstTpl.id,
    roofStyle: finalDna.roofStyle,
    structuralSystem: safeBuild.elementMaterials.structuralSystem,
    elementMaterials: safeBuild.elementMaterials,
    material: safeBuild.elementMaterials.exteriorCladding,
    accentMaterial: safeBuild.elementMaterials.upperCladding,
    roofMaterial: safeBuild.elementMaterials.roofMaterial,
    wallColor: finalDna.wallColor,
    upperWallColor: finalDna.upperWallColor,
    roofColor: finalDna.roofColor,
    interiorTheme: finalDna.interiorTheme,
    interiorWallColor: finalDna.interiorWallColor,
    interiorFloorColor: finalDna.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    gardenBoostRatio: finalDna.gardenDensity,
    styleSummary: finalDna.architecturalNote,
    materialBreakdown: safeBuild.materialBreakdown,
    tags,
    dna: finalDna,
    templates: tenTemplates,
    analysisSource: usedVision ? 'vision-ai' : 'local-fallback',
    modelUsed,
  };

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
        Math.max(0, Math.round(currentSpec.gardenAreaSqm * finalDna.gardenDensity))
      )
    : currentSpec.gardenAreaSqm;

  const adaptedSpec: BuildingSpec = {
    ...currentSpec,
    usageType: category,
    templateId: firstTpl.id,
    selectedTemplateName: firstTpl.name,
    dynamicTemplates: tenTemplates,
    architecturalDna: finalDna,
    structuralSystem: safeBuild.elementMaterials.structuralSystem,
    elementMaterials: safeBuild.elementMaterials,
    roofStyle: finalDna.roofStyle,
    roofPitchDeg: finalDna.roofPitchDeg,
    overhangScale: finalDna.overhangScale,
    windowWallRatio: safeBuild.safeWindowRatio,
    accentMaterial: safeBuild.elementMaterials.upperCladding,
    roofMaterial: safeBuild.elementMaterials.roofMaterial,
    interiorTheme: finalDna.interiorTheme,
    interiorWallColor: finalDna.interiorWallColor,
    interiorFloorColor: finalDna.interiorFloorColor,
    openPlanRatio: firstTpl.openPlanRatio,
    floors: nextFloors,
    heightMeters: nextHeight,
    totalFloorAreaSqm: nextTotalArea,
    gardenAreaSqm: nextGardenArea,
    customWallColor: finalDna.wallColor,
    customUpperWallColor: finalDna.upperWallColor,
    customRoofColor: finalDna.roofColor,
    styleSummary: finalDna.architecturalNote,
    photoCount: validUrls.length,
    analysisSource: usedVision ? 'vision-ai' : 'local-fallback',
    designConcept: `${finalDna.architecturalNote} · ${firstTpl.name}`,
  };

  return { adaptedSpec, extracted };
}