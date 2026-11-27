import {
  BuildingSpec,
  BuildingTemplateId,
  BuildingTemplateOption,
  CadMaterial,
  DesignCategory,
  ExteriorWindow3D,
  InteriorTheme,
  MepPipe3D,
  NodePoint,
  BeamMember,
  RoofStyle,
  SitePoint2D,
  SiteShape,
  SolidPrimitive,
  UnitDesignType,
  UnitPlacement3D,
  UnitRoomZone,
} from '../types/cad';
import { getKdsLoadRange } from './buildingEstimator';

export type { BuildingTemplateOption };

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
      roofStyle: 'flat-overhang',
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      wallColor: '#f5f2eb',
      roofColor: '#c89b6e',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.05,
      gardenMultiplier: 1.0,
      structureBadge: 'L자 교차 중정 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 아트리움 테라스 하우스',
      subtitle: '중앙 선큰 정원을 양쪽 윙이 감싸고 상층부가 셋백된 3면 채광 주택',
      concept: 'ㄷ자 아트리움 중정 테라스 하우스',
      roofStyle: 'shed',
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      wallColor: '#d4a373',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.1,
      gardenMultiplier: 1.25,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '밀착 경사지붕',
    },
    {
      id: 'stepped-wing',
      name: '스텝 캔틸레버 아틀리에',
      subtitle: '층마다 비대칭 돌출·후퇴를 두어 넓은 테라스와 입체감을 만든 주택',
      concept: '스텝 캔틸레버 아틀리에 하우스',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.15,
      gardenMultiplier: 1.15,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '필로티 캔틸레버 브릿지 하우스',
      subtitle: '1층 코어 위로 2층 매스가 과감히 돌출된 하이엔드 주택',
      concept: '필로티 캔틸레버 브릿지 모던 하우스',
      roofStyle: 'butterfly',
      primaryMaterial: 'concrete',
      accentMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#8d99ae',
      openPlanRatio: 1.24,
      gardenMultiplier: 1.1,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '밀착 나비형 역경사지붕',
    },
    {
      id: 'twin-pavilion',
      name: '스카이브릿지 트윈 파빌리온',
      subtitle: '두 개의 주거 매스를 공중 연결 통로와 나비형 지붕으로 잇는 주택',
      concept: '스카이브릿지 트윈 파빌리온 하우스',
      roofStyle: 'butterfly',
      primaryMaterial: 'stucco',
      accentMaterial: 'glass',
      wallColor: '#f8fafc',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.12,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '밀착 나비형 역경사지붕',
    },
    {
      id: 'split-gable',
      name: '듀얼 스플릿 박공 하우스',
      subtitle: '엇갈린 이중 지붕 매스 사이에 채광 틈과 박공벽이 밀착된 주택',
      concept: '듀얼 스플릿 박공 채광 하우스',
      roofStyle: 'split-gable',
      primaryMaterial: 'wood',
      accentMaterial: 'concrete',
      wallColor: '#c89b6e',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.15,
      gardenMultiplier: 1.15,
      structureBadge: '이중 매스 스플릿 구조',
      roofBadge: '밀착 스플릿 지붕',
    },
    {
      id: 'atrium-ring',
      name: '중앙 채광 아트리움 순환 하우스',
      subtitle: '건물 중심 채광 코어 주위로 거실·서재·침실이 순환하는 주택',
      concept: '중앙 채광 아트리움 순환형 갤러리 하우스',
      roofStyle: 'gable',
      primaryMaterial: 'stucco',
      accentMaterial: 'glass',
      wallColor: '#f8fafc',
      roofColor: '#475569',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.2,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '밀착 박공 지붕',
    },
    {
      id: 'courtyard-pavilion',
      name: '포켓 가든 중정 파빌리온',
      subtitle: '대지 내 정원과 중정 테라스를 품은 재패니즈 모던 주택',
      concept: '포켓 가든 중정 파빌리온 하우스',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      wallColor: '#faf6ef',
      roofColor: '#b45309',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.12,
      gardenMultiplier: 1.3,
      structureBadge: '포켓 중정 파빌리온 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'cantilever-studio',
      name: '어시메트릭 캔틸레버 스튜디오',
      subtitle: '작업실·스튜디오 매스가 비대칭 돌출된 인더스트리얼 로프트 주택',
      concept: '어시메트릭 캔틸레버 스튜디오 하우스',
      roofStyle: 'shed',
      primaryMaterial: 'concrete',
      accentMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#8d99ae',
      openPlanRatio: 1.25,
      gardenMultiplier: 1.05,
      structureBadge: '어시메트릭 캔틸레버 구조',
      roofBadge: '밀착 경사지붕',
    },
    {
      id: 'gable-garden',
      name: '가든 포치 박공 하우스',
      subtitle: '전면 가든 포치와 정원 조경이 조화된 따뜻한 박공 주택',
      concept: '가든 포치 박공 단독주택',
      roofStyle: 'gable',
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      wallColor: '#d4a373',
      roofColor: '#3f3f46',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.1,
      gardenMultiplier: 1.25,
      structureBadge: '가든 포치 박공 구조',
      roofBadge: '밀착 박공 지붕',
    },
  ],
  공동주택: [
    {
      id: 'U-terrace',
      name: 'ㄷ자 중정 스텝 레지던스',
      subtitle: '중앙 커뮤니티 정원과 테라스형 세대가 결합된 주거',
      concept: 'ㄷ자 중정 커뮤니티 테라스 레지던스',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      wallColor: '#f5f2eb',
      roofColor: '#475569',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.0,
      gardenMultiplier: 1.2,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'twin-pavilion',
      name: '스카이 브릿지 트윈 타워',
      subtitle: '두 개의 주거 동을 공중 브릿지로 연결한 주거',
      concept: '스카이 브릿지 트윈 공동주택',
      roofStyle: 'butterfly',
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      wallColor: '#cbd5e1',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.15,
      gardenMultiplier: 1.1,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '밀착 나비형 역경사지붕',
    },
    {
      id: 'stepped-wing',
      name: '계단식 테라스 가든 아파트',
      subtitle: '전 세대 테라스와 조경 데크를 갖춘 계단형 주거',
      concept: '계단식 테라스 가든 공동주택',
      roofStyle: 'shed',
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      wallColor: '#d4a373',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.08,
      gardenMultiplier: 1.25,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '밀착 경사지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '포디움 캔틸레버 테라스 빌라',
      subtitle: '저층부 로비 위로 주거 매스가 돌출된 입체 주거',
      concept: '포디움 캔틸레버 테라스 빌라',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.1,
      gardenMultiplier: 1.05,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'atrium-ring',
      name: '중정 아트리움 코리빙 하우스',
      subtitle: '중앙 채광 아트리움을 둘러싼 공유 라운지형 주거',
      concept: '중정 아트리움 코리빙 레지던스',
      roofStyle: 'split-gable',
      primaryMaterial: 'stucco',
      accentMaterial: 'steel',
      wallColor: '#f8fafc',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#94a3b8',
      openPlanRatio: 1.2,
      gardenMultiplier: 1.15,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '밀착 스플릿 지붕',
    },
  ],
  '업무·상업시설': [
    {
      id: 'twin-pavilion',
      name: '아트리움 트윈 오피스 파빌리온',
      subtitle: '오픈 플라자와 브릿지 오피스가 결합된 상업 빌딩',
      concept: '아트리움 트윈 오피스·리테일 파빌리온',
      roofStyle: 'shed',
      primaryMaterial: 'steel',
      accentMaterial: 'glass',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#f1f5f9',
      interiorFloorColor: '#94a3b8',
      openPlanRatio: 1.25,
      gardenMultiplier: 1.0,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '밀착 경사지붕',
    },
    {
      id: 'stepped-wing',
      name: '스텝 테라스 크리에이티브 사옥',
      subtitle: '층별 야외 라운지를 갖춘 현대적 업무시설',
      concept: '스텝 테라스 크리에이티브 사옥',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.2,
      gardenMultiplier: 1.15,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'L-courtyard',
      name: 'L자 스트리트 갤러리 상가',
      subtitle: '보행자 중정 광장을 품은 복합 근린생활 건축물',
      concept: 'L자 스트리트 중정 상업시설',
      roofStyle: 'split-gable',
      primaryMaterial: 'stucco',
      accentMaterial: 'steel',
      wallColor: '#f5f2eb',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.1,
      structureBadge: 'L자 교차 중정 구조',
      roofBadge: '밀착 스플릿 지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '캔틸레버 랜드마크 스튜디오 사옥',
      subtitle: '1층 코어 위로 상부 오피스 매스가 돌출된 사옥',
      concept: '캔틸레버 랜드마크 스튜디오 사옥',
      roofStyle: 'butterfly',
      primaryMaterial: 'steel',
      accentMaterial: 'wood',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#8d99ae',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.0,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '밀착 나비형 역경사지붕',
    },
    {
      id: 'atrium-ring',
      name: '보이드 아트리움 테크 허브',
      subtitle: '중앙 채광 아트리움을 중심으로 구성된 업무시설',
      concept: '보이드 아트리움 테크 허브',
      roofStyle: 'gable',
      primaryMaterial: 'glass',
      accentMaterial: 'concrete',
      wallColor: '#e0f2fe',
      roofColor: '#475569',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.1,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '밀착 박공 지붕',
    },
  ],
  복합문화시설: [
    {
      id: 'stepped-wing',
      name: '캔틸레버 아트 뮤지엄',
      subtitle: '역동적인 전시 매스와 테라스를 품은 미술관',
      concept: '캔틸레버 아트 뮤지엄',
      roofStyle: 'butterfly',
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.2,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '밀착 나비형 역경사지붕',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 야외 마당 문화센터',
      subtitle: '중앙 야외 마당을 둘러싼 전시·도서관 문화공간',
      concept: 'ㄷ자 야외 마당 복합문화센터',
      roofStyle: 'shed',
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      wallColor: '#d4a373',
      roofColor: '#475569',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.3,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '밀착 경사지붕',
    },
    {
      id: 'twin-pavilion',
      name: '브릿지 갤러리 파빌리온',
      subtitle: '수공간과 연결 브릿지가 어우러진 문화 파빌리온',
      concept: '브릿지 갤러리 문화 파빌리온',
      roofStyle: 'split-gable',
      primaryMaterial: 'steel',
      accentMaterial: 'glass',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.15,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '밀착 스플릿 지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '플로팅 매스 현대미술관',
      subtitle: '야외 플라자 상공에 전시 매스가 돌출된 미술관',
      concept: '플로팅 매스 현대미술관',
      roofStyle: 'flat-overhang',
      primaryMaterial: 'stucco',
      accentMaterial: 'concrete',
      wallColor: '#f5f2eb',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.2,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '밀착 처마 평지붕',
    },
    {
      id: 'atrium-ring',
      name: '로툰다 채광 도서관·문화원',
      subtitle: '중앙 채광 아트리움을 따라 공간이 이어지는 문화시설',
      concept: '로툰다 채광 도서관·문화원',
      roofStyle: 'gable',
      primaryMaterial: 'wood',
      accentMaterial: 'glass',
      wallColor: '#c89b6e',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.25,
      gardenMultiplier: 1.15,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '밀착 박공 지붕',
    },
  ],
};

