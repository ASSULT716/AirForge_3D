import {
  BuildingSpec,
  BuildingTemplateId,
  CadMaterial,
  DesignCategory,
  ExteriorWindow3D,
  InteriorTheme,
  MepPipe3D,
  NodePoint,
  BeamMember,
  RoofStyle,
  SiteShape,
  SolidPrimitive,
  UnitDesignType,
  UnitPlacement3D,
  UnitRoomZone,
} from '../types/cad';
import { getKdsLoadRange } from './buildingEstimator';

export interface BuildingTemplateOption {
  id: BuildingTemplateId;
  name: string;
  subtitle: string;
  concept: string;
}

export const BUILDING_TEMPLATES_BY_CATEGORY: Record<
  Exclude<DesignCategory, '3D 디자인'>,
  BuildingTemplateOption[]
> = {
  단독주택: [
    {
      id: 'L-courtyard',
      name: 'L자 중정 갤러리 하우스',
      subtitle: '1층 중정 데크와 2층 캔틸레버 매스가 교차하는 모던 주택',
      concept: 'L자 중정 갤러리 모던 스텝 테라스 하우스',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 아트리움 테라스 하우스',
      subtitle: '중앙 선큰 정원을 양쪽 윙이 감싸고 상층부가 셋백된 3면 채광 주택',
      concept: 'ㄷ자 아트리움 중정 테라스 하우스',
    },
    {
      id: 'stepped-wing',
      name: '스텝 캔틸레버 아틀리에',
      subtitle: '층마다 비대칭 돌출·후퇴를 두어 넓은 테라스와 입체감을 만든 주택',
      concept: '스텝 캔틸레버 루프탑 아틀리에 하우스',
    },
  ],
  공동주택: [
    {
      id: 'U-terrace',
      name: 'ㄷ자 중정 스텝 레지던스',
      subtitle: '중앙 커뮤니티 정원과 테라스형 세대가 결합된 중저층 아트 주거',
      concept: 'ㄷ자 중정 커뮤니티 테라스 레지던스',
    },
    {
      id: 'twin-pavilion',
      name: '스카이 브릿지 트윈 타워',
      subtitle: '두 개의 주거 동을 공중 스카이 라운지로 연결한 랜드마크 주거',
      concept: '스카이 브릿지 트윈 아트리움 공동주택',
    },
    {
      id: 'stepped-wing',
      name: '계단식 테라스 가든 아파트',
      subtitle: '전 세대 남향 테라스와 옥상 공원을 갖춘 계단형 공동주택',
      concept: '계단식 테라스 가든 공동주택',
    },
  ],
  '업무·상업시설': [
    {
      id: 'twin-pavilion',
      name: '아트리움 트윈 오피스 파빌리온',
      subtitle: '저층부 오픈 플라자와 상층부 캔틸레버 오피스가 결합된 상업 빌딩',
      concept: '아트리움 트윈 오피스·리테일 파빌리온',
    },
    {
      id: 'stepped-wing',
      name: '스텝 테라스 크리에이티브 사옥',
      subtitle: '층별 야외 라운지와 전면 커튼월을 갖춘 현대적 업무시설',
      concept: '스텝 테라스 크리에이티브 사옥',
    },
    {
      id: 'L-courtyard',
      name: 'L자 스트리트 갤러리 상가',
      subtitle: '보행자 중정 광장을 품은 복합 근린생활·오피스 건축물',
      concept: 'L자 스트리트 중정 상업시설',
    },
  ],
  복합문화시설: [
    {
      id: 'stepped-wing',
      name: '캔틸레버 아트 뮤지엄',
      subtitle: '역동적인 캔틸레버 전시관과 옥상 조각 공원을 품은 미술관',
      concept: '캔틸레버 아트 뮤지엄 & 조각 공원',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 야외 원형극장 문화센터',
      subtitle: '중앙 야외 공연 마당을 둘러싼 전시·도서관 복합 문화공간',
      concept: 'ㄷ자 야외 공연 마당 복합문화센터',
    },
    {
      id: 'twin-pavilion',
      name: '브릿지 갤러리 파빌리온',
      subtitle: '수공간과 공중 전시 브릿지가 어우러진 현대 건축 파빌리온',
      concept: '브릿지 갤러리 문화 파빌리온',
    },
  ],
};

export const FLOOR_COLOR_PALETTE = [
  '#f5f2eb', // 1F 웜 스타코
  '#e6d5be', // 2F 내추럴 우드/샌드
  '#dce3ea', // 3F 아키텍처 징크/스틸
  '#ede7dd', // 4F 라임 플라스터
  '#dde6e1', // 5F 세이지 스톤
  '#e8e4ec', // 6F 쿨 미네랄
];

export function getFloorColor(floorIndex: number): string {
  if (floorIndex < 0) return '#94a3b8';
  if (floorIndex === 99) return '#475569';
  return FLOOR_COLOR_PALETTE[(Math.max(1, floorIndex) - 1) % FLOOR_COLOR_PALETTE.length];
}

export function getSiteBoundaryPoints(
  siteAreaSqm: number,
  siteShape: SiteShape = 'rectangle'
): {
  points: [number, number, number][];
  halfW: number;
  halfD: number;
} {
  const SCALE_DIV = 3.2;
  const areaUnits = Math.max(2.5, Math.min(48, siteAreaSqm / (SCALE_DIV * SCALE_DIV)));

  if (siteShape === 'circle') {
    const r = Math.sqrt(areaUnits / Math.PI);
    const pts: [number, number, number][] = [];
    const segs = 48;
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([Number((Math.cos(a) * r).toFixed(3)), 0.015, Number((Math.sin(a) * r).toFixed(3))]);
    }
    return { points: pts, halfW: r, halfD: r };
  }

  if (siteShape === 'triangle') {
    const base = Math.sqrt(areaUnits * 2.2);
    const height = (2 * areaUnits) / base;
    const hw = base * 0.5;
    const hd = height * 0.5;
    return {
      points: [
        [0, 0.015, -hd],
        [hw, 0.015, hd],
        [-hw, 0.015, hd],
        [0, 0.015, -hd],
      ],
      halfW: hw * 0.78,
      halfD: hd * 0.72,
    };
  }

  if (siteShape === 'trapezoid') {
    const depth = Math.sqrt(areaUnits * 0.85);
    const avgW = areaUnits / depth;
    const topHalf = avgW * 0.36;
    const botHalf = avgW * 0.64;
    const hd = depth * 0.5;
    return {
      points: [
        [-topHalf, 0.015, -hd],
        [topHalf, 0.015, -hd],
        [botHalf, 0.015, hd],
        [-botHalf, 0.015, hd],
        [-topHalf, 0.015, -hd],
      ],
      halfW: avgW * 0.46,
      halfD: hd,
    };
  }

  const w = Math.sqrt(areaUnits * 1.18);
  const d = areaUnits / w;
  const hw = w * 0.5;
  const hd = d * 0.5;
  return {
    points: [
      [-hw, 0.015, -hd],
      [hw, 0.015, -hd],
      [hw, 0.015, hd],
      [-hw, 0.015, hd],
      [-hw, 0.015, -hd],
    ],
    halfW: hw,
    halfD: hd,
  };
}

