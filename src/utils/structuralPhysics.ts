import type {
  BuildingSpec,
  CadMaterial,
  DesignCategory,
  SolidPrimitive,
} from '../types/cad';

const SCALE_DIV = 3.2;

/** 실제 건축 주구조 시스템 (유리 단독·무골조 구조 원천 방지) */
export type StructuralSystemId =
  | 'rc_frame'        // 철근콘크리트 라멘조 (기둥+보+슬래브, 가장 보편적·안전)
  | 'steel_frame'     // H-Beam 철골조 (장스팬·전면 커튼월 유리주택 필수)
  | 'heavy_timber'    // 중목 구조용 집성재 기둥·보 (친환경 목조주택, 저층 적합)
  | 'hybrid_rc_steel'; // 저층 RC + 상층 철골/커튼월 복합조

/** 부위별 자재 지정 명세 */
export interface ElementMaterialSpec {
  structuralSystem: StructuralSystemId;
  foundationMaterial: 'rc_mat' | 'rc_footing';
  exteriorCladding: CadMaterial; // 1층 외장 마감
  upperCladding: CadMaterial;    // 상층부 외장 마감
  roofMaterial: CadMaterial;     // 지붕 마감
  glazingSpec: 'double_lowe' | 'triple_lowe' | 'curtain_wall';
  insulationSpec: 'eps_150' | 'pf_board_120' | 'mineral_wool_150';
}

/** 실제 재료 물성치 (KDS 14 20 / 14 31 / 41 12 / 41 50 기준) */
export interface StructuralMaterialProps {
  id: StructuralSystemId;
  nameKo: string;
  codeRef: string;
  unitWeightKnM3: number;    // 단위중량 γ (kN/m³)
  elasticModulusMpa: number; // 탄성계수 E (MPa = N/mm²)
  designStrengthMpa: number; // 기준강도 f_ck / F_y / F_c (MPa)
  rebarYieldMpa?: number;    // 철근 항복강도 f_y (MPa, RC 전용)
  phiCompression: number;    // 압축 강도감소계수 φ_c
  phiFlexure: number;        // 휨 강도감소계수 φ_b
  maxRecommendedFloors: number;
  summary: string;
}

export const STRUCTURAL_SYSTEM_DB: Record<StructuralSystemId, StructuralMaterialProps> = {
  rc_frame: {
    id: 'rc_frame',
    nameKo: '철근콘크리트 라멘조 (RC)',
    codeRef: 'KDS 14 20 20 (fck=24MPa, SD400)',
    unitWeightKnM3: 24.0,
    elasticModulusMpa: 25810, // Ec = 8500 * (24+4)^(1/3)
    designStrengthMpa: 24.0,
    rebarYieldMpa: 400.0,
    phiCompression: 0.65,
    phiFlexure: 0.85,
    maxRecommendedFloors: 15,
    summary: '콘크리트 기둥·보·슬래브 일체형 골조로 내화·차음·구조 안정성이 가장 우수함',
  },
  steel_frame: {
    id: 'steel_frame',
    nameKo: 'H-Beam 철골 라멘조 (SS275)',
    codeRef: 'KDS 14 31 10 (Fy=275MPa, E=210GPa)',
    unitWeightKnM3: 77.0,
    elasticModulusMpa: 210000,
    designStrengthMpa: 275.0,
    phiCompression: 0.9,
    phiFlexure: 0.9,
    maxRecommendedFloors: 20,
    summary: '고강도 H형강 기둥·보로 넓은 무주 공간과 대형 유리 커튼월 하중을 안전하게 지지',
  },
  heavy_timber: {
    id: 'heavy_timber',
    nameKo: '중목 구조용 집성재 (Glulam)',
    codeRef: 'KDS 41 50 20 (구조용 집성재 10S-30B)',
    unitWeightKnM3: 5.5,
    elasticModulusMpa: 10000,
    designStrengthMpa: 18.0,
    phiCompression: 0.9,
    phiFlexure: 0.85,
    maxRecommendedFloors: 3,
    summary: '경량 친환경 목재 기둥·보 구조(3층 이하 권장, 1층 RC 기초판 필수 결합)',
  },
  hybrid_rc_steel: {
    id: 'hybrid_rc_steel',
    nameKo: 'RC 코어 + 철골 복합조 (하이브리드)',
    codeRef: 'KDS 14 20 / KDS 14 31 복합 기준',
    unitWeightKnM3: 24.0,
    elasticModulusMpa: 210000,
    designStrengthMpa: 275.0,
    rebarYieldMpa: 400.0,
    phiCompression: 0.85,
    phiFlexure: 0.9,
    maxRecommendedFloors: 25,
    summary: '지하·1층 RC 내진 코어에 상층부 H-Beam 철골·커튼월을 결합한 고성능 복합 구조',
  },
};

/** 외장·마감재별 현실적 한국 시공 단가 및 표면 면밀도 (proceduralTextures.ts 단가와 100% 일치) */
export const CLADDING_COST_DB: Record<
  CadMaterial,
  {
    label: string;
    matPerSqm: number;
    laborPerSqm: number;
    surfaceDeadLoadKnM2: number; // 마감재 ㎡당 자중 (kN/㎡)
  }
> = {
  stucco: {
    label: '스타코플렉스(외단열 마감)',
    matPerSqm: 78000,
    laborPerSqm: 58000,
    surfaceDeadLoadKnM2: 0.35,
  },
  wood: {
    label: '적삼목·탄화목 우드 사이딩',
    matPerSqm: 125000,
    laborPerSqm: 72000,
    surfaceDeadLoadKnM2: 0.22,
  },
  concrete: {
    label: '노출 콘크리트 마감',
    matPerSqm: 85000,
    laborPerSqm: 78000,
    surfaceDeadLoadKnM2: 0.85,
  },
  steel: {
    label: '브러시드 리얼징크·강재',
    matPerSqm: 118000,
    laborPerSqm: 68000,
    surfaceDeadLoadKnM2: 0.42,
  },
  titanium: {
    label: '티타늄 아연판(VMZINC)',
    matPerSqm: 195000,
    laborPerSqm: 88000,
    surfaceDeadLoadKnM2: 0.46,
  },
  gold: {
    label: '샴페인 골드 아노다이징 메탈',
    matPerSqm: 225000,
    laborPerSqm: 90000,
    surfaceDeadLoadKnM2: 0.48,
  },
  carbon: {
    label: '세라믹·탄소복합재(CFRP) 패널',
    matPerSqm: 175000,
    laborPerSqm: 82000,
    surfaceDeadLoadKnM2: 0.28,
  },
  glass: {
    label: '고단열 투명 로이(Low-E) 유리',
    matPerSqm: 265000,
    laborPerSqm: 115000,
    surfaceDeadLoadKnM2: 0.55,
  },
  hologram: {
    label: '반투명 에칭 로이 유리',
    matPerSqm: 245000,
    laborPerSqm: 105000,
    surfaceDeadLoadKnM2: 0.52,
  },
};