export const FLOOR_COLOR_PALETTE = [
  '#f5f2eb',
  '#e6d5be',
  '#dce3ea',
  '#ede7dd',
  '#dde6e1',
  '#e8e4ec',
];

export function getFloorColor(floorIndex: number): string {
  if (floorIndex < 0) return '#94a3b8';
  if (floorIndex === 99) return '#475569';
  return FLOOR_COLOR_PALETTE[(Math.max(1, floorIndex) - 1) % FLOOR_COLOR_PALETTE.length];
}

// 자유 그린 2D 폴리곤 면적을 Shoelace 공식으로 계산하고, 지정된 siteAreaSqm(㎡)과 동일한 면적으로 정규화
export function normalizeCustomSitePointsToArea(
  rawPoints: SitePoint2D[],
  siteAreaSqm: number
): {
  points: [number, number, number][];
  halfW: number;
  halfD: number;
  dominantYaw: number;
  vertexCount: number;
} {
  const SCALE_DIV = 3.2;
  const targetAreaUnits = Math.max(2.5, Math.min(48, siteAreaSqm / (SCALE_DIV * SCALE_DIV)));

  if (!rawPoints || rawPoints.length < 3) {
    return getSiteBoundaryPoints(siteAreaSqm, 'rectangle');
  }

  // 중심 이동
  let cx = 0;
  let cz = 0;
  for (const p of rawPoints) {
    cx += p.x;
    cz += p.z;
  }
  cx /= rawPoints.length;
  cz /= rawPoints.length;

  const centered = rawPoints.map((p) => ({ x: p.x - cx, z: p.z - cz }));

  // Shoelace 면적 계산
  let signedArea2 = 0;
  for (let i = 0; i < centered.length; i++) {
    const a = centered[i];
    const b = centered[(i + 1) % centered.length];
    signedArea2 += a.x * b.z - b.x * a.z;
  }
  const currentArea = Math.abs(signedArea2) * 0.5;
  const scaleFactor =
    currentArea > 1e-4 ? Math.sqrt(targetAreaUnits / currentArea) : Math.sqrt(targetAreaUnits / 6);

  const scaled = centered.map((p) => ({
    x: Number((p.x * scaleFactor).toFixed(3)),
    z: Number((p.z * scaleFactor).toFixed(3)),
  }));

  // 최장 변 기준 대지 방향각 계산 (대지 경계에 맞춰 집이 정렬되도록 활용)
  let maxEdgeLen = 0;
  let dominantYaw = 0;
  for (let i = 0; i < scaled.length; i++) {
    const a = scaled[i];
    const b = scaled[(i + 1) % scaled.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len = Math.hypot(dx, dz);
    if (len > maxEdgeLen) {
      maxEdgeLen = len;
      dominantYaw = Math.atan2(-dz, dx);
    }
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of scaled) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }

  const halfW = Math.max(0.6, (maxX - minX) * 0.5);
  const halfD = Math.max(0.6, (maxZ - minZ) * 0.5);

  const pts: [number, number, number][] = scaled.map((p) => [p.x, 0.015, p.z]);
  pts.push([scaled[0].x, 0.015, scaled[0].z]);

  return {
    points: pts,
    halfW: Number(halfW.toFixed(3)),
    halfD: Number(halfD.toFixed(3)),
    dominantYaw: Number(dominantYaw.toFixed(4)),
    vertexCount: scaled.length,
  };
}