export function getDefaultSpecForCategory(
  category: Exclude<DesignCategory, '3D 디자인'>,
  templateId?: BuildingTemplateId
): BuildingSpec {
  const defaultTpl = templateId ?? BUILDING_TEMPLATES_BY_CATEGORY[category][0].id;
  const tplObj =
    BUILDING_TEMPLATES_BY_CATEGORY[category].find((t) => t.id === defaultTpl) ??
    BUILDING_TEMPLATES_BY_CATEGORY[category][0];

  if (category === '단독주택') {
    return {
      projectName: `AirForge ${tplObj.name}`,
      usageType: '단독주택',
      templateId: tplObj.id,
      roofStyle: 'flat-overhang',
      accentMaterial: 'wood',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      siteShape: 'rectangle',
      useHouseholds: true,
      siteAreaSqm: 450,
      buildingAreaSqm: 200,
      totalFloorAreaSqm: 400,
      undergroundFloors: 1,
      undergroundAreaSqm: 160,
      heightMeters: 7.4,
      floors: 2,
      households: 1,
      unitTypeCount: 2,
      elevators: 0,
      stairs: 1,
      rooftops: 1,
      gardenAreaSqm: 95,
      designConcept: tplObj.concept,
    };
  }
  if (category === '공동주택') {
    return {
      projectName: `AirForge ${tplObj.name}`,
      usageType: '공동주택',
      templateId: tplObj.id,
      roofStyle: 'flat-overhang',
      accentMaterial: 'wood',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#d4a373',
      siteShape: 'rectangle',
      useHouseholds: true,
      siteAreaSqm: 1400,
      buildingAreaSqm: 650,
      totalFloorAreaSqm: 2600,
      undergroundFloors: 1,
      undergroundAreaSqm: 950,
      heightMeters: 14.0,
      floors: 4,
      households: 12,
      unitTypeCount: 3,
      elevators: 1,
      stairs: 2,
      rooftops: 2,
      gardenAreaSqm: 220,
      designConcept: tplObj.concept,
    };
  }
  if (category === '업무·상업시설') {
    return {
      projectName: `AirForge ${tplObj.name}`,
      usageType: '업무·상업시설',
      templateId: tplObj.id,
      roofStyle: 'shed',
      accentMaterial: 'steel',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#f1f5f9',
      interiorFloorColor: '#94a3b8',
      siteShape: 'rectangle',
      useHouseholds: false,
      siteAreaSqm: 1200,
      buildingAreaSqm: 600,
      totalFloorAreaSqm: 2400,
      undergroundFloors: 1,
      undergroundAreaSqm: 850,
      heightMeters: 15.2,
      floors: 4,
      households: 0,
      unitTypeCount: 2,
      elevators: 1,
      stairs: 2,
      rooftops: 1,
      gardenAreaSqm: 150,
      designConcept: tplObj.concept,
    };
  }
  return {
    projectName: `AirForge ${tplObj.name}`,
    usageType: '복합문화시설',
    templateId: tplObj.id,
    roofStyle: 'butterfly',
    accentMaterial: 'glass',
    interiorTheme: 'minimal-gallery',
    interiorWallColor: '#f8fafc',
    interiorFloorColor: '#cbd5e1',
    siteShape: 'rectangle',
    useHouseholds: false,
    siteAreaSqm: 1600,
    buildingAreaSqm: 720,
    totalFloorAreaSqm: 2160,
    undergroundFloors: 1,
    undergroundAreaSqm: 900,
    heightMeters: 12.6,
    floors: 3,
    households: 0,
    unitTypeCount: 2,
    elevators: 1,
    stairs: 2,
    rooftops: 2,
    gardenAreaSqm: 280,
    designConcept: tplObj.concept,
  };
}