export interface FloorPhysicsResult {
  floor: number;
  deadLoadKnM2: number;        // D: 바닥 슬래브 + 마감 + 칸막이 + 보 자중 (kN/m²)
  liveLoadKnM2: number;        // L: KDS 41 12 00 활하중 (kN/m²)
  factoredLoadKnM2: number;    // U = max(1.4D, 1.2D + 1.6L) (kN/m²)
  beamSpanM: number;           // 보 경간 L (m)
  beamMomentKnM: number;       // 계수 휨모멘트 Mu = wu * L² / 8 (kN·m)
  beamCapacityKnM: number;     // 설계 휨강도 φMn (kN·m)
  beamFlexureDcr: number;      // 보 휨 응력비 (Mu / φMn)
  beamDeflectionMm: number;    // 사용하중 탄성 처짐 δ (mm)
  allowableDeflectionMm: number; // 허용 처짐 L/240 (mm)
  beamDeflectionDcr: number;   // 처짐비 (δ / δ_allow)
  columnAxialDemandKn: number; // 상층부 누적 기둥 계수 축하중 Pu (kN)
  columnEulerBucklingKn: number; // 오일러 탄성좌굴하중 Pcr (kN)
  columnCapacityKn: number;    // KDS 설계 압축강도 φPn (kN)
  columnDcr: number;           // 기둥 응력비 (Pu / φPn)
  slabDcr: number;             // 슬래브 응력비
  status: 'safe' | 'caution' | 'unsafe';
}

export interface StructuralAnalysisReport {
  system: StructuralMaterialProps;
  columnGridCountX: number;
  columnGridCountZ: number;
  totalColumnsPerFloor: number;
  spanXM: number;
  spanZM: number;
  tributaryAreaM2: number;
  columnSectionLabel: string;
  beamSectionLabel: string;
  totalDeadWeightKn: number;      // 건물 전체 고정하중 (kN)
  totalLiveWeightKn: number;      // 건물 전체 활하중 (kN)
  totalGravityMassTon: number;    // 건물 총 중량 (톤, (D+L)/9.81)
  footingServiceLoadKn: number;   // 최하부 기둥 1개당 사용하중 (kN)
  footingAreaM2: number;          // 기초판 면적 (m²)
  soilBearingPressureKpa: number; // 지반 접지압 σ_soil (kPa = kN/m²)
  allowableSoilKpa: number;       // 허용 지반지지력 q_a (kPa, 보통 풍화토 200kPa)
  foundationDcr: number;          // 기초 안전비 (σ_soil / q_a)
  maxDcr: number;                 // 전체 부재 중 최대 응력비
  overallSafety: 'safe' | 'caution' | 'unsafe';
  safetyWarnings: string[];
  floors: FloorPhysicsResult[];
}

export interface QtoBudgetLine {
  category: string;
  itemName: string;
  specDetail: string;
  quantity: number;
  unit: string;
  unitPriceKrw: number;
  materialCostKrw: number;
  laborCostKrw: number;
  totalCostKrw: number;
}

export interface RealisticBudgetReport {
  lines: QtoBudgetLine[];
  totalMaterialCostKrw: number;
  totalLaborCostKrw: number;
  directConstructionKrw: number;
  indirectAndDesignKrw: number; // 현장관리비·설계·감리비 약 16%
  grandTotalKrw: number;
  costPerSqmKrw: number;
  costPerPyeongKrw: number;
  referenceNote: string;
}

/** 유리 비중이나 층수에 따라 안전한 주구조 시스템을 자동 추천·강제 */
export function resolveSafeStructuralSystem(params: {
  usageType: DesignCategory;
  floors: number;
  windowWallRatio?: number;
  primaryMaterial: CadMaterial;
  requestedSystem?: StructuralSystemId;
}): StructuralSystemId {
  const { floors, windowWallRatio = 0.5, primaryMaterial, requestedSystem } = params;

  if (primaryMaterial === 'glass' || windowWallRatio >= 0.65) {
    if (requestedSystem === 'steel_frame' || requestedSystem === 'hybrid_rc_steel') {
      return requestedSystem;
    }
    return floors >= 3 ? 'hybrid_rc_steel' : 'steel_frame';
  }

  if (requestedSystem) {
    if (requestedSystem === 'heavy_timber' && floors >= 4) {
      return 'hybrid_rc_steel';
    }
    return requestedSystem;
  }

  if (primaryMaterial === 'wood' && floors <= 3) return 'heavy_timber';
  if (primaryMaterial === 'steel' || primaryMaterial === 'titanium') return 'steel_frame';
  if (floors >= 6) return 'hybrid_rc_steel';
  return 'rc_frame';
}

/**
 * 실제 건축구조역학(KDS 41 12 00 / 14 20 20 / 14 31 10 / 41 50 20) 기반
 * 층별 하중 전달 · 보 휨/처짐 · 기둥 좌굴/압축 · 기초 지반압 정밀 해석
 */
