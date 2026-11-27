import {
  BuildingSpec,
  CadMaterial,
  DesignCategory,
  ExteriorWindow3D,
  MepPipe3D,
  SolidPrimitive,
  UnitDesignType,
  UnitPlacement3D,
} from '../types/cad';
import {
  generateWatertightArchitecture,
  getRoomsForTemplate,
} from './architectureGenerator';

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
  designCapacityKn: number; // 안전율(1.5x)을 둔 실제 구조 설계 허용 한계
  ultimateLimitKn: number;  // 극한 파단 시험 한계
  standardNote: string;
}

export interface KoreanBuildingLimits {
  maxBuildingCoverageRatio: number;
  maxFloorAreaRatio: number;
  maxBuildingAreaSqm: number;
  maxTotalFloorAreaSqm: number;
  maxUndergroundAreaSqm: number;
  minFloorsForHeight: number;
  maxFloorsForHeight: number;
  minHouseholds: number;
  maxHouseholds: number;
  minUnitTypes: number;
  maxUnitTypes: number;
  minPassengerElevators: number;
  minEmergencyElevators: number;
  minTotalElevators: number;
  minStairs: number;
  minGardenAreaSqm: number;
  requiredParkingCount: number;
  requiredParkingAreaSqm: number;
  evParkingCount: number;
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

export const MATERIAL_CATALOG: Record<
  CadMaterial,
  { label: string; unitPricePerM3: number; factor: number; hex: string }
> = {
  stucco: { label: '웜 화이트 라임 스터코 마감', unitPricePerM3: 420000, factor: 1.05, hex: '#f8fafc' },
  wood: { label: '내추럴 화이트 오크 목구조·루버', unitPricePerM3: 680000, factor: 1.22, hex: '#e7d5be' },
  concrete: { label: '밝은 노출 백색 콘크리트', unitPricePerM3: 480000, factor: 1.08, hex: '#e2e8f0' },
  glass: { label: '고단열 스카이블루 로이(Low-E) 유리', unitPricePerM3: 890000, factor: 1.28, hex: '#bae6fd' },
  hologram: { label: '라이트 커튼월 글라스 패널', unitPricePerM3: 750000, factor: 1.15, hex: '#cfe8fc' },
  steel: { label: '브러시드 실버 구조용 강재', unitPricePerM3: 620000, factor: 1.0, hex: '#cbd5e1' },
  titanium: { label: '샴페인 티타늄 아노다이징 패널', unitPricePerM3: 1180000, factor: 1.45, hex: '#d6d3d1' },
  carbon: { label: '라이트 그레이 복합재(CFRP)', unitPricePerM3: 980000, factor: 1.32, hex: '#94a3b8' },
  gold: { label: '소프트 샴페인 골드 알루미늄', unitPricePerM3: 1250000, factor: 1.55, hex: '#fde68a' },
};

const UNIT_TYPE_PALETTE = ['#0284c7', '#d97706', '#7c3aed', '#0d9488', '#db2777'];

// 선택한 개별 3D 부위의 부피 기반 자재비 산출
export function estimateSinglePartCost(solid: SolidPrimitive, fallbackMaterial: CadMaterial): {
  materialLabel: string;
  volumeM3: number;
  costKrw: number;
} {
  const matKey = solid.material ?? fallbackMaterial ?? 'stucco';
  const info = MATERIAL_CATALOG[matKey] ?? MATERIAL_CATALOG.stucco;
  // 씬 유닛 1m를 실제 건축 스케일(약 2.8m 환산)로 계산
  const realW = solid.scale[0] * 2.8;
  const realH = solid.scale[1] * 2.8;
  const realD = solid.scale[2] * 2.8;
  const volumeM3 = Math.max(0.2, Number((realW * realH * realD * 0.35).toFixed(2)));
  const costKrw = Math.round(volumeM3 * info.unitPricePerM3);
  return {
    materialLabel: info.label,
    volumeM3,
    costKrw,
  };
}

export function calculateKoreanBuildingLimits(params: {
  usageType: DesignCategory;
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
    totalFloorAreaSqm,
    undergroundAreaSqm,
    undergroundFloors,
    heightMeters,
    floors,
    households,
  } = params;

  const ratioMap: Record<DesignCategory, { bcr: number; far: number }> = {
    단독주택: { bcr: 60, far: 200 },
    공동주택: { bcr: 60, far: 250 },
    '업무·상업시설': { bcr: 70, far: 400 },
    복합문화시설: { bcr: 60, far: 300 },
    '3D 디자인': { bcr: 100, far: 1000 },
  };
  const { bcr, far } = ratioMap[usageType] ?? ratioMap['단독주택'];
  const maxBuildingAreaSqm = Math.max(50, Math.floor((siteAreaSqm * bcr) / 100));
  const maxTotalFloorAreaSqm = Math.max(80, Math.floor((siteAreaSqm * far) / 100));
  const maxUndergroundAreaSqm =
    undergroundFloors <= 0
      ? 0
      : Math.max(50, Math.floor(siteAreaSqm * 0.85 * undergroundFloors));

  // 최소 층수는 항상 1층부터 허용
  const minFloorsForHeight = 1;
  const maxFloorsForHeight = Math.max(1, Math.floor(heightMeters / 2.4));

  const minHouseholds = 0;
  const maxHouseholds =
    usageType === '단독주택'
      ? Math.min(19, Math.max(1, Math.floor(totalFloorAreaSqm / 30)))
      : usageType === '공동주택'
      ? Math.max(2, Math.floor(totalFloorAreaSqm / 25))
      : Math.max(1, Math.floor(totalFloorAreaSqm / 40));

  const minUnitTypes = households > 0 ? 1 : 0;
  const maxUnitTypes = households > 0 ? Math.min(5, Math.max(1, households)) : 0;

  const combinedTotalArea = totalFloorAreaSqm + undergroundAreaSqm;
  const avgFloorArea = totalFloorAreaSqm / Math.max(1, floors);

  const minPassengerElevators =
    floors >= 6 && combinedTotalArea >= 2000
      ? 1 + Math.max(0, Math.ceil((combinedTotalArea - 3000) / 2000))
      : 0;

  const minEmergencyElevators =
    heightMeters > 31
      ? 1 + (avgFloorArea > 1500 ? Math.ceil((avgFloorArea - 1500) / 3000) : 0)
      : 0;

  const minTotalElevators = minPassengerElevators + minEmergencyElevators;

  const avgUndergroundFloorArea =
    undergroundFloors > 0 ? undergroundAreaSqm / undergroundFloors : 0;
  const unitsPerFloor = Math.ceil(households / Math.max(1, floors));

  let minStairs = 1;
  if (avgUndergroundFloorArea >= 200) minStairs = 2;
  if (usageType === '공동주택' && unitsPerFloor > 4 && avgFloorArea >= 300) minStairs = 2;
  if (usageType !== '공동주택' && floors >= 3 && avgFloorArea >= 400) minStairs = 2;
  if (avgFloorArea > 1000) minStairs = 3;

  const minGardenAreaSqm =
    siteAreaSqm >= 200
      ? usageType === '단독주택' && combinedTotalArea < 2000
        ? Math.ceil(siteAreaSqm * 0.05)
        : Math.ceil(siteAreaSqm * 0.1)
      : 0;

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

// 실제 건축 구조설계 안전율(1.5x)이 적용된 KDS 41 12 00 설계하중 범위
export function getKdsLoadRange(usageType: DesignCategory): KdsLoadRange {
  if (usageType === '단독주택') {
    return {
      minKn: 0.0,
      legalBaseKn: 2.0,
      legalMaxKn: 4.0,
      designCapacityKn: 6.2, // 법정 최대 4.0 kN/㎡ 대비 1.55배 구조 여유 확보
      ultimateLimitKn: 8.5,
      standardNote: 'KDS 41 12 00 (안전율 1.55x 적용): 거실 2.0 · 테라스 3.0 · 구조 허용한계 6.2 kN/㎡',
    };
  }
  if (usageType === '공동주택') {
    return {
      minKn: 0.0,
      legalBaseKn: 2.0,
      legalMaxKn: 5.0,
      designCapacityKn: 7.5, // 법정 최대 5.0 kN/㎡ 대비 1.5배 구조 여유 확보
      ultimateLimitKn: 10.0,
      standardNote: 'KDS 41 12 00 (안전율 1.50x 적용): 거실 2.0 · 발코니 3.0 · 구조 허용한계 7.5 kN/㎡',
    };
  }
  return {
    minKn: 0.0,
    legalBaseKn: 2.5,
    legalMaxKn: 5.0,
    designCapacityKn: 7.8,
    ultimateLimitKn: 10.5,
    standardNote: 'KDS 41 12 00 (안전율 1.56x 적용): 일반실 2.5 · 공용부 5.0 · 구조 허용한계 7.8 kN/㎡',
  };
}

// 건물 외형(solids) 변경 시 평면도 비율 · 외벽 창호 · 수도/전기 배관을 실시간으로 재계산
export function syncBuildingWithSolids(
  spec: BuildingSpec,
  solids: SolidPrimitive[]
): BuildingSpec {
  // 1. 기본 빈틈없는 건축 엔진으로 기본 스펙(층별 하중, 템플릿 등) 초기화
  const { spec: baseSynced } = generateWatertightArchitecture(spec);

  // 지상 주요 건축 매스(외벽·슬래브 등) 필터링 (정원·지하층 제외)
  const mainVolumes = solids.filter(
    (s) =>
      s.partRole !== 'garden' &&
      s.partRole !== 'basement' &&
      s.partRole !== 'site_boundary' &&
      s.color !== '#86efac' &&
      s.position[1] >= 0 &&
      s.scale[1] > 0.05
  );

  // 아직 3D 솔리드가 없으면 기본 엔진 결과 그대로 반환
  if (mainVolumes.length === 0) {
    return baseSynced;
  }

  // 2. 사용자가 인스펙터/채팅으로 수정한 실제 3D 매스의 외곽 치수 계산
  let minX = Infinity, maxX = -Infinity;
  let maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  mainVolumes.forEach((s) => {
    if (s.partRole === 'roof' || s.partRole === 'sculpture') return;
    minX = Math.min(minX, s.position[0] - s.scale[0] * 0.5);
    maxX = Math.max(maxX, s.position[0] + s.scale[0] * 0.5);
    maxY = Math.max(maxY, s.position[1] + s.scale[1] * 0.5);
    minZ = Math.min(minZ, s.position[2] - s.scale[2] * 0.5);
    maxZ = Math.max(maxZ, s.position[2] + s.scale[2] * 0.5);
  });

  if (!Number.isFinite(minX)) {
    return baseSynced;
  }

  const widthX = Math.max(1.4, maxX - minX);
  const depthZ = Math.max(1.1, maxZ - minZ);
  const floors = Math.max(1, Math.round(spec.floors || 2));
  const floorHeight = Math.max(0.45, maxY / floors);
  const centerX = (minX + maxX) * 0.5;
  const centerZ = (minZ + maxZ) * 0.5;
  const aspectRatio = Number((widthX / depthZ).toFixed(2));

  const typeCount = Math.max(1, Math.min(5, Math.round(spec.unitTypeCount || 1)));
  const totalHouseholds = Math.max(1, Math.round(spec.households || 1));
  const kds = getKdsLoadRange(spec.usageType);
  const templateId = spec.templateId ?? 'L-courtyard';

  const basePerType = Math.floor(totalHouseholds / typeCount);
  let remainder = totalHouseholds % typeCount;
  const generatedTypes: UnitDesignType[] = [];
  let globalUnitCursor = 0;

  for (let t = 0; t < typeCount; t++) {
    const countForThisType = Math.max(1, basePerType + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;

    const code = `TYPE-${String.fromCharCode(65 + t)}`;
    const placements: UnitPlacement3D[] = [];
    const rooms = getRoomsForTemplate(templateId, t);

    const unitsPerFloor = Math.max(1, Math.ceil(totalHouseholds / floors));
    for (let u = 0; u < countForThisType; u++) {
      const slotIdx = globalUnitCursor++;
      const floorNum = (slotIdx % floors) + 1;
      const slotInFloor = Math.floor(slotIdx / floors) % unitsPerFloor;

      const cols = Math.min(unitsPerFloor, 3);
      const rows = Math.max(1, Math.ceil(unitsPerFloor / cols));
      const col = slotInFloor % cols;
      const row = Math.floor(slotInFloor / cols);

      const unitW = (widthX * 0.82) / cols;
      const unitD = (depthZ * 0.8) / rows;
      const unitH = floorHeight * 0.72;

      const px = centerX - (widthX * 0.82) / 2 + unitW * (col + 0.5);
      const py = (floorNum - 0.5) * floorHeight;
      const pz = centerZ - (depthZ * 0.8) / 2 + unitD * (row + 0.5);

      placements.push({
        floor: floorNum,
        position: [Number(px.toFixed(3)), Number(py.toFixed(3)), Number(pz.toFixed(3))],
        scale: [
          Number((unitW * 0.9).toFixed(3)),
          Number(unitH.toFixed(3)),
          Number((unitD * 0.9).toFixed(3)),
        ],
      });
    }

    generatedTypes.push({
      id: `unit_type_${t + 1}`,
      code,
      name: `${code} (${t === 0 ? '메인 중정형' : t === 1 ? '테라스 스위트형' : '캔틸레버 스튜디오형'})`,
      areaSqm: Math.max(36, Math.round(spec.totalFloorAreaSqm / Math.max(1, totalHouseholds))),
      householdCount: countForThisType,
      liveLoadKn: kds.legalBaseKn,
      color: UNIT_TYPE_PALETTE[t % UNIT_TYPE_PALETTE.length],
      planLayout: t === 0 ? templateId : t === 1 ? 'U-terrace' : 'stepped-wing',
      aspectRatio,
      rooms,
      placements,
    });
  }

  // 3. 수정된 외벽 크기에 맞춰 외벽 창호 위치 자동 재정렬
  const exteriorWindows: ExteriorWindow3D[] = [];
  const extWallThick = 0.09;

  for (let f = 1; f <= floors; f++) {
    const floorBaseY = (f - 1) * floorHeight;
    const clearWallH = Math.max(0.28, floorHeight - 0.07);
    const sillH = clearWallH * 0.28;
    const headerH = clearWallH * 0.22;
    const winH = Number((clearWallH - sillH - headerH).toFixed(3));
    const winMidY = Number((floorBaseY + 0.07 + sillH + winH * 0.5).toFixed(3));

    (['S', 'N'] as const).forEach((dir) => {
      const wallZ = dir === 'S' ? maxZ - extWallThick * 0.5 : minZ + extWallThick * 0.5;
      [-0.225, 0.225].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number((centerX + widthX * winOffset).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((widthX * 0.35).toFixed(3)), winH, Number((extWallThick * 0.65).toFixed(3))],
          rotationY: 0,
        });
      });
    });

