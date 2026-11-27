import {
  BuildingSpec,
  BuildingTemplateId,
  CadMaterial,
  DesignCategory,
  ExteriorWindow3D,
  MepPipe3D,
  NodePoint,
  BeamMember,
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
      subtitle: '프라이빗 중정 데크와 2층 캔틸레버 매스가 어우러진 모던 주택',
      concept: 'L자 중정 갤러리 모던 스텝 테라스 하우스',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 아트리움 테라스 하우스',
      subtitle: '중앙 선큰 정원을 양쪽 윙이 감싸는 개방형 3면 채광 주택',
      concept: 'ㄷ자 아트리움 중정 테라스 하우스',
    },
    {
      id: 'stepped-wing',
      name: '스텝 캔틸레버 아틀리에',
      subtitle: '층마다 단차를 두어 넓은 루프탑 테라스와 조망을 확보한 조형 주택',
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

// 층별 미묘하게 구분되는 세련된 건축 파스텔/뉴트럴 팔레트
export const FLOOR_COLOR_PALETTE = [
  '#f8fafc', // 1F: 퓨어 웜 화이트 스터코
  '#f4ede2', // 2F: 소프트 린넨 샌드
  '#eaf1f8', // 3F: 미스트 스카이 스톤
  '#f2efe9', // 4F: 웜 아이보리 라임
  '#e9f2ee', // 5F: 소프트 세이지 미네랄
  '#f3edf5', // 6F: 펄 라벤더 스톤
];

export function getFloorColor(floorIndex: number): string {
  if (floorIndex < 0) return '#cbd5e1'; // 지하층
  if (floorIndex === 99) return '#e7d5be'; // 옥상 내추럴 오크
  return FLOOR_COLOR_PALETTE[(Math.max(1, floorIndex) - 1) % FLOOR_COLOR_PALETTE.length];
}

export function getDefaultSpecForCategory(
  category: Exclude<DesignCategory, '3D 디자인'>,
  templateId?: BuildingTemplateId
): BuildingSpec {
  const defaultTpl =
    templateId ?? BUILDING_TEMPLATES_BY_CATEGORY[category][0].id;
  const tplObj =
    BUILDING_TEMPLATES_BY_CATEGORY[category].find((t) => t.id === defaultTpl) ??
    BUILDING_TEMPLATES_BY_CATEGORY[category][0];

  if (category === '단독주택') {
    return {
      projectName: `AirForge ${tplObj.name}`,
      usageType: '단독주택',
      templateId: tplObj.id,
      siteAreaSqm: 450,
      buildingAreaSqm: 210,
      totalFloorAreaSqm: 400,
      undergroundFloors: 1,
      undergroundAreaSqm: 160,
      heightMeters: 9.5,
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
      siteAreaSqm: 1400,
      buildingAreaSqm: 680,
      totalFloorAreaSqm: 2600,
      undergroundFloors: 1,
      undergroundAreaSqm: 950,
      heightMeters: 16,
      floors: 4,
      households: 16,
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
      siteAreaSqm: 1200,
      buildingAreaSqm: 640,
      totalFloorAreaSqm: 2400,
      undergroundFloors: 1,
      undergroundAreaSqm: 850,
      heightMeters: 18,
      floors: 4,
      households: 8,
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
    siteAreaSqm: 1600,
    buildingAreaSqm: 780,
    totalFloorAreaSqm: 2100,
    undergroundFloors: 1,
    undergroundAreaSqm: 900,
    heightMeters: 15,
    floors: 3,
    households: 4,
    unitTypeCount: 2,
    elevators: 1,
    stairs: 2,
    rooftops: 2,
    gardenAreaSqm: 280,
    designConcept: tplObj.concept,
  };
}

// 템플릿별 비정형 평면 구획 (2D 평면도와 3D 내벽·외벽·창호에 1:1 사용)
export function getRoomsForTemplate(
  templateId: BuildingTemplateId,
  variantIdx = 0
): UnitRoomZone[] {
  const effectiveLayout: BuildingTemplateId =
    variantIdx === 0
      ? templateId
      : variantIdx === 1
      ? 'U-terrace'
      : 'stepped-wing';

  if (effectiveLayout === 'L-courtyard') {
    return [
      { name: '파노라마 거실', x: 4, y: 16, w: 48, h: 42, liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
      { name: '아일랜드 주방', x: 4, y: 58, w: 36, h: 38, liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
      { name: '메인 욕실·코어', x: 40, y: 58, w: 16, h: 38, liveLoadKn: 2.0, windows: ['S'], hasWater: true },
      { name: '마스터 침실', x: 56, y: 46, w: 40, h: 50, liveLoadKn: 2.0, windows: ['E', 'S'], hasPower: true },
      { name: '중정 야외 데크', x: 52, y: 4, w: 44, h: 42, liveLoadKn: 3.0, windows: ['N', 'E'] },
      { name: '북측 테라스', x: 4, y: 4, w: 48, h: 12, liveLoadKn: 3.0, windows: ['N'] },
    ];
  }

  if (effectiveLayout === 'U-terrace') {
    return [
      { name: '서측 거실 라운지', x: 4, y: 8, w: 30, h: 56, liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
      { name: '갤러리 주방', x: 4, y: 64, w: 36, h: 32, liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
      { name: '중앙 코어·홀', x: 40, y: 64, w: 22, h: 32, liveLoadKn: 2.5, hasWater: true, hasPower: true },
      { name: '동측 스위트 침실', x: 62, y: 8, w: 34, h: 54, liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
      { name: '스위트 욕실', x: 62, y: 62, w: 34, h: 34, liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true },
      { name: '중앙 중정 테라스', x: 34, y: 8, w: 28, h: 56, liveLoadKn: 3.0, windows: ['N'] },
    ];
  }

  // stepped-wing / twin-pavilion
  return [
    { name: '캔틸레버 LDK', x: 16, y: 10, w: 54, h: 44, liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
    { name: '오픈 키친·바', x: 16, y: 54, w: 34, h: 40, liveLoadKn: 2.0, windows: ['S'], hasWater: true, hasPower: true },
    { name: '서측 서재 윙', x: 4, y: 22, w: 12, h: 58, liveLoadKn: 2.0, windows: ['W'], hasPower: true },
    { name: '프라이빗 침실', x: 50, y: 54, w: 40, h: 40, liveLoadKn: 2.0, windows: ['E', 'S'], hasPower: true },
    { name: '스파 욕실', x: 70, y: 26, w: 20, h: 28, liveLoadKn: 2.0, windows: ['E'], hasWater: true },
    { name: '스카이 정원', x: 70, y: 10, w: 24, h: 16, liveLoadKn: 4.0, windows: ['N', 'E'] },
  ];
}

const UNIT_TYPE_PALETTE = ['#0284c7', '#d97706', '#7c3aed', '#0d9488', '#db2777'];

/**
 * 제원(BuildingSpec)과 템플릿을 기반으로
 * 1) 빈틈없는 층별 바닥 슬래브
 * 2) 실제 외벽(창호 위치에 상·하 인방 포함)
 * 3) 평면도 방 경계와 1:1 일치하는 3D 내벽(칸막이벽)
 * 4) 옥상 슬래브 + 옥상 난간(파라펫) + 조형 지붕/파고라
 * 5) 승강기·계단 수직 코어 + 지하층 + 정원 조경 구역
 * 을 완벽하게 맞물려 생성합니다.
 */
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
  const floors = Math.max(1, Math.min(12, Math.round(rawSpec.floors || 2)));
  const undergroundFloors = Math.max(0, Math.min(5, Math.round(rawSpec.undergroundFloors || 0)));

  // 실제 면적·높이 수치에 비례하는 3D 월드 스케일 (1유닛 ≈ 3.2m)
  const SCALE_DIV = 3.2;
  const siteSideM = Math.sqrt(Math.max(100, rawSpec.siteAreaSqm || 450));
  const siteW = Number(Math.max(3.2, Math.min(13.5, siteSideM / SCALE_DIV)).toFixed(3));
  const siteD = Number((siteW * 0.86).toFixed(3));

  const footprintM = Math.sqrt(Math.max(45, rawSpec.buildingAreaSqm || 210));
  const bldgW = Number(Math.max(2.2, Math.min(siteW * 0.82, (footprintM * 1.12) / SCALE_DIV)).toFixed(3));
  const bldgD = Number(Math.max(1.8, Math.min(siteD * 0.82, (footprintM * 0.92) / SCALE_DIV)).toFixed(3));

  const totalHeightUnits = Number(
    Math.max(1.1, Math.min(9.5, (rawSpec.heightMeters || 9.5) / SCALE_DIV)).toFixed(3)
  );
  const floorH = Number((totalHeightUnits / floors).toFixed(3));

  const solids: SolidPrimitive[] = [];
  const nodes: NodePoint[] = [];
  const beams: BeamMember[] = [];
  const exteriorWindows: ExteriorWindow3D[] = [];
  const mepPipes: MepPipe3D[] = [];

  const rooms = getRoomsForTemplate(templateId, 0);
  const indoorRooms = rooms.filter((r) => r.liveLoadKn < 3.0);

  // 1. 지하층 볼륨 (y < 0 아래에 빈틈없이 밀착)
  if (undergroundFloors > 0 && rawSpec.undergroundAreaSqm > 0) {
    const ugRatio = Math.min(1.15, Math.max(0.55, Math.sqrt(rawSpec.undergroundAreaSqm / Math.max(1, rawSpec.buildingAreaSqm))));
    const ugH = Number((0.42 * undergroundFloors).toFixed(3));
    solids.push({
      id: 'arch_basement_main',
      groupName: `지하층 (B1~B${undergroundFloors}, ${rawSpec.undergroundAreaSqm}㎡)`,
      partRole: 'basement',
      shape: 'box',
      position: [-0.35, -ugH * 0.5, 0],
      scale: [Number((bldgW * ugRatio).toFixed(3)), ugH, Number((bldgD * ugRatio).toFixed(3))],
      color: '#cbd5e1',
      material: 'concrete',
      isFixed: true,
      floorIndex: -1,
    });
  }

  // 2. 정원 조경 구역 (gardenAreaSqm에 실시간 비례하는 잔디·데크 영역)
  const gardenSideM = Math.sqrt(Math.max(10, rawSpec.gardenAreaSqm || 80));
  const gardenW = Number(Math.max(0.9, Math.min(siteW * 0.45, gardenSideM / SCALE_DIV)).toFixed(3));
  const gardenD = Number(Math.max(0.9, Math.min(bldgD * 0.95, gardenSideM / SCALE_DIV)).toFixed(3));
  const gardenCenterX = Number((bldgW * 0.5 + gardenW * 0.5 + 0.12).toFixed(3));

  solids.push({
    id: 'arch_garden_zone',
    groupName: `정원 조경 (${rawSpec.gardenAreaSqm}㎡)`,
    partRole: 'garden',
    shape: 'box',
    position: [gardenCenterX, 0.025, 0],
    scale: [gardenW, 0.05, gardenD],
    color: '#86efac',
    material: 'stucco',
    isFixed: true,
    floorIndex: 0,
  });

  // 3. 층별 슬래브 + 비정형 외벽(창호 개구부 포함) + 2D 평면도 연동 내벽(칸막이벽)
  const slabThick = 0.07;
  const extWallThick = 0.09;
  const intWallThick = 0.045;
  const bldgOffsetX = -0.35;

  for (let f = 1; f <= floors; f++) {
    const floorBaseY = (f - 1) * floorH;
    const floorTopY = f * floorH;
    const clearWallH = Math.max(0.28, floorH - slabThick);
    const wallCenterY = floorBaseY + slabThick + clearWallH * 0.5;
    const floorColor = getFloorColor(f);

    // 층별 살짝 다른 건축 비율(캔틸레버/스텝 조형미)
    const stepFactorX =
      templateId === 'stepped-wing'
        ? 1 - (f - 1) * 0.08
        : templateId === 'L-courtyard' && f % 2 === 0
        ? 0.92
        : 1.0;
    const stepShiftX =
      templateId === 'L-courtyard' && f % 2 === 0
        ? -bldgW * 0.06
        : templateId === 'stepped-wing'
        ? -(f - 1) * 0.14
        : 0;

    const curW = Number((bldgW * Math.max(0.65, stepFactorX)).toFixed(3));
    const curD = bldgD;
    const cx = Number((bldgOffsetX + stepShiftX).toFixed(3));
    const cz = 0;

    // 3-A. 층 바닥 슬래브 (빈틈없이 외벽 하단과 밀착)
    solids.push({
      id: `floor_${f}_slab`,
      groupName: `${f}층 바닥 슬래브`,
      partRole: 'slab',
      shape: 'box',
      position: [cx, Number((floorBaseY + slabThick * 0.5).toFixed(3)), cz],
      scale: [curW, slabThick, curD],
      color: floorColor,
      material: baseMaterial,
      isFixed: true,
      floorIndex: f,
    });

    // 3-B. 외벽 (창문 인방/허리벽 구조로 창문이 외벽 안에 빈틈없이 매립됨)
    const sillH = Number((clearWallH * 0.28).toFixed(3)); // 창대 하부 외벽
    const headerH = Number((clearWallH * 0.22).toFixed(3)); // 창상부 인방 외벽
    const winH = Number((clearWallH - sillH - headerH).toFixed(3));
    const winMidY = Number((floorBaseY + slabThick + sillH + winH * 0.5).toFixed(3));

    const minX = cx - curW * 0.5;
    const maxX = cx + curW * 0.5;
    const minZ = cz - curD * 0.5;
    const maxZ = cz + curD * 0.5;

    // 남측(S) & 북측(N) 외벽 (하부 허리벽 + 상부 인방벽 + 좌우 코너 기둥벽)
    (['S', 'N'] as const).forEach((dir) => {
      const wallZ = dir === 'S' ? maxZ - extWallThick * 0.5 : minZ + extWallThick * 0.5;
      // 하부 허리벽 (전폭 빈틈없음)
      solids.push({
        id: `floor_${f}_ext_${dir}_sill`,
        groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 외벽`,
        partRole: 'exterior_wall',
        shape: 'box',
        position: [cx, Number((floorBaseY + slabThick + sillH * 0.5).toFixed(3)), Number(wallZ.toFixed(3))],
        scale: [curW, sillH, extWallThick],
        color: floorColor,
        material: baseMaterial,
        isFixed: true,
        floorIndex: f,
      });
      // 상부 인방벽 (전폭 빈틈없음)
      solids.push({
        id: `floor_${f}_ext_${dir}_header`,
        groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 상부 외벽`,
        partRole: 'exterior_wall',
        shape: 'box',
        position: [cx, Number((floorTopY - headerH * 0.5).toFixed(3)), Number(wallZ.toFixed(3))],
        scale: [curW, headerH, extWallThick],
        color: floorColor,
        material: baseMaterial,
        isFixed: true,
        floorIndex: f,
      });
      // 좌·우 모서리 외벽 기둥 + 중앙 멀리언 벽체 (창호 사이 빈틈 제거)
      [-0.45, 0, 0.45].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 외벽 기둥`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number((cx + curW * offsetRatio).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * 0.1).toFixed(3)), winH, extWallThick],
          color: floorColor,
          material: baseMaterial,
          isFixed: true,
          floorIndex: f,
        });
      });

      // 남/북 외벽 창호 (벽체 두께 내부에 정확히 끼워짐)
      [-0.225, 0.225].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number((cx + curW * winOffset).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * 0.35).toFixed(3)), winH, Number((extWallThick * 0.65).toFixed(3))],
          rotationY: 0,
        });
      });
    });

    // 동측(E) & 서측(W) 외벽 (하부 허리벽 + 상부 인방벽 + 기둥벽 + 유리 창호)
    (['E', 'W'] as const).forEach((dir) => {
      const wallX = dir === 'E' ? maxX - extWallThick * 0.5 : minX + extWallThick * 0.5;
      const innerD = Math.max(0.4, curD - extWallThick * 2);

      solids.push({
        id: `floor_${f}_ext_${dir}_sill`,
        groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 외벽`,
        partRole: 'exterior_wall',
        shape: 'box',
        position: [Number(wallX.toFixed(3)), Number((floorBaseY + slabThick + sillH * 0.5).toFixed(3)), cz],
        scale: [extWallThick, sillH, innerD],
        color: floorColor,
        material: baseMaterial,
        isFixed: true,
        floorIndex: f,
      });
      solids.push({
        id: `floor_${f}_ext_${dir}_header`,
        groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 상부 외벽`,
        partRole: 'exterior_wall',
        shape: 'box',
        position: [Number(wallX.toFixed(3)), Number((floorTopY - headerH * 0.5).toFixed(3)), cz],
        scale: [extWallThick, headerH, innerD],
        color: floorColor,
        material: baseMaterial,
        isFixed: true,
        floorIndex: f,
      });
      [-0.44, 0, 0.44].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 외벽 기둥`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * offsetRatio).toFixed(3))],
          scale: [extWallThick, winH, Number((innerD * 0.12).toFixed(3))],
          color: floorColor,
          material: baseMaterial,
          isFixed: true,
          floorIndex: f,
        });
      });

      [-0.22, 0.22].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * winOffset).toFixed(3))],
          scale: [Number((innerD * 0.34).toFixed(3)), winH, Number((extWallThick * 0.65).toFixed(3))],
          rotationY: Math.PI / 2,
        });
      });
    });

    // 3-C. 평면도 방 구획(rooms)과 1:1 일치하는 실제 3D 내벽(칸막이벽) 생성!
    const usableW = curW - extWallThick * 2;
    const usableD = curD - extWallThick * 2;
    const startX = minX + extWallThick;
    const startZ = minZ + extWallThick;

    indoorRooms.forEach((room, rIdx) => {
      const rx = startX + usableW * (room.x / 100);
      const rz = startZ + usableD * (room.y / 100);
      const rw = usableW * (room.w / 100);
      const rd = usableD * (room.h / 100);

      // 방 우측 내벽 (외벽과 겹치지 않는 내부 경계에만 생성, 출입구 개구부 78% 폭 반영)
      if (room.x + room.w < 93) {
        solids.push({
          id: `floor_${f}_intwall_v_${rIdx}`,
          groupName: `${f}층 ${room.name} 내벽`,
          partRole: 'interior_wall',
          shape: 'box',
          position: [Number((rx + rw).toFixed(3)), Number(wallCenterY.toFixed(3)), Number((rz + rd * 0.44).toFixed(3))],
          scale: [intWallThick, clearWallH, Number((rd * 0.82).toFixed(3))],
          color: '#ffffff',
          material: 'stucco',
          isFixed: true,
          floorIndex: f,
        });
      }

      // 방 하단 내벽 (외벽과 겹치지 않는 내부 경계에만 생성)
      if (room.y + room.h < 93) {
        solids.push({
          id: `floor_${f}_intwall_h_${rIdx}`,
          groupName: `${f}층 ${room.name} 칸막이 내벽`,
          partRole: 'interior_wall',
          shape: 'box',
          position: [Number((rx + rw * 0.46).toFixed(3)), Number(wallCenterY.toFixed(3)), Number((rz + rd).toFixed(3))],
          scale: [Number((rw * 0.84).toFixed(3)), clearWallH, intWallThick],
          color: '#ffffff',
          material: 'stucco',
          isFixed: true,
          floorIndex: f,
        });
      }
    });

    // 층 외곽 구조 기둥 노드 & 보 (물리 시뮬레이션 및 구조 안정성용)
    const nIds = [
      `n_${f}_0`,
      `n_${f}_1`,
      `n_${f}_2`,
      `n_${f}_3`,
    ];
    const corners: [number, number, number][] = [
      [minX + 0.04, floorTopY, minZ + 0.04],
      [maxX - 0.04, floorTopY, minZ + 0.04],
      [maxX - 0.04, floorTopY, maxZ - 0.04],
      [minX + 0.04, floorTopY, maxZ - 0.04],
    ];
    corners.forEach((pos, idx) => {
      nodes.push({
        id: nIds[idx],
        groupName: `${f}층 기둥 코어`,
        position: [Number(pos[0].toFixed(3)), Number(pos[1].toFixed(3)), Number(pos[2].toFixed(3))],
        isFixed: f === 1,
        role: 'primary',
      });
    });
  }

  // 4. 옥상 슬래브 + 옥상 난간(파라펫) + 조형 루프 파빌리온 (빈틈없이 최상층 외벽과 밀착)
  const topY = floors * floorH;
  const roofW = templateId === 'stepped-wing' ? bldgW * Math.max(0.65, 1 - (floors - 1) * 0.08) : bldgW;
  const roofCx = templateId === 'stepped-wing' ? bldgOffsetX - (floors - 1) * 0.14 : bldgOffsetX;
  const parapetH = 0.16;

  solids.push({
    id: 'arch_roof_slab',
    groupName: `옥상 지붕 슬래브 (${rawSpec.rooftops}개소)`,
    partRole: 'roof',
    shape: 'box',
    position: [Number(roofCx.toFixed(3)), Number((topY + 0.045).toFixed(3)), 0],
    scale: [Number((roofW + 0.08).toFixed(3)), 0.09, Number((bldgD + 0.08).toFixed(3))],
    color: '#e7d5be',
    material: 'wood',
    isFixed: true,
    floorIndex: 99,
  });

  // 옥상 4면 난간 파라펫 (빈틈없는 링 구조)
  const rHalfW = (roofW + 0.08) * 0.5;
  const rHalfD = (bldgD + 0.08) * 0.5;
  const parapetY = Number((topY + 0.09 + parapetH * 0.5).toFixed(3));
  solids.push(
    {
      id: 'roof_parapet_s',
      groupName: '옥상 남측 난간',
      partRole: 'roof',
      shape: 'box',
      position: [Number(roofCx.toFixed(3)), parapetY, Number((rHalfD - 0.03).toFixed(3))],
      scale: [Number((roofW + 0.08).toFixed(3)), parapetH, 0.06],
      color: '#f8fafc',
      material: 'stucco',
      isFixed: true,
      floorIndex: 99,
    },
    {
      id: 'roof_parapet_n',
      groupName: '옥상 북측 난간',
      partRole: 'roof',
      shape: 'box',
      position: [Number(roofCx.toFixed(3)), parapetY, Number((-rHalfD + 0.03).toFixed(3))],
      scale: [Number((roofW + 0.08).toFixed(3)), parapetH, 0.06],
      color: '#f8fafc',
      material: 'stucco',
      isFixed: true,
      floorIndex: 99,
    },
    {
      id: 'roof_parapet_e',
      groupName: '옥상 동측 난간',
      partRole: 'roof',
      shape: 'box',
      position: [Number((roofCx + rHalfW - 0.03).toFixed(3)), parapetY, 0],
      scale: [0.06, parapetH, Number(bldgD.toFixed(3))],
      color: '#f8fafc',
      material: 'stucco',
      isFixed: true,
      floorIndex: 99,
    },
    {
      id: 'roof_parapet_w',
      groupName: '옥상 서측 난간',
      partRole: 'roof',
      shape: 'box',
      position: [Number((roofCx - rHalfW + 0.03).toFixed(3)), parapetY, 0],
      scale: [0.06, parapetH, Number(bldgD.toFixed(3))],
      color: '#f8fafc',
      material: 'stucco',
      isFixed: true,
      floorIndex: 99,
    }
  );

  // 옥상 조형 캐노피 / 채광 아트리움 (옥상 수에 비례)
  const canopyCount = Math.max(1, Math.min(3, rawSpec.rooftops || 1));
  for (let c = 0; c < canopyCount; c++) {
    const offsetX = roofCx - roofW * 0.22 + c * (roofW * 0.24);
    solids.push({
      id: `roof_canopy_${c}`,
      groupName: `옥상 조형 캐노피 #${c + 1}`,
      partRole: 'sculpture',
      shape: 'box',
      position: [Number(offsetX.toFixed(3)), Number((topY + 0.34).toFixed(3)), -bldgD * 0.12],
      scale: [Number((roofW * 0.36).toFixed(3)), 0.07, Number((bldgD * 0.44).toFixed(3))],
      rotation: [0, 0, c % 2 === 0 ? 0.06 : -0.06],
      color: '#bae6fd',
      material: 'glass',
      isFixed: true,
      floorIndex: 99,
    });
  }

  // 5. 승강기 & 직통계단 수직 코어 볼륨 (옥상 코어탑까지 관통)
  const coreCount = Math.max(1, (rawSpec.elevators || 0) + (rawSpec.stairs || 1));
  for (let k = 0; k < Math.min(3, coreCount); k++) {
    const kx = roofCx + roofW * 0.24 - k * 0.42;
    solids.push({
      id: `arch_core_${k}`,
      groupName: k === 0 && rawSpec.elevators > 0 ? '엘리베이터·계단 코어' : `직통계단 코어 #${k + 1}`,
      partRole: 'core',
      shape: 'box',
      position: [Number(kx.toFixed(3)), Number(((topY + 0.28) * 0.5).toFixed(3)), Number((-bldgD * 0.22).toFixed(3))],
      scale: [0.34, Number((topY + 0.28).toFixed(3)), 0.34],
      color: '#e2e8f0',
      material: 'concrete',
      isFixed: true,
      floorIndex: floors,
    });
  }

  // 6. 수도(급수·배수) 및 전기 배관 자동 라우팅
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
    indoorRooms.forEach((room, idx) => {
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

  // 7. 방(세대) 디자인 유형 생성 (2D 평면도와 3D 내부 구획 일치)
  const typeCount = Math.max(1, Math.min(5, Math.round(rawSpec.unitTypeCount || 1)));
  const totalHouseholds = Math.max(1, Math.round(rawSpec.households || 1));
  const kds = getKdsLoadRange(rawSpec.usageType);
  const aspectRatio = Number((bldgW / Math.max(0.5, bldgD)).toFixed(2));

  const basePerType = Math.floor(totalHouseholds / typeCount);
  let remainder = totalHouseholds % typeCount;
  const unitTypes: UnitDesignType[] = [];
  let cursor = 0;

  for (let t = 0; t < typeCount; t++) {
    const countForType = Math.max(1, basePerType + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder -= 1;

    const code = `TYPE-${String.fromCharCode(65 + t)}`;
    const typeRooms = getRoomsForTemplate(templateId, t);
    const placements: UnitPlacement3D[] = [];
    const unitsPerFloor = Math.max(1, Math.ceil(totalHouseholds / floors));

    for (let u = 0; u < countForType; u++) {
      const slot = cursor++;
      const fNum = (slot % floors) + 1;
      const inFloor = Math.floor(slot / floors) % unitsPerFloor;
      const cols = Math.min(unitsPerFloor, 3);
      const rows = Math.max(1, Math.ceil(unitsPerFloor / cols));
      const cIdx = inFloor % cols;
      const rIdx = Math.floor(inFloor / cols);

      const uw = (bldgW * 0.82) / cols;
      const ud = (bldgD * 0.8) / rows;
      const uh = Math.max(0.22, (floorH - slabThick) * 0.72);

      const px = bldgOffsetX - (bldgW * 0.82) / 2 + uw * (cIdx + 0.5);
      const py = (fNum - 1) * floorH + slabThick + uh * 0.5;
      const pz = -(bldgD * 0.8) / 2 + ud * (rIdx + 0.5);

      placements.push({
        floor: fNum,
        position: [Number(px.toFixed(3)), Number(py.toFixed(3)), Number(pz.toFixed(3))],
        scale: [Number((uw * 0.9).toFixed(3)), Number(uh.toFixed(3)), Number((ud * 0.9).toFixed(3))],
      });
    }

    unitTypes.push({
      id: `unit_type_${t + 1}`,
      code,
      name: `${code} (${t === 0 ? '메인 중정형' : t === 1 ? '테라스 스위트형' : '캔틸레버 스튜디오형'})`,
      areaSqm: Math.max(36, Math.round(rawSpec.totalFloorAreaSqm / Math.max(1, totalHouseholds))),
      householdCount: countForType,
      liveLoadKn: kds.legalBaseKn,
      color: UNIT_TYPE_PALETTE[t % UNIT_TYPE_PALETTE.length],
      planLayout: t === 0 ? templateId : t === 1 ? 'U-terrace' : 'stepped-wing',
      aspectRatio,
      rooms: typeRooms,
      placements,
    });
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