export function runStructuralAnalysis(
  spec: BuildingSpec,
  matSpec: ElementMaterialSpec,
  floorDeadLoadDeltaKnM2?: Record<number, number>
): StructuralAnalysisReport {
  const system = STRUCTURAL_SYSTEM_DB[matSpec.structuralSystem];
  const floors = Math.max(1, Math.round(spec.floors || 2));
  const floorHeightM = Math.max(2.6, (spec.heightMeters || floors * 3.3) / floors);
  const footprintSqm = Math.max(40, spec.buildingAreaSqm || 150);

  const aspect = 1.22;
  const widthM = Math.sqrt(footprintSqm * aspect);
  const depthM = footprintSqm / widthM;

  const targetBayM = matSpec.structuralSystem === 'heavy_timber' ? 4.2 : 5.4;
  const baysX = Math.max(2, Math.round(widthM / targetBayM));
  const baysZ = Math.max(2, Math.round(depthM / targetBayM));
  const spanXM = widthM / baysX;
  const spanZM = depthM / baysZ;
  const govSpanM = Math.max(spanXM, spanZM);
  const tribWidthM = Math.min(spanXM, spanZM);
  const tributaryAreaM2 = spanXM * spanZM;
  const totalColumnsPerFloor = (baysX + 1) * (baysZ + 1);

  const slabThickM =
    matSpec.structuralSystem === 'heavy_timber'
      ? 0.14
      : matSpec.structuralSystem === 'steel_frame'
      ? 0.15
      : 0.18;

  const slabSelfWeight =
    matSpec.structuralSystem === 'heavy_timber'
      ? slabThickM * 5.5 + 0.6
      : slabThickM * 24.0;

  const superDeadKnM2 =
    spec.usageType === '단독주택' || spec.usageType === '공동주택' ? 2.6 : 2.2;
  const claddingLineDeadKnM2 =
    matSpec.glazingSpec === 'curtain_wall'
      ? 0.55
      : CLADDING_COST_DB[matSpec.exteriorCladding]?.surfaceDeadLoadKnM2 ?? 0.55;

  const baseFloorDeadKnM2 = Number(
    (slabSelfWeight + superDeadKnM2 + claddingLineDeadKnM2).toFixed(2)
  );
  const roofDeadKnM2 = Number((slabSelfWeight + 1.4).toFixed(2));

  let colCapacityKn = 1500;
  let colEulerKn = 4000;
  let beamCapacityKnM = 180;
  let beamEI_Nmm2 = 2e13;
  let columnSectionLabel = '';
  let beamSectionLabel = '';

  const L_col_mm = floorHeightM * 1000;
  const K_eff = 1.0;

  if (matSpec.structuralSystem === 'rc_frame') {
    const colSideMm = floors <= 2 ? 350 : floors <= 5 ? 400 : 500;
    const beamB = 300;
    const beamH = floors <= 3 ? 450 : 550;
    const Ag = colSideMm * colSideMm;
    const rhoG = 0.016;
    const Ast = Ag * rhoG;
    const fck = system.designStrengthMpa;
    const fy = system.rebarYieldMpa ?? 400;

    const Pn_max_N = 0.8 * (0.85 * fck * (Ag - Ast) + fy * Ast);
    colCapacityKn = (system.phiCompression * Pn_max_N) / 1000;

    const Ig_col = Math.pow(colSideMm, 4) / 12;
    colEulerKn =
      (Math.PI * Math.PI * system.elasticModulusMpa * (0.7 * Ig_col)) /
      Math.pow(K_eff * L_col_mm, 2) /
      1000;

    const d_mm = beamH - 60;
    const As_beam = beamB * d_mm * 0.0085;
    const a_mm = (As_beam * fy) / (0.85 * fck * beamB);
    const Mn_Nmm = As_beam * fy * (d_mm - a_mm * 0.5);
    beamCapacityKnM = (system.phiFlexure * Mn_Nmm) / 1e6;

    const Ig_beam = (beamB * Math.pow(beamH, 3)) / 12;
    beamEI_Nmm2 = system.elasticModulusMpa * (0.35 * Ig_beam);

    columnSectionLabel = `RC ${colSideMm}×${colSideMm}mm (주근비 1.6%)`;
    beamSectionLabel = `RC ${beamB}×${beamH}mm (SD400)`;
  } else if (
    matSpec.structuralSystem === 'steel_frame' ||
    matSpec.structuralSystem === 'hybrid_rc_steel'
  ) {
    const heavy = floors >= 4;
    const Ag = heavy ? 9218 : 6353;
    const Iy = heavy ? 36500000 : 16000000;
    const ry = Math.sqrt(Iy / Ag);
    const Fy = system.designStrengthMpa;
    const Es = system.elasticModulusMpa;

    const slenderness = (K_eff * L_col_mm) / ry;
    const Fe = (Math.PI * Math.PI * Es) / (slenderness * slenderness);
    const Fcr = Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;

    colCapacityKn = (system.phiCompression * Fcr * Ag) / 1000;
    colEulerKn = (Fe * Ag) / 1000;

    const Zx = heavy ? 865000 : 542000;
    const Ix_beam = heavy ? 136000000 : 72100000;
    beamCapacityKnM = (system.phiFlexure * Fy * Zx) / 1e6;
    beamEI_Nmm2 = Es * Ix_beam;

    columnSectionLabel = heavy
      ? 'H-250×250×9×14 (SS275)'
      : 'H-200×200×8×12 (SS275)';
    beamSectionLabel = heavy
      ? 'H-350×175×7×11 (SS275)'
      : 'H-300×150×6.5×9 (SS275)';
  } else {
    const colD = floors <= 2 ? 210 : 240;
    const beamB = 180;
    const beamH = 330;
    const Ag = colD * colD;
    const FcStar = system.designStrengthMpa;
    const E_min = system.elasticModulusMpa * 0.55;

    const leOverD = (K_eff * L_col_mm) / colD;
    const FcE = (0.822 * E_min) / (leOverD * leOverD);
    const c_glulam = 0.9;
    const ratio = FcE / FcStar;
    const term = (1 + ratio) / (2 * c_glulam);
    const Cp = term - Math.sqrt(Math.max(0, term * term - ratio / c_glulam));

    colCapacityKn = (system.phiCompression * FcStar * Cp * Ag) / 1000;
    const I_col = Math.pow(colD, 4) / 12;
    colEulerKn =
      (Math.PI * Math.PI * system.elasticModulusMpa * I_col) /
      Math.pow(K_eff * L_col_mm, 2) /
      1000;

    const Sx = (beamB * beamH * beamH) / 6;
    beamCapacityKnM = (system.phiFlexure * 24.0 * Sx) / 1e6;
    const I_beam = (beamB * Math.pow(beamH, 3)) / 12;
    beamEI_Nmm2 = system.elasticModulusMpa * I_beam;

    columnSectionLabel = `Glulam 집성재 ${colD}×${colD}mm`;
    beamSectionLabel = `Glulam 집성재 ${beamB}×${beamH}mm`;
  }

  const floorResults: FloorPhysicsResult[] = [];
  let cumulativeFactoredColumnKn = 0;
  let cumulativeServiceColumnKn = 0;
  let totalDeadWeightKn = 0;
  let totalLiveWeightKn = 0;

  const defaultLiveKn =
    spec.usageType === '업무·상업시설'
      ? 2.5
      : spec.usageType === '복합문화시설'
      ? 4.0
      : 2.0;

  for (let f = floors; f >= 1; f--) {
    const isTopFloor = f === floors;
    const baseD = isTopFloor
      ? (baseFloorDeadKnM2 + roofDeadKnM2) * 0.55
      : baseFloorDeadKnM2;
    const customDeltaD = floorDeadLoadDeltaKnM2?.[f] ?? 0;
    const deadKnM2 = Number(Math.max(1.8, baseD + customDeltaD).toFixed(2));
    const liveKnM2 = spec.floorLoadsKn?.[f] ?? defaultLiveKn;

    const factoredKnM2 = Number(
      Math.max(1.4 * deadKnM2, 1.2 * deadKnM2 + 1.6 * liveKnM2).toFixed(2)
    );
    const serviceKnM2 = deadKnM2 + liveKnM2;

    totalDeadWeightKn += deadKnM2 * footprintSqm;
    totalLiveWeightKn += liveKnM2 * footprintSqm;

    const wu_beam = factoredKnM2 * tribWidthM;
    const ws_beam = serviceKnM2 * tribWidthM;
    const beamMomentKnM = (wu_beam * govSpanM * govSpanM) / 8;
    const beamFlexureDcr = beamMomentKnM / Math.max(1, beamCapacityKnM);

    const L_beam_mm = govSpanM * 1000;
    const beamDeflectionMm =
      (5 * ws_beam * Math.pow(L_beam_mm, 4)) / (384 * Math.max(1e9, beamEI_Nmm2));
    const allowableDeflectionMm = L_beam_mm / 240;
    const beamDeflectionDcr = beamDeflectionMm / Math.max(1, allowableDeflectionMm);

    const colSelfKn =
      matSpec.structuralSystem === 'heavy_timber'
        ? 0.21 * 0.21 * floorHeightM * 5.5
        : matSpec.structuralSystem === 'steel_frame'
        ? 0.008 * floorHeightM * 77.0
        : 0.4 * 0.4 * floorHeightM * 24.0;

    cumulativeFactoredColumnKn += factoredKnM2 * tributaryAreaM2 + 1.2 * colSelfKn;
    cumulativeServiceColumnKn += serviceKnM2 * tributaryAreaM2 + colSelfKn;

    const effectiveColCapKn = Math.min(colCapacityKn, colEulerKn * 0.75);
    const columnDcr = cumulativeFactoredColumnKn / Math.max(1, effectiveColCapKn);

    const slabLimitKnM2 = matSpec.structuralSystem === 'heavy_timber' ? 11.5 : 15.5;
    const slabDcr = factoredKnM2 / slabLimitKnM2;

    const floorMaxDcr = Math.max(columnDcr, beamFlexureDcr, beamDeflectionDcr, slabDcr);
    const status: 'safe' | 'caution' | 'unsafe' =
      floorMaxDcr > 1.0 ? 'unsafe' : floorMaxDcr > 0.78 ? 'caution' : 'safe';

    floorResults.push({
      floor: f,
      deadLoadKnM2: deadKnM2,
      liveLoadKnM2: Number(liveKnM2.toFixed(2)),
      factoredLoadKnM2: factoredKnM2,
      beamSpanM: Number(govSpanM.toFixed(2)),
      beamMomentKnM: Number(beamMomentKnM.toFixed(1)),
      beamCapacityKnM: Number(beamCapacityKnM.toFixed(1)),
      beamFlexureDcr: Number(beamFlexureDcr.toFixed(3)),
      beamDeflectionMm: Number(beamDeflectionMm.toFixed(2)),
      allowableDeflectionMm: Number(allowableDeflectionMm.toFixed(1)),
      beamDeflectionDcr: Number(beamDeflectionDcr.toFixed(3)),
      columnAxialDemandKn: Number(cumulativeFactoredColumnKn.toFixed(1)),
      columnEulerBucklingKn: Number(colEulerKn.toFixed(1)),
      columnCapacityKn: Number(effectiveColCapKn.toFixed(1)),
      columnDcr: Number(columnDcr.toFixed(3)),
      slabDcr: Number(slabDcr.toFixed(3)),
      status,
    });
  }

  floorResults.sort((a, b) => a.floor - b.floor);

  const allowableSoilKpa = 200;
  const footingAreaM2 =
    matSpec.foundationMaterial === 'rc_mat'
      ? Math.max(4.0, tributaryAreaM2 * 0.85)
      : Math.max(2.25, floors <= 2 ? 2.56 : 4.0);
  const soilBearingPressureKpa = cumulativeServiceColumnKn / footingAreaM2;
  const foundationDcr = soilBearingPressureKpa / allowableSoilKpa;

  const maxDcr = Number(
    Math.max(
      foundationDcr,
      ...floorResults.map((r) =>
        Math.max(r.columnDcr, r.beamFlexureDcr, r.beamDeflectionDcr, r.slabDcr)
      )
    ).toFixed(3)
  );

  const safetyWarnings: string[] = [];
  if (matSpec.structuralSystem === 'heavy_timber' && floors > 3) {
    safetyWarnings.push('중목구조는 3층 이하 권장입니다. RC 또는 철골 복합조로 전환을 권장합니다.');
  }
  const worstCol = floorResults[0];
  if (worstCol && worstCol.columnDcr > 1.0) {
    safetyWarnings.push(
      `1층 기둥 축하중(${worstCol.columnAxialDemandKn}kN)이 설계강도(${worstCol.columnCapacityKn}kN)를 초과했습니다.`
    );
  }
  const worstBeam = floorResults.reduce(
    (max, cur) => (cur.beamFlexureDcr > max.beamFlexureDcr ? cur : max),
    floorResults[0]
  );
  if (worstBeam && worstBeam.beamDeflectionDcr > 1.0) {
    safetyWarnings.push(
      `${worstBeam.floor}층 보 처짐(${worstBeam.beamDeflectionMm}mm)이 허용치(${worstBeam.allowableDeflectionMm}mm)를 초과했습니다.`
    );
  }
  if (foundationDcr > 1.0) {
    safetyWarnings.push(
      `기초 지반접지압(${soilBearingPressureKpa.toFixed(0)}kPa)이 허용지내력(${allowableSoilKpa}kPa)을 초과했습니다. 매트기초 확장이 필요합니다.`
    );
  }

  const overallSafety: 'safe' | 'caution' | 'unsafe' =
    maxDcr > 1.0 ? 'unsafe' : maxDcr > 0.78 ? 'caution' : 'safe';

  return {
    system,
    columnGridCountX: baysX + 1,
    columnGridCountZ: baysZ + 1,
    totalColumnsPerFloor,
    spanXM: Number(spanXM.toFixed(2)),
    spanZM: Number(spanZM.toFixed(2)),
    tributaryAreaM2: Number(tributaryAreaM2.toFixed(2)),
    columnSectionLabel,
    beamSectionLabel,
    totalDeadWeightKn: Math.round(totalDeadWeightKn),
    totalLiveWeightKn: Math.round(totalLiveWeightKn),
    totalGravityMassTon: Math.round((totalDeadWeightKn + totalLiveWeightKn) / 9.81),
    footingServiceLoadKn: Number(cumulativeServiceColumnKn.toFixed(1)),
    footingAreaM2: Number(footingAreaM2.toFixed(2)),
    soilBearingPressureKpa: Number(soilBearingPressureKpa.toFixed(1)),
    allowableSoilKpa,
    foundationDcr: Number(foundationDcr.toFixed(3)),
    maxDcr,
    overallSafety,
    safetyWarnings,
    floors: floorResults,
  };
}