    (['E', 'W'] as const).forEach((dir) => {
      const wallX = dir === 'E' ? maxX - extWallThick * 0.5 : minX + extWallThick * 0.5;
      const innerD = Math.max(0.4, depthZ - extWallThick * 2);
      [-0.22, 0.22].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number(wallX.toFixed(3)), winMidY, Number((centerZ + innerD * winOffset).toFixed(3))],
          scale: [Number((innerD * 0.34).toFixed(3)), winH, Number((extWallThick * 0.65).toFixed(3))],
          rotationY: Math.PI / 2,
        });
      });
    });
  }

  // 4. 수정된 외형에 맞춰 수도·전기 배관 자동 재라우팅
  const mepPipes: MepPipe3D[] = [];
  const baseY = spec.undergroundFloors > 0 ? -0.35 * spec.undergroundFloors : 0.08;
  const topFloorY = floors * floorHeight - 0.1;
  const waterShaftX = centerX - widthX * 0.1;
  const waterShaftZ = centerZ + depthZ * 0.16;
  const elecShaftX = centerX + widthX * 0.12;
  const elecShaftZ = centerZ + depthZ * 0.16;

  mepPipes.push(
    {
      id: 'mep_water_riser',
      system: 'water',
      points: [
        [waterShaftX, baseY, waterShaftZ],
        [waterShaftX, topFloorY, waterShaftZ],
      ],
    },
    {
      id: 'mep_elec_riser',
      system: 'electric',
      points: [
        [elecShaftX, baseY, elecShaftZ],
        [elecShaftX, topFloorY + 0.05, elecShaftZ],
      ],
    }
  );

  const primaryRooms = generatedTypes[0]?.rooms.filter((r) => r.liveLoadKn < 3.0) ?? [];
  for (let f = 1; f <= floors; f++) {
    const pipeY = (f - 1) * floorHeight + 0.12;
    primaryRooms.forEach((room, idx) => {
      const tx = minX + widthX * ((room.x + room.w * 0.5) / 100);
      const tz = minZ + depthZ * ((room.y + room.h * 0.5) / 100);

      if (room.hasWater) {
        mepPipes.push({
          id: `mep_w_${f}_${idx}`,
          system: 'water',
          points: [
            [waterShaftX, pipeY, waterShaftZ],
            [tx, pipeY, waterShaftZ],
            [tx, pipeY + 0.04, tz],
          ],
        });
      }
      if (room.hasPower) {
        mepPipes.push({
          id: `mep_e_${f}_${idx}`,
          system: 'electric',
          points: [
            [elecShaftX, pipeY + 0.05, elecShaftZ],
            [elecShaftX, pipeY + 0.05, tz],
            [tx, pipeY + 0.05, tz],
          ],
        });
      }
    });
  }

  return {
    ...baseSynced,
    unitTypeCount: typeCount,
    unitTypes: generatedTypes,
    exteriorWindows,
    mepPipes,
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
      currentValue: `건폐율 ${actualBcr}% (${spec.buildingAreaSqm.toLocaleString()}㎡) · 용적률 ${actualFar}%`,
      isCompliant:
        spec.buildingAreaSqm <= limits.maxBuildingAreaSqm &&
        spec.totalFloorAreaSqm <= limits.maxTotalFloorAreaSqm,
      note: '지하층 면적은 용적률 산정에서 제외됨',
    },
    {
      category: '구조 여유 안전율 (KDS 41 12 00)',
      requirement: `기본 ${kdsLoadRange.legalBaseKn.toFixed(1)} kN/㎡ / 구조 허용한계 ${kdsLoadRange.designCapacityKn.toFixed(1)} kN/㎡ (안전율 1.5x)`,
      currentValue: `${spec.unitTypeCount}개 유형 평균 ${avgUnitLiveLoad.toFixed(2)} kN/㎡ 반영`,
      isCompliant: avgUnitLiveLoad <= kdsLoadRange.designCapacityKn,
      note: kdsLoadRange.standardNote,
    },
    {
      category: '승강기 설비 (건축법 제64조)',
      requirement:
        limits.minTotalElevators > 0
          ? `최소 ${limits.minTotalElevators}대 이상`
          : '법정 의무 대상 아님',
      currentValue: `설계 반영 ${spec.elevators}대`,
      isCompliant: spec.elevators >= limits.minTotalElevators,
      note: '연면적 및 층수 기준 산정',
    },
    {
      category: '직통·피난계단 (시행령 제34조)',
      requirement: `최소 ${limits.minStairs}개소 이상`,
      currentValue: `설계 반영 ${spec.stairs}개소`,
      isCompliant: spec.stairs >= limits.minStairs,
      note: '지하층 200㎡ 이상 및 지상 층 면적 기준',
    },
    {
      category: '대지안의 조경 (건축법 제42조)',
      requirement: `최소 ${limits.minGardenAreaSqm.toLocaleString()}㎡ 이상`,
      currentValue: `정원 ${spec.gardenAreaSqm.toLocaleString()}㎡`,
      isCompliant: spec.gardenAreaSqm >= limits.minGardenAreaSqm,
      note: '대지면적 200㎡ 이상 조경 확보 기준',
    },
  ];

  const matInfo = MATERIAL_CATALOG[material] ?? MATERIAL_CATALOG.stucco;
  const typeComplexityFactor = 1 + Math.max(0, spec.unitTypeCount - 1) * 0.03;
  const baseUnitCost = Math.round(2392000 * matInfo.factor * typeComplexityFactor);
  const aboveStructureCost = spec.totalFloorAreaSqm * baseUnitCost;
  const undergroundCost = Math.round(spec.undergroundAreaSqm * baseUnitCost * 1.28);
  const elevatorCost = spec.elevators * 125000000;
  const stairCoreCost = spec.stairs * 48000000;
  const gardenRooftopCost = spec.gardenAreaSqm * 280000 + spec.rooftops * 35000000;
  const parkingCost = limits.requiredParkingCount * 24000000;
  const mepCost = Math.round((spec.totalFloorAreaSqm + spec.undergroundAreaSqm) * 185000);

  const costs: MaterialCostItem[] = [
    {
      item: `지상 주골조 및 외장 (${matInfo.label})`,
      spec: `지상 연면적 ${spec.totalFloorAreaSqm.toLocaleString()}㎡ · 외벽 창호 ${spec.exteriorWindows?.length ?? 0}개소 포함`,
      quantity: `${spec.totalFloorAreaSqm.toLocaleString()} ㎡`,
      unitPrice: baseUnitCost,
      totalPrice: aboveStructureCost,
    },
    {
      item: `지하층 골조·흙막이 공사 (지하 ${spec.undergroundFloors}개층)`,
      spec: `지하 연면적 ${spec.undergroundAreaSqm.toLocaleString()}㎡`,
      quantity: `${spec.undergroundAreaSqm.toLocaleString()} ㎡`,
      unitPrice: Math.round(baseUnitCost * 1.28),
      totalPrice: undergroundCost,
    },
    {
      item: '급수·배수 위생배관 및 전기 간선 설비 (MEP)',
      spec: `코어 입상관 및 층별 분기 배관 ${spec.mepPipes?.length ?? 0}계통 자동 설계`,
      quantity: `${combinedArea.toLocaleString()} ㎡`,
      unitPrice: 185000,
      totalPrice: mepCost,
    },
    {
      item: '승용·비상용 엘리베이터 시스템',
      spec: `법정 최소 ${limits.minTotalElevators}대 기준`,
      quantity: `${spec.elevators} 대`,
      unitPrice: 125000000,
      totalPrice: elevatorCost,
    },
    {
      item: '직통·피난계단 코어 자재',
      spec: `법정 최소 ${limits.minStairs}개소 기준`,
      quantity: `${spec.stairs} 개소`,
      unitPrice: 48000000,
      totalPrice: stairCoreCost,
    },
    {
      item: '정원 조경 및 부설주차장 인프라',
      spec: `조경 ${spec.gardenAreaSqm}㎡ + 주차 ${limits.requiredParkingCount}대`,
      quantity: `1 식`,
      unitPrice: gardenRooftopCost + parkingCost,
      totalPrice: gardenRooftopCost + parkingCost,
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