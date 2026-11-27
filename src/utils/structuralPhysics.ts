import { BuildingSpec, CadMaterial, DesignCategory } from '../types/cad';

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

  // 유리가 많은 집(창호비율 65% 이상 또는 유리 주재질)은 순수 목조·무골조 금지 -> 철골/복합조 강제
  if (primaryMaterial === 'glass' || windowWallRatio >= 0.65) {
    if (requestedSystem === 'steel_frame' || requestedSystem === 'hybrid_rc_steel') {
      return requestedSystem;
    }
    return floors >= 3 ? 'hybrid_rc_steel' : 'steel_frame';
  }

  if (requestedSystem) {
    // 4층 이상인데 중목구조 요청 시 안전을 위해 RC 또는 하이브리드로 상향
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
  matSpec: ElementMaterialSpec
): StructuralAnalysisReport {
  const system = STRUCTURAL_SYSTEM_DB[matSpec.structuralSystem];
  const floors = Math.max(1, Math.round(spec.floors || 2));
  const floorHeightM = Math.max(2.6, (spec.heightMeters || floors * 3.3) / floors);
  const footprintSqm = Math.max(40, spec.buildingAreaSqm || 150);

  // 건축면적 기반 가로·세로 실치수 및 구조 기둥 그리드(경간 4.2m ~ 6.2m) 자동 배치
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

  // 바닥 슬래브 및 마감 고정하중 (kN/m²)
  const slabThickM =
    matSpec.structuralSystem === 'heavy_timber'
      ? 0.14 // CLT/목재 장선 바닥
      : matSpec.structuralSystem === 'steel_frame'
      ? 0.15 // 데크플레이트 RC 토핑 슬래브
      : 0.18; // 일반 RC 슬래브 (KDS 최소두께 및 바닥충격음 고려)

  const slabSelfWeight =
    matSpec.structuralSystem === 'heavy_timber'
      ? slabThickM * 5.5 + 0.6 // 목재 바닥 + 방통/마감
      : slabThickM * 24.0;

  // 바닥 마감(온돌 모르타르 0.9) + 천장/설비(0.4) + 경량칸막이 등가하중(1.0) + 보 자중 등가(0.5)
  const superDeadKnM2 =
    spec.usageType === '단독주택' || spec.usageType === '공동주택' ? 2.6 : 2.2;
  const claddingLineDeadKnM2 =
    matSpec.glazingSpec === 'curtain_wall'
      ? 0.55
      : matSpec.exteriorCladding === 'concrete'
      ? 0.95
      : matSpec.exteriorCladding === 'wood'
      ? 0.35
      : 0.55;

  const baseFloorDeadKnM2 = Number(
    (slabSelfWeight + superDeadKnM2 + claddingLineDeadKnM2).toFixed(2)
  );
  const roofDeadKnM2 = Number((slabSelfWeight + 1.4).toFixed(2)); // 지붕 방수·단열·지붕재 자중

  // 구조 시스템별 단면 치수 자동 사이징 (층수 반영)
  let colCapacityKn = 1500;
  let colEulerKn = 4000;
  let beamCapacityKnM = 180;
  let beamEI_Nmm2 = 2e13; // E * I (N·mm²)
  let columnSectionLabel = '';
  let beamSectionLabel = '';

  const L_col_mm = floorHeightM * 1000;
  const K_eff = 1.0; // 횡변위 구속 라멘 유효좌굴길이계수

  if (matSpec.structuralSystem === 'rc_frame') {
    const colSideMm = floors <= 2 ? 350 : floors <= 5 ? 400 : 500;
    const beamB = 300;
    const beamH = floors <= 3 ? 450 : 550;
    const Ag = colSideMm * colSideMm;
    const rhoG = 0.016; // 철근비 1.6% (KDS 14 20 20 최소 1%~최대 8% 범위)
    const Ast = Ag * rhoG;
    const fck = system.designStrengthMpa;
    const fy = system.rebarYieldMpa ?? 400;

    // KDS 14 20 20 띠철근 기둥 최대 설계축강도 φPn,max
    const Pn_max_N = 0.8 * (0.85 * fck * (Ag - Ast) + fy * Ast);
    colCapacityKn = (system.phiCompression * Pn_max_N) / 1000;

    // 오일러 탄성좌굴하중 Pcr = π² * (0.4 Ec Ig) / (KL)² (균열단면 강성 0.7Ig 중 장기 0.4Ig)
    const Ig_col = (Math.pow(colSideMm, 4)) / 12;
    colEulerKn =
      (Math.PI * Math.PI * system.elasticModulusMpa * (0.7 * Ig_col)) /
      Math.pow(K_eff * L_col_mm, 2) /
      1000;

    // RC 보 설계휨강도 φMn (인장철근비 0.85%, d = h - 60mm)
    const d_mm = beamH - 60;
    const As_beam = beamB * d_mm * 0.0085;
    const a_mm = (As_beam * fy) / (0.85 * fck * beamB);
    const Mn_Nmm = As_beam * fy * (d_mm - a_mm * 0.5);
    beamCapacityKnM = (system.phiFlexure * Mn_Nmm) / 1e6;

    // RC 보 균열유효단면2차모멘트 Ie ≈ 0.35 Ig (KDS 14 20 30)
    const Ig_beam = (beamB * Math.pow(beamH, 3)) / 12;
    beamEI_Nmm2 = system.elasticModulusMpa * (0.35 * Ig_beam);

    columnSectionLabel = `RC ${colSideMm}×${colSideMm}mm (주근비 1.6%)`;
    beamSectionLabel = `RC ${beamB}×${beamH}mm (SD400)`;
  } else if (
    matSpec.structuralSystem === 'steel_frame' ||
    matSpec.structuralSystem === 'hybrid_rc_steel'
  ) {
    // 표준 KS H형강 단면 (층수별 자동 선택)
    const heavy = floors >= 4;
    const Ag = heavy ? 9218 : 6353; // H-250x250x9x14 vs H-200x200x8x12 (mm²)
    const Iy = heavy ? 36500000 : 16000000; // 약축 단면2차모멘트 (mm⁴)
    const ry = Math.sqrt(Iy / Ag);
    const Fy = system.designStrengthMpa;
    const Es = system.elasticModulusMpa;

    // KDS 14 31 10 강구조 압축부재 좌굴응력 Fcr
    const slenderness = (K_eff * L_col_mm) / ry;
    const Fe = (Math.PI * Math.PI * Es) / (slenderness * slenderness);
    const Fcr =
      Fy / Fe <= 2.25 ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe;

    colCapacityKn = (system.phiCompression * Fcr * Ag) / 1000;
    colEulerKn = (Fe * Ag) / 1000;

    // H형강 보 (H-300x150x6.5x9 또는 H-350x175x7x11)
    const Zx = heavy ? 865000 : 542000; // 소성단면계수 (mm³)
    const Ix_beam = heavy ? 136000000 : 72100000; // 강축 단면2차모멘트 (mm⁴)
    beamCapacityKnM = (system.phiFlexure * Fy * Zx) / 1e6;
    beamEI_Nmm2 = Es * Ix_beam;

    columnSectionLabel = heavy
      ? 'H-250×250×9×14 (SS275)'
      : 'H-200×200×8×12 (SS275)';
    beamSectionLabel = heavy
      ? 'H-350×175×7×11 (SS275)'
      : 'H-300×150×6.5×9 (SS275)';
  } else {
    // heavy_timber (구조용 집성재 Glulam)
    const colD = floors <= 2 ? 210 : 240;
    const beamB = 180;
    const beamH = 330;
    const Ag = colD * colD;
    const FcStar = system.designStrengthMpa; // 18 MPa
    const E_min = system.elasticModulusMpa * 0.55; // 좌굴용 최소탄성계수

    // Ylinen 기둥 안정계수 Cp (KDS 41 50 / NDS 목구조 기준)
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

    // 목재 보 휨강도 (Fb = 24 MPa)
    const Sx = (beamB * beamH * beamH) / 6;
    beamCapacityKnM = (system.phiFlexure * 24.0 * Sx) / 1e6;
    const I_beam = (beamB * Math.pow(beamH, 3)) / 12;
    beamEI_Nmm2 = system.elasticModulusMpa * I_beam;

    columnSectionLabel = `Glulam 집성재 ${colD}×${colD}mm`;
    beamSectionLabel = `Glulam 집성재 ${beamB}×${beamH}mm`;
  }

  // 상층(지붕) -> 하층(1층) 순으로 실제 누적 축하중 전달 계산
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
    const deadKnM2 = isTopFloor ? Number(((baseFloorDeadKnM2 + roofDeadKnM2) * 0.55).toFixed(2)) : baseFloorDeadKnM2;
    const liveKnM2 = spec.floorLoadsKn?.[f] ?? defaultLiveKn;

    // KDS 41 12 00 강도설계법 하중조합 U = max(1.4D, 1.2D + 1.6L)
    const factoredKnM2 = Number(
      Math.max(1.4 * deadKnM2, 1.2 * deadKnM2 + 1.6 * liveKnM2).toFixed(2)
    );
    const serviceKnM2 = deadKnM2 + liveKnM2;

    totalDeadWeightKn += deadKnM2 * footprintSqm;
    totalLiveWeightKn += liveKnM2 * footprintSqm;

    // 보 등분포하중 wu (kN/m) 및 휨모멘트 Mu = wu * L² / 8
    const wu_beam = factoredKnM2 * tribWidthM;
    const ws_beam = serviceKnM2 * tribWidthM; // 1 kN/m = 1 N/mm
    const beamMomentKnM = (wu_beam * govSpanM * govSpanM) / 8;
    const beamFlexureDcr = beamMomentKnM / Math.max(1, beamCapacityKnM);

    // 보 탄성 처짐 δ = 5 * ws * L⁴ / (384 * E * I) [단위: N, mm -> 결과 mm]
    const L_beam_mm = govSpanM * 1000;
    const beamDeflectionMm =
      (5 * ws_beam * Math.pow(L_beam_mm, 4)) / (384 * Math.max(1e9, beamEI_Nmm2));
    const allowableDeflectionMm = L_beam_mm / 240;
    const beamDeflectionDcr = beamDeflectionMm / Math.max(1, allowableDeflectionMm);

    // 기둥 자체 자중 + 해당 층 분담면적 하중 누적
    const colSelfKn =
      matSpec.structuralSystem === 'heavy_timber'
        ? 0.21 * 0.21 * floorHeightM * 5.5
        : matSpec.structuralSystem === 'steel_frame'
        ? 0.008 * floorHeightM * 77.0
        : 0.4 * 0.4 * floorHeightM * 24.0;

    cumulativeFactoredColumnKn += factoredKnM2 * tributaryAreaM2 + 1.2 * colSelfKn;
    cumulativeServiceColumnKn += serviceKnM2 * tributaryAreaM2 + colSelfKn;

    // 오일러 좌굴과 단면 압축강도 중 지배값으로 DCR 계산
    const effectiveColCapKn = Math.min(colCapacityKn, colEulerKn * 0.75);
    const columnDcr = cumulativeFactoredColumnKn / Math.max(1, effectiveColCapKn);

    // 슬래브 응력비 (기준 한계 14 kN/m² 대비 계수하중 비율)
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

  // 최하부 기초 지반접지압 검토 (보통 풍화토 허용지내력 qa = 200 kPa = 200 kN/m²)
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

/** 외장 마감재별 현실적 한국 시공 단가 (자재 + 시공 분리, 원/㎡) */
const CLADDING_COST_DB: Record<CadMaterial, { label: string; matPerSqm: number; laborPerSqm: number }> = {
  stucco: { label: '스타코플렉스 + 외단열(EPS 150T)', matPerSqm: 78000, laborPerSqm: 58000 },
  wood: { label: '적삼목/탄화목 우드 사이딩 + 방습지', matPerSqm: 125000, laborPerSqm: 72000 },
  concrete: { label: '노출콘크리트 발수코팅 + 내단열', matPerSqm: 85000, laborPerSqm: 78000 },
  steel: { label: '리얼징크/알루미늄 복합패널 마감', matPerSqm: 118000, laborPerSqm: 68000 },
  titanium: { label: '티타늄 아연판(VMZINC) 고급 외장', matPerSqm: 195000, laborPerSqm: 88000 },
  glass: { label: '알루미늄 로이(Low-E) 복층 커튼월', matPerSqm: 265000, laborPerSqm: 115000 },
  hologram: { label: '복층 로이 유리 파사드', matPerSqm: 245000, laborPerSqm: 105000 },
  carbon: { label: '세라믹/복합재(CFRP) 외장 패널', matPerSqm: 175000, laborPerSqm: 82000 },
  gold: { label: '샴페인 아노다이징 알루미늄 패널', matPerSqm: 185000, laborPerSqm: 85000 },
};

/**
 * 실제 부재 물량산출(QTO) 기반 대한민국 현실적 건축 공사비 산출
 * (중복 계상 제거 — 단독주택 기준 평당 약 550만~950만 원 수준의 합리적 공사비 산출)
 */
export function calculateRealisticBudget(
  spec: BuildingSpec,
  matSpec: ElementMaterialSpec,
  physics: StructuralAnalysisReport
): RealisticBudgetReport {
  const floors = Math.max(1, spec.floors || 2);
  const aboveArea = Math.max(40, spec.totalFloorAreaSqm || 200);
  const ugArea = Math.max(0, spec.undergroundAreaSqm || 0);
  const footprint = Math.max(40, spec.buildingAreaSqm || aboveArea / floors);
  const heightM = Math.max(3.2, spec.heightMeters || floors * 3.3);
  const wwr = Math.max(0.22, Math.min(0.82, spec.windowWallRatio ?? 0.5));

  // 외벽 총 면적 추정 (평면 둘레 × 건물 높이)
  const perimeterM = 2 * (Math.sqrt(footprint * 1.22) + footprint / Math.sqrt(footprint * 1.22));
  const grossFacadeArea = perimeterM * heightM;
  const windowAreaSqm = Math.round(grossFacadeArea * wwr);
  const opaqueWallSqm = Math.max(20, Math.round(grossFacadeArea * (1 - wwr)));
  const floor1WallSqm = Math.round(opaqueWallSqm / floors);
  const upperWallSqm = Math.max(0, opaqueWallSqm - floor1WallSqm);

  const lines: QtoBudgetLine[] = [];

  // 1. 기초 및 토공사 (매트/독립기초 + 지하 터파기)
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

  // 2. 주 구조 골조 (구조 시스템별 실제 물량 산출)
  if (matSpec.structuralSystem === 'rc_frame') {
    const concreteM3 = Math.round(aboveArea * 0.38);
    const rebarTon = Number((concreteM3 * 0.105).toFixed(1));
    const matCost = Math.round(concreteM3 * 110000 + rebarTon * 980000); // 레미콘 + SD400 철근
    const laborCost = Math.round(concreteM3 * 220000 + rebarTon * 720000); // 거푸집 + 철근가공·타설
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
    const steelTon = Number((aboveArea * 0.058).toFixed(1)); // 약 58kg/㎡
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
    // heavy_timber
    const timberM3 = Number((aboveArea * 0.24).toFixed(1));
    const matCost = Math.round(timberM3 * 980000 + aboveArea * 65000); // 집성재 + 구조철물
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

  // 3. 외벽 마감재 (1층 + 상층부 분리 물량 산출)
  const c1 = CLADDING_COST_DB[matSpec.exteriorCladding] ?? CLADDING_COST_DB.stucco;
  const c2 = CLADDING_COST_DB[matSpec.upperCladding] ?? CLADDING_COST_DB.wood;
  const wallMatCost = floor1WallSqm * c1.matPerSqm + upperWallSqm * c2.matPerSqm;
  const wallLaborCost = floor1WallSqm * c1.laborPerSqm + upperWallSqm * c2.laborPerSqm;
  lines.push({
    category: '외장·단열',
    itemName:
      upperWallSqm > 0 && matSpec.exteriorCladding !== matSpec.upperCladding
        ? `외벽 이종 마감 (1F ${c1.label.split(' ')[0]} + 상층 ${c2.label.split(' ')[0]})`
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
    itemName: `지붕 구조 마감 및 복합방수 (${roofInfo.label.split(' ')[0]})`,
    specDetail: `지붕 투영/경사 면적 ${roofAreaSqm}㎡ (우레탄·시트방수 및 지붕단열 포함)`,
    quantity: roofAreaSqm,
    unit: '㎡',
    unitPriceKrw: Math.round((roofMat + roofLabor) / Math.max(1, roofAreaSqm)),
    materialCostKrw: roofMat,
    laborCostKrw: roofLabor,
    totalCostKrw: roofMat + roofLabor,
  });

  // 6. 실내 인테리어 마감 (바닥 마루/타일 + 내벽 도배/도장 + 주방·욕실)
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

  // 7. 기계설비·전기·배관(MEP) + 승강기(선택)
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

  const totalMaterialCostKrw = lines.reduce((acc, l) => acc + l.materialCostKrw, 0);
  const totalLaborCostKrw = lines.reduce((acc, l) => acc + l.laborCostKrw, 0);
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
      '대한건설협회 시중노임·자재 물량산출(QTO) 기준 추정치 (순수 자재비·시공비·간접/설계비 분리 산출, 토지구입비 및 취득세 제외)',
  };
}