export function getSiteBoundaryPoints(
  siteAreaSqm: number,
  siteShape: SiteShape = 'rectangle',
  customSitePoints?: SitePoint2D[]
): {
  points: [number, number, number][];
  halfW: number;
  halfD: number;
  dominantYaw: number;
  vertexCount: number;
} {
  if (siteShape === 'freeform' && customSitePoints && customSitePoints.length >= 3) {
    return normalizeCustomSitePointsToArea(customSitePoints, siteAreaSqm);
  }

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
    return { points: pts, halfW: r, halfD: r, dominantYaw: 0, vertexCount: 48 };
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
      halfW: hw * 0.72,
      halfD: hd * 0.68,
      dominantYaw: 0,
      vertexCount: 3,
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
      halfW: avgW * 0.44,
      halfD: hd,
      dominantYaw: 0,
      vertexCount: 4,
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
    dominantYaw: 0,
    vertexCount: 4,
  };
}

export function getDefaultSpecForCategory(
  category: Exclude<DesignCategory, '3D 디자인'>,
  templateId?: BuildingTemplateId
): BuildingSpec {
  const tplList = BUILDING_TEMPLATES_BY_CATEGORY[category];
  const defaultTpl = templateId ?? tplList[0].id;
  const tplObj = tplList.find((t) => t.id === defaultTpl) ?? tplList[0];

  if (category === '단독주택') {
    return {
      projectName: `AirForge ${tplObj.name}`,
      usageType: '단독주택',
      templateId: tplObj.id,
      selectedTemplateName: tplObj.name,
      dynamicTemplates: tplList,
      roofStyle: tplObj.roofStyle,
      accentMaterial: tplObj.accentMaterial,
      interiorTheme: tplObj.interiorTheme,
      interiorWallColor: tplObj.interiorWallColor,
      interiorFloorColor: tplObj.interiorFloorColor,
      openPlanRatio: tplObj.openPlanRatio,
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
      selectedTemplateName: tplObj.name,
      dynamicTemplates: tplList,
      roofStyle: tplObj.roofStyle,
      accentMaterial: tplObj.accentMaterial,
      interiorTheme: tplObj.interiorTheme,
      interiorWallColor: tplObj.interiorWallColor,
      interiorFloorColor: tplObj.interiorFloorColor,
      openPlanRatio: tplObj.openPlanRatio,
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
      selectedTemplateName: tplObj.name,
      dynamicTemplates: tplList,
      roofStyle: tplObj.roofStyle,
      accentMaterial: tplObj.accentMaterial,
      interiorTheme: tplObj.interiorTheme,
      interiorWallColor: tplObj.interiorWallColor,
      interiorFloorColor: tplObj.interiorFloorColor,
      openPlanRatio: tplObj.openPlanRatio,
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
    selectedTemplateName: tplObj.name,
    dynamicTemplates: tplList,
    roofStyle: tplObj.roofStyle,
    accentMaterial: tplObj.accentMaterial,
    interiorTheme: tplObj.interiorTheme,
    interiorWallColor: tplObj.interiorWallColor,
    interiorFloorColor: tplObj.interiorFloorColor,
    openPlanRatio: tplObj.openPlanRatio,
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

  const altOrder: BuildingTemplateId[] = [
    templateId,
    'U-terrace',
    'atrium-ring',
    'bridge-cantilever',
    'split-gable',
  ];
  const effectiveLayout: BuildingTemplateId = altOrder[variantIdx % altOrder.length];

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

  if (effectiveLayout === 'atrium-ring' || effectiveLayout === 'courtyard-pavilion') {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 87,
      rooms: [
        { name: '갤러리 거실 라운지', x: rx(0), y: ry(0), w: rw(36), h: rh(66), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '중앙 채광 아트리움', x: rx(36), y: ry(18), w: rw(28), h: rh(48), liveLoadKn: 3.0, windows: ['N'] },
        { name: '아일랜드 키친·다이닝', x: rx(0), y: ry(66), w: rw(48), h: rh(34), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '마스터 침실 스위트', x: rx(64), y: ry(0), w: rw(36), h: rh(56), liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
        { name: '서재·프라이빗 욕실', x: rx(48), y: ry(66), w: rw(52), h: rh(34), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true, hasPower: true },
      ],
    };
  }

  if (effectiveLayout === 'twin-pavilion' || effectiveLayout === 'split-gable') {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 89,
      rooms: [
        { name: '서측 파노라마 거실', x: rx(0), y: ry(0), w: rw(40), h: rh(62), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '서측 오픈 키친', x: rx(0), y: ry(62), w: rw(40), h: rh(38), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '스카이 브릿지 서재', x: rx(40), y: ry(24), w: rw(20), h: rh(46), liveLoadKn: 2.0, windows: ['N', 'S'], hasPower: true },
        { name: '동측 마스터 침실', x: rx(60), y: ry(0), w: rw(40), h: rh(58), liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
        { name: '동측 욕실·드레스룸', x: rx(60), y: ry(58), w: rw(40), h: rh(42), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true },
      ],
    };
  }

  if (
    areaSqm < 48 ||
    effectiveLayout === 'bridge-cantilever' ||
    effectiveLayout === 'cantilever-studio' ||
    openPlanRatio > 1.2
  ) {
    return {
      planLayout: effectiveLayout,
      efficiencyPct: 91,
      rooms: [
        { name: '광폭 캔틸레버 거실', x: rx(0), y: ry(0), w: rw(66), h: rh(70), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '아일랜드 주방·바', x: rx(66), y: ry(0), w: rw(34), h: rh(46), liveLoadKn: 2.0, windows: ['N', 'E'], hasWater: true, hasPower: true },
        { name: '침실·욕실 코어', x: rx(66), y: ry(46), w: rw(34), h: rh(54), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true, hasPower: true },
        { name: '전면 캔틸레버 테라스', x: rx(0), y: ry(70), w: rw(66), h: rh(30), liveLoadKn: 3.0, windows: ['S', 'W'] },
      ],
    };
  }

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
  const siteMeta = getSiteBoundaryPoints(
    rawSpec.siteAreaSqm || 450,
    siteShape,
    rawSpec.customSitePoints
  );
  const { halfW: siteHalfW, halfD: siteHalfD, dominantYaw, vertexCount } = siteMeta;

  // 대지 경계 형태(꼭짓점 수·폭/깊이 비율·방향각)에 따라 집의 평면 비율·캔틸레버·배치도 함께 변형
  const siteRatio = siteHalfW / Math.max(0.5, siteHalfD);
  const isFreeformPoly = siteShape === 'freeform' && vertexCount >= 3;
  const polyBendFactor = isFreeformPoly ? (((vertexCount - 3) % 5) - 2) * 0.06 : 0;

  const effectiveFootprintSqm = Math.max(
    45,
    Math.min(
      rawSpec.siteAreaSqm * 0.78,
      rawSpec.buildingAreaSqm || rawSpec.totalFloorAreaSqm / floors
    )
  );
  const footprintUnits = effectiveFootprintSqm / (SCALE_DIV * SCALE_DIV);

  const tplAspectBoost =
    templateId === 'twin-pavilion' || templateId === 'split-gable'
      ? 1.24
      : templateId === 'bridge-cantilever' || templateId === 'cantilever-studio'
      ? 1.18
      : templateId === 'U-terrace' || templateId === 'courtyard-pavilion'
      ? 1.12
      : 1.04;

  const ratioAspect = Math.max(
    0.58,
    Math.min(1.85, siteRatio * 0.65 + tplAspectBoost * 0.35 + polyBendFactor)
  );

  let bldgW = Math.sqrt(footprintUnits * ratioAspect);
  let bldgD = footprintUnits / bldgW;

  const maxAllowedW = siteHalfW * 1.44;
  const maxAllowedD = siteHalfD * 1.44;
  if (bldgW > maxAllowedW) {
    bldgW = maxAllowedW;
    bldgD = Math.min(maxAllowedD, footprintUnits / bldgW);
  }
  if (bldgD > maxAllowedD) {
    bldgD = maxAllowedD;
    bldgW = Math.min(maxAllowedW, footprintUnits / bldgD);
  }
  bldgW = Number(Math.max(1.5, bldgW).toFixed(3));
  bldgD = Number(Math.max(1.3, bldgD).toFixed(3));

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

  const freeSpaceX = Math.max(0, siteHalfW * 1.75 - bldgW);
  const bldgOffsetX = Number((-freeSpaceX * 0.22).toFixed(3));
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
      rotation: [0, dominantYaw, 0],
      color: '#94a3b8',
      material: 'concrete',
      isFixed: true,
      floorIndex: -1,
    });
  }

  // 2. 대지 여백 기반 정원 조경 배치
  const gardenReqSqm = Math.max(0, rawSpec.gardenAreaSqm || 0);
  const gardenUnitsReq = gardenReqSqm / (SCALE_DIV * SCALE_DIV);
  const bldgRightEdge = bldgOffsetX + bldgW * 0.5;
  const bldgFrontEdge = bldgOffsetZ + bldgD * 0.5;

  const rightStripW = Math.max(0, siteHalfW * 0.9 - bldgRightEdge - 0.12);
  const frontStripD = Math.max(0, siteHalfD * 0.9 - bldgFrontEdge - 0.12);
  let placedGardenUnits = 0;

  if (gardenUnitsReq > 0.05 && rightStripW > 0.22) {
    const maxRightD = Math.min(siteHalfD * 1.5, bldgD + frontStripD * 0.6);
    const gW = Number(Math.min(rightStripW, Math.max(0.32, gardenUnitsReq / maxRightD)).toFixed(3));
    const gD = Number(Math.min(maxRightD, Math.max(0.38, gardenUnitsReq / gW)).toFixed(3));
    const gX = Number((bldgRightEdge + 0.08 + gW * 0.5).toFixed(3));

    solids.push({
      id: 'arch_garden_side',
      groupName: `측면 중정 정원 (${Math.round(gW * gD * SCALE_DIV * SCALE_DIV)}㎡)`,
      partRole: 'garden',
      shape: 'box',
      position: [gX, 0.025, 0],
      scale: [gW, 0.05, gD],
      rotation: [0, dominantYaw, 0],
      color: '#4d7c0f',
      material: 'stucco',
      isFixed: true,
      floorIndex: 0,
    });
    placedGardenUnits += gW * gD;
  }

  const remAfterSide = gardenUnitsReq - placedGardenUnits;
  if (remAfterSide > 0.08 && frontStripD > 0.2) {
    const maxFrontW = Math.min(siteHalfW * 1.6, bldgW + rightStripW * 0.7);
    const fD = Number(Math.min(frontStripD, Math.max(0.26, remAfterSide / maxFrontW)).toFixed(3));
    const fW = Number(Math.min(maxFrontW, Math.max(0.45, remAfterSide / fD)).toFixed(3));
    const fZ = Number((bldgFrontEdge + 0.08 + fD * 0.5).toFixed(3));

    solids.push({
      id: 'arch_garden_front',
      groupName: `전면 테라스 조경 (${Math.round(fW * fD * SCALE_DIV * SCALE_DIV)}㎡)`,
      partRole: 'garden',
      shape: 'box',
      position: [bldgOffsetX, 0.025, fZ],
      scale: [fW, 0.05, fD],
      rotation: [0, dominantYaw, 0],
      color: '#4d7c0f',
      material: 'stucco',
      isFixed: true,
      floorIndex: 0,
    });
  }

  // 3. 10종 템플릿 & 대지 경계 연동 층별 매스·외피·실내 벽체·가구 생성
  const slabThick = 0.07;
  const extWallThick = 0.09;
  const intWallThick = 0.045;
  let topFloorW = bldgW;
  let topFloorD = bldgD;
  let topFloorCx = bldgOffsetX;
  let topFloorCz = bldgOffsetZ;
  let firstFloorIndoorRooms: UnitRoomZone[] = [];

  for (let f = 1; f <= floors; f++) {
    const floorBaseY = (f - 1) * floorH;
    const floorTopY = f * floorH;
    const clearWallH = Math.max(0.28, floorH - slabThick);
    const wallCenterY = floorBaseY + slabThick + clearWallH * 0.5;

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

    let stepFactorX = 1.0;
    let stepFactorZ = 1.0;
    let stepShiftX = 0;
    let stepShiftZ = 0;

    if (templateId === 'L-courtyard') {
      if (f % 2 === 0) {
        stepFactorX = 0.84;
        stepFactorZ = 1.12;
        stepShiftX = -bldgW * 0.09;
        stepShiftZ = bldgD * 0.05;
      }
    } else if (templateId === 'U-terrace' || templateId === 'courtyard-pavilion') {
      if (f > 1) {
        stepFactorX = Math.max(0.76, 1 - (f - 1) * 0.06);
        stepFactorZ = 0.84;
        stepShiftZ = -bldgD * 0.07;
      }
    } else if (templateId === 'stepped-wing') {
      stepFactorX = Math.max(0.68, 1 - (f - 1) * 0.08);
      stepFactorZ = Math.max(0.74, 1 - (f - 1) * 0.05);
      stepShiftX = (f % 2 === 0 ? 1 : -1) * Math.min(0.18, (f - 1) * 0.09);
    } else if (templateId === 'bridge-cantilever' || templateId === 'cantilever-studio') {
      if (f === 1) {
        stepFactorX = 0.6;
        stepFactorZ = 0.8;
        stepShiftX = -bldgW * 0.12;
      } else {
        stepFactorX = 1.16;
        stepFactorZ = 0.96;
        stepShiftX = bldgW * 0.05;
      }
    } else if (templateId === 'twin-pavilion') {
      stepFactorX = f === 1 ? 0.96 : 1.05;
      stepFactorZ = f === 1 ? 0.88 : 0.94;
    } else if (templateId === 'split-gable') {
      stepFactorX = f === 1 ? 0.98 : 0.92;
      stepShiftX = f % 2 === 0 ? bldgW * 0.04 : -bldgW * 0.04;
    } else if (templateId === 'atrium-ring' || templateId === 'gable-garden') {
      stepFactorX = 1.0;
      stepFactorZ = 1.0;
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

    // 층 바닥 구조 슬래브
    solids.push({
      id: `floor_${f}_slab`,
      groupName: `${f}층 바닥 슬래브 (${floorMat.toUpperCase()})`,
      partRole: 'slab',
      shape: 'box',
      position: [cx, Number((floorBaseY + slabThick * 0.5).toFixed(3)), cz],
      scale: [curW, slabThick, curD],
      rotation: [0, dominantYaw, 0],
      color: floorColor,
      material: floorMat,
      isFixed: true,
      floorIndex: f,
    });

    // 실내 마감 바닥판
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
      rotation: [0, dominantYaw, 0],
      color: interiorFloorColor,
      material: floorFinishMat,
      isFixed: true,
      floorIndex: f,
    });

    if (templateId === 'twin-pavilion' && f >= 2) {
      solids.push({
        id: `floor_${f}_sky_bridge`,
        groupName: `${f}층 글라스 스카이브릿지`,
        partRole: 'unit_divider',
        shape: 'box',
        position: [cx, Number(wallCenterY.toFixed(3)), cz],
        scale: [
          Number((curW * 0.24).toFixed(3)),
          Number(clearWallH.toFixed(3)),
          Number((curD * 0.62).toFixed(3)),
        ],
        rotation: [0, dominantYaw, 0],
        color: '#bae6fd',
        material: 'glass',
        isFixed: true,
        floorIndex: f,
      });
    } else if (templateId === 'atrium-ring') {
      solids.push({
        id: `floor_${f}_atrium_void`,
        groupName: `${f}층 중앙 채광 아트리움 유리 코어`,
        partRole: 'unit_divider',
        shape: 'box',
        position: [cx, Number(wallCenterY.toFixed(3)), cz],
        scale: [
          Number((curW * 0.26).toFixed(3)),
          Number(clearWallH.toFixed(3)),
          Number((curD * 0.28).toFixed(3)),
        ],
        rotation: [0, dominantYaw, 0],
        color: '#bae6fd',
        material: 'glass',
        isFixed: true,
        floorIndex: f,
      });
    } else if ((templateId === 'bridge-cantilever' || templateId === 'cantilever-studio') && f === 1) {
      solids.push({
        id: `floor_1_pilotis_plaza`,
        groupName: '1층 캔틸레버 하부 데크',
        partRole: 'slab',
        shape: 'box',
        position: [Number((bldgOffsetX + bldgW * 0.26).toFixed(3)), 0.03, cz],
        scale: [Number((bldgW * 0.54).toFixed(3)), 0.05, curD],
        rotation: [0, dominantYaw, 0],
        color: '#b45309',
        material: 'wood',
        isFixed: true,
        floorIndex: 1,
      });
    }

    if (f > 1 && curD < bldgD * 0.94) {
      const deckD = Number(((bldgD - curD) * 0.85).toFixed(3));
      solids.push({
        id: `floor_${f}_terrace_deck`,
        groupName: `${f}층 야외 테라스 데크`,
        partRole: 'slab',
        shape: 'box',
        position: [
          cx,
          Number((floorBaseY + slabThick * 0.5).toFixed(3)),
          Number((cz + curD * 0.5 + deckD * 0.45).toFixed(3)),
        ],
        scale: [curW, slabThick * 0.85, deckD],
        rotation: [0, dominantYaw, 0],
        color: '#b45309',
        material: 'wood',
        isFixed: true,
        floorIndex: f,
      });
    }

    // 층 천장 슬래브/상부 마감벽이 floorTopY까지 빈틈없이 이어지도록 구성
    const sillH = Number((clearWallH * 0.22).toFixed(3));
    const headerH = Number((clearWallH * 0.22).toFixed(3));
    const winH = Number(Math.max(0.08, clearWallH - sillH - headerH).toFixed(3));
    const winMidY = Number((floorBaseY + slabThick + sillH + winH * 0.5).toFixed(3));

    const minX = cx - curW * 0.5;
    const maxX = cx + curW * 0.5;
    const minZ = cz - curD * 0.5;
    const maxZ = cz + curD * 0.5;

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
          rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
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
          rotationY: dominantYaw,
        });
      });
    });

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
          rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
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
          rotationY: dominantYaw + Math.PI / 2,
        });
      });
    });

    const startX = minX + extWallThick;
    const startZ = minZ + extWallThick;

    const floorPlan = generateDynamicRoomLayout({
      usageType: rawSpec.usageType,
      templateId,
      areaSqm: avgUnitAreaSqm,
      aspectRatio: Number((curW / Math.max(0.4, curD)).toFixed(2)),
      variantIdx: (f - 1) % 3,
      openPlanRatio: f === 1 ? (rawSpec.openPlanRatio ?? 1.0) * 1.12 : 0.95,
    });
    const floorIndoorRooms = floorPlan.rooms.filter((r) => r.liveLoadKn < 3.0);
    if (f === 1) firstFloorIndoorRooms = floorIndoorRooms;

    const intWallMat: CadMaterial =
      interiorTheme === 'industrial-loft'
        ? 'concrete'
        : interiorTheme === 'japandi'
        ? 'wood'
        : 'stucco';

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
          scale: [intWallThick, Number(clearWallH.toFixed(3)), Number((rd * 0.84).toFixed(3))],
          rotation: [0, dominantYaw, 0],
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
          scale: [Number((rw * 0.84).toFixed(3)), Number(clearWallH.toFixed(3)), intWallThick],
          rotation: [0, dominantYaw, 0],
          color: interiorWallColor,
          material: intWallMat,
          isFixed: true,
          floorIndex: f,
        });
      }

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
            rotation: [0, dominantYaw, 0],
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
            rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
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
          rotation: [0, dominantYaw, 0],
          color: '#f1f5f9',
          material: 'stucco',
          isFixed: true,
          floorIndex: f,
        });
      } else if (room.name.includes('오피스') || room.name.includes('회의') || room.name.includes('전시') || room.name.includes('서재')) {
        solids.push({
          id: `furn_${f}_${rIdx}_desk`,
          groupName: `${f}층 ${room.name} 워크 테이블`,
          partRole: 'furniture',
          shape: 'box',
          position: [Number(roomCenterX.toFixed(3)), Number((furnBaseY + 0.06).toFixed(3)), Number(roomCenterZ.toFixed(3))],
          scale: [Number((rw * 0.58).toFixed(3)), 0.12, Number((rd * 0.32).toFixed(3))],
          rotation: [0, dominantYaw, 0],
          color: '#b08968',
          material: 'wood',
          isFixed: true,
          floorIndex: f,
        });
      }
    });

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

  // 4. 최상층 천장 밀착 베이스 + 5종 지붕(박공/경사/나비형/스플릿/처마평지붕) — 벽과 지붕 사이 틈이 없도록 밀착 시공
  const topY = floors * floorH;
  const roofColor = rawSpec.customRoofColor ?? '#475569';
  const roofMat: CadMaterial = accentMaterial === 'wood' ? 'wood' : 'steel';
  const topRoofW = Number((topFloorW + 0.16).toFixed(3));
  const topRoofD = Number((topFloorD + 0.16).toFixed(3));

  // 최상층 벽체 상단(topY)과 지붕 경사면 하부를 완전히 연결하는 밀착 천장 슬래브
  solids.push({
    id: 'arch_roof_sealing_deck',
    groupName: '최상층 벽·지붕 밀착 천장 슬래브',
    partRole: 'roof',
    shape: 'box',
    position: [topFloorCx, Number((topY - 0.02).toFixed(3)), topFloorCz],
    scale: [topRoofW, 0.06, topRoofD],
    rotation: [0, dominantYaw, 0],
    color: getFloorColor(99),
    material: baseMaterial,
    isFixed: true,
    floorIndex: 99,
  });

  if (roofStyle === 'gable') {
    const pitch = 0.28;
    const halfSpan = topRoofW * 0.5;
    const slopeW = Number((halfSpan / Math.cos(pitch) + 0.04).toFixed(3));
    const rise = halfSpan * Math.tan(pitch);
    const midY = Number((topY + rise * 0.5 - 0.01).toFixed(3));

    solids.push(
      {
        id: 'arch_roof_gable_left',
        groupName: '밀착 박공 지붕 좌측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx - halfSpan * 0.48).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.09, topRoofD],
        rotation: [0, dominantYaw, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_gable_right',
        groupName: '밀착 박공 지붕 우측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx + halfSpan * 0.48).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.09, topRoofD],
        rotation: [0, dominantYaw, -pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      // 좌·우 경사면 사이 틈을 막는 밀착 박공벽(Gable Wall)
      {
        id: 'arch_roof_gable_infills',
        groupName: '박공 상부 마감벽',
        partRole: 'exterior_wall',
        shape: 'box',
        position: [topFloorCx, Number((topY + rise * 0.36).toFixed(3)), topFloorCz],
        scale: [Number((topFloorW * 0.52).toFixed(3)), Number((rise * 0.78).toFixed(3)), Number((topFloorD * 0.96).toFixed(3))],
        rotation: [0, dominantYaw, 0],
        color: getFloorColor(99),
        material: baseMaterial,
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'split-gable') {
    const pitch = 0.22;
    const leftW = Number(((topRoofW * 0.56) / Math.cos(pitch)).toFixed(3));
    const rightW = Number(((topRoofW * 0.54) / Math.cos(pitch)).toFixed(3));
    solids.push(
      {
        id: 'arch_roof_split_left',
        groupName: '밀착 스플릿 상부 경사 지붕',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx - topRoofW * 0.23).toFixed(3)), Number((topY + 0.16).toFixed(3)), topFloorCz],
        scale: [leftW, 0.09, topRoofD],
        rotation: [0, dominantYaw, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_split_right',
        groupName: '밀착 스플릿 하부 경사 지붕',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx + topRoofW * 0.25).toFixed(3)), Number((topY + 0.08).toFixed(3)), topFloorCz],
        scale: [rightW, 0.09, topRoofD],
        rotation: [0, dominantYaw, -pitch * 0.8],
        color: '#9c6644',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      },
      // 스플릿 지붕 하부 밀착 코어벽
      {
        id: 'arch_roof_split_core',
        groupName: '스플릿 지붕 밀착 마감벽',
        partRole: 'exterior_wall',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.06).toFixed(3)), topFloorCz],
        scale: [Number((topFloorW * 0.96).toFixed(3)), 0.14, Number((topFloorD * 0.96).toFixed(3))],
        rotation: [0, dominantYaw, 0],
        color: getFloorColor(99),
        material: baseMaterial,
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'shed') {
    const pitch = 0.18;
    const spanW = Number((topRoofW / Math.cos(pitch) + 0.04).toFixed(3));
    const rise = topRoofW * Math.tan(pitch);
    const midY = Number((topY + rise * 0.42 - 0.01).toFixed(3));
    solids.push(
      {
        id: 'arch_roof_shed',
        groupName: '밀착 모던 경사 지붕',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, midY, topFloorCz],
        scale: [spanW, 0.09, topRoofD],
        rotation: [0, dominantYaw, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_shed_curtain',
        groupName: '경사 지붕 하부 밀착 마감대',
        partRole: 'exterior_wall',
        shape: 'box',
        position: [topFloorCx, Number((topY + rise * 0.25).toFixed(3)), topFloorCz],
        scale: [Number((topFloorW * 0.96).toFixed(3)), Number((rise * 0.55).toFixed(3)), Number((topFloorD * 0.96).toFixed(3))],
        rotation: [0, dominantYaw, 0],
        color: getFloorColor(99),
        material: baseMaterial,
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'butterfly') {
    const pitch = 0.22;
    const halfSpan = topRoofW * 0.5;
    const slopeW = Number((halfSpan / Math.cos(pitch) + 0.04).toFixed(3));
    const rise = halfSpan * Math.tan(pitch);
    const midY = Number((topY + rise * 0.44 - 0.01).toFixed(3));

    solids.push(
      {
        id: 'arch_roof_butterfly_left',
        groupName: '밀착 나비형 지붕 좌측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx - halfSpan * 0.48).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.09, topRoofD],
        rotation: [0, dominantYaw, -pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_butterfly_right',
        groupName: '밀착 나비형 지붕 우측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [Number((topFloorCx + halfSpan * 0.48).toFixed(3)), midY, topFloorCz],
        scale: [slopeW, 0.09, topRoofD],
        rotation: [0, dominantYaw, pitch],
        color: roofColor,
        material: roofMat,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_butterfly_band',
        groupName: '나비형 지붕 밀착 파라펫',
        partRole: 'exterior_wall',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.05).toFixed(3)), topFloorCz],
        scale: [Number((topFloorW * 0.98).toFixed(3)), 0.12, Number((topFloorD * 0.98).toFixed(3))],
        rotation: [0, dominantYaw, 0],
        color: getFloorColor(99),
        material: baseMaterial,
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else {
    solids.push({
      id: 'arch_roof_slab',
      groupName: `밀착 처마 지붕 슬래브 (${rawSpec.rooftops}개소)`,
      partRole: 'roof',
      shape: 'box',
      position: [topFloorCx, Number((topY + 0.025).toFixed(3)), topFloorCz],
      scale: [topRoofW, 0.09, topRoofD],
      rotation: [0, dominantYaw, 0],
      color: '#c89b6e',
      material: 'wood',
      isFixed: true,
      floorIndex: 99,
    });
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
      rotation: [0, dominantYaw, 0],
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