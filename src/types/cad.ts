import type {
  StructuralSystemId,
  ElementMaterialSpec,
  StructuralMaterialProps,
  FloorPhysicsResult,
  StructuralAnalysisReport,
  QtoBudgetLine,
  RealisticBudgetReport,
} from '../utils/structuralPhysics';

export type {
  StructuralSystemId,
  ElementMaterialSpec,
  StructuralMaterialProps,
  FloorPhysicsResult,
  StructuralAnalysisReport,
  QtoBudgetLine,
  RealisticBudgetReport,
};

export type CadTool = 'draw' | 'erase' | 'move' | 'deform' | 'spray' | 'select';

export type CadMaterial =
  | 'stucco'
  | 'wood'
  | 'concrete'
  | 'glass'
  | 'hologram'
  | 'steel'
  | 'titanium'
  | 'carbon'
  | 'gold';

export type DesignCategory =
  | '단독주택'
  | '공동주택'
  | '업무·상업시설'
  | '복합문화시설'
  | '3D 디자인';

export type BuildingTemplateId =
  | 'L-courtyard'
  | 'U-terrace'
  | 'stepped-wing'
  | 'twin-pavilion'
  | 'bridge-cantilever'
  | 'split-gable'
  | 'atrium-ring'
  | 'mono-loft'
  | 'courtyard-hanok'
  | 'stacked-cube';

export type RoofStyle =
  | 'flat-overhang'
  | 'gable'
  | 'shed'
  | 'butterfly'
  | 'split-gable'
  | 'hip-eaves';

export type InteriorTheme =
  | 'warm-wood'
  | 'minimal-gallery'
  | 'industrial-loft'
  | 'japandi';

export type GlazingSpec = 'double_lowe' | 'triple_lowe' | 'curtain_wall';

export type InsulationSpec = 'eps_150' | 'pf_board_120' | 'mineral_wool_150';

/**
 * exterior: 일반 외관 뷰
 * interior_cutaway: 지붕·전면 외벽 오픈 실내 투시 뷰
 * structural_frame: 외장재 투명화 후 실제 RC/H-Beam/중목 기둥·보·기초 골조 집중 뷰
 */
export type StudioViewMode = 'exterior' | 'interior_cutaway' | 'structural_frame';

export type SiteShape = 'rectangle' | 'triangle' | 'circle' | 'trapezoid' | 'custom';

/** Vision AI가 참조 사진에서 추출하는 정밀 건축·구조·자재 DNA */
export interface ArchitecturalDna {
  massingStyle: BuildingTemplateId;
  roofStyle: RoofStyle;
  roofPitchDeg: number; // 지붕 경사각 (0 ~ 38도)
  overhangScale: number; // 처마 돌출 비율 (0.06 ~ 0.42)
  windowWallRatio: number; // 외벽 대비 창호 비율 (0.22 ~ 0.86)
  /** 사진의 유리 비중·경간·층수에 따라 강제 결정되는 안전한 주 구조체 */
  structuralSystem?: StructuralSystemId;
  glazingSpec?: GlazingSpec;
  insulationSpec?: InsulationSpec;
  /** 사진에서 판별된 실제 사용 자재 내역 (예: ["H-Beam SS275 철골 기둥·보", "삼중 로이 커튼월 유리", "적삼목 외장 루버"]) */
  materialBreakdown?: string[];
  floor1Material: CadMaterial;
  upperMaterial: CadMaterial;
  roofMaterial: CadMaterial;
  wallColor: string;
  upperWallColor: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  suggestedFloors: number;
  hasCantilever: boolean;
  hasPorchDeck: boolean;
  gardenDensity: number; // 0.6 ~ 1.6
  architecturalNote: string;
}

