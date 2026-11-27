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
  SiteShape,
  SolidPrimitive,
  UnitDesignType,
  UnitPlacement3D,
  UnitRoomZone,
} from '../types/cad';
import { getKdsLoadRange } from './buildingEstimator';

export type { BuildingTemplateOption };

const SCALE_DIV = 3.2;

export const BUILDING_TEMPLATES_BY_CATEGORY: Record<
  Exclude<DesignCategory, '3D 디자인'>,
  BuildingTemplateOption[]
> = {
  단독주택: [
    {
      id: 'L-courtyard',
      name: 'L자 중정 갤러리 하우스',
      subtitle: '1층 중정 데크와 2층 캔틸레버 매스가 직교 교차하는 모던 주택',
      concept: 'L자 중정 갤러리 모던 하우스',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.24,
      windowWallRatio: 0.58,
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      roofMaterial: 'wood',
      wallColor: '#f5f2eb',
      upperWallColor: '#c89b6e',
      roofColor: '#9c6644',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.05,
      gardenMultiplier: 1.15,
      hasCantilever: true,
      hasPorchDeck: true,
      structureBadge: 'L자 교차 중정 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 아트리움 테라스 하우스',
      subtitle: '중앙 선큰 정원을 양쪽 윙이 감싸고 상층부가 셋백된 3면 채광 주택',
      concept: 'ㄷ자 아트리움 중정 테라스 하우스',
      roofStyle: 'shed',
      roofPitchDeg: 15,
      overhangScale: 0.22,
      windowWallRatio: 0.62,
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      roofMaterial: 'steel',
      wallColor: '#d4a373',
      upperWallColor: '#f5f2eb',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.1,
      gardenMultiplier: 1.28,
      hasPorchDeck: true,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '모던 경사지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '필로티 캔틸레버 브릿지 하우스',
      subtitle: '1층 콘크리트 코어 위로 2층 매스가 과감히 돌출된 하이엔드 주택',
      concept: '필로티 캔틸레버 브릿지 모던 하우스',
      roofStyle: 'butterfly',
      roofPitchDeg: 18,
      overhangScale: 0.2,
      windowWallRatio: 0.68,
      primaryMaterial: 'concrete',
      accentMaterial: 'steel',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      upperWallColor: '#94a3b8',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#8d99ae',
      openPlanRatio: 1.24,
      gardenMultiplier: 1.1,
      hasCantilever: true,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '나비형 역경사지붕',
    },
    {
      id: 'split-gable',
      name: '듀얼 스플릿 박공 하우스',
      subtitle: '높이가 다른 두 경사 지붕 사이에 고측창 채광 틈을 둔 북유럽풍 주택',
      concept: '듀얼 스플릿 박공 채광 하우스',
      roofStyle: 'split-gable',
      roofPitchDeg: 22,
      overhangScale: 0.2,
      windowWallRatio: 0.54,
      primaryMaterial: 'wood',
      accentMaterial: 'concrete',
      roofMaterial: 'steel',
      wallColor: '#c89b6e',
      upperWallColor: '#cbd5e1',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.15,
      gardenMultiplier: 1.15,
      structureBadge: '고측창 이중 박공 구조',
      roofBadge: '비대칭 스플릿 지붕',
    },
    {
      id: 'atrium-ring',
      name: '중앙 채광 아트리움 순환 하우스',
      subtitle: '건물 중심의 수직 중정 보이드 주위로 거실·서재·침실이 순환하는 주택',
      concept: '중앙 채광 아트리움 순환형 갤러리 하우스',
      roofStyle: 'gable',
      roofPitchDeg: 24,
      overhangScale: 0.22,
      windowWallRatio: 0.6,
      primaryMaterial: 'stucco',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#f8fafc',
      upperWallColor: '#e0f2fe',
      roofColor: '#475569',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.22,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '박공 지붕',
    },
    {
      id: 'stepped-wing',
      name: '스텝 테라스 가든 하우스',
      subtitle: '상층부로 갈수록 계단식 후퇴를 두어 층별 야외 데크를 확보한 주택',
      concept: '계단식 셋백 테라스 가든 하우스',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.26,
      windowWallRatio: 0.64,
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      roofMaterial: 'wood',
      wallColor: '#e2e8f0',
      upperWallColor: '#c89b6e',
      roofColor: '#9c6644',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.14,
      gardenMultiplier: 1.2,
      hasPorchDeck: true,
      structureBadge: '층별 셋백 테라스 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'twin-pavilion',
      name: '스카이브릿지 트윈 파빌리온',
      subtitle: '공용동과 침실동을 좌·우로 분리하고 유리 브릿지로 연결한 주택',
      concept: '스카이브릿지 트윈 파빌리온 하우스',
      roofStyle: 'butterfly',
      roofPitchDeg: 16,
      overhangScale: 0.2,
      windowWallRatio: 0.72,
      primaryMaterial: 'steel',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      upperWallColor: '#e0f2fe',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.18,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '나비형 역경사지붕',
    },
    {
      id: 'mono-loft',
      name: '모노 경사 하이실링 로프트',
      subtitle: '한 방향으로 높게 솟은 경사 지붕 아래 복층급 개방 거실을 둔 주택',
      concept: '모노 단경사 하이실링 로프트 하우스',
      roofStyle: 'shed',
      roofPitchDeg: 21,
      overhangScale: 0.24,
      windowWallRatio: 0.76,
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#d1d5db',
      upperWallColor: '#e2e8f0',
      roofColor: '#1f2937',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#f1f5f9',
      interiorFloorColor: '#94a3b8',
      openPlanRatio: 1.34,
      gardenMultiplier: 1.05,
      structureBadge: '단경사 하이실링 로프트 구조',
      roofBadge: '모던 경사지붕',
    },
    {
      id: 'courtyard-hanok',
      name: '모던 한옥 처마 중정 하우스',
      subtitle: '깊게 내민 처마 지붕과 남측 목재 툇마루 데크로 한국적 비례미를 구현한 주택',
      concept: '모던 한옥 깊은 처마 중정 하우스',
      roofStyle: 'hip-eaves',
      roofPitchDeg: 22,
      overhangScale: 0.36,
      windowWallRatio: 0.48,
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      roofMaterial: 'steel',
      wallColor: '#f7f3ea',
      upperWallColor: '#b08968',
      roofColor: '#27272a',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.08,
      gardenMultiplier: 1.32,
      hasPorchDeck: true,
      structureBadge: '깊은 처마·툇마루 중정 구조',
      roofBadge: '깊은 처마 모임지붕',
    },
    {
      id: 'stacked-cube',
      name: '직교 적층 스컬프처 큐브 하우스',
      subtitle: '서로 다른 비율의 상·하층 볼륨을 비대칭 적층해 조각적 입면을 만든 주택',
      concept: '비대칭 직교 적층 스컬프처 큐브 하우스',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.16,
      windowWallRatio: 0.6,
      primaryMaterial: 'stucco',
      accentMaterial: 'steel',
      roofMaterial: 'concrete',
      wallColor: '#f8fafc',
      upperWallColor: '#94a3b8',
      roofColor: '#475569',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.08,
      hasCantilever: true,
      structureBadge: '비대칭 회전 적층 매스 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
  ],
  공동주택: [
    {
      id: 'U-terrace',
      name: 'ㄷ자 중정 스텝 레지던스',
      subtitle: '중앙 커뮤니티 정원과 테라스형 세대가 결합된 중저층 아트 주거',
      concept: 'ㄷ자 중정 커뮤니티 테라스 레지던스',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.2,
      windowWallRatio: 0.58,
      primaryMaterial: 'stucco',
      accentMaterial: 'wood',
      roofMaterial: 'concrete',
      wallColor: '#f5f2eb',
      roofColor: '#475569',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf7f2',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.0,
      gardenMultiplier: 1.2,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'twin-pavilion',
      name: '스카이 브릿지 트윈 타워',
      subtitle: '두 개의 주거 동을 공중 스카이 라운지로 연결한 랜드마크 주거',
      concept: '스카이 브릿지 트윈 아트리움 공동주택',
      roofStyle: 'butterfly',
      roofPitchDeg: 14,
      overhangScale: 0.18,
      windowWallRatio: 0.66,
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.15,
      gardenMultiplier: 1.1,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '나비형 역경사지붕',
    },
    {
      id: 'stepped-wing',
      name: '계단식 테라스 가든 아파트',
      subtitle: '전 세대 남향 테라스와 옥상 공원을 갖춘 계단형 공동주택',
      concept: '계단식 테라스 가든 공동주택',
      roofStyle: 'shed',
      roofPitchDeg: 12,
      overhangScale: 0.2,
      windowWallRatio: 0.6,
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      roofMaterial: 'steel',
      wallColor: '#d4a373',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.08,
      gardenMultiplier: 1.25,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '모던 경사지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '포디움 캔틸레버 테라스 빌라',
      subtitle: '저층부 커뮤니티 로비 위로 주거 매스가 돌출된 입체 공동주택',
      concept: '포디움 캔틸레버 테라스 빌라',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.22,
      windowWallRatio: 0.62,
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      roofMaterial: 'concrete',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8f0e5',
      interiorFloorColor: '#c48f5a',
      openPlanRatio: 1.1,
      gardenMultiplier: 1.05,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'atrium-ring',
      name: '중정 아트리움 코리빙 하우스',
      subtitle: '중앙 채광 아트리움을 둘러싼 공유 라운지형 공동주택',
      concept: '중정 아트리움 코리빙 레지던스',
      roofStyle: 'split-gable',
      roofPitchDeg: 18,
      overhangScale: 0.18,
      windowWallRatio: 0.56,
      primaryMaterial: 'stucco',
      accentMaterial: 'steel',
      roofMaterial: 'steel',
      wallColor: '#f8fafc',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#94a3b8',
      openPlanRatio: 1.2,
      gardenMultiplier: 1.15,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '비대칭 스플릿 지붕',
    },
  ],
  '업무·상업시설': [
    {
      id: 'twin-pavilion',
      name: '아트리움 트윈 오피스 파빌리온',
      subtitle: '저층부 오픈 플라자와 상층부 브릿지 오피스가 결합된 상업 빌딩',
      concept: '아트리움 트윈 오피스·리테일 파빌리온',
      roofStyle: 'shed',
      roofPitchDeg: 12,
      overhangScale: 0.2,
      windowWallRatio: 0.76,
      primaryMaterial: 'steel',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#f1f5f9',
      interiorFloorColor: '#94a3b8',
      openPlanRatio: 1.25,
      gardenMultiplier: 1.0,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '모던 경사지붕',
    },
    {
      id: 'stepped-wing',
      name: '스텝 테라스 크리에이티브 사옥',
      subtitle: '층별 야외 라운지와 전면 커튼월을 갖춘 현대적 업무시설',
      concept: '스텝 테라스 크리에이티브 사옥',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.22,
      windowWallRatio: 0.72,
      primaryMaterial: 'concrete',
      accentMaterial: 'wood',
      roofMaterial: 'concrete',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.2,
      gardenMultiplier: 1.15,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'L-courtyard',
      name: 'L자 스트리트 갤러리 상가',
      subtitle: '보행자 중정 광장을 품은 복합 근린생활·오피스 건축물',
      concept: 'L자 스트리트 중정 상업시설',
      roofStyle: 'split-gable',
      roofPitchDeg: 16,
      overhangScale: 0.18,
      windowWallRatio: 0.68,
      primaryMaterial: 'stucco',
      accentMaterial: 'steel',
      roofMaterial: 'steel',
      wallColor: '#f5f2eb',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.1,
      structureBadge: 'L자 교차 중정 구조',
      roofBadge: '비대칭 스플릿 지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '캔틸레버 랜드마크 스튜디오 사옥',
      subtitle: '1층 리테일 코어 위로 상부 오피스 매스가 돌출된 상징적 사옥',
      concept: '캔틸레버 랜드마크 스튜디오 사옥',
      roofStyle: 'butterfly',
      roofPitchDeg: 14,
      overhangScale: 0.22,
      windowWallRatio: 0.74,
      primaryMaterial: 'steel',
      accentMaterial: 'wood',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'industrial-loft',
      interiorWallColor: '#e2e8f0',
      interiorFloorColor: '#8d99ae',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.0,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '나비형 역경사지붕',
    },
    {
      id: 'atrium-ring',
      name: '보이드 아트리움 테크 허브',
      subtitle: '중앙 천창 아트리움을 중심으로 협업 라운지가 배치된 업무시설',
      concept: '보이드 아트리움 테크 허브',
      roofStyle: 'gable',
      roofPitchDeg: 18,
      overhangScale: 0.2,
      windowWallRatio: 0.75,
      primaryMaterial: 'glass',
      accentMaterial: 'concrete',
      roofMaterial: 'steel',
      wallColor: '#e0f2fe',
      roofColor: '#475569',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.1,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '박공 지붕',
    },
  ],
  복합문화시설: [
    {
      id: 'stepped-wing',
      name: '캔틸레버 아트 뮤지엄',
      subtitle: '역동적인 캔틸레버 전시관과 옥상 조각 공원을 품은 미술관',
      concept: '캔틸레버 아트 뮤지엄 & 조각 공원',
      roofStyle: 'butterfly',
      roofPitchDeg: 16,
      overhangScale: 0.24,
      windowWallRatio: 0.66,
      primaryMaterial: 'concrete',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#e2e8f0',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.2,
      structureBadge: '계단식 셋백 테라스 구조',
      roofBadge: '나비형 역경사지붕',
    },
    {
      id: 'U-terrace',
      name: 'ㄷ자 야외 원형극장 문화센터',
      subtitle: '중앙 야외 공연 마당을 둘러싼 전시·도서관 복합 문화공간',
      concept: 'ㄷ자 야외 공연 마당 복합문화센터',
      roofStyle: 'shed',
      roofPitchDeg: 14,
      overhangScale: 0.22,
      windowWallRatio: 0.62,
      primaryMaterial: 'wood',
      accentMaterial: 'stucco',
      roofMaterial: 'wood',
      wallColor: '#d4a373',
      roofColor: '#475569',
      interiorTheme: 'warm-wood',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#c89b6e',
      openPlanRatio: 1.22,
      gardenMultiplier: 1.3,
      structureBadge: 'ㄷ자 아트리움 윙 구조',
      roofBadge: '모던 경사지붕',
    },
    {
      id: 'twin-pavilion',
      name: '브릿지 갤러리 파빌리온',
      subtitle: '수공간과 공중 전시 브릿지가 어우러진 현대 건축 파빌리온',
      concept: '브릿지 갤러리 문화 파빌리온',
      roofStyle: 'split-gable',
      roofPitchDeg: 18,
      overhangScale: 0.22,
      windowWallRatio: 0.72,
      primaryMaterial: 'steel',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#cbd5e1',
      roofColor: '#1e293b',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.28,
      gardenMultiplier: 1.15,
      structureBadge: '스카이브릿지 트윈동 구조',
      roofBadge: '비대칭 스플릿 지붕',
    },
    {
      id: 'bridge-cantilever',
      name: '플로팅 매스 현대미술관',
      subtitle: '야외 조각 플라자 상공에 거대한 전시 매스가 떠 있는 미술관',
      concept: '플로팅 매스 현대미술관',
      roofStyle: 'flat-overhang',
      roofPitchDeg: 0,
      overhangScale: 0.28,
      windowWallRatio: 0.64,
      primaryMaterial: 'stucco',
      accentMaterial: 'concrete',
      roofMaterial: 'concrete',
      wallColor: '#f5f2eb',
      roofColor: '#334155',
      interiorTheme: 'minimal-gallery',
      interiorWallColor: '#f8fafc',
      interiorFloorColor: '#cbd5e1',
      openPlanRatio: 1.3,
      gardenMultiplier: 1.2,
      structureBadge: '필로티 캔틸레버 브릿지 구조',
      roofBadge: '캔틸레버 처마 평지붕',
    },
    {
      id: 'atrium-ring',
      name: '로툰다 채광 도서관·문화원',
      subtitle: '중앙 천창 아트리움을 따라 서가와 갤러리가 이어지는 문화시설',
      concept: '로툰다 채광 도서관·문화원',
      roofStyle: 'gable',
      roofPitchDeg: 20,
      overhangScale: 0.22,
      windowWallRatio: 0.65,
      primaryMaterial: 'wood',
      accentMaterial: 'glass',
      roofMaterial: 'steel',
      wallColor: '#c89b6e',
      roofColor: '#475569',
      interiorTheme: 'japandi',
      interiorWallColor: '#faf6ef',
      interiorFloorColor: '#d6b48c',
      openPlanRatio: 1.25,
      gardenMultiplier: 1.15,
      structureBadge: '중앙 채광 아트리움 순환 구조',
      roofBadge: '박공 지붕',
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

// ---------- 자유형 대지 경계 폴리곤 기하 유틸리티 ----------

export function createDefaultSitePolygon(
  siteAreaSqm: number,
  siteShape: SiteShape = 'rectangle'
): [number, number][] {
  const areaUnits = Math.max(2.5, Math.min(54, siteAreaSqm / (SCALE_DIV * SCALE_DIV)));

  if (siteShape === 'circle') {
    const r = Math.sqrt(areaUnits / Math.PI);
    const pts: [number, number][] = [];
    const segs = 10; // 드래그 조작이 용이한 10각형 원형 폴리곤
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push([Number((Math.cos(a) * r).toFixed(3)), Number((Math.sin(a) * r).toFixed(3))]);
    }
    return pts;
  }

  if (siteShape === 'triangle') {
    const base = Math.sqrt(areaUnits * 2.2);
    const height = (2 * areaUnits) / base;
    const hw = base * 0.5;
    const hd = height * 0.5;
    return [
      [0, Number((-hd).toFixed(3))],
      [Number(hw.toFixed(3)), Number(hd.toFixed(3))],
      [Number((-hw).toFixed(3)), Number(hd.toFixed(3))],
    ];
  }

  if (siteShape === 'trapezoid') {
    const depth = Math.sqrt(areaUnits * 0.85);
    const avgW = areaUnits / depth;
    const topHalf = avgW * 0.36;
    const botHalf = avgW * 0.64;
    const hd = depth * 0.5;
    return [
      [Number((-topHalf).toFixed(3)), Number((-hd).toFixed(3))],
      [Number(topHalf.toFixed(3)), Number((-hd).toFixed(3))],
      [Number(botHalf.toFixed(3)), Number(hd.toFixed(3))],
      [Number((-botHalf).toFixed(3)), Number(hd.toFixed(3))],
    ];
  }

  const w = Math.sqrt(areaUnits * 1.18);
  const d = areaUnits / w;
  const hw = Number((w * 0.5).toFixed(3));
  const hd = Number((d * 0.5).toFixed(3));
  return [
    [-hw, -hd],
    [hw, -hd],
    [hw, hd],
    [-hw, hd],
  ];
}

export function computePolygonAreaUnits(poly: [number, number][]): number {
  if (poly.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    sum += x1 * z2 - x2 * z1;
  }
  return Math.abs(sum) * 0.5;
}

export function computePolygonAreaSqm(poly: [number, number][]): number {
  return Math.max(40, Math.round(computePolygonAreaUnits(poly) * SCALE_DIV * SCALE_DIV));
}

export function computePolygonCentroid(poly: [number, number][]): [number, number] {
  if (poly.length === 0) return [0, 0];
  let signedArea = 0;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x0, z0] = poly[i];
    const [x1, z1] = poly[(i + 1) % poly.length];
    const cross = x0 * z1 - x1 * z0;
    signedArea += cross;
    cx += (x0 + x1) * cross;
    cz += (z0 + z1) * cross;
  }
  if (Math.abs(signedArea) < 1e-5) {
    const avgX = poly.reduce((s, p) => s + p[0], 0) / poly.length;
    const avgZ = poly.reduce((s, p) => s + p[1], 0) / poly.length;
    return [avgX, avgZ];
  }
  return [cx / (3 * signedArea), cz / (3 * signedArea)];
}

/** 동일 면적 유지 옵션이 켜졌을 때 드래그한 폴리곤을 중심 기준으로 비율 보정 */
export function rescalePolygonToArea(
  poly: [number, number][],
  targetAreaSqm: number
): [number, number][] {
  const curUnits = computePolygonAreaUnits(poly);
  const targetUnits = Math.max(2.5, targetAreaSqm / (SCALE_DIV * SCALE_DIV));
  if (curUnits < 0.05) return poly;
  const k = Math.sqrt(targetUnits / curUnits);
  const [cx, cz] = computePolygonCentroid(poly);
  return poly.map(([x, z]) => [
    Number((cx + (x - cx) * k).toFixed(3)),
    Number((cz + (z - cz) * k).toFixed(3)),
  ]);
}

function isPointInPolygon(px: number, pz: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    const intersect =
      zi > pz !== zj > pz && px < ((xj - xi) * (pz - zi)) / (zj - zi + 1e-9) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsCross(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number
): boolean {
  const ccw = (p1x: number, p1z: number, p2x: number, p2z: number, p3x: number, p3z: number) =>
    (p3z - p1z) * (p2x - p1x) > (p2z - p1z) * (p3x - p1x);
  return (
    ccw(ax, az, cx, cz, dx, dz) !== ccw(bx, bz, cx, cz, dx, dz) &&
    ccw(ax, az, bx, bz, cx, cz) !== ccw(ax, az, bx, bz, dx, dz)
  );
}

function isRectStrictlyInsidePolygon(
  cx: number,
  cz: number,
  w: number,
  d: number,
  poly: [number, number][],
  margin = 0.1
): boolean {
  const hw = w * 0.5 + margin;
  const hd = d * 0.5 + margin;
  const corners: [number, number][] = [
    [cx - hw, cz - hd],
    [cx + hw, cz - hd],
    [cx + hw, cz + hd],
    [cx - hw, cz + hd],
  ];
  for (const [qx, qz] of corners) {
    if (!isPointInPolygon(qx, qz, poly)) return false;
  }
  // 오목 다각형에서도 변이 파고들지 않도록 사각형 4변과 대지 폴리곤 변 교차 검사
  for (let r = 0; r < 4; r++) {
    const [ax, az] = corners[r];
    const [bx, bz] = corners[(r + 1) % 4];
    for (let i = 0; i < poly.length; i++) {
      const [px, pz] = poly[i];
      const [qx, qz] = poly[(i + 1) % poly.length];
      if (segmentsCross(ax, az, bx, bz, px, pz, qx, qz)) return false;
    }
  }
  return true;
}

/** 자유형 대지 폴리곤 내부에서 건물이 깨지지 않고 안정적으로 들어가는 최적 위치·크기 계산 */
export function computeSafeBuildingFootprintInPolygon(
  poly: [number, number][],
  targetFootprintUnits: number,
  preferredAspect: number
): { cx: number; cz: number; width: number; depth: number } {
  const [centX, centZ] = computePolygonCentroid(poly);
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  poly.forEach(([x, z]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  });

  const candidates: [number, number][] = [];
  if (isPointInPolygon(centX, centZ, poly)) {
    candidates.push([centX, centZ]);
  }
  const steps = 5;
  for (let gx = 1; gx < steps; gx++) {
    for (let gz = 1; gz < steps; gz++) {
      const px = minX + ((maxX - minX) * gx) / steps;
      const pz = minZ + ((maxZ - minZ) * gz) / steps;
      if (isPointInPolygon(px, pz, poly)) {
        candidates.push([px, pz]);
      }
    }
  }
  if (candidates.length === 0) {
    candidates.push([centX, centZ]);
  }

  const aspectCandidates = [preferredAspect, 1.0, Number((1 / Math.max(0.5, preferredAspect)).toFixed(2))];
  const maxSpan = Math.max(maxX - minX, maxZ - minZ, 1.2);

  let best = {
    cx: centX,
    cz: centZ,
    width: Math.max(1.2, Math.min((maxX - minX) * 0.55, Math.sqrt(targetFootprintUnits))),
    depth: Math.max(1.1, Math.min((maxZ - minZ) * 0.55, Math.sqrt(targetFootprintUnits))),
    score: -1,
  };

  for (const [tx, tz] of candidates) {
    for (const asp of aspectCandidates) {
      const targetW = Math.sqrt(targetFootprintUnits * asp);
      const targetD = targetFootprintUnits / Math.max(0.2, targetW);
      const capScale = Math.min(1, maxSpan / Math.max(targetW, targetD, 0.5));

      let lo = 0.25;
      let hi = capScale;
      let bestScale = 0;

      // 8회 이진 탐색으로 폴리곤 내부 최대 허용 비율 고속 탐색
      for (let iter = 0; iter < 8; iter++) {
        const mid = (lo + hi) * 0.5;
        const w = targetW * mid;
        const d = targetD * mid;
        if (isRectStrictlyInsidePolygon(tx, tz, w, d, poly, 0.12)) {
          bestScale = mid;
          lo = mid;
        } else {
          hi = mid;
        }
      }

      if (bestScale > 0) {
        const w = targetW * bestScale;
        const d = targetD * bestScale;
        const areaScore = w * d * (asp === preferredAspect ? 1.06 : 1.0);
        if (areaScore > best.score) {
          best = { cx: tx, cz: tz, width: w, depth: d, score: areaScore };
        }
      }
    }
  }

  return {
    cx: Number(best.cx.toFixed(3)),
    cz: Number(best.cz.toFixed(3)),
    width: Number(Math.max(1.2, best.width).toFixed(3)),
    depth: Number(Math.max(1.1, best.depth).toFixed(3)),
  };
}

export function getSiteBoundaryPoints(
  siteAreaSqm: number,
  siteShape: SiteShape = 'rectangle',
  sitePolygon?: [number, number][]
): {
  points: [number, number, number][];
  polygon2D: [number, number][];
  halfW: number;
  halfD: number;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  const polygon2D =
    sitePolygon && sitePolygon.length >= 3
      ? sitePolygon
      : createDefaultSitePolygon(siteAreaSqm, siteShape);

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  polygon2D.forEach(([x, z]) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  });

  const points: [number, number, number][] = [
    ...polygon2D.map(([x, z]): [number, number, number] => [x, 0.015, z]),
    [polygon2D[0][0], 0.015, polygon2D[0][1]],
  ];

  return {
    points,
    polygon2D,
    halfW: (maxX - minX) * 0.5,
    halfD: (maxZ - minZ) * 0.5,
    minX,
    maxX,
    minZ,
    maxZ,
  };
}

export function getDefaultSpecForCategory(
  category: Exclude<DesignCategory, '3D 디자인'>,
  templateId?: BuildingTemplateId
): BuildingSpec {
  const tplList = BUILDING_TEMPLATES_BY_CATEGORY[category];
  const defaultTpl = templateId ?? tplList[0].id;
  const tplObj = tplList.find((t) => t.id === defaultTpl) ?? tplList[0];

  const baseSiteArea =
    category === '단독주택'
      ? 450
      : category === '공동주택'
      ? 1400
      : category === '업무·상업시설'
      ? 1200
      : 1600;

  const baseCommon = {
    projectName: `AirForge ${tplObj.name}`,
    usageType: category,
    templateId: tplObj.id,
    selectedTemplateName: tplObj.name,
    dynamicTemplates: tplList,
    roofStyle: tplObj.roofStyle,
    roofPitchDeg: tplObj.roofPitchDeg ?? 18,
    overhangScale: tplObj.overhangScale ?? 0.22,
    windowWallRatio: tplObj.windowWallRatio ?? 0.56,
    accentMaterial: tplObj.accentMaterial,
    roofMaterial: tplObj.roofMaterial ?? 'steel',
    interiorTheme: tplObj.interiorTheme,
    interiorWallColor: tplObj.interiorWallColor,
    interiorFloorColor: tplObj.interiorFloorColor,
    openPlanRatio: tplObj.openPlanRatio,
    siteShape: 'rectangle' as SiteShape,
    sitePolygon: createDefaultSitePolygon(baseSiteArea, 'rectangle'),
    lockSiteAreaOnDrag: false,
    designConcept: tplObj.concept,
  };

  if (category === '단독주택') {
    return {
      ...baseCommon,
      useHouseholds: true,
      siteAreaSqm: baseSiteArea,
      buildingAreaSqm: 190,
      totalFloorAreaSqm: 380,
      undergroundFloors: 1,
      undergroundAreaSqm: 150,
      heightMeters: 7.4,
      floors: 2,
      households: 1,
      unitTypeCount: 2,
      elevators: 0,
      stairs: 1,
      rooftops: 1,
      gardenAreaSqm: 95,
    };
  }
  if (category === '공동주택') {
    return {
      ...baseCommon,
      useHouseholds: true,
      siteAreaSqm: baseSiteArea,
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
    };
  }
  if (category === '업무·상업시설') {
    return {
      ...baseCommon,
      useHouseholds: false,
      siteAreaSqm: baseSiteArea,
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
    };
  }
  return {
    ...baseCommon,
    useHouseholds: false,
    siteAreaSqm: baseSiteArea,
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
  };
}

// 10종 구조 아키타입 및 면적·개방감에 따른 동적 방 평면 재설계
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
    'courtyard-hanok',
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

  if (effectiveLayout === 'courtyard-hanok') {
    return {
      planLayout: 'courtyard-hanok',
      efficiencyPct: 89,
      rooms: [
        { name: '대청마루 거실', x: rx(28), y: ry(18), w: rw(44), h: rh(58), liveLoadKn: 2.0, windows: ['N', 'S'], hasPower: true },
        { name: '안방 한실 스위트', x: rx(0), y: ry(18), w: rw(28), h: rh(52), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '현대식 주방·부엌', x: rx(0), y: ry(70), w: rw(28), h: rh(30), liveLoadKn: 2.0, windows: ['W', 'S'], hasWater: true, hasPower: true },
        { name: '사랑방 서재·게스트', x: rx(72), y: ry(18), w: rw(28), h: rh(48), liveLoadKn: 2.0, windows: ['N', 'E'], hasPower: true },
        { name: '욕실·다실 코어', x: rx(72), y: ry(66), w: rw(28), h: rh(34), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true },
        { name: '남향 툇마루 데크', x: rx(28), y: ry(76), w: rw(44), h: rh(24), liveLoadKn: 3.0, windows: ['S'] },
      ],
    };
  }

  if (effectiveLayout === 'mono-loft') {
    return {
      planLayout: 'mono-loft',
      efficiencyPct: 93,
      rooms: [
        { name: '복층 하이실링 거실', x: rx(0), y: ry(0), w: rw(62), h: rh(74), liveLoadKn: 2.0, windows: ['N', 'W'], hasPower: true },
        { name: '아일랜드 바·키친', x: rx(62), y: ry(0), w: rw(38), h: rh(44), liveLoadKn: 2.0, windows: ['N', 'E'], hasWater: true, hasPower: true },
        { name: '로프트 침실·욕실', x: rx(62), y: ry(44), w: rw(38), h: rh(56), liveLoadKn: 2.0, windows: ['E', 'S'], hasWater: true, hasPower: true },
        { name: '남측 선룸 테라스', x: rx(0), y: ry(74), w: rw(62), h: rh(26), liveLoadKn: 3.0, windows: ['S', 'W'] },
      ],
    };
  }

  if (effectiveLayout === 'atrium-ring') {
    return {
      planLayout: 'atrium-ring',
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

  if (areaSqm < 48 || effectiveLayout === 'bridge-cantilever' || effectiveLayout === 'stacked-cube' || openPlanRatio > 1.2) {
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
  const roofPitchDeg = rawSpec.roofPitchDeg ?? (roofStyle === 'flat-overhang' ? 0 : 22);
  const overhangScale = rawSpec.overhangScale ?? (roofStyle === 'hip-eaves' ? 0.36 : 0.22);
  const windowWallRatio = Math.max(0.24, Math.min(0.84, rawSpec.windowWallRatio ?? 0.56));
  const accentMaterial: CadMaterial = rawSpec.accentMaterial ?? 'wood';
  const roofMaterial: CadMaterial =
    rawSpec.roofMaterial ?? (accentMaterial === 'wood' ? 'wood' : 'steel');
  const interiorTheme: InteriorTheme = rawSpec.interiorTheme ?? 'warm-wood';
  const interiorWallColor = rawSpec.interiorWallColor ?? '#faf7f2';
  const interiorFloorColor = rawSpec.interiorFloorColor ?? '#c89b6e';
  const siteShape: SiteShape = rawSpec.siteShape ?? 'rectangle';
  const floors = Math.max(1, Math.min(15, Math.round(rawSpec.floors || 1)));
  const undergroundFloors = Math.max(0, Math.min(5, Math.round(rawSpec.undergroundFloors || 0)));

  // 1. 자유형 대지 폴리곤 확정 및 실제 대지면적 계산
  const siteInfo = getSiteBoundaryPoints(
    rawSpec.siteAreaSqm || 450,
    siteShape,
    rawSpec.sitePolygon
  );
  const polygon2D = siteInfo.polygon2D;
  const effectiveSiteSqm =
    siteShape === 'custom' && !rawSpec.lockSiteAreaOnDrag
      ? computePolygonAreaSqm(polygon2D)
      : rawSpec.siteAreaSqm || computePolygonAreaSqm(polygon2D);

  const preferredAspect =
    templateId === 'twin-pavilion' || templateId === 'split-gable'
      ? 1.42
      : templateId === 'bridge-cantilever' || templateId === 'courtyard-hanok'
      ? 1.34
      : templateId === 'U-terrace'
      ? 1.28
      : templateId === 'L-courtyard'
      ? 1.22
      : 1.12;

  const requestedFootprintSqm = Math.max(
    40,
    Math.min(
      effectiveSiteSqm * 0.72,
      rawSpec.buildingAreaSqm || rawSpec.totalFloorAreaSqm / floors
    )
  );
  const targetFootprintUnits = requestedFootprintSqm / (SCALE_DIV * SCALE_DIV);

  // 자유형 대지 경계 내부에 절대 깨지지 않고 안전하게 수납되는 건물 베이스 좌표/치수 산출
  const safeBox = computeSafeBuildingFootprintInPolygon(
    polygon2D,
    targetFootprintUnits,
    preferredAspect
  );
  const bldgW = safeBox.width;
  const bldgD = safeBox.depth;
  const bldgOffsetX = safeBox.cx;
  const bldgOffsetZ = safeBox.cz;
  const actualFootprintSqm = Math.round(bldgW * bldgD * SCALE_DIV * SCALE_DIV);

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

  // 2. 지하층 볼륨 (안전 영역 내부 밀착)
  if (undergroundFloors > 0 && rawSpec.undergroundAreaSqm > 0) {
    const ugRatio = Math.min(
      1.0,
      Math.max(0.55, Math.sqrt(rawSpec.undergroundAreaSqm / Math.max(1, actualFootprintSqm)))
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

  // 3. 자유형 대지 경계 내부 잔여 공간 자동 탐색 정원 배치 (경계 밖 돌출 차단)
  const gardenReqSqm = Math.max(0, rawSpec.gardenAreaSqm || 0);
  const gardenUnitsReq = gardenReqSqm / (SCALE_DIV * SCALE_DIV);
  if (gardenUnitsReq > 0.05) {
    const candidatePatches: {
      id: string;
      name: string;
      cx: number;
      cz: number;
      w: number;
      d: number;
    }[] = [
      {
        id: 'arch_garden_east',
        name: '동측 정원 마당',
        cx: bldgOffsetX + bldgW * 0.5 + 0.45,
        cz: bldgOffsetZ,
        w: 0.72,
        d: bldgD * 0.85,
      },
      {
        id: 'arch_garden_south',
        name: '남향 잔디 정원',
        cx: bldgOffsetX,
        cz: bldgOffsetZ + bldgD * 0.5 + 0.42,
        w: bldgW * 0.88,
        d: 0.68,
      },
      {
        id: 'arch_garden_west',
        name: '서측 포켓 정원',
        cx: bldgOffsetX - bldgW * 0.5 - 0.45,
        cz: bldgOffsetZ,
        w: 0.72,
        d: bldgD * 0.85,
      },
      {
        id: 'arch_garden_north',
        name: '북측 후정 조경',
        cx: bldgOffsetX,
        cz: bldgOffsetZ - bldgD * 0.5 - 0.42,
        w: bldgW * 0.85,
        d: 0.65,
      },
    ];

    let placedUnits = 0;
    for (const patch of candidatePatches) {
      if (placedUnits >= gardenUnitsReq) break;
      // 폴리곤 내부에 안전하게 들어가는 최대 스케일 탐색
      for (const s of [1.15, 0.9, 0.68, 0.48]) {
        const pw = Number((patch.w * s).toFixed(3));
        const pd = Number((patch.d * s).toFixed(3));
        const dirX = Math.sign(patch.cx - bldgOffsetX);
        const dirZ = Math.sign(patch.cz - bldgOffsetZ);
        const pcx = Number((bldgOffsetX + dirX * (bldgW * 0.5 + pw * 0.5 + 0.08)).toFixed(3));
        const pcz = Number((bldgOffsetZ + dirZ * (bldgD * 0.5 + pd * 0.5 + 0.08)).toFixed(3));
        if (isRectStrictlyInsidePolygon(pcx, pcz, pw, pd, polygon2D, 0.05)) {
          solids.push({
            id: patch.id,
            groupName: `${patch.name} (${Math.round(pw * pd * SCALE_DIV * SCALE_DIV)}㎡)`,
            partRole: 'garden',
            shape: 'box',
            position: [pcx, 0.025, pcz],
            scale: [pw, 0.05, pd],
            color: '#4d7c0f',
            material: 'stucco',
            isFixed: true,
            floorIndex: 0,
          });
          placedUnits += pw * pd;
          break;
        }
      }
    }
  }

  // 4. 10종 아키타입별 층별 매스·외피·창호 비율(windowWallRatio)·실내 벽체·가구 생성
  const slabThick = 0.07;
  const extWallThick = 0.09;
  const intWallThick = 0.045;
  let topFloorW = bldgW;
  let topFloorD = bldgD;
  let topFloorCx = bldgOffsetX;
  let topFloorCz = bldgOffsetZ;
  let topFloorMat: CadMaterial = baseMaterial;
  let topFloorColor = rawSpec.customWallColor ?? getFloorColor(1);
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
        : rawSpec.customUpperWallColor ??
          (accentMaterial === 'wood'
            ? '#c89b6e'
            : accentMaterial === 'steel'
            ? '#94a3b8'
            : accentMaterial === 'concrete'
            ? '#cbd5e1'
            : getFloorColor(f));

    // 10종 아키타입별 층별 구조 변형 (단, 대지 경계 밖으로 나가지 않도록 안전 범위 클램핑)
    let stepFactorX = 1.0;
    let stepFactorZ = 1.0;
    let stepShiftX = 0;
    let stepShiftZ = 0;

    if (templateId === 'L-courtyard') {
      if (f % 2 === 0) {
        stepFactorX = 0.84;
        stepFactorZ = 1.04;
        stepShiftX = -bldgW * 0.07;
        stepShiftZ = bldgD * 0.02;
      }
    } else if (templateId === 'U-terrace') {
      if (f > 1) {
        stepFactorX = Math.max(0.76, 1 - (f - 1) * 0.06);
        stepFactorZ = 0.84;
        stepShiftZ = -bldgD * 0.07;
      }
    } else if (templateId === 'stepped-wing') {
      stepFactorX = Math.max(0.68, 1 - (f - 1) * 0.09);
      stepFactorZ = Math.max(0.74, 1 - (f - 1) * 0.06);
      stepShiftX = (f % 2 === 0 ? 1 : -1) * Math.min(0.14, (f - 1) * 0.07);
    } else if (templateId === 'bridge-cantilever') {
      if (f === 1) {
        stepFactorX = 0.6;
        stepFactorZ = 0.78;
        stepShiftX = -bldgW * 0.14;
      } else {
        stepFactorX = 1.02;
        stepFactorZ = 0.96;
        stepShiftX = bldgW * 0.03;
      }
    } else if (templateId === 'twin-pavilion') {
      stepFactorX = f === 1 ? 0.96 : 1.0;
      stepFactorZ = f === 1 ? 0.88 : 0.94;
    } else if (templateId === 'split-gable') {
      stepFactorX = f === 1 ? 0.98 : 0.92;
      stepShiftX = f % 2 === 0 ? bldgW * 0.03 : -bldgW * 0.02;
    } else if (templateId === 'atrium-ring') {
      stepFactorX = 0.98;
      stepFactorZ = 0.98;
    } else if (templateId === 'mono-loft') {
      stepFactorX = f === 1 ? 0.98 : 0.82;
      stepFactorZ = f === 1 ? 0.96 : 0.86;
      stepShiftX = f > 1 ? bldgW * 0.07 : 0;
    } else if (templateId === 'courtyard-hanok') {
      stepFactorX = f === 1 ? 1.0 : 0.8;
      stepFactorZ = f === 1 ? 0.92 : 0.84;
      stepShiftZ = f > 1 ? -bldgD * 0.04 : 0;
    } else if (templateId === 'stacked-cube') {
      if (f % 2 === 0) {
        stepFactorX = 0.82;
        stepFactorZ = 0.96;
        stepShiftX = bldgW * 0.08;
      } else {
        stepFactorX = 0.96;
        stepFactorZ = 0.84;
        stepShiftX = -bldgW * 0.04;
      }
    }

    let curW = Number((bldgW * stepFactorX).toFixed(3));
    let curD = Number((bldgD * stepFactorZ).toFixed(3));
    let cx = Number((bldgOffsetX + stepShiftX).toFixed(3));
    let cz = Number((bldgOffsetZ + stepShiftZ).toFixed(3));

    // 대지 경계를 변형했을 때 상층부 오프셋이 폴리곤을 넘지 않도록 자동 안전 보정
    if (!isRectStrictlyInsidePolygon(cx, cz, curW, curD, polygon2D, 0.06)) {
      cx = bldgOffsetX;
      cz = bldgOffsetZ;
      curW = Math.min(curW, bldgW);
      curD = Math.min(curD, bldgD);
    }

    if (f === floors) {
      topFloorW = curW;
      topFloorD = curD;
      topFloorCx = cx;
      topFloorCz = cz;
      topFloorMat = floorMat;
      topFloorColor = floorColor;
    }

    // 층 바닥 구조 슬래브
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

    // 실내 마감 바닥판
    const usableW = Math.max(0.4, curW - extWallThick * 2);
    const usableD = Math.max(0.4, curD - extWallThick * 2);
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

    // 아키타입 특화 서브 구조 (스카이브릿지 / 중앙 아트리움 / 필로티 데크 / 한옥 툇마루)
    if (templateId === 'twin-pavilion' && f >= 2) {
      solids.push({
        id: `floor_${f}_sky_bridge`,
        groupName: `${f}층 글라스 스카이브릿지`,
        partRole: 'unit_divider',
        shape: 'box',
        position: [cx, Number(wallCenterY.toFixed(3)), cz],
        scale: [Number((curW * 0.24).toFixed(3)), Number((clearWallH * 0.92).toFixed(3)), Number((curD * 0.62).toFixed(3))],
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
        scale: [Number((curW * 0.26).toFixed(3)), Number((clearWallH * 0.96).toFixed(3)), Number((curD * 0.28).toFixed(3))],
        color: '#bae6fd',
        material: 'glass',
        isFixed: true,
        floorIndex: f,
      });
    } else if (templateId === 'bridge-cantilever' && f === 1) {
      solids.push({
        id: 'floor_1_pilotis_plaza',
        groupName: '1층 필로티 캔틸레버 하부 데크',
        partRole: 'slab',
        shape: 'box',
        position: [Number((bldgOffsetX + bldgW * 0.2).toFixed(3)), 0.03, cz],
        scale: [Number((bldgW * 0.45).toFixed(3)), 0.05, Number((curD * 0.92).toFixed(3))],
        color: '#b45309',
        material: 'wood',
        isFixed: true,
        floorIndex: 1,
      });
    } else if (templateId === 'courtyard-hanok' && f === 1) {
      solids.push({
        id: 'floor_1_hanok_toenmaru',
        groupName: '1층 남향 목재 툇마루 데크',
        partRole: 'slab',
        shape: 'box',
        position: [cx, 0.045, Number((cz + curD * 0.5 + 0.14).toFixed(3))],
        scale: [Number((curW * 0.9).toFixed(3)), 0.09, 0.26],
        color: '#b08968',
        material: 'wood',
        isFixed: true,
        floorIndex: 1,
      });
    }

    // 창호 비율(windowWallRatio)에 따른 동적 외벽·창틀 계산 (전면 통창 ~ 펀치드 윈도우)
    const sillRatio = Math.max(0.08, 0.34 - windowWallRatio * 0.3);
    const headerRatio = Math.max(0.1, 0.26 - windowWallRatio * 0.16);
    const sillH = Number((clearWallH * sillRatio).toFixed(3));
    const headerH = Number((clearWallH * headerRatio).toFixed(3));
    const winH = Number(Math.max(0.12, clearWallH - sillH - headerH).toFixed(3));
    const winMidY = Number((floorBaseY + slabThick + sillH + winH * 0.5).toFixed(3));

    const pierWidthFrac = Math.max(0.055, (1 - windowWallRatio) * 0.34);
    const winSpanFrac = Math.max(0.18, (1 - pierWidthFrac * 3) * 0.5);

    const minX = cx - curW * 0.5;
    const maxX = cx + curW * 0.5;
    const minZ = cz - curD * 0.5;
    const maxZ = cz + curD * 0.5;

    // 남·북 외벽 + 창호
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

      const cornerOffset = 0.5 - pierWidthFrac * 0.5;
      [-cornerOffset, 0, cornerOffset].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'S' ? '남측' : '북측'} 구조 기둥벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number((cx + curW * offsetRatio).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * pierWidthFrac).toFixed(3)), winH, extWallThick],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        });
      });

      const winOffsetAbs = (pierWidthFrac + winSpanFrac) * 0.5;
      [-winOffsetAbs, winOffsetAbs].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number((cx + curW * winOffset).toFixed(3)), winMidY, Number(wallZ.toFixed(3))],
          scale: [Number((curW * winSpanFrac).toFixed(3)), winH, Number((extWallThick * 0.55).toFixed(3))],
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

      const cornerOffset = 0.5 - pierWidthFrac * 0.5;
      [-cornerOffset, 0, cornerOffset].forEach((offsetRatio, pIdx) => {
        solids.push({
          id: `floor_${f}_ext_${dir}_pier_${pIdx}`,
          groupName: `${f}층 ${dir === 'E' ? '동측' : '서측'} 구조 기둥벽`,
          partRole: 'exterior_wall',
          shape: 'box',
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * offsetRatio).toFixed(3))],
          scale: [extWallThick, winH, Number((innerD * pierWidthFrac).toFixed(3))],
          color: floorColor,
          material: floorMat,
          isFixed: true,
          floorIndex: f,
        });
      });

      const winOffsetAbs = (pierWidthFrac + winSpanFrac) * 0.5;
      [-winOffsetAbs, winOffsetAbs].forEach((winOffset, wIdx) => {
        exteriorWindows.push({
          id: `win_${f}_${dir}_${wIdx}`,
          floor: f,
          wall: dir,
          position: [Number(wallX.toFixed(3)), winMidY, Number((cz + innerD * winOffset).toFixed(3))],
          scale: [Number((innerD * winSpanFrac).toFixed(3)), winH, Number((extWallThick * 0.55).toFixed(3))],
          rotationY: Math.PI / 2,
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
      } else if (room.name.includes('침실') || room.name.includes('한실') || room.name.includes('게스트')) {
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
      } else if (room.name.includes('오피스') || room.name.includes('회의') || room.name.includes('전시') || room.name.includes('서재')) {
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

  // 5. 지붕-벽체 틈새 0mm 완전 밀봉 3D 지붕 엔진 (gable_wall / wedge_wall / 고측창)
  const topY = floors * floorH;
  const roofColor = rawSpec.customRoofColor ?? '#3f3f46';
  const roofT = 0.08;
  const halfW = topFloorW * 0.5;
  const halfD = topFloorD * 0.5;
  const southWallZ = Number((topFloorCz + halfD - extWallThick * 0.5).toFixed(3));
  const northWallZ = Number((topFloorCz - halfD + extWallThick * 0.5).toFixed(3));
  const eastWallX = Number((topFloorCx + halfW - extWallThick * 0.5).toFixed(3));
  const westWallX = Number((topFloorCx - halfW + extWallThick * 0.5).toFixed(3));
  const innerDepth = Math.max(0.3, topFloorD - extWallThick * 2);
  const ov = Math.max(0.08, Math.min(0.42, overhangScale));
  const pitchRad = (Math.max(8, Math.min(36, roofPitchDeg || 20)) * Math.PI) / 180;

  if (roofStyle === 'gable' || roofStyle === 'hip-eaves') {
    const eaveOv = roofStyle === 'hip-eaves' ? ov * 1.35 : ov;
    const rise = halfW * Math.tan(pitchRad);

    // 전·후면 삼각 박공 마감벽 (지붕과 벽체 사이 삼각 빈틈 완전 밀봉)
    [southWallZ, northWallZ].forEach((wz, idx) => {
      solids.push({
        id: `roof_gable_infill_${idx}`,
        groupName: idx === 0 ? '남측 박공 마감벽' : '북측 박공 마감벽',
        partRole: 'roof_infill',
        shape: 'gable_wall',
        position: [topFloorCx, Number((topY + rise * 0.5).toFixed(3)), wz],
        scale: [topFloorW, Number(rise.toFixed(3)), extWallThick],
        color: topFloorColor,
        material: topFloorMat,
        isFixed: true,
        floorIndex: 99,
      });
    });

    // 깊은 처마 모임/한옥형일 경우 하부 목재 처마 반자(soffit) 추가
    if (roofStyle === 'hip-eaves') {
      solids.push({
        id: 'roof_hanok_eave_soffit',
        groupName: '깊은 처마 목재 반자',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.025).toFixed(3)), topFloorCz],
        scale: [
          Number((topFloorW + eaveOv * 2).toFixed(3)),
          0.05,
          Number((topFloorD + eaveOv * 2).toFixed(3)),
        ],
        color: '#b08968',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      });
    }

    const run = halfW + eaveOv;
    const slopeLen = Number((run / Math.cos(pitchRad) + 0.04).toFixed(3));
    const underY = topY + (halfW - eaveOv) * 0.5 * Math.tan(pitchRad);

    const leftMidX = topFloorCx - run * 0.5;
    const rightMidX = topFloorCx + run * 0.5;

    solids.push(
      {
        id: 'arch_roof_gable_left',
        groupName: '박공 지붕 좌측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((leftMidX - roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
          Number((underY + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLen, roofT, Number((topFloorD + eaveOv * 2).toFixed(3))],
        rotation: [0, 0, pitchRad],
        color: roofColor,
        material: roofMaterial,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_gable_right',
        groupName: '박공 지붕 우측 경사면',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((rightMidX + roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
          Number((underY + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLen, roofT, Number((topFloorD + eaveOv * 2).toFixed(3))],
        rotation: [0, 0, -pitchRad],
        color: roofColor,
        material: roofMaterial,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_ridge_beam',
        groupName: '박공 마룻대 캡',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + rise + roofT * 0.6).toFixed(3)), topFloorCz],
        scale: [0.1, 0.09, Number((topFloorD + eaveOv * 2 + 0.04).toFixed(3))],
        color: '#9c6644',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'shed') {
    const rise = topFloorW * Math.tan(pitchRad);

    // 전·후면 직각삼각 경사 마감벽(wedge_wall) + 동측 고벽체 밀봉
    [southWallZ, northWallZ].forEach((wz, idx) => {
      solids.push({
        id: `roof_shed_wedge_${idx}`,
        groupName: idx === 0 ? '남측 경사 마감벽' : '북측 경사 마감벽',
        partRole: 'roof_infill',
        shape: 'wedge_wall',
        position: [topFloorCx, Number((topY + rise * 0.5).toFixed(3)), wz],
        scale: [topFloorW, Number(rise.toFixed(3)), extWallThick],
        color: topFloorColor,
        material: topFloorMat,
        isFixed: true,
        floorIndex: 99,
      });
    });

    solids.push({
      id: 'roof_shed_east_infill',
      groupName: '동측 상부 경사 밀봉벽',
      partRole: 'roof_infill',
      shape: 'box',
      position: [eastWallX, Number((topY + rise * 0.5).toFixed(3)), topFloorCz],
      scale: [extWallThick, Number(rise.toFixed(3)), Number(innerDepth.toFixed(3))],
      color: topFloorColor,
      material: topFloorMat,
      isFixed: true,
      floorIndex: 99,
    });

    const spanW = Number(((topFloorW + ov * 2) / Math.cos(pitchRad)).toFixed(3));
    const underCenterY = topY + rise * 0.5;
    solids.push({
      id: 'arch_roof_shed',
      groupName: '모던 경사 지붕 (Shed Roof)',
      partRole: 'roof',
      shape: 'box',
      position: [
        Number((topFloorCx - roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
        Number((underCenterY + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
        topFloorCz,
      ],
      scale: [spanW, roofT, Number((topFloorD + ov * 2).toFixed(3))],
      rotation: [0, 0, pitchRad],
      color: roofColor,
      material: roofMaterial,
      isFixed: true,
      floorIndex: 99,
    });
  } else if (roofStyle === 'butterfly') {
    const rise = halfW * Math.tan(pitchRad);

    // 좌·우 날개 전·후면 wedge_wall + 동·서 외벽 상부 밀봉
    [southWallZ, northWallZ].forEach((wz, idx) => {
      solids.push(
        {
          id: `roof_bf_wedge_L_${idx}`,
          groupName: '나비형 좌측 경사 마감벽',
          partRole: 'roof_infill',
          shape: 'wedge_wall',
          position: [Number((topFloorCx - halfW * 0.5).toFixed(3)), Number((topY + rise * 0.5).toFixed(3)), wz],
          scale: [halfW, Number(rise.toFixed(3)), extWallThick],
          rotation: [0, Math.PI, 0],
          color: topFloorColor,
          material: topFloorMat,
          isFixed: true,
          floorIndex: 99,
        },
        {
          id: `roof_bf_wedge_R_${idx}`,
          groupName: '나비형 우측 경사 마감벽',
          partRole: 'roof_infill',
          shape: 'wedge_wall',
          position: [Number((topFloorCx + halfW * 0.5).toFixed(3)), Number((topY + rise * 0.5).toFixed(3)), wz],
          scale: [halfW, Number(rise.toFixed(3)), extWallThick],
          color: topFloorColor,
          material: topFloorMat,
          isFixed: true,
          floorIndex: 99,
        }
      );
    });

    [westWallX, eastWallX].forEach((wx, idx) => {
      solids.push({
        id: `roof_bf_side_${idx}`,
        groupName: idx === 0 ? '서측 나비지붕 마감벽' : '동측 나비지붕 마감벽',
        partRole: 'roof_infill',
        shape: 'box',
        position: [wx, Number((topY + rise * 0.5).toFixed(3)), topFloorCz],
        scale: [extWallThick, Number(rise.toFixed(3)), Number(innerDepth.toFixed(3))],
        color: topFloorColor,
        material: topFloorMat,
        isFixed: true,
        floorIndex: 99,
      });
    });

    const run = halfW + ov;
    const slopeLen = Number((run / Math.cos(pitchRad) + 0.03).toFixed(3));
    const underY = topY + (run * 0.5) * Math.tan(pitchRad);

    solids.push(
      {
        id: 'arch_roof_butterfly_left',
        groupName: '나비형 지붕 좌측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((topFloorCx - run * 0.5 + roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
          Number((underY + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLen, roofT, Number((topFloorD + ov * 2).toFixed(3))],
        rotation: [0, 0, -pitchRad],
        color: roofColor,
        material: roofMaterial,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_butterfly_right',
        groupName: '나비형 지붕 우측 윙',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((topFloorCx + run * 0.5 - roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
          Number((underY + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLen, roofT, Number((topFloorD + ov * 2).toFixed(3))],
        rotation: [0, 0, pitchRad],
        color: roofColor,
        material: roofMaterial,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_bf_valley',
        groupName: '나비지붕 중앙 배수거터 보',
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.04).toFixed(3)), topFloorCz],
        scale: [0.1, 0.08, Number((topFloorD + ov * 2).toFixed(3))],
        color: '#334155',
        material: 'steel',
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else if (roofStyle === 'split-gable') {
    const clerestoryH = 0.2;
    const riseL = halfW * Math.tan(pitchRad);
    const riseR = halfW * Math.tan(pitchRad * 0.85);

    // 좌측 단차 하부벽 + 삼각 마감벽 + 중앙 고측창 채광 유리 + 우측 삼각 마감벽 (빈틈 0mm)
    solids.push({
      id: 'roof_split_west_collar',
      groupName: '서측 스플릿 상부벽',
      partRole: 'roof_infill',
      shape: 'box',
      position: [westWallX, Number((topY + clerestoryH * 0.5).toFixed(3)), topFloorCz],
      scale: [extWallThick, clerestoryH, Number(innerDepth.toFixed(3))],
      color: topFloorColor,
      material: topFloorMat,
      isFixed: true,
      floorIndex: 99,
    });

    [southWallZ, northWallZ].forEach((wz, idx) => {
      solids.push(
        {
          id: `roof_split_L_base_${idx}`,
          groupName: '스플릿 좌측 상부벽',
          partRole: 'roof_infill',
          shape: 'box',
          position: [Number((topFloorCx - halfW * 0.5).toFixed(3)), Number((topY + clerestoryH * 0.5).toFixed(3)), wz],
          scale: [halfW, clerestoryH, extWallThick],
          color: topFloorColor,
          material: topFloorMat,
          isFixed: true,
          floorIndex: 99,
        },
        {
          id: `roof_split_L_wedge_${idx}`,
          groupName: '스플릿 좌측 경사 마감벽',
          partRole: 'roof_infill',
          shape: 'wedge_wall',
          position: [Number((topFloorCx - halfW * 0.5).toFixed(3)), Number((topY + clerestoryH + riseL * 0.5).toFixed(3)), wz],
          scale: [halfW, Number(riseL.toFixed(3)), extWallThick],
          color: topFloorColor,
          material: topFloorMat,
          isFixed: true,
          floorIndex: 99,
        },
        {
          id: `roof_split_R_wedge_${idx}`,
          groupName: '스플릿 우측 경사 마감벽',
          partRole: 'roof_infill',
          shape: 'wedge_wall',
          position: [Number((topFloorCx + halfW * 0.5).toFixed(3)), Number((topY + riseR * 0.5).toFixed(3)), wz],
          scale: [halfW, Number(riseR.toFixed(3)), extWallThick],
          rotation: [0, Math.PI, 0],
          color: topFloorColor,
          material: topFloorMat,
          isFixed: true,
          floorIndex: 99,
        }
      );
    });

    // 중앙 고측창 유리 밀봉벽 (좌·우 지붕 사이 단차를 채광창으로 밀봉)
    const stepGapH = Math.max(0.08, clerestoryH + riseL - riseR);
    solids.push({
      id: 'roof_split_clerestory_glass',
      groupName: '스플릿 고측창 채광 유리',
      partRole: 'roof_infill',
      shape: 'box',
      position: [topFloorCx, Number((topY + riseR + stepGapH * 0.5).toFixed(3)), topFloorCz],
      scale: [0.05, Number(stepGapH.toFixed(3)), Number(innerDepth.toFixed(3))],
      color: '#bae6fd',
      material: 'glass',
      isFixed: true,
      floorIndex: 99,
    });

    const runL = halfW + ov;
    const slopeLenL = Number((runL / Math.cos(pitchRad) + 0.03).toFixed(3));
    const underYL = topY + clerestoryH + (halfW - ov) * 0.5 * Math.tan(pitchRad);

    const pitchR = pitchRad * 0.85;
    const runR = halfW + ov;
    const slopeLenR = Number((runR / Math.cos(pitchR) + 0.03).toFixed(3));
    const underYR = topY + (halfW - ov) * 0.5 * Math.tan(pitchR);

    solids.push(
      {
        id: 'arch_roof_split_left',
        groupName: '스플릿 상부 경사 지붕',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((topFloorCx - runL * 0.5 - roofT * 0.5 * Math.sin(pitchRad)).toFixed(3)),
          Number((underYL + roofT * 0.5 * Math.cos(pitchRad)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLenL, roofT, Number((topFloorD + ov * 2).toFixed(3))],
        rotation: [0, 0, pitchRad],
        color: roofColor,
        material: roofMaterial,
        isFixed: true,
        floorIndex: 99,
      },
      {
        id: 'arch_roof_split_right',
        groupName: '스플릿 하부 경사 지붕',
        partRole: 'roof',
        shape: 'box',
        position: [
          Number((topFloorCx + runR * 0.5 + roofT * 0.5 * Math.sin(pitchR)).toFixed(3)),
          Number((underYR + roofT * 0.5 * Math.cos(pitchR)).toFixed(3)),
          topFloorCz,
        ],
        scale: [slopeLenR, roofT, Number((topFloorD + ov * 2).toFixed(3))],
        rotation: [0, 0, -pitchR],
        color: '#9c6644',
        material: 'wood',
        isFixed: true,
        floorIndex: 99,
      }
    );
  } else {
    // 캔틸레버 처마 평지붕 (완전 밀착 슬래브 + 유리 난간)
    const rW = Number((topFloorW + ov * 1.6).toFixed(3));
    const rD = Number((topFloorD + ov * 1.6).toFixed(3));
    solids.push(
      {
        id: 'arch_roof_slab',
        groupName: `캔틸레버 처마 지붕 슬래브 (${rawSpec.rooftops}개소)`,
        partRole: 'roof',
        shape: 'box',
        position: [topFloorCx, Number((topY + 0.05).toFixed(3)), topFloorCz],
        scale: [rW, 0.1, rD],
        color: rawSpec.customRoofColor ?? '#c89b6e',
        material: roofMaterial,
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

  // 6. 승강기 & 직통계단 수직 코어
  const coreCount = Math.max(1, (rawSpec.elevators || 0) + (rawSpec.stairs || 1));
  for (let k = 0; k < Math.min(3, coreCount); k++) {
    const kx = topFloorCx + topFloorW * 0.22 - k * 0.38;
    solids.push({
      id: `arch_core_${k}`,
      groupName: k === 0 && rawSpec.elevators > 0 ? '엘리베이터·계단 코어' : `직통계단 코어 #${k + 1}`,
      partRole: 'core',
      shape: 'box',
      position: [Number(kx.toFixed(3)), Number((topY * 0.5).toFixed(3)), Number((topFloorCz - topFloorD * 0.2).toFixed(3))],
      scale: [0.3, Number(topY.toFixed(3)), 0.3],
      color: '#cbd5e1',
      material: 'concrete',
      isFixed: true,
      floorIndex: 1,
    });
  }

  // 7. 수도·전기 배관 라우팅
  const basePipeY = undergroundFloors > 0 ? -0.35 * undergroundFloors : 0.08;
  const waterX = bldgOffsetX - bldgW * 0.1;
  const waterZ = bldgOffsetZ + bldgD * 0.16;
  const elecX = bldgOffsetX + bldgW * 0.12;
  const elecZ = bldgOffsetZ + bldgD * 0.16;

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
      const tz = bldgOffsetZ - bldgD * 0.42 + bldgD * 0.84 * ((room.y + room.h * 0.5) / 100);
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

  // 8. 방(세대) 디자인 유형 생성
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
        const pz = bldgOffsetZ - (bldgD * 0.82) / 2 + ud * (rIdx + 0.5);

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
      roofPitchDeg,
      overhangScale,
      windowWallRatio,
      accentMaterial,
      roofMaterial,
      interiorTheme,
      interiorWallColor,
      interiorFloorColor,
      siteShape,
      sitePolygon: polygon2D,
      siteAreaSqm: effectiveSiteSqm,
      useHouseholds,
      buildingAreaSqm: actualFootprintSqm,
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