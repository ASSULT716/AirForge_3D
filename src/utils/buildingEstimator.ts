import {
  BuildingSpec,
  CadMaterial,
  SolidPrimitive,
  UnitDesignType,
  UnitPlacement3D,
  UnitRoomZone,
} from '../types/cad';

export interface LawComplianceItem {
  category: string;
  requirement: string;
  currentValue: string;
  isCompliant: boolean;
  note: string;
}

export interface MaterialCostItem {
  item: string;
  spec: string;
  quantity: string;
  unitPrice: number;
  totalPrice: number;
}

export interface KdsLoadRange {
  minKn: number;
  legalBaseKn: number;
  legalMaxKn: number;
  ultimateLimitKn: number;
  standardNote: string;
}

export interface KoreanBuildingLimits {
  maxBuildingCoverageRatio: number; // 법정 최대 건폐율 (%)
  maxFloorAreaRatio: number;        // 법정 최대 용적률 (%)
  maxBuildingAreaSqm: number;       // 법정 최대 건축면적 (㎡)
  maxTotalFloorAreaSqm: number;     // 법정 최대 지상 연면적 (㎡)
  maxUndergroundAreaSqm: number;    // 지하 최대 굴착 연면적 (㎡)
  minFloorsForHeight: number;       // 높이 기준 최소 층수
  maxFloorsForHeight: number;       // 높이 기준 최대 층수
  minHouseholds: number;            // 최소 가구 수
  maxHouseholds: number;            // 연면적 대비 최대 가구 수
  minUnitTypes: number;             // 최소 가구 유형 수
  maxUnitTypes: number;             // 최대 가구 유형 수
  minPassengerElevators: number;    // 건축법 제64조 승용 승강기 최소 대수
  minEmergencyElevators: number;    // 건축법 제64조② 비상용 승강기 최소 대수
  minTotalElevators: number;        // 총 의무 승강기 최소 대수
  minStairs: number;                // 건축법 시행령 제34조 직통계단 최소 개소
  minGardenAreaSqm: number;         // 건축법 제42조 대지안의 조경 최소 면적 (㎡)
  requiredParkingCount: number;     // 주차장법 부설주차장 최소 대수
  requiredParkingAreaSqm: number;   // 부설주차장 최소 면적 (㎡)
  evParkingCount: number;           // 전기차 충전 구역 최소 면적/대수
}

export interface BuildingReportData {
  limits: KoreanBuildingLimits;
  requiredParkingCount: number;
  requiredParkingAreaSqm: number;
  evParkingCount: number;
  requiredPassengerElevators: number;
  requiredEmergencyElevators: number;
  requiredStairs: number;
  requiredGardenAreaSqm: number;
  kdsLoadRange: KdsLoadRange;
  laws: LawComplianceItem[];
  costs: MaterialCostItem[];
  totalMaterialCost: number;
}

const MATERIAL_MULTIPLIER: Record<CadMaterial, { label: string; factor: number }> = {
  hologram: { label: '로이 커튼월 글라스 + 철골 코어', factor: 1.15 },
  steel: { label: '고장력 구조용 강재(H-Beam) + RC', factor: 1.0 },
  titanium: { label: '티타늄 합금 외장 패널 + 초고강도 골조', factor: 1.48 },
  carbon: { label: '탄소섬유 복합재(CFRP) 경량 트러스', factor: 1.32 },
  gold: { label: '골드 아노다이징 알루미늄 커튼월', factor: 1.62 },
};