export interface BuildingTemplateOption {
  id: BuildingTemplateId;
  name: string;
  subtitle: string;
  concept: string;
  roofStyle: RoofStyle;
  roofPitchDeg?: number;
  overhangScale?: number;
  windowWallRatio?: number;
  structuralSystem?: StructuralSystemId;
  glazingSpec?: GlazingSpec;
  primaryMaterial: CadMaterial;
  accentMaterial: CadMaterial;
  roofMaterial?: CadMaterial;
  wallColor: string;
  upperWallColor?: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  openPlanRatio: number;
  gardenMultiplier: number;
  hasCantilever?: boolean;
  hasPorchDeck?: boolean;
  structureBadge: string;
  roofBadge: string;
  materialTags?: string[];
  isPhotoDerived?: boolean;
}

export interface CameraControlState {
  commandId?: number;
  mode: 'free' | 'auto_rotate' | 'step_rotate' | 'preset';
  preset?: 'front' | 'top' | 'iso';
  yawDeg?: number;
  pitchDeg?: number;
  speed?: number;
  zoomFactor?: number;
}

export interface NodePoint {
  id: string;
  groupName?: string;
  position: [number, number, number];
  isFixed?: boolean;
  role?: 'primary' | 'secondary' | 'reinforcement';
}

export interface BeamMember {
  id: string;
  groupName?: string;
  startNodeId: string;
  endNodeId: string;
  stress: number;
  /** KDS 물리 해석으로 산출된 실제 수요/내력비 (Demand / Capacity Ratio) */
  dcr?: number;
  axialLoadKn?: number;
  capacityKn?: number;
  deflectionMm?: number;
  color?: string;
  material?: CadMaterial;
  radius?: number;
  role?: 'primary' | 'secondary' | 'reinforcement';
}

/**
 * (조원호) 회전체 원기둥 단면 (shape === 'cylinder'일 때만). 없으면 일반 원기둥.
 * 스케치업 "면 스케일"(원뿔·원뿔대·접시)과 "원형 면 오프셋 + 밀기"(컵·파이프)용
 */
/** 솔리드 형상 (aiReinforce 등에서 사용) */
export type SolidShape = SolidPrimitive['shape'];

export interface LatheProfile {
  /** 윗면/아랫면 반지름 비율 (1 = 원기둥, 0 = 뾰족, 1보다 크면 벌어짐) */
  top: number;
  bottom: number;
  /** 오프셋으로 만든 안쪽 구멍 */
  bore?: {
    /** 구멍을 시작한 면 */
    from: 'top' | 'bottom';
    /** 테두리 두께 = 그 면 반지름 × wall (0~1) */
    wall: number;
    /** 깊이 = 높이 × depth (0 = 안쪽 원만, 1 = 관통) */
    depth: number;
  };
}

export interface SolidPrimitive {
  id: string;
  groupName?: string;
  partRole?:
    | 'slab'
    | 'structural_column'
    | 'structural_beam'
    | 'structural_footing'
    | 'exterior_wall'
    | 'interior_wall'
    | 'interior_floor'
    | 'furniture'
    | 'unit_divider'
    | 'roof'
    | 'roof_infill'
    | 'core'
    | 'basement'
    | 'garden'
    | 'sculpture'
    | 'site_boundary';
  /**
   * gable_wall: 이등변 삼각형 박공 마감벽 (박공 지붕과 벽체 사이 빈틈 밀봉)
   * wedge_wall: 직각 삼각형 경사 마감벽 (경사·나비·스플릿 지붕 측벽 빈틈 밀봉)
   */
  shape: 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus' | 'gable_wall' | 'wedge_wall';
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: CadMaterial;
  isFixed?: boolean;
  floorIndex?: number;
  /** 실제 구조역학 해석 결과 (부위별 응력비 및 커서/인스펙터 표시용 공학 근거) */
  dcr?: number;
  stressLabel?: string;
  lathe?: LatheProfile;
}

export interface DesignCandidate {
  id: string;
  title: string;
  description: string;
  solids: SolidPrimitive[];
  nodes: NodePoint[];
  beams: BeamMember[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  candidates?: DesignCandidate[];
  timestamp: number;
}

export interface UnitRoomZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  liveLoadKn: number;
  windows?: ('N' | 'S' | 'E' | 'W')[];
  hasWater?: boolean;
  hasPower?: boolean;
}