// 건물의 용도·면적·비율·템플릿·사진 개방감(openPlanRatio)에 따라 동적 방 평면 재설계
export function generateDynamicRoomLayout(params: {
  usageType: DesignCategory;
  templateId: BuildingTemplateId;
  areaSqm: number;
  aspectRatio: number;
  variantIdx?: number;
  openPlanRatio?: number;
}): {
  planLayout: BuildingTemplateId;
  rooms: UnitRoomZone[];
  efficiencyPct: number;
} {
  const {
    usageType,
    templateId,
    areaSqm,
    aspectRatio,
    variantIdx = 0,
    openPlanRatio = 1.0,
  } = params;

  const effectiveLayout: BuildingTemplateId =
    variantIdx === 0
      ? templateId
      : variantIdx === 1
      ? 'U-terrace'
      : variantIdx === 2
      ? 'stepped-wing'
      : 'L-courtyard';

  const clampedRatio = Math.max(0.68, Math.min(1.42, aspectRatio || 1.15));
  const pw = clampedRatio >= 1 ? 92 : Math.round(92 * clampedRatio);
  const ph = clampedRatio >= 1 ? Math.max(58, Math.round(92 / clampedRatio)) : 92;
  const ox = Math.round((100 - pw) / 2);
  const oy = Math.round((100 - ph) / 2);

  const rx = (pctX: number) => Number((ox + (pw * pctX) / 100).toFixed(1));
  const ry = (pctY: number) => Number((oy + (ph * pctY) / 100).toFixed(1));
  const rw = (pctW: number) => Number(((pw * pctW) / 100).toFixed(1));
  const rh = (pctH: number) => Number(((ph * pctH) / 100).toFixed(1));

  if (usageType === '업무·상업시설') {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 88,
      rooms: [
        { name: '메인 오픈 오피스', x: rx(0), y: ry(14), w: rw(56), h: rh(56), liveLoadKn: 2.5, windows: ['W'], hasPower: true },
        { name: '스마트 회의실', x: rx(56), y: ry(14), w: rw(44), h: rh(38), liveLoadKn: 2.5, windows: ['E'], hasPower: true },
        { name: '임원·포커스룸', x: rx(56), y: ry(52), w: rw(44), h: rh(48), liveLoadKn: 2.5, windows: ['E', 'S'], hasPower: true },
        { name: '탕비·수전 코어', x: rx(0), y: ry(70), w: rw(32), h: rh(30), liveLoadKn: 2.5, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '웰컴 라운지', x: rx(32), y: ry(70), w: rw(24), h: rh(30), liveLoadKn: 2.5, windows: ['S'], hasPower: true },
        { name: '루프 스카이 데크', x: rx(0), y: ry(0), w: rw(100), h: rh(14), liveLoadKn: 3.0, windows: ['N'] },
      ],
    };
  }

  if (usageType === '복합문화시설') {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 86,
      rooms: [
        { name: '메인 아트리움 전시홀', x: rx(0), y: ry(16), w: rw(62), h: rh(58), liveLoadKn: 4.0, windows: ['W'], hasPower: true },
        { name: '세미나·공연홀', x: rx(62), y: ry(16), w: rw(38), h: rh(46), liveLoadKn: 4.0, windows: ['E'], hasPower: true },
        { name: '뮤지엄 카페·수전', x: rx(0), y: ry(74), w: rw(42), h: rh(26), liveLoadKn: 3.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '큐레이터·수장고', x: rx(42), y: ry(74), w: rw(20), h: rh(26), liveLoadKn: 3.5, windows: ['S'], hasPower: true },
        { name: '기프트 라운지', x: rx(62), y: ry(62), w: rw(38), h: rh(38), liveLoadKn: 3.0, windows: ['E', 'S'], hasPower: true },
        { name: '야외 조각 데크', x: rx(0), y: ry(0), w: rw(100), h: rh(16), liveLoadKn: 4.0, windows: ['N'] },
      ],
    };
  }

  // 소형 스튜디오 OR 사진에서 개방형 로프트/갤러리 특성이 강하게 감지된 경우
  if (areaSqm < 48 || (openPlanRatio > 1.15 && areaSqm < 75)) {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 92,
      rooms: [
        { name: '광폭 오픈 LDK·침실', x: rx(0), y: ry(0), w: rw(68), h: rh(74), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '아일랜드 주방', x: rx(68), y: ry(0), w: rw(32), h: rh(48), liveLoadKn: 2.0, windows: ['N', 'E'], hasWater: true, hasPower: true },
        { name: '욕실·드레스코어', x: rx(68), y: ry(48), w: rw(32), h: rh(52), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true },
        { name: '전면 테라스 데크', x: rx(0), y: ry(74), w: rw(68), h: rh(26), liveLoadKn: 3.0, windows: ['S', 'W'] },
      ],
    };
  }

  if (areaSqm < 95) {
    if (effectiveLayout === 'U-terrace') {
      return {
        planLayout: 'U-terrace',
        efficiencyPct: 88,
        rooms: [
          { name: '거실 라운지', x: rx(0), y: ry(0), w: rw(34), h: rh(62), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
          { name: '대면형 주방·식당', x: rx(0), y: ry(62), w: rw(44), h: rh(38), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
          { name: '공용 욕실·다용도', x: rx(44), y: ry(62), w: rw(22), h: rh(38), liveLoadKn: 2.0, windows: ['S'], hasWater: true },
          { name: '마스터 침실', x: rx(66), y: ry(0), w: rw(34), h: rh(54), liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
          { name: '서브 침실·서재', x: rx(66), y: ry(54), w: rw(34), h: rh(46), liveLoadKn: 2.0, windows: ['E', 'S'], hasPower: true },
          { name: '중앙 중정 테라스', x: rx(34), y: ry(0), w: rw(32), h: rh(62), liveLoadKn: 3.0, windows: ['N'] },
        ],
      };
    }

    return {
      planLayout: effectiveLayout,
      efficiencyPct: 89,
      rooms: [
        { name: '파노라마 거실', x: rx(0), y: ry(16), w: rw(52), h: rh(46), liveLoadKn: 2.0, windows: ['W'], hasPower: true },
        { name: '아일랜드 주방', x: rx(0), y: ry(62), w: rw(38), h: rh(38), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '욕실·수전코어', x: rx(38), y: ry(62), w: rw(18), h: rh(38), liveLoadKn: 2.0, windows: ['S'], hasWater: true },
        { name: '마스터 침실', x: rx(56), y: ry(46), w: rw(44), h: rh(54), liveLoadKn: 2.0, windows: ['E', 'S'], hasPower: true },
        { name: '중정 야외 데크', x: rx(52), y: ry(0), w: rw(48), h: rh(46), liveLoadKn: 3.0, windows: ['N', 'E'] },
        { name: '북측 선큰 테라스', x: rx(0), y: ry(0), w: rw(52), h: rh(16), liveLoadKn: 3.0, windows: ['N'] },
      ],
    };
  }

  return {
    planLayout: effectiveLayout,
    efficiencyPct: 86,
    rooms: [
      { name: '광폭 LDK 거실', x: rx(16), y: ry(14), w: rw(52), h: rh(44), liveLoadKn: 2.0, windows: ['N'], hasPower: true },
      { name: '다이닝·오픈 키친', x: rx(16), y: ry(58), w: rw(34), h: rh(42), liveLoadKn: 2.0, windows: ['S'], hasWater: true, hasPower: true },
      { name: '서측 서재·게스트룸', x: rx(0), y: ry(14), w: rw(16), h: rh(62), liveLoadKn: 2.0, windows: ['W'], hasPower: true },
      { name: '공용 욕실·런드리', x: rx(0), y: ry(76), w: rw(16), h: rh(24), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true },
      { name: '마스터 스위트 침실', x: rx(50), y: ry(58), w: rw(32), h: rh(42), liveLoadKn: 2.0, windows: ['S'], hasPower: true },
      { name: '드레스룸·부부욕실', x: rx(82), y: ry(58), w: rw(18), h: rh(42), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true },
      { name: '자녀 침실 2', x: rx(68), y: ry(26), w: rw(32), h: rh(32), liveLoadKn: 2.0, windows: ['E'], hasPower: true },
      { name: '스카이 중정 데크', x: rx(68), y: ry(0), w: rw(32), h: rh(26), liveLoadKn: 3.5, windows: ['N', 'E'] },
    ],
  };
}

export function getRoomsForTemplate(
  templateId: BuildingTemplateId,
  variantIdx = 0
): UnitRoomZone[] {
  return generateDynamicRoomLayout({
    usageType: '단독주택',
    templateId,
    areaSqm: 84,
    aspectRatio: 1.18,
    variantIdx,
  }).rooms;
}

const UNIT_TYPE_PALETTE = ['#0284c7', '#d97706', '#7c3aed', '#0d9488', '#db2777'];

export function generateWatertightArchitecture(
  rawSpec: BuildingSpec,
  baseMaterial: CadMaterial = 'stucco'
): {
  spec: BuildingSpec;
  solids: SolidPrimitive[];
  nodes: NodePoint[];
  beams: BeamMember[];
} {
  const templateId: BuildingTemplateId = rawSpec.templateId ?? 'L-courtyard';
  const roofStyle: RoofStyle = rawSpec.roofStyle ?? 'flat-overhang';
  const accentMaterial: CadMaterial = rawSpec.accentMaterial ?? 'wood';
  const interiorTheme: InteriorTheme = rawSpec.interiorTheme ?? 'warm-wood';
  const interiorWallColor = rawSpec.interiorWallColor ?? '#faf7f2';
  const interiorFloorColor = rawSpec.interiorFloorColor ?? '#c89b6e';
  const siteShape: SiteShape = rawSpec.siteShape ?? 'rectangle';
  const floors = Math.max(1, Math.min(15, Math.round(rawSpec.floors || 1)));
  const undergroundFloors = Math.max(0, Math.min(5, Math.round(rawSpec.undergroundFloors || 0)));

  const SCALE_DIV = 3.2;
  const { halfW: siteHalfW, halfD: siteHalfD } = getSiteBoundaryPoints(
    rawSpec.siteAreaSqm || 450,
    siteShape
  );

  const effectiveFootprintSqm = Math.max(
    45,
    Math.min(
      rawSpec.siteAreaSqm * 0.78,
      rawSpec.buildingAreaSqm || rawSpec.totalFloorAreaSqm / floors
    )
  );
  const footprintUnits = effectiveFootprintSqm / (SCALE_DIV * SCALE_DIV);
  const ratioAspect =
    templateId === 'twin-pavilion'
      ? 1.38
      : templateId === 'U-terrace'
      ? 1.28
      : templateId === 'L-courtyard'
      ? 1.22
      : 1.15;

  let bldgW = Math.sqrt(footprintUnits * ratioAspect);
  let bldgD = footprintUnits / bldgW;

  const maxAllowedW = siteHalfW * 1.48;
  const maxAllowedD = siteHalfD * 1.48;
  if (bldgW > maxAllowedW) {
    bldgW = maxAllowedW;
    bldgD = Math.min(maxAllowedD, footprintUnits / bldgW);
  }
  if (bldgD > maxAllowedD) {
    bldgD = maxAllowedD;
    bldgW = Math.min(maxAllowedW, footprintUnits / bldgD);
  }
  bldgW = Number(Math.max(1.6, bldgW).toFixed(3));
  bldgD = Number(Math.max(1.4, bldgD).toFixed(3));

  const totalHeightUnits = Number(
    Math.max(0.95, Math.min(12.0, (rawSpec.heightMeters || 7.2) / SCALE_DIV)).toFixed(3)
  );
  const floorH = Number((totalHeightUnits / floors).toFixed(3));

  const solids: SolidPrimitive[] = [];
  const nodes: NodePoint[] = [];
  const beams: BeamMember[] = [];
  const exteriorWindows: ExteriorWindow3D[] = [];
  const mepPipes: MepPipe3D[] = [];

  const useHouseholds = rawSpec.useHouseholds !== false && (rawSpec.households ?? 0) > 0;
  const activeHouseholds = useHouseholds ? Math.max(1, Math.round(rawSpec.households)) : 0;
  const unitsPerFloor = useHouseholds ? Math.max(1, Math.ceil(activeHouseholds / floors)) : 1;
  const aspectRatio = Number((bldgW / Math.max(0.5, bldgD)).toFixed(2));
  const avgUnitAreaSqm = Math.max(
    24,
    Math.round(rawSpec.totalFloorAreaSqm / Math.max(1, useHouseholds ? activeHouseholds : floors))
  );

  const freeSpaceX = Math.max(0, siteHalfW * 1.85 - bldgW);
  const bldgOffsetX = Number((-freeSpaceX * 0.28).toFixed(3));
  const bldgOffsetZ = 0;

  // 1. 지하층 볼륨
  if (undergroundFloors > 0 && rawSpec.undergroundAreaSqm > 0) {
    const ugRatio = Math.min(
      1.15,
      Math.max(0.55, Math.sqrt(rawSpec.undergroundAreaSqm / Math.max(1, effectiveFootprintSqm)))
    );
    const ugH = Number((0.42 * undergroundFloors).toFixed(3));
    solids.push({
      id: 'arch_basement_main',
      groupName: `지하층 (B1~B${undergroundFloors}, ${rawSpec.undergroundAreaSqm}㎡)`,
      partRole: 'basement',
      shape: 'box',
      position: [bldgOffsetX, -ugH * 0.5, bldgOffsetZ],
      scale: [Number((bldgW * ugRatio).toFixed(3)), ugH, Number((bldgD * ugRatio).toFixed(3))],
      color: '#94a3b8',
      material: 'concrete',
      isFixed: true,
      floorIndex: -1,
    });
  }

  // 2. 유동적 정원 조경 배치
  const gardenReqSqm = Math.max(0, rawSpec.gardenAreaSqm || 0);
  const gardenUnitsReq = gardenReqSqm / (SCALE_DIV * SCALE_DIV);
  const bldgRightEdge = bldgOffsetX + bldgW * 0.5;
  const bldgFrontEdge = bldgOffsetZ + bldgD * 0.5;

  const rightStripW = Math.max(0, siteHalfW * 0.92 - bldgRightEdge - 0.12);
  const frontStripD = Math.max(0, siteHalfD * 0.92 - bldgFrontEdge - 0.12);
  let placedGardenUnits = 0;

  if (gardenUnitsReq > 0.05 && rightStripW > 0.25) {
    const maxRightD = Math.min(siteHalfD * 1.55, bldgD + frontStripD * 0.6);
    const gW = Number(Math.min(rightStripW, Math.max(0.35, gardenUnitsReq / maxRightD)).toFixed(3));
    const gD = Number(Math.min(maxRightD, Math.max(0.4, gardenUnitsReq / gW)).toFixed(3));
    const gX = Number((bldgRightEdge + 0.08 + gW * 0.5).toFixed(3));

    solids.push({
      id: 'arch_garden_side',
      groupName: `측면 중정 정원 (${Math.round(gW * gD * SCALE_DIV * SCALE_DIV)}㎡)`,
      partRole: 'garden',
      shape: 'box',
      position: [gX, 0.025, 0],
      scale: [gW, 0.05, gD],
      color: '#4d7c0f',
      material: 'stucco',
      isFixed: true,
      floorIndex: 0,
    });
    placedGardenUnits += gW * gD;
  }

  const remAfterSide = gardenUnitsReq - placedGardenUnits;
  if (remAfterSide > 0.08 && frontStripD > 0.22) {
    const maxFrontW = Math.min(siteHalfW * 1.65, bldgW + rightStripW * 0.7);
    const fD = Number(Math.min(frontStripD, Math.max(0.28, remAfterSide / maxFrontW)).toFixed(3));
    const fW = Number(Math.min(maxFrontW, Math.max(0.5, remAfterSide / fD)).toFixed(3));
    const fZ = Number((bldgFrontEdge + 0.08 + fD * 0.5).toFixed(3));

    solids.push({
      id: 'arch_garden_front',
      groupName: `전면 테라스 조경 (${Math.round(fW * fD * SCALE_DIV * SCALE_DIV)}㎡)`,
      partRole: 'garden',
      shape: 'box',
      position: [bldgOffsetX, 0.025, fZ],
      scale: [fW, 0.05, fD],
      color: '#4d7c0f',
      material: 'stucco',
      isFixed: true,
      floorIndex: 0,
    });
    placedGardenUnits += fW * fD;
  }

  // 3. 층별 구조·매스·마감재 차별화 + 실내 바닥/내벽/가구 조립
  const slabThick = 0.07;
  const extWallThick = 0.09;
  const intWallThick = 0.045;
  let topFloorW = bldgW;
  let topFloorD = bldgD;
  let topFloorCx = bldgOffsetX;
  let topFloorCz = bldgOffsetZ;

  // 층별 실내 방 구획 저장 (배관 라우팅에 재활용)
  let firstFloorIndoorRooms: UnitRoomZone[] = [];

  for (let f = 1; f <= floors; f++) {
    const floorBaseY = (f - 1) * floorH;
    const floorTopY = f * floorH;
    const clearWallH = Math.max(0.28, floorH - slabThick);
    const wallCenterY = floorBaseY + slabThick + clearWallH * 0.5;

    // 1층은 주 외장재(baseMaterial), 2층 이상은 사진/템플릿에서 추출된 상층 포인트 외장재(accentMaterial) 교차 적용
    const floorMat: CadMaterial = f === 1 ? baseMaterial : accentMaterial;
    const floorColor =
      f === 1
        ? rawSpec.customWallColor ?? getFloorColor(1)
        : accentMaterial === 'wood'
        ? '#c89b6e'
        : accentMaterial === 'steel'
        ? '#94a3b8'
        : accentMaterial === 'concrete'
        ? '#cbd5e1'
        : getFloorColor(f);

    // 층마다 다른 구조적 매스 변형 (캔틸레버 돌출 / 테라스 셋백 / L자·ㄷ자 교차)
    let stepFactorX = 1.0;
    let stepFactorZ = 1.0;
    let stepShiftX = 0;
    let stepShiftZ = 0;

    if (templateId === 'L-courtyard') {
      if (f % 2 === 0) {
        stepFactorX = 0.86;
        stepFactorZ = 1.08;
        stepShiftX = -bldgW * 0.09;
        stepShiftZ = bldgD * 0.05;
      }
    } else if (templateId === 'U-terrace') {
      if (f > 1) {
        stepFactorX = Math.max(0.76, 1 - (f - 1) * 0.06);
        stepFactorZ = 0.86;
        stepShiftZ = -bldgD * 0.07;
      }
    } else if (templateId === 'stepped-wing') {
      stepFactorX = Math.max(0.68, 1 - (f - 1) * 0.08);
      stepFactorZ = Math.max(0.74, 1 - (f - 1) * 0.05);
      stepShiftX = (f % 2 === 0 ? 1 : -1) * Math.min(0.18, (f - 1) * 0.09);
    } else if (templateId === 'twin-pavilion') {
      if (f === 1) {
        stepFactorX = 0.94;
      } else {
        stepFactorX = 1.06; // 2층 스카이 브릿지 캔틸레버 확장
        stepFactorZ = 0.88;
      }
    }

    const curW = Number((bldgW * stepFactorX).toFixed(3));
    const curD = Number((bldgD * stepFactorZ).toFixed(3));
    const cx = Number((bldgOffsetX + stepShiftX).toFixed(3));
    const cz = Number((bldgOffsetZ + stepShiftZ).toFixed(3));

    if (f === floors) {
      topFloorW = curW;
      topFloorD = curD;
      topFloorCx = cx;
      topFloorCz = cz;
    }

    // 층별 바닥 구조 슬래브
    solids.push({
      id: `floor_${f}_slab`,
      groupName: `${f}층 바닥 슬래브 (${floorMat.toUpperCase()})`,
      partRole: 'slab',
      shape: 'box',
      position: [cx, Number((floorBaseY + slabThick * 0.5).toFixed(3)), cz],
      scale: [curW, slabThick, curD],
      color: floorColor,
      material: floorMat,
      isFixed: true,
      floorIndex: f,
    });

    // 실내 마감 바닥판 (실내 투시 뷰에서 따뜻한 원목 마루 / 타일 / 폴리싱 콘크리트 마감 표현)
    const usableW = curW - extWallThick * 2;
    const usableD = curD - extWallThick * 2;
    const floorFinishMat: CadMaterial =
      interiorTheme === 'industrial-loft' ? 'concrete' : 'wood';

    solids.push({
      id: `floor_${f}_interior_finish`,
      groupName: `${f}층 실내 마감 바닥 (${interiorTheme})`,
      partRole: 'interior_floor',
      shape: 'box',
      position: [cx, Number((floorBaseY + slabThick + 0.008).toFixed(3)), cz],
      scale: [Number(usableW.toFixed(3)), 0.014, Number(usableD.toFixed(3))],
      color: interiorFloorColor,
      material: floorFinishMat,
      isFixed: true,
      floorIndex: f,
    });

    // 2층 이상 셋백 구간에 야외 우드 테라스 데크 자동 생성
    if (f > 1 && curD < bldgD * 0.94) {
      const deckD = Number(((bldgD - curD) * 0.85).toFixed(3));
      solids.push({
        id: `floor_${f}_terrace_deck`,
        groupName: `${f}층 야외 테라스 데크`,
        partRole: 'slab',
        shape: 'box',
        position: [cx, Number((floorBaseY + slabThick * 0.5).toFixed(3)), Number((cz + curD * 0.5 + deckD * 0.45).toFixed(3))],
        scale: [curW, slabThick * 0.85, deckD],
        color: '#b45309',
        material: 'wood',
        isFixed: true,
        floorIndex: f,
      });
    }

    const sillH = Number((clearWallH * 0.24).toFixed(3));
    const headerH = Number((clearWallH * 0.2).toFixed(3));
    const winH = Number((clearWallH - sillH - headerH).toFixed(3));
    const winMidY = Number((floorBaseY + slabThick + sillH + winH * 0.5).toFixed(3));

    const minX = cx - curW * 0.5;
    const maxX = cx + curW * 0.5;
    const minZ = cz - curD * 0.5;
    const maxZ = cz + curD * 0.5;

    // 남·북 외벽 + 파노라마 통창
    (['S', 'N'] as const).forEach((dir) => {
      const wallZ = dir === 'S' ? maxZ - extWallThick * 0.5 : minZ + extWallThick * 0.5;
      solids.push(
        {
          id: `floor_${f}_ext_${dir}_sill`,
          groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 외벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [cx, Number((floorBaseY + slabThick + sillH * 0.5).toFixed(3)), Number(wallZ.toFixed(3))],
          scale: [curW, sillH, extWallThick],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        },
        {
          id: `floor_${f}_ext_${dir}_header`,
          groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 상부 외벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [cx, Number((floorTopY - headerH * 0.5).toFixed(3)), Number(wallZ.toFixed(3))],
          scale: [curW, headerH, extWallThick],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        }
      );

      [-0.46, 0, 0.46].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 구조 기둥벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number((cx + curW * offsetRatio).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * 0.08).toFixed(3)), winH, extWallThick],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        });
      });

      [-0.23, 0.23].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number((cx + curW * winOffset).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * 0.38).toFixed(3)), winH, Number((extWallThick * 0.55).toFixed(3))],
          rotationY: 0,
        });
      });
    });

    // 동·서 외벽 + 창호
    (['E', 'W'] as const).forEach((dir) => {
      const wallX = dir === 'E' ? maxX - extWallThick * 0.5 : minX + extWallThick * 0.5;
      const innerD = Math.max(0.4, curD - extWallThick * 2);

      solids.push(
        {
          id: `floor_${f}_ext_${dir}_sill`,
          groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 외벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number(wallX.toFixed(3)), Number((floorBaseY + slabThick + sillH * 0.5).toFixed(3)), cz],
          scale: [extWallThick, sillH, innerD],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        },
        {
          id: `floor_${f}_ext_${dir}_header`,
          groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 상부 외벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number(wallX.toFixed(3)), Number((floorTopY - headerH * 0.5).toFixed(3)), cz],
          scale: [extWallThick, headerH, innerD],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        }
      );

      [-0.45, 0, 0.45].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 구조 기둥벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * offsetRatio).toFixed(3))],
          scale: [extWallThick, winH, Number((innerD * 0.1).toFixed(3))],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        });
      });

      [-0.225, 0.225].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * winOffset).toFixed(3))],
          scale: [Number((innerD * 0.36).toFixed(3)), winH, Number((extWallThick * 0.55).toFixed(3))],
          rotationY: Math.PI / 2,
        });
      });
    });

    const startX = minX + extWallThick;
    const startZ = minZ + extWallThick;

    // 층마다 방 구조가 다르게 진화 (1층: 공용 LDK·접객 / 2층+: 프라이빗 침실·서재·스위트)
    const floorPlan = generateDynamicRoomLayout({
      usageType: rawSpec.usageType,
      templateId,
      areaSqm: avgUnitAreaSqm,
      aspectRatio: Number((curW / Math.max(0.4, curD)).toFixed(2)),
      variantIdx: (f - 1) % 3,
      openPlanRatio: f === 1 ? (rawSpec.openPlanRatio ?? 1.0) * 1.15 : 0.9,
    });
    const floorIndoorRooms = floorPlan.rooms.filter((r) => r.liveLoadKn < 3.0);
    if (f === 1) firstFloorIndoorRooms = floorIndoorRooms;

    const intWallMat: CadMaterial =
      interiorTheme === 'industrial-loft'
        ? 'concrete'
        : interiorTheme === 'japandi'
        ? 'wood'
        : 'stucco';

    // 실내 칸막이벽 + 각 실 기능에 맞는 3D 가구/설비 배치
    floorIndoorRooms.forEach((room, rIdx) => {
      const rx = startX + usableW * (room.x / 100);
      const rz = startZ + usableD * (room.y / 100);
      const rw = usableW * (room.w / 100);
      const rd = usableD * (room.h / 100);

      if (room.x + room.w < 93) {
        solids.push({
          id: `floor_${f}_intwall_v_${rIdx}`,
          groupName: `${f}층 ${room.name} 실내 내벽`,
          partRole: 'interior_wall',
          shape: 'box',
          position: [
            Number((rx + rw).toFixed(3)),
            Number(wallCenterY.toFixed(3)),
            Number((rz + rd * 0.45).toFixed(3)),
          ],
          scale: [intWallThick, Number((clearWallH * 0.94).toFixed(3)), Number((rd * 0.84).toFixed(3))],
          color: interiorWallColor,
          material: intWallMat,
          isFixed: true,
          floorIndex: f,
        });
      }

      if (room.y + room.h < 93) {
        solids.push({
          id: `floor_${f}_intwall_h_${rIdx}`,
          groupName: `${f}층 ${room.name} 칸막이 내벽`,
          partRole: 'interior_wall',
          shape: 'box',
          position: [
            Number((rx + rw * 0.46).toFixed(3)),
            Number(wallCenterY.toFixed(3)),
            Number((rz + rd).toFixed(3)),
          ],
          scale: [Number((rw * 0.84).toFixed(3)), Number((clearWallH * 0.94).toFixed(3)), intWallThick],
          color: interiorWallColor,
          material: intWallMat,
          isFixed: true,
          floorIndex: f,
        });
      }

      // 실내 가구 및 설비(소파, 아일랜드 식탁, 침대, 욕조/카운터) 생성
      const furnBaseY = floorBaseY + slabThick + 0.015;
      const roomCenterX = rx + rw * 0.5;
      const roomCenterZ = rz + rd * 0.5;

      if (room.name.includes('거실') || room.name.includes('라운지')) {
        solids.push(
          {
            id: `furn_${f}_${rIdx}_sofa`,
            groupName: `${f}층 ${room.name} 라운지 소파`,
            partRole: 'furniture',
            shape: 'box',
            position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.055).toFixed(3)), Number((roomCenterZ - rd * 0.14).toFixed(3))],
            scale: [Number((rw * 0.56).toFixed(3)), 0.11, Number((rd * 0.24).toFixed(3))],
            color: interiorTheme === 'industrial-loft' ? '#475569' : '#d6ccc2',
            material: 'stucco',
            isFixed: true,
            floorIndex: f,
          },
          {
            id: `furn_${f}_${rIdx}_table`,
            groupName: `${f}층 ${room.name} 로우 테이블`,
            partRole: 'furniture',
            shape: 'box',
            position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.032).toFixed(3)), Number((roomCenterZ + rd * 0.12).toFixed(3))],
            scale: [Number((rw * 0.34).toFixed(3)), 0.064, Number((rd * 0.18).toFixed(3))],
            color: '#9c6644',
            material: 'wood',
            isFixed: true,
            floorIndex: f,
          }
        );
      } else if (room.name.includes('주방') || room.name.includes('키친') || room.name.includes('카페')) {
        solids.push({
          id: `furn_${f}_${rIdx}_island`,
          groupName: `${f}층 ${room.name} 아일랜드 카운터`,
          partRole: 'furniture',
          shape: 'box',
          position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.068).toFixed(3)), Number(roomCenterZ.toFixed(3))],
          scale: [Number((rw * 0.54).toFixed(3)), 0.135, Number((rd * 0.28).toFixed(3))],
          color: '#e2e8f0',
          material: 'concrete',
          isFixed: true,
          floorIndex: f,
        });
      } else if (room.name.includes('침실') || room.name.includes('게스트')) {
        solids.push({
          id: `furn_${f}_${rIdx}_bed`,
          groupName: `${f}층 ${room.name} 퀸 베드`,
          partRole: 'furniture',
          shape: 'box',
          position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.048).toFixed(3)), Number(roomCenterZ.toFixed(3))],
          scale: [Number((rw * 0.48).toFixed(3)), 0.095, Number((rd * 0.52).toFixed(3))],
          color: '#f1f5f9',
          material: 'stucco',
          isFixed: true,
          floorIndex: f,
        });
      } else if (room.name.includes('오피스') || room.name.includes('회의') || room.name.includes('전시')) {
        solids.push({
          id: `furn_${f}_${rIdx}_desk`,
          groupName: `${f}층 ${room.name} 워크 테이블`,
          partRole: 'furniture',
          shape: 'box',
          position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.06).toFixed(3)), Number(roomCenterZ.toFixed(3))],
          scale: [Number((rw * 0.58).toFixed(3)), 0.12, Number((rd * 0.32).toFixed(3))],
          color: '#b08968',
          material: 'wood',
          isFixed: true,
          floorIndex: f,
        });
      }
    });

    // 구조 기둥 노드
    const corners: [number, number, number][] = [
      [minX + 0.04, floorTopY, minZ + 0.04],
      [maxX - 0.04, floorTopY, minZ + 0.04],
      [maxX - 0.04, floorTopY, maxZ - 0.04],
      [minX + 0.04, floorTopY, maxZ - 0.04],
    ];
    corners.forEach((pos, idx) => {
      const curId = `n_${f}_${idx}`;
      nodes.push({
        id: curId,
        groupName: `${f}층 기둥 코어`,
        position: [Number(pos[0].toFixed(3)), Number(pos[1].toFixed(3)), Number(pos[2].toFixed(3))],
        isFixed: false,
        role: 'primary',
      });
      if (f === 1) {
        const baseId = `n_0_${idx}`;
        nodes.push({
          id: baseId,
          groupName: '기초 지점',
          position: [Number(pos[0].toFixed(3)), 0, Number(pos[2].toFixed(3))],
          isFixed: true,
          role: 'primary',
        });
        beams.push({
          id: `col_${f}_${idx}`,
          groupName: `${f}층 수직 기둥`,
          startNodeId: baseId,
          endNodeId: curId,
          stress: 0.25,
          radius: 0.034,
          material: 'steel',
          role: 'primary',
        });
      } else {
        beams.push({
          id: `col_${f}_${idx}`,
          groupName: `${f}층 수직 기둥`,
          startNodeId: `n_${f - 1}_${idx}`,
          endNodeId: curId,
          stress: 0.2,
          radius: 0.032,
          material: 'steel',
          role: 'primary',
        });
      }
    });
  }

  // 4. 사진/템플릿별 4종 3D 지붕 건축 (박공 / 경사 / 나비형 / 캔틸레버 평지붕)
  const topY = floors * floorH;
  const roofColor = rawSpec.customRoofColor ?? '#475569';
  const roofMat: CadMaterial = accentMaterial === 'wood' ? 'wood' : 'steel';

  if (roofStyle === 'gable') {
    const pitch = 0.3;
    const halfSpan = (topFloorW + 0.24) * 0.5;
    const slopeW = Number((halfSpan / Math.cos(pitch)).toFixed(3));
    const rise = halfSpan * Math.tan(pitch);
    const midY = Number((topY + rise * 0.5 + 0.02).toFixed(3));

    solids.push(
      {
        id: 'arch_roof_gable_left',
        groupName: '박공 지붕 좌측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx - halfSpan * 0.5).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.08, Number((topFloorD + 0.22).toFixed(3))],
        rotation: [0, 0, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_gable_right',
        groupName: '박공 지붕 우측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx + halfSpan * 0.5).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.08, Number((topFloorD + 0.22).toFixed(3))],
        rotation: [0, 0, -pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_ridge_beam',
        groupName: '박공 지붕 마룻대 보',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + rise + 0.03).toFixed(3)), topFloorCz],
        scale: [0.09, 0.09, Number((topFloorD + 0.26).toFixed(3))],
        color: '#9c6644',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'shed') {
    const pitch = 0.2;
    const spanW = Number(((topFloorW + 0.28) / Math.cos(pitch)).toFixed(3));
    const midY = Number((topY + (topFloorW * Math.tan(pitch)) * 0.45 + 0.05).toFixed(3));
    solids.push({
      id: 'arch_roof_shed',
      groupName: '모던 경사 지붕 (Shed Roof)',
      partRole: 'roof',
      shape: 'box',
      position: [topFloorCx, midY, topFloorCz],
      scale: [spanW, 0.09, Number((topFloorD + 0.24).toFixed(3))],
      rotation: [0, 0, pitch],
      color: roofColor,
      material: roofMat,
      isFixed: true,
      floorIndex: 99,
    });
  } else if (roofStyle === 'butterfly') {
    const pitch = 0.24;
    const halfSpan = (topFloorW + 0.24) * 0.5;
    const slopeW = Number((halfSpan / Math.cos(pitch)).toFixed(3));
    const rise = halfSpan * Math.tan(pitch);
    const midY = Number((topY + rise * 0.48 + 0.04).toFixed(3));

    solids.push(
      {
        id: 'arch_roof_butterfly_left',
        groupName: '나비형 지붕 좌측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx - halfSpan * 0.5).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.08, Number((topFloorD + 0.22).toFixed(3))],
        rotation: [0, 0, -pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_butterfly_right',
        groupName: '나비형 지붕 우측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx + halfSpan * 0.5).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.08, Number((topFloorD + 0.22).toFixed(3))],
        rotation: [0, 0, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else {
    // 캔틸레버 처마 평지붕 + 유리 난간
    const rW = Number((topFloorW + 0.24).toFixed(3));
    const rD = Number((topFloorD + 0.24).toFixed(3));
    solids.push(
      {
        id: 'arch_roof_slab',
        groupName: `캔틸레버 처마 지붕 슬래브 (${rawSpec.rooftops}개소)`,
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.05).toFixed(3)), topFloorCz],
        scale: [rW, 0.1, rD],
        color: '#c89b6e',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'roof_glass_balustrade_s',
        groupName: '옥상 유리 난간',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.18).toFixed(3)), Number((topFloorCz + rD * 0.48).toFixed(3))],
        scale: [rW, 0.16, 0.03],
        color: '#bae6fd',
        material: 'glass',
        isFixed: true,
        floorIndex: 99,
      }
    );
  }

  // 5. 승강기 & 직통계단 수직 코어
  const coreCount = Math.max(1, (rawSpec.elevators || 0) + (rawSpec.stairs || 1));
  for (let k = 0; k < Math.min(3, coreCount); k++) {
    const kx = topFloorCx + topFloorW * 0.24 - k * 0.42;
    solids.push({
      id: `arch_core_${k}`,
      groupName: k === 0 && rawSpec.elevators > 0 ? '엘리베이터·계단 코어' : `직통계단 코어 #${k + 1}`,
      partRole: 'core',
      shape: 'box',
      position: [Number(kx.toFixed(3)), Number((topY * 0.5).toFixed(3)), Number((-topFloorD * 0.22).toFixed(3))],
      scale: [0.32, Number(topY.toFixed(3)), 0.32],
      color: '#cbd5e1',
      material: 'concrete',
      isFixed: true,
      floorIndex: 1,
    });
  }

  // 6. 수도·전기 배관 라우팅
  const basePipeY = undergroundFloors > 0 ? -0.35 * undergroundFloors : 0.08;
  const waterX = bldgOffsetX - bldgW * 0.1;
  const waterZ = bldgD * 0.16;
  const elecX = bldgOffsetX + bldgW * 0.12;
  const elecZ = bldgD * 0.16;

  mepPipes.push(
    {
      id: 'mep_water_riser',
      system: 'water',
      points: [
        [waterX, basePipeY, waterZ],
        [waterX, topY - 0.1, waterZ],
      ],
    },
    {
      id: 'mep_elec_riser',
      system: 'electric',
      points: [
        [elecX, basePipeY, elecZ],
        [elecX, topY - 0.05, elecZ],
      ],
    }
  );

  for (let f = 1; f <= floors; f++) {
    const pipeY = (f - 1) * floorH + slabThick + 0.05;
    firstFloorIndoorRooms.forEach((room, idx) => {
      const tx = bldgOffsetX - bldgW * 0.42 + bldgW * 0.84 * ((room.x + room.w * 0.5) / 100);
      const tz = -bldgD * 0.42 + bldgD * 0.84 * ((room.y + room.h * 0.5) / 100);
      if (room.hasWater) {
        mepPipes.push({
          id: `mep_w_${f}_${idx}`,
          system: 'water',
          points: [
            [waterX, pipeY, waterZ],
            [tx, pipeY, waterZ],
            [tx, pipeY + 0.04, tz],
          ],
        });
      }
      if (room.hasPower) {
        mepPipes.push({
          id: `mep_e_${f}_${idx}`,
          system: 'electric',
          points: [
            [elecX, pipeY + 0.05, elecZ],
            [elecX, pipeY + 0.05, tz],
            [tx, pipeY + 0.05, tz],
          ],
        });
      }
    });
  }

  // 7. 방(세대) 디자인 유형 생성
  const unitTypes: UnitDesignType[] = [];
  const kds = getKdsLoadRange(rawSpec.usageType);
  const typeCount = useHouseholds
    ? Math.max(1, Math.min(5, Math.min(activeHouseholds, Math.round(rawSpec.unitTypeCount || 1))))
    : 0;

  if (useHouseholds && typeCount > 0) {
    const basePerType = Math.floor(activeHouseholds / typeCount);
    let remainder = activeHouseholds % typeCount;
    let cursor = 0;

    for (let t = 0; t < typeCount; t++) {
      const countForType = Math.max(1, basePerType + (remainder > 0 ? 1 : 0));
      if (remainder > 0) remainder -= 1;

      const areaForType = Math.max(
        24,
        Math.round(
          (rawSpec.totalFloorAreaSqm / Math.max(1, activeHouseholds)) *
            (t === 0 ? 1.05 : t === 1 ? 0.95 : 1.0)
        )
      );
      const dynamicPlan = generateDynamicRoomLayout({
        usageType: rawSpec.usageType,
        templateId,
        areaSqm: areaForType,
        aspectRatio,
        variantIdx: t,
        openPlanRatio: rawSpec.openPlanRatio ?? 1.0,
      });

      const code = `TYPE-${String.fromCharCode(65 + t)}`;
      const roomCountLabel = dynamicPlan.rooms.filter((r) => r.liveLoadKn < 3.0).length;
      const placements: UnitPlacement3D[] = [];

      for (let u = 0; u < countForType; u++) {
        const slot = cursor++;
        const fNum = (slot % floors) + 1;
        const inFloor = Math.floor(slot / floors) % unitsPerFloor;
        const cols = Math.min(unitsPerFloor, 4);
        const rows = Math.max(1, Math.ceil(unitsPerFloor / cols));
        const cIdx = inFloor % cols;
        const rIdx = Math.floor(inFloor / cols);

        const uw = (bldgW * 0.84) / cols;
        const ud = (bldgD * 0.82) / rows;
        const uh = Math.max(0.24, (floorH - slabThick) * 0.92);

        const px = bldgOffsetX - (bldgW * 0.84) / 2 + uw * (cIdx + 0.5);
        const py = (fNum - 1) * floorH + slabThick + uh * 0.5;
        const pz = -(bldgD * 0.82) / 2 + ud * (rIdx + 0.5);

        placements.push({
          floor: fNum,
          position: [Number(px.toFixed(3)), Number(py.toFixed(3)), Number(pz.toFixed(3))],
          scale: [Number((uw * 0.92).toFixed(3)), Number(uh.toFixed(3)), Number((ud * 0.92).toFixed(3))],
        });
      }

      unitTypes.push({
        id: `unit_type_${t + 1}`,
        code,
        name: `${code} (${roomCountLabel}실 구성 · 효율 ${dynamicPlan.efficiencyPct}%)`,
        areaSqm: areaForType,
        householdCount: countForType,
        liveLoadKn: kds.legalBaseKn,
        color: UNIT_TYPE_PALETTE[t % UNIT_TYPE_PALETTE.length],
        planLayout: dynamicPlan.planLayout,
        aspectRatio,
        rooms: dynamicPlan.rooms,
        placements,
      });
    }
  }

  const floorLoadsKn: Record<number, number> = { ...(rawSpec.floorLoadsKn ?? {}) };
  for (let f = 1; f <= floors; f++) {
    if (typeof floorLoadsKn[f] !== 'number') {
      floorLoadsKn[f] = kds.legalBaseKn;
    }
  }

  return {
    spec: {
      ...rawSpec,
      templateId,
      roofStyle,
      accentMaterial,
      interiorTheme,
      interiorWallColor,
      interiorFloorColor,
      siteShape,
      useHouseholds,
      buildingAreaSqm: Math.round(effectiveFootprintSqm),
      households: activeHouseholds,
      unitTypeCount: typeCount,
      unitTypes,
      exteriorWindows,
      mepPipes,
      floorLoadsKn,
    },
    solids,
    nodes,
    beams,
  };
}