/** 개별 부위의 실제 건축 면적(㎡) 추정 (SceneCanvas 호버 툴팁과 동일 공식) */
function computeSolidFaceAreaM2(solid: SolidPrimitive): number {
  const dims = [
    solid.scale[0] * SCALE_DIV,
    solid.scale[1] * SCALE_DIV,
    solid.scale[2] * SCALE_DIV,
  ].sort((a, b) => b - a);
  return Math.max(0.5, Number((dims[0] * dims[1]).toFixed(2)));
}

/** 부위별 기본(초기 생성) 재질을 판별해 개별·층별 변경 차액을 정확히 산출 */
function getBaselineMaterialForSolid(
  solid: SolidPrimitive,
  matSpec: ElementMaterialSpec,
  spec: BuildingSpec
): CadMaterial | null {
  const role = solid.partRole;
  const floor = solid.floorIndex ?? 1;

  if (
    role === 'garden' ||
    role === 'furniture' ||
    role === 'sculpture' ||
    role === 'site_boundary' ||
    role === 'unit_divider' ||
    role === 'basement' ||
    role === 'structural_footing'
  ) {
    return null;
  }
  if (role === 'roof') return matSpec.roofMaterial;
  if (role === 'roof_infill') {
    return floor > 1 || spec.floors > 1 ? matSpec.upperCladding : matSpec.exteriorCladding;
  }
  if (role === 'exterior_wall') {
    return floor <= 1 ? matSpec.exteriorCladding : matSpec.upperCladding;
  }
  if (role === 'slab') {
    return matSpec.structuralSystem === 'heavy_timber' ? 'wood' : 'concrete';
  }
  if (role === 'structural_column' || role === 'structural_beam') {
    if (matSpec.structuralSystem === 'steel_frame') return 'steel';
    if (matSpec.structuralSystem === 'heavy_timber') return 'wood';
    if (matSpec.structuralSystem === 'hybrid_rc_steel') {
      return floor <= 1 ? 'concrete' : 'steel';
    }
    return 'concrete';
  }
  if (role === 'interior_wall') {
    if (spec.interiorTheme === 'industrial-loft') return 'concrete';
    if (spec.interiorTheme === 'japandi') return 'wood';
    return 'stucco';
  }
  if (role === 'interior_floor') {
    return spec.interiorTheme === 'industrial-loft' ? 'concrete' : 'wood';
  }
  if (role === 'core') return 'concrete';
  return matSpec.exteriorCladding;
}