export interface UnitPlacement3D {
  floor: number;
  position: [number, number, number];
  scale: [number, number, number];
}

export interface UnitDesignType {
  id: string;
  code: string;
  name: string;
  areaSqm: number;
  householdCount: number;
  liveLoadKn: number;
  color: string;
  planLayout: BuildingTemplateId;
  aspectRatio: number;
  rooms: UnitRoomZone[];
  placements: UnitPlacement3D[];
}

export interface ExteriorWindow3D {
  id: string;
  floor: number;
  wall: 'N' | 'S' | 'E' | 'W';
  position: [number, number, number];
  scale: [number, number, number];
  rotationY: number;
}

export interface MepPipe3D {
  id: string;
  system: 'water' | 'electric';
  points: [number, number, number][];
}

export interface ActiveSpecVisualization {
  paramKey: string;
  label: string;
  formattedValue: string;
  deltaText?: string;
}

export interface BuildingSpec {
  projectName: string;
  usageType: DesignCategory;
  templateId?: BuildingTemplateId;
  selectedTemplateName?: string;
  dynamicTemplates?: BuildingTemplateOption[];
  architecturalDna?: ArchitecturalDna;
  /** 선택된 실제 주 구조 시스템 및 부위별 자재 명세 */
  structuralSystem?: StructuralSystemId;
  elementMaterials?: ElementMaterialSpec;
  /** KDS 물리 해석 결과 및 물량산출(QTO) 기반 현실적 예산 리포트 */
  structuralReport?: StructuralAnalysisReport;
  budgetReport?: RealisticBudgetReport;
  roofStyle?: RoofStyle;
  roofPitchDeg?: number;
  overhangScale?: number;
  windowWallRatio?: number;
  accentMaterial?: CadMaterial;
  roofMaterial?: CadMaterial;
  interiorTheme?: InteriorTheme;
  interiorWallColor?: string;
  interiorFloorColor?: string;
  openPlanRatio?: number;
  siteShape?: SiteShape;
  sitePolygon?: [number, number][];
  lockSiteAreaOnDrag?: boolean;
  useHouseholds?: boolean;
  siteAreaSqm: number;
  buildingAreaSqm: number;
  totalFloorAreaSqm: number;
  undergroundFloors: number;
  undergroundAreaSqm: number;
  heightMeters: number;
  floors: number;
  households: number;
  unitTypeCount: number;
  elevators: number;
  stairs: number;
  rooftops: number;
  gardenAreaSqm: number;
  designConcept?: string;
  customWallColor?: string;
  customUpperWallColor?: string;
  customRoofColor?: string;
  styleSummary?: string;
  photoCount?: number;
  analysisSource?: 'vision-ai' | 'local-fallback';
  unitTypes?: UnitDesignType[];
  exteriorWindows?: ExteriorWindow3D[];
  mepPipes?: MepPipe3D[];
  floorLoadsKn?: Record<number, number>;
}

export interface StructureState {
  nodes: NodePoint[];
  beams: BeamMember[];
  solids?: SolidPrimitive[];
  targetLoadKg: number;
  isSimulating: boolean;
  activeTool: CadTool;
  activeMaterial: CadMaterial;
  activeColor: string;
  cameraControl?: CameraControlState;
  statusMessage?: string;
  chatHistory?: ChatMessage[];
  activeCandidates?: DesignCandidate[];
  buildingSpec?: BuildingSpec;
  selectedUnitTypeId?: string | null;
  selectedPartId?: string | null;
  selectedFloorIndex?: number | null;
  isSiteEditMode?: boolean;
  isLoadHeatmapActive?: boolean;
  showMepPipes?: boolean;
  viewMode?: StudioViewMode;
  /** 시니어·접근성 친화 고대비 큰 글씨 4단계 간편 마법사 모드 */
  isSeniorMode?: boolean;
  activeSpecViz?: ActiveSpecVisualization | null;
}