const UNIT_TYPE_PALETTE = ['#38bdf8', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6'];

// 한국 건축법·국토계획법·주차장법에 의거한 실시간 최소·최대 한계 산출
export function calculateKoreanBuildingLimits(params: {
  usageType: BuildingSpec['usageType'];
  siteAreaSqm: number;
  buildingAreaSqm: number;
  totalFloorAreaSqm: number;
  undergroundAreaSqm: number;
  undergroundFloors: number;
  heightMeters: number;
  floors: number;
  households: number;
}): KoreanBuildingLimits {
  const {
    usageType,
    siteAreaSqm,
    buildingAreaSqm,
    totalFloorAreaSqm,
    undergroundAreaSqm,
    undergroundFloors,
    heightMeters,
    floors,
    households,
  } = params;

  // 1. 국토계획법·건축법 용도별 건폐율/용적률 기준 (제1·2종 일반주거 / 준주거·상업 기준)
  const ratioMap: Record<BuildingSpec['usageType'], { bcr: number; far: number }> = {
    단독주택: { bcr: 60, far: 200 },
    공동주택: { bcr: 60, far: 250 },
    '업무·상업시설': { bcr: 70, far: 400 },
    복합문화시설: { bcr: 60, far: 300 },
  };
  const { bcr, far } = ratioMap[usageType];
  const maxBuildingAreaSqm = Math.max(50, Math.floor((siteAreaSqm * bcr) / 100));
  const maxTotalFloorAreaSqm = Math.max(80, Math.floor((siteAreaSqm * far) / 100));
  // 지하는 용적률 산정에서 제외되며 지하층 수에 따라 대지 면적의 85% × 지하층수까지 굴착 가능
  const maxUndergroundAreaSqm =
    undergroundFloors <= 0
      ? 0
      : Math.max(50, Math.floor(siteAreaSqm * 0.85 * undergroundFloors));

  // 2. 높이(m)와 층수 물리·건축법적 연동 (층고 최소 2.6m ~ 최대 6.0m)
  const minFloorsForHeight = Math.max(1, Math.ceil(heightMeters / 6.0));
  const maxFloorsForHeight = Math.max(minFloorsForHeight, Math.floor(heightMeters / 2.6));

  // 3. 가구(세대) 수 및 디자인 유형 최소·최대
  // 단독주택(일반/다가구)은 1~19세대(다가구주택 법정 상한 19세대 이하), 공동주택은 최소 30㎡/세대 기준
  const minHouseholds = 1;
  const maxHouseholds =
    usageType === '단독주택'
      ? Math.min(19, Math.max(1, Math.floor(totalFloorAreaSqm / 35)))
      : usageType === '공동주택'
      ? Math.max(2, Math.floor(totalFloorAreaSqm / 30))
      : Math.max(1, Math.floor(totalFloorAreaSqm / 45));

  const minUnitTypes = 1;
  const maxUnitTypes = Math.min(5, Math.max(1, households));

  // 4. 건축법 제64조(승강기) 및 시행령 제90조(비상용 승강기)
  const combinedTotalArea = totalFloorAreaSqm + undergroundAreaSqm;
  const avgFloorArea = totalFloorAreaSqm / Math.max(1, floors);

  // 6층 이상이면서 연면적 2,000㎡ 이상일 때 승용 승강기 의무 (3,000㎡ 초과 시 2,000㎡마다 +1대)
  const minPassengerElevators =
    floors >= 6 && combinedTotalArea >= 2000
      ? 1 + Math.max(0, Math.ceil((combinedTotalArea - 3000) / 2000))
      : 0;

  // 높이 31m 초과 시 비상용 승강기 의무 (최대 바닥면적 1,500㎡ 초과 시 3,000㎡마다 +1대)
  const minEmergencyElevators =
    heightMeters > 31
      ? 1 + (avgFloorArea > 1500 ? Math.ceil((avgFloorArea - 1500) / 3000) : 0)
      : 0;

  const minTotalElevators = minPassengerElevators + minEmergencyElevators;

  // 5. 건축법 시행령 제34조(직통계단의 설치)
  const avgUndergroundFloorArea =
    undergroundFloors > 0 ? undergroundAreaSqm / undergroundFloors : 0;
  const unitsPerFloor = Math.ceil(households / Math.max(1, floors));

  let minStairs = 1;
  // 지하층 거실/바닥면적 합계 200㎡ 이상 시 용도 불문 직통계단 2개소 이상
  if (avgUndergroundFloorArea >= 200) {
    minStairs = 2;
  }
  // 공동주택: 층당 4세대 초과 & 거실 바닥면적 300㎡ 이상 시 2개소 이상
  if (usageType === '공동주택' && unitsPerFloor > 4 && avgFloorArea >= 300) {
    minStairs = 2;
  }
  // 그 외 용도(단독·다가구·업무·복합): 3층 이상 층의 바닥면적 합계 400㎡ 이상 시 2개소 이상
  if (usageType !== '공동주택' && floors >= 3 && avgFloorArea >= 400) {
    minStairs = 2;
  }
  // 층당 바닥면적 1,000㎡ 초과 대규모 건축물은 3개소 이상 권장·산정
  if (avgFloorArea > 1000) {
    minStairs = 3;
  }

  // 6. 건축법 제42조(대지의 조경): 대지면적 200㎡ 이상 시 최소 10% 이상
  // (단독주택은 연면적 2,000㎡ 미만일 때 조례 완화 가능하나 설계 안전 기준으로 200㎡ 이상 시 10% 산출)
  const minGardenAreaSqm =
    siteAreaSqm >= 200
      ? usageType === '단독주택' && combinedTotalArea < 2000
        ? Math.ceil(siteAreaSqm * 0.05)
        : Math.ceil(siteAreaSqm * 0.1)
      : 0;

  // 7. 주차장법 부설주차장 설치 기준
  const rawParking =
    usageType === '단독주택'
      ? combinedTotalArea <= 50
        ? 0
        : combinedTotalArea <= 150
        ? 1
        : 1 + Math.ceil((combinedTotalArea - 150) / 100)
      : usageType === '공동주택'
      ? Math.max(households * 1.0, combinedTotalArea / 85)
      : combinedTotalArea / 100;

  const requiredParkingCount = Math.max(
    usageType === '단독주택' && combinedTotalArea <= 50 ? 0 : 1,
    Math.ceil(rawParking)
  );
  const requiredParkingAreaSqm = Math.round(requiredParkingCount * 28);
  const evParkingCount =
    requiredParkingCount >= 20 ? Math.max(1, Math.ceil(requiredParkingCount * 0.05)) : 0;

  return {
    maxBuildingCoverageRatio: bcr,
    maxFloorAreaRatio: far,
    maxBuildingAreaSqm,
    maxTotalFloorAreaSqm,
    maxUndergroundAreaSqm,
    minFloorsForHeight,
    maxFloorsForHeight,
    minHouseholds,
    maxHouseholds,
    minUnitTypes,
    maxUnitTypes,
    minPassengerElevators,
    minEmergencyElevators,
    minTotalElevators,
    minStairs,
    minGardenAreaSqm,
    requiredParkingCount,
    requiredParkingAreaSqm,
    evParkingCount,
  };
}

export function getKdsLoadRange(usageType: BuildingSpec['usageType']): KdsLoadRange {
  if (usageType === '단독주택') {
    return {
      minKn: 0.0,
      legalBaseKn: 2.0,
      legalMaxKn: 4.0,
      ultimateLimitKn: 6.5,
      standardNote: 'KDS 41 12 00 기준: 단독주택 거실 2.0 kN/㎡, 발코니·테라스 3.0 kN/㎡, 옥상정원 4.0 kN/㎡',
    };
  }
  if (usageType === '공동주택') {
    return {
      minKn: 0.0,
      legalBaseKn: 2.0,
      legalMaxKn: 5.0,
      ultimateLimitKn: 7.5,
      standardNote: 'KDS 41 12 00 기준: 거실 2.0 kN/㎡, 발코니 3.0 kN/㎡, 공용실·옥상정원 5.0 kN/㎡',
    };
  }
  if (usageType === '업무·상업시설') {
    return {
      minKn: 0.0,
      legalBaseKn: 2.5,
      legalMaxKn: 5.0,
      ultimateLimitKn: 8.0,
      standardNote: 'KDS 41 12 00 기준: 일반사무실 2.5 kN/㎡, 복도 4.0 kN/㎡, 판매장·문서고 5.0 kN/㎡',
    };
  }
  return {
    minKn: 0.0,
    legalBaseKn: 3.0,
    legalMaxKn: 5.0,
    ultimateLimitKn: 8.5,
    standardNote: 'KDS 41 12 00 기준: 전시·문화공간 3.0 kN/㎡, 집회·로비·옥상테라스 5.0 kN/㎡',
  };
}

function createDefaultRoomsForType(index: number, isDetachedHouse = false): UnitRoomZone[] {
  if (isDetachedHouse && index === 0) {
    return [
      { name: '가족 거실 (Family Living)', x: 34, y: 20, w: 36, h: 52, liveLoadKn: 2.0 },
      { name: '마스터 침실', x: 4, y: 20, w: 30, h: 42, liveLoadKn: 2.0 },
      { name: '침실 2 / 서재', x: 70, y: 20, w: 26, h: 42, liveLoadKn: 2.0 },
      { name: '대면형 주방·다이닝', x: 34, y: 72, w: 36, h: 24, liveLoadKn: 2.0 },
      { name: '욕실·드레스룸·현관', x: 4, y: 62, w: 30, h: 34, liveLoadKn: 2.0 },
      { name: '계단실·다용도실', x: 70, y: 62, w: 26, h: 34, liveLoadKn: 2.5 },
      { name: '남향 데크·테라스', x: 4, y: 4, w: 92, h: 16, liveLoadKn: 3.0 },
    ];
  }
  if (index % 3 === 0) {
    return [
      { name: '거실 (Living)', x: 34, y: 18, w: 34, h: 58, liveLoadKn: 2.0 },
      { name: '안방 (Master)', x: 4, y: 18, w: 30, h: 42, liveLoadKn: 2.0 },
      { name: '침실 2', x: 68, y: 18, w: 28, h: 38, liveLoadKn: 2.0 },
      { name: '주방/식당', x: 34, y: 76, w: 34, h: 20, liveLoadKn: 2.0 },
      { name: '욕실/현관', x: 4, y: 60, w: 30, h: 36, liveLoadKn: 2.0 },
      { name: '드레스룸/다용도', x: 68, y: 56, w: 28, h: 40, liveLoadKn: 2.0 },
      { name: '전면 발코니 (1.5x 활하중)', x: 4, y: 4, w: 92, h: 14, liveLoadKn: 3.0 },
    ];
  }
  if (index % 3 === 1) {
    return [
      { name: '코너 거실 (Corner Living)', x: 42, y: 16, w: 54, h: 48, liveLoadKn: 2.0 },
      { name: '주방/아일랜드', x: 42, y: 64, w: 32, h: 32, liveLoadKn: 2.0 },
      { name: '안방 스위트', x: 4, y: 16, w: 38, h: 40, liveLoadKn: 2.0 },
      { name: '침실 2 / 서재', x: 4, y: 56, w: 38, h: 24, liveLoadKn: 2.0 },
      { name: '욕실 / 코어접속', x: 4, y: 80, w: 38, h: 16, liveLoadKn: 2.0 },
      { name: '테라스 발코니', x: 74, y: 64, w: 22, h: 32, liveLoadKn: 3.0 },
      { name: '측면 발코니', x: 4, y: 4, w: 92, h: 12, liveLoadKn: 3.0 },
    ];
  }
  return [
    { name: '광폭 LDK (거실·주방)', x: 28, y: 24, w: 46, h: 72, liveLoadKn: 2.0 },
    { name: '마스터 베드룸', x: 4, y: 24, w: 24, h: 46, liveLoadKn: 2.0 },
    { name: '게스트룸', x: 74, y: 24, w: 22, h: 42, liveLoadKn: 2.0 },
    { name: '욕실 1·2', x: 4, y: 70, w: 24, h: 26, liveLoadKn: 2.0 },
    { name: '팬트리/실외기', x: 74, y: 66, w: 22, h: 30, liveLoadKn: 2.5 },
    { name: '스카이 테라스 정원', x: 4, y: 4, w: 92, h: 20, liveLoadKn: 4.0 },
  ];
}

export function hydrateBuildingSpec(
  spec: BuildingSpec,
  solids: SolidPrimitive[]
): BuildingSpec {
  const typeCount = Math.max(1, Math.min(5, Math.round(spec.unitTypeCount || 1)));
  const totalHouseholds = Math.max(1, Math.round(spec.households || 1));
  const floors = Math.max(1, Math.round(spec.floors || 2));
  const kds = getKdsLoadRange(spec.usageType);

  // 지상 건물 매스 바운딩 계산 (y >= 0, 조경 슬래브 제외)
  const aboveGroundSolids = solids.filter(
    (s) => s.color !== '#10b981' && s.position[1] >= 0 && s.scale[1] > 0.15
  );
  let minX = -1.8, maxX = 1.8, maxY = 3.0, minZ = -1.2, maxZ = 1.2;
  if (aboveGroundSolids.length > 0) {
    minX = Infinity; maxX = -Infinity; maxY = -Infinity; minZ = Infinity; maxZ = -Infinity;
    aboveGroundSolids.forEach((s) => {
      minX = Math.min(minX, s.position[0] - s.scale[0] * 0.5);
      maxX = Math.max(maxX, s.position[0] + s.scale[0] * 0.5);
      maxY = Math.max(maxY, s.position[1] + s.scale[1] * 0.5);
      minZ = Math.min(minZ, s.position[2] - s.scale[2] * 0.5);
      maxZ = Math.max(maxZ, s.position[2] + s.scale[2] * 0.5);
    });
  }

  const widthX = Math.max(1.5, maxX - minX);
  const depthZ = Math.max(1.2, maxZ - minZ);
  const floorHeight = Math.max(0.45, (maxY * 0.88) / floors);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;

  const basePerType = Math.floor(totalHouseholds / typeCount);
  let remainder = totalHouseholds % typeCount;

  const presetsMeta =
    spec.usageType === '단독주택'
      ? [
          { suffix: '메인 패밀리 존 (1·2층)', area: Math.round(spec.totalFloorAreaSqm * 0.65) },
          { suffix: '게스트·세컨드 리빙 존', area: Math.round(spec.totalFloorAreaSqm * 0.35) },
          { suffix: '테라스 스튜디오 존', area: 48 },
          { suffix: '다락·아틀리에 존', area: 36 },
          { suffix: '별채 스위트 존', area: 42 },
        ]
      : [
          { suffix: '59㎡ 3-Bay 판상형', area: 59 },
          { suffix: '84㎡ 코너 타워형', area: 84 },
          { suffix: '114㎡ 테라스 펜트형', area: 114 },
          { suffix: '46㎡ 스튜디오형', area: 46 },
          { suffix: '132㎡ 복층 듀플렉스형', area: 132 },
        ];

  const generatedTypes: UnitDesignType[] = [];
  let globalUnitCursor = 0;

  for (let t = 0; t < typeCount; t++) {
    const countForThisType = Math.max(
      1,
      basePerType + (remainder > 0 ? 1 : 0)
    );
    if (remainder > 0) remainder -= 1;

    const meta = presetsMeta[t % presetsMeta.length];
    const code = `TYPE-${String.fromCharCode(65 + t)}`;
    const placements: UnitPlacement3D[] = [];

    const unitsPerFloor = Math.max(1, Math.ceil(totalHouseholds / floors));
    for (let u = 0; u < countForThisType; u++) {
      const slotIdx = globalUnitCursor++;
      const floorNum = (slotIdx % floors) + 1;
      const slotInFloor = Math.floor(slotIdx / floors) % unitsPerFloor;

      const cols = Math.min(unitsPerFloor, 4);
      const rows = Math.max(1, Math.ceil(unitsPerFloor / cols));
      const col = slotInFloor % cols;
      const row = Math.floor(slotInFloor / cols);

      const unitW = (widthX * 0.84) / cols;
      const unitD = (depthZ * 0.82) / rows;
      const unitH = floorHeight * 0.76;

      const px = centerX - (widthX * 0.84) / 2 + unitW * (col + 0.5);
      const py = (floorNum - 0.5) * floorHeight;
      const pz = centerZ - (depthZ * 0.82) / 2 + unitD * (row + 0.5);

      placements.push({
        floor: floorNum,
        position: [Number(px.toFixed(3)), Number(py.toFixed(3)), Number(pz.toFixed(3))],
        scale: [
          Number((unitW * 0.88).toFixed(3)),
          Number(unitH.toFixed(3)),
          Number((unitD * 0.88).toFixed(3)),
        ],
      });
    }

    generatedTypes.push({
      id: `unit_type_${t + 1}`,
      code,
      name: `${code} (${meta.suffix})`,
      areaSqm: meta.area,
      householdCount: countForThisType,
      liveLoadKn: t === 2 ? 2.5 : kds.legalBaseKn,
      color: UNIT_TYPE_PALETTE[t % UNIT_TYPE_PALETTE.length],
      rooms: createDefaultRoomsForType(t, spec.usageType === '단독주택'),
      placements,
    });
  }

  const floorLoadsKn: Record<number, number> = { ...(spec.floorLoadsKn ?? {}) };
  for (let f = 1; f <= floors; f++) {
    if (typeof floorLoadsKn[f] !== 'number') {
      floorLoadsKn[f] =
        f === 1 && spec.usageType !== '단독주택'
          ? Math.min(kds.legalMaxKn, kds.legalBaseKn + 1.5)
          : kds.legalBaseKn;
    }
  }

  return {
    ...spec,
    unitTypeCount: typeCount,
    unitTypes: generatedTypes,
    floorLoadsKn,
  };
}

export function evaluateBuildingSpec(
  spec: BuildingSpec,
  material: CadMaterial
): BuildingReportData {
  const limits = calculateKoreanBuildingLimits(spec);
  const kdsLoadRange = getKdsLoadRange(spec.usageType);
  const combinedArea = spec.totalFloorAreaSqm + (spec.undergroundAreaSqm || 0);

  const avgUnitLiveLoad =
    spec.unitTypes && spec.unitTypes.length > 0
      ? spec.unitTypes.reduce((sum, u) => sum + u.liveLoadKn * u.householdCount, 0) /
        Math.max(1, spec.households)
      : kdsLoadRange.legalBaseKn;

  const actualBcr = ((spec.buildingAreaSqm / Math.max(1, spec.siteAreaSqm)) * 100).toFixed(1);
  const actualFar = ((spec.totalFloorAreaSqm / Math.max(1, spec.siteAreaSqm)) * 100).toFixed(1);

  const laws: LawComplianceItem[] = [
    {
      category: '건폐율·용적률 한도 (국토계획법)',
      requirement: `건폐율 ${limits.maxBuildingCoverageRatio}% 이하 (${limits.maxBuildingAreaSqm.toLocaleString()}㎡) / 용적률 ${limits.maxFloorAreaRatio}% 이하 (${limits.maxTotalFloorAreaSqm.toLocaleString()}㎡)`,
      currentValue: `건폐율 ${actualBcr}% (${spec.buildingAreaSqm.toLocaleString()}㎡) · 용적률 ${actualFar}% (지하 ${spec.undergroundAreaSqm.toLocaleString()}㎡ 제외)`,
      isCompliant:
        spec.buildingAreaSqm <= limits.maxBuildingAreaSqm &&
        spec.totalFloorAreaSqm <= limits.maxTotalFloorAreaSqm,
      note: '건축법상 지하층 바닥면적은 용적률 산정 연면적에서 제외됨',
    },
    {
      category: '바닥·세대 설계하중 (KDS 41 12 00)',
      requirement: `기본 ${kdsLoadRange.legalBaseKn.toFixed(1)} kN/㎡ 이상 / 최대 ${kdsLoadRange.legalMaxKn.toFixed(1)} kN/㎡`,
      currentValue: `${spec.unitTypeCount}개 유형 평균 ${avgUnitLiveLoad.toFixed(2)} kN/㎡ 반영`,
      isCompliant: avgUnitLiveLoad >= kdsLoadRange.legalBaseKn,
      note: kdsLoadRange.standardNote,
    },
    {
      category: '승강기 설비 (건축법 제64조)',
      requirement:
        limits.minTotalElevators > 0
          ? `최소 ${limits.minTotalElevators}대 이상 (승용 ${limits.minPassengerElevators}대 + 비상용 ${limits.minEmergencyElevators}대)`
          : '법정 의무 대상 아님 (6층 이상·연면적 2,000㎡ 이상 시 의무)',
      currentValue: `설계 반영 ${spec.elevators}대`,
      isCompliant: spec.elevators >= limits.minTotalElevators,
      note:
        spec.heightMeters > 31
          ? '높이 31m 초과로 비상용 승강기 추가 의무'
          : '연면적(지상+지하 합계) 및 층수 기준 산정',
    },
    {
      category: '직통·피난계단 (시행령 제34조)',
      requirement: `최소 ${limits.minStairs}개소 이상 (${spec.undergroundAreaSqm >= 200 ? '지하 200㎡ 이상 포함' : '지상·지하 바닥면적 기준'})`,
      currentValue: `설계 반영 ${spec.stairs}개소`,
      isCompliant: spec.stairs >= limits.minStairs,
      note: '지하층 바닥면적 합계 200㎡ 이상 또는 기준 층 면적 초과 시 2개소 이상 의무',
    },
    {
      category: '대지안의 조경 (건축법 제42조)',
      requirement: `최소 ${limits.minGardenAreaSqm.toLocaleString()}㎡ 이상`,
      currentValue: `정원 ${spec.gardenAreaSqm.toLocaleString()}㎡ / 옥상 ${spec.rooftops}개소`,
      isCompliant: spec.gardenAreaSqm >= limits.minGardenAreaSqm,
      note: '대지면적 200㎡ 이상 건축물 조경 확보 기준 적용',
    },
    {
      category: '부설주차장 (주차장법)',
      requirement: `최소 ${limits.requiredParkingCount}대 이상 (${limits.requiredParkingAreaSqm.toLocaleString()}㎡)`,
      currentValue: `법정 기준 ${limits.requiredParkingCount}대 확보`,
      isCompliant: true,
      note: '단독주택 연면적 50㎡ 초과~150㎡ 이하 1대, 초과 시 100㎡당 1대 가산',
    },
  ];

  const matInfo = MATERIAL_MULTIPLIER[material];
  const typeComplexityFactor = 1 + Math.max(0, spec.unitTypeCount - 1) * 0.03;
  const baseUnitCost = Math.round(2392000 * matInfo.factor * typeComplexityFactor);
  const aboveStructureCost = spec.totalFloorAreaSqm * baseUnitCost;
  // 지하층 토공사·흙막이·방수 골조 단가 (지상 대비 약 1.28배)
  const undergroundCost = Math.round(spec.undergroundAreaSqm * baseUnitCost * 1.28);
  const elevatorCost = spec.elevators * 125000000;
  const stairCoreCost = spec.stairs * 48000000;
  const gardenRooftopCost = spec.gardenAreaSqm * 280000 + spec.rooftops * 35000000;
  const parkingCost = limits.requiredParkingCount * 24000000;

  const costs: MaterialCostItem[] = [
    {
      item: `지상 주골조 및 외장 마감재 (${matInfo.label})`,
      spec: `지상 연면적 ${spec.totalFloorAreaSqm.toLocaleString()}㎡ · ${spec.unitTypeCount}개 유형 반영`,
      quantity: `${spec.totalFloorAreaSqm.toLocaleString()} ㎡`,
      unitPrice: baseUnitCost,
      totalPrice: aboveStructureCost,
    },
    {
      item: `지하층 골조·흙막이·방수 공사 (지하 ${spec.undergroundFloors}개층)`,
      spec: `지하 연면적 ${spec.undergroundAreaSqm.toLocaleString()}㎡ (RC 내수압 슬래브·토공사 포함)`,
      quantity: `${spec.undergroundAreaSqm.toLocaleString()} ㎡`,
      unitPrice: Math.round(baseUnitCost * 1.28),
      totalPrice: undergroundCost,
    },
    {
      item: '승용·비상용 엘리베이터 시스템',
      spec: `법정 최소 ${limits.minTotalElevators}대 기준 / 반영 ${spec.elevators}대`,
      quantity: `${spec.elevators} 대`,
      unitPrice: 125000000,
      totalPrice: elevatorCost,
    },
    {
      item: '직통·피난계단 및 수직 코어 자재',
      spec: `법정 최소 ${limits.minStairs}개소 기준 / 반영 ${spec.stairs}개소`,
      quantity: `${spec.stairs} 개소`,
      unitPrice: 48000000,
      totalPrice: stairCoreCost,
    },
    {
      item: '정원 조경 및 옥상 방수·루프탑 데크',
      spec: `조경 ${spec.gardenAreaSqm.toLocaleString()}㎡ (최소 ${limits.minGardenAreaSqm}㎡) + 옥상 ${spec.rooftops}개소`,
      quantity: `${spec.gardenAreaSqm.toLocaleString()} ㎡ / ${spec.rooftops} 식`,
      unitPrice: 280000,
      totalPrice: gardenRooftopCost,
    },
    {
      item: '법정 부설주차장 토목·바닥 인프라',
      spec: `총 연면적 ${combinedArea.toLocaleString()}㎡ 기준 법정 ${limits.requiredParkingCount}대`,
      quantity: `${limits.requiredParkingCount} 면`,
      unitPrice: 24000000,
      totalPrice: parkingCost,
    },
  ];

  return {
    limits,
    requiredParkingCount: limits.requiredParkingCount,
    requiredParkingAreaSqm: limits.requiredParkingAreaSqm,
    evParkingCount: limits.evParkingCount,
    requiredPassengerElevators: limits.minPassengerElevators,
    requiredEmergencyElevators: limits.minEmergencyElevators,
    requiredStairs: limits.minStairs,
    requiredGardenAreaSqm: limits.minGardenAreaSqm,
    kdsLoadRange,
    laws,
    costs,
    totalMaterialCost: costs.reduce((acc, c) => acc + c.totalPrice, 0),
  };
}