/**
 * 실제 부재 물량산출(QTO) 기반 대한민국 현실적 건축 공사비 산출
 * (solids를 전달하면 개별 부위·층별 재질 변경에 따른 자재비·시공비 차액까지 실시간 합산)
 */
export function calculateRealisticBudget(
  spec: BuildingSpec,
  matSpec: ElementMaterialSpec,
  physics: StructuralAnalysisReport,
  solids?: SolidPrimitive[]
): RealisticBudgetReport {
  const floors = Math.max(1, spec.floors || 2);
  const aboveArea = Math.max(40, spec.totalFloorAreaSqm || 200);
  const ugArea = Math.max(0, spec.undergroundAreaSqm || 0);
  const footprint = Math.max(40, spec.buildingAreaSqm || aboveArea / floors);
  const heightM = Math.max(3.2, spec.heightMeters || floors * 3.3);
  const wwr = Math.max(0.22, Math.min(0.82, spec.windowWallRatio ?? 0.5));

  const perimeterM = 2 * (Math.sqrt(footprint * 1.22) + footprint / Math.sqrt(footprint * 1.22));
  const grossFacadeArea = perimeterM * heightM;
  const windowAreaSqm = Math.round(grossFacadeArea * wwr);
  const opaqueWallSqm = Math.max(20, Math.round(grossFacadeArea * (1 - wwr)));
  const floor1WallSqm = Math.round(opaqueWallSqm / floors);
  const upperWallSqm = Math.max(0, opaqueWallSqm - floor1WallSqm);

  const lines: QtoBudgetLine[] = [];

  // 1. 기초 및 토공사
  const foundationConcreteM3 = Math.round(footprint * 0.35 + ugArea * 0.42);
  const foundationMat = foundationConcreteM3 * 165000 + ugArea * 180000;
  const foundationLabor = foundationConcreteM3 * 115000 + ugArea * 190000;
  lines.push({
    category: '토목·기초',
    itemName:
      ugArea > 0
        ? `지하층(${spec.undergroundFloors}F) 흙막이·터파기 및 RC 기초`
        : '지상 건축물 RC 기초판 및 터파기',
    specDetail: `기초 콘크리트 ${foundationConcreteM3}㎥ · 지반압 ${physics.soilBearingPressureKpa}kPa 검토`,
    quantity: foundationConcreteM3,
    unit: '㎥',
    unitPriceKrw: Math.round((foundationMat + foundationLabor) / Math.max(1, foundationConcreteM3)),
    materialCostKrw: Math.round(foundationMat),
    laborCostKrw: Math.round(foundationLabor),
    totalCostKrw: Math.round(foundationMat + foundationLabor),
  });

  // 2. 주 구조 골조
  if (matSpec.structuralSystem === 'rc_frame') {
    const concreteM3 = Math.round(aboveArea * 0.38);
    const rebarTon = Number((concreteM3 * 0.105).toFixed(1));
    const matCost = Math.round(concreteM3 * 110000 + rebarTon * 980000);
    const laborCost = Math.round(concreteM3 * 220000 + rebarTon * 720000);
    lines.push({
      category: '주구조 골조',
      itemName: '철근콘크리트(RC) 기둥·보·슬래브 골조',
      specDetail: `레미콘 ${concreteM3}㎥ + SD400 철근 ${rebarTon}t (${physics.columnSectionLabel})`,
      quantity: aboveArea,
      unit: '㎡',
      unitPriceKrw: Math.round((matCost + laborCost) / aboveArea),
      materialCostKrw: matCost,
      laborCostKrw: laborCost,
      totalCostKrw: matCost + laborCost,
    });
  } else if (
    matSpec.structuralSystem === 'steel_frame' ||
    matSpec.structuralSystem === 'hybrid_rc_steel'
  ) {
    const steelTon = Number((aboveArea * 0.058).toFixed(1));
    const deckConcreteM3 = Math.round(aboveArea * 0.16);
    const matCost = Math.round(steelTon * 1450000 + deckConcreteM3 * 135000);
    const laborCost = Math.round(steelTon * 980000 + deckConcreteM3 * 145000);
    lines.push({
      category: '주구조 골조',
      itemName:
        matSpec.structuralSystem === 'hybrid_rc_steel'
          ? 'RC 내진코어 + H-Beam 철골 복합 골조'
          : 'H-Beam 철골 라멘조 + 데크플레이트 슬래브',
      specDetail: `SS275 H형강 ${steelTon}t + 데크 RC ${deckConcreteM3}㎥ (${physics.columnSectionLabel})`,
      quantity: Number(steelTon),
      unit: 't',
      unitPriceKrw: Math.round((matCost + laborCost) / Math.max(1, steelTon)),
      materialCostKrw: matCost,
      laborCostKrw: laborCost,
      totalCostKrw: matCost + laborCost,
    });
  } else {
    const timberM3 = Number((aboveArea * 0.24).toFixed(1));
    const matCost = Math.round(timberM3 * 980000 + aboveArea * 65000);
    const laborCost = Math.round(timberM3 * 640000 + aboveArea * 55000);
    lines.push({
      category: '주구조 골조',
      itemName: '중목 구조용 집성재(Glulam) 기둥·보 및 바닥 골조',
      specDetail: `구조용 집성재 ${timberM3}㎥ + 접합철물 (${physics.columnSectionLabel})`,
      quantity: timberM3,
      unit: '㎥',
      unitPriceKrw: Math.round((matCost + laborCost) / Math.max(1, timberM3)),
      materialCostKrw: matCost,
      laborCostKrw: laborCost,
      totalCostKrw: matCost + laborCost,
    });
  }

  // 3. 외벽 마감재 (1층 + 상층부)
  const c1 = CLADDING_COST_DB[matSpec.exteriorCladding] ?? CLADDING_COST_DB.stucco;
  const c2 = CLADDING_COST_DB[matSpec.upperCladding] ?? CLADDING_COST_DB.wood;
  const wallMatCost = floor1WallSqm * c1.matPerSqm + upperWallSqm * c2.matPerSqm;
  const wallLaborCost = floor1WallSqm * c1.laborPerSqm + upperWallSqm * c2.laborPerSqm;
  lines.push({
    category: '외장·단열',
    itemName:
      upperWallSqm > 0 && matSpec.exteriorCladding !== matSpec.upperCladding
        ? `외벽 이종 마감 (1F ${c1.label.split('(')[0]} + 상층 ${c2.label.split('(')[0]})`
        : `외벽 마감 (${c1.label})`,
    specDetail: `불투명 외벽 ${opaqueWallSqm}㎡ (1F ${floor1WallSqm}㎡ / 상층 ${upperWallSqm}㎡)`,
    quantity: opaqueWallSqm,
    unit: '㎡',
    unitPriceKrw: Math.round((wallMatCost + wallLaborCost) / Math.max(1, opaqueWallSqm)),
    materialCostKrw: Math.round(wallMatCost),
    laborCostKrw: Math.round(wallLaborCost),
    totalCostKrw: Math.round(wallMatCost + wallLaborCost),
  });

  // 4. 창호 및 유리 파사드
  const glazingRates =
    matSpec.glazingSpec === 'curtain_wall'
      ? { label: '알루미늄 삼중 로이 커튼월 시스템', mat: 320000, labor: 125000 }
      : matSpec.glazingSpec === 'triple_lowe'
      ? { label: '독일식 시스템 삼중 로이 창호', mat: 290000, labor: 95000 }
      : { label: '고단열 이중 로이 시스템 창호', mat: 215000, labor: 75000 };

  const winMat = windowAreaSqm * glazingRates.mat;
  const winLabor = windowAreaSqm * glazingRates.labor;
  lines.push({
    category: '창호·유리',
    itemName: glazingRates.label,
    specDetail: `외벽 창호비율 ${Math.round(wwr * 100)}% · 총 개구부 ${windowAreaSqm}㎡`,
    quantity: windowAreaSqm,
    unit: '㎡',
    unitPriceKrw: glazingRates.mat + glazingRates.labor,
    materialCostKrw: winMat,
    laborCostKrw: winLabor,
    totalCostKrw: winMat + winLabor,
  });

  // 5. 지붕 방수·단열·마감 공사
  const roofAreaSqm = Math.round(footprint * 1.18);
  const roofInfo = CLADDING_COST_DB[matSpec.roofMaterial] ?? CLADDING_COST_DB.steel;
  const roofMat = roofAreaSqm * (roofInfo.matPerSqm + 45000);
  const roofLabor = roofAreaSqm * (roofInfo.laborPerSqm + 35000);
  lines.push({
    category: '지붕·방수',
    itemName: `지붕 구조 마감 및 복합방수 (${roofInfo.label.split('(')[0]})`,
    specDetail: `지붕 투영/경사 면적 ${roofAreaSqm}㎡ (우레탄·시트방수 및 지붕단열 포함)`,
    quantity: roofAreaSqm,
    unit: '㎡',
    unitPriceKrw: Math.round((roofMat + roofLabor) / Math.max(1, roofAreaSqm)),
    materialCostKrw: roofMat,
    laborCostKrw: roofLabor,
    totalCostKrw: roofMat + roofLabor,
  });

  // 6. 실내 인테리어 마감
  const totalUsableArea = aboveArea + ugArea * 0.6;
  const intMat = Math.round(totalUsableArea * 260000);
  const intLabor = Math.round(totalUsableArea * 210000);
  lines.push({
    category: '실내 마감',
    itemName: '실내 바닥재·내벽 마감·주방 및 욕실 기구',
    specDetail: `실내 마감 연면적 ${Math.round(totalUsableArea)}㎡`,
    quantity: Math.round(totalUsableArea),
    unit: '㎡',
    unitPriceKrw: 470000,
    materialCostKrw: intMat,
    laborCostKrw: intLabor,
    totalCostKrw: intMat + intLabor,
  });

  // 7. 기계설비·전기·배관(MEP) + 승강기
  const mepArea = aboveArea + ugArea;
  const elevCount = Math.max(0, spec.elevators || 0);
  const mepMat = Math.round(mepArea * 155000 + elevCount * 42000000);
  const mepLabor = Math.round(mepArea * 125000 + elevCount * 16000000);
  lines.push({
    category: '설비·전기(MEP)',
    itemName:
      elevCount > 0
        ? `급배수·난방·전기배선 및 승강기(${elevCount}대)`
        : '급배수·바닥난방·전기배선 및 분전 설비',
    specDetail: `설비 연면적 ${mepArea}㎡ · 자동 라우팅 배관 반영`,
    quantity: mepArea,
    unit: '㎡',
    unitPriceKrw: Math.round((mepMat + mepLabor) / Math.max(1, mepArea)),
    materialCostKrw: mepMat,
    laborCostKrw: mepLabor,
    totalCostKrw: mepMat + mepLabor,
  });

  // 8. 외부 조경 및 데크
  const gardenSqm = Math.max(0, spec.gardenAreaSqm || 0);
  if (gardenSqm > 0) {
    const gMat = Math.round(gardenSqm * 85000);
    const gLabor = Math.round(gardenSqm * 55000);
    lines.push({
      category: '조경·외부',
      itemName: '정원 잔디·수목 식재 및 외부 데크 포장',
      specDetail: `조경 면적 ${gardenSqm}㎡`,
      quantity: gardenSqm,
      unit: '㎡',
      unitPriceKrw: 140000,
      materialCostKrw: gMat,
      laborCostKrw: gLabor,
      totalCostKrw: gMat + gLabor,
    });
  }

  // 9. 개별 부위·층 전체 재질 커스텀 변경 차액 정산 (금·유리·티타늄·카본 등 즉시 반영)
  if (solids && solids.length > 0) {
    let deltaMatTotal = 0;
    let deltaLaborTotal = 0;
    let changedAreaM2 = 0;
    let changedCount = 0;
    const changedLabels = new Set<string>();

    solids.forEach((solid) => {
      if (!solid.material) return;
      const baseMat = getBaselineMaterialForSolid(solid, matSpec, spec);
      if (!baseMat || baseMat === solid.material) return;

      const curCost = CLADDING_COST_DB[solid.material];
      const baseCost = CLADDING_COST_DB[baseMat];
      if (!curCost || !baseCost) return;

      const areaM2 = computeSolidFaceAreaM2(solid);
      deltaMatTotal += (curCost.matPerSqm - baseCost.matPerSqm) * areaM2;
      deltaLaborTotal += (curCost.laborPerSqm - baseCost.laborPerSqm) * areaM2;
      changedAreaM2 += areaM2;
      changedCount += 1;
      changedLabels.add(curCost.label.split('(')[0]);
    });

    const totalDelta = Math.round(deltaMatTotal + deltaLaborTotal);
    if (changedCount > 0 && Math.abs(totalDelta) >= 10000) {
      const labelArr = Array.from(changedLabels);
      const summaryName =
        labelArr.length === 1
          ? `${labelArr[0]} 변경 차액`
          : `${labelArr[0]} 외 ${labelArr.length - 1}종 변경 차액`;

      lines.push({
        category: '자재 변경 차액',
        itemName: summaryName,
        specDetail: `개별·층별 변경 ${changedCount}개 부위 (총 ${changedAreaM2.toFixed(1)}㎡ 적용)`,
        quantity: Number(changedAreaM2.toFixed(1)),
        unit: '㎡',
        unitPriceKrw: Math.round(totalDelta / Math.max(1, changedAreaM2)),
        materialCostKrw: Math.round(deltaMatTotal),
        laborCostKrw: Math.round(deltaLaborTotal),
        totalCostKrw: totalDelta,
      });
    }
  }

  const totalMaterialCostKrw = Math.max(
    5000000,
    lines.reduce((acc, l) => acc + l.materialCostKrw, 0)
  );
  const totalLaborCostKrw = Math.max(
    5000000,
    lines.reduce((acc, l) => acc + l.laborCostKrw, 0)
  );
  const directConstructionKrw = totalMaterialCostKrw + totalLaborCostKrw;
  const indirectAndDesignKrw = Math.round(directConstructionKrw * 0.16);
  const grandTotalKrw = directConstructionKrw + indirectAndDesignKrw;

  const totalAreaForUnit = Math.max(1, aboveArea + ugArea);
  const costPerSqmKrw = Math.round(grandTotalKrw / totalAreaForUnit);
  const costPerPyeongKrw = Math.round(costPerSqmKrw * 3.3058);

  return {
    lines,
    totalMaterialCostKrw,
    totalLaborCostKrw,
    directConstructionKrw,
    indirectAndDesignKrw,
    grandTotalKrw,
    costPerSqmKrw,
    costPerPyeongKrw,
    referenceNote:
      '대한건설협회 시중노임·자재 물량산출(QTO) 기준 추정치 (부위·층별 재질 변경 차액 실시간 반영, 토지구입비·취득세 제외)',
  };
}

/**
 * 개별 부위 또는 층 전체의 재질/치수가 변경되었을 때
 * 1) 자재 단위중량 변화에 따른 층별 자중(D) 및 KDS 구조역학(DCR) 재계산
 * 2) 실제 변경 면적 × 단가 차액을 반영한 총 예상 공사비(budgetReport) 재계산
 * 3) 각 SolidPrimitive의 dcr·stressLabel까지 최신 수치로 갱신
 */
export function syncPhysicsAndBudgetForSolids(
  spec: BuildingSpec,
  solids: SolidPrimitive[]
): {
  nextSpec: BuildingSpec;
  nextSolids: SolidPrimitive[];
} {
  const floors = Math.max(1, spec.floors || 2);
  const footprint = Math.max(40, spec.buildingAreaSqm || 150);

  const matSpec: ElementMaterialSpec = spec.elementMaterials ?? {
    structuralSystem:
      spec.structuralSystem ??
      resolveSafeStructuralSystem({
        usageType: spec.usageType,
        floors,
        windowWallRatio: spec.windowWallRatio,
        primaryMaterial: 'stucco',
      }),
    foundationMaterial: floors >= 3 ? 'rc_mat' : 'rc_footing',
    exteriorCladding: 'stucco',
    upperCladding: spec.accentMaterial ?? 'wood',
    roofMaterial: spec.roofMaterial ?? 'steel',
    glazingSpec: (spec.windowWallRatio ?? 0.5) >= 0.65 ? 'curtain_wall' : 'double_lowe',
    insulationSpec: 'eps_150',
  };

  // 층별 자재 변경에 따른 마감 자중 증감분(kN/㎡) 집계
  const floorWeightDeltaKn: Record<number, number> = {};
  solids.forEach((solid) => {
    if (!solid.material) return;
    const baseMat = getBaselineMaterialForSolid(solid, matSpec, spec);
    if (!baseMat || baseMat === solid.material) return;

    const curW = CLADDING_COST_DB[solid.material]?.surfaceDeadLoadKnM2 ?? 0.4;
    const baseW = CLADDING_COST_DB[baseMat]?.surfaceDeadLoadKnM2 ?? 0.4;
    const areaM2 = computeSolidFaceAreaM2(solid);
    const fIdx =
      typeof solid.floorIndex === 'number' && solid.floorIndex >= 1 && solid.floorIndex <= floors
        ? solid.floorIndex
        : floors;
    floorWeightDeltaKn[fIdx] = (floorWeightDeltaKn[fIdx] ?? 0) + (curW - baseW) * areaM2;
  });

  const floorDeadLoadDeltaKnM2: Record<number, number> = {};
  Object.entries(floorWeightDeltaKn).forEach(([fKey, totalKn]) => {
    floorDeadLoadDeltaKnM2[Number(fKey)] = Number((totalKn / footprint).toFixed(3));
  });

  const structuralReport = runStructuralAnalysis(spec, matSpec, floorDeadLoadDeltaKnM2);
  const budgetReport = calculateRealisticBudget(spec, matSpec, structuralReport, solids);

  // 각 3D 부재의 dcr 및 stressLabel을 최신 물리 해석 결과로 갱신
  const footingLabel = `기초 지반압 ${structuralReport.soilBearingPressureKpa}kPa / 허용 ${structuralReport.allowableSoilKpa}kPa (DCR ${(
    structuralReport.foundationDcr * 100
  ).toFixed(0)}%)`;

  const nextSolids = solids.map((solid) => {
    const fIdx =
      typeof solid.floorIndex === 'number' && solid.floorIndex >= 1 && solid.floorIndex <= floors
        ? solid.floorIndex
        : 1;
    const fp =
      structuralReport.floors.find((r) => r.floor === fIdx) ?? structuralReport.floors[0];
    if (!fp) return solid;

    if (solid.partRole === 'structural_footing' || solid.partRole === 'basement') {
      return {
        ...solid,
        dcr: structuralReport.foundationDcr,
        stressLabel: footingLabel,
      };
    }
    if (solid.partRole === 'structural_column') {
      return {
        ...solid,
        dcr: fp.columnDcr,
        stressLabel: `${fIdx}F ${structuralReport.columnSectionLabel} · 축하중 ${fp.columnAxialDemandKn}kN / 설계강도 ${fp.columnCapacityKn}kN (DCR ${(
          fp.columnDcr * 100
        ).toFixed(0)}%)`,
      };
    }
    if (solid.partRole === 'structural_beam') {
      const bDcr = Math.max(fp.beamFlexureDcr, fp.beamDeflectionDcr);
      return {
        ...solid,
        dcr: bDcr,
        stressLabel: `${fIdx}F ${structuralReport.beamSectionLabel} · 모멘트 ${fp.beamMomentKnM}/${fp.beamCapacityKnM}kN·m · 처짐 ${fp.beamDeflectionMm}/${fp.allowableDeflectionMm}mm (DCR ${(
          bDcr * 100
        ).toFixed(0)}%)`,
      };
    }
    if (solid.partRole === 'slab') {
      return {
        ...solid,
        dcr: fp.slabDcr,
        stressLabel: `${fIdx}F 슬래브 · 고정 ${fp.deadLoadKnM2} + 활하중 ${fp.liveLoadKnM2} → 계수하중 ${fp.factoredLoadKnM2}kN/㎡ (DCR ${(
          fp.slabDcr * 100
        ).toFixed(0)}%)`,
      };
    }
    return solid;
  });

  return {
    nextSpec: {
      ...spec,
      elementMaterials: matSpec,
      structuralReport,
      budgetReport,
    },
    nextSolids,
  };
}