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

export type StudioViewMode = 'exterior' | 'interior_cutaway';

export type SiteShape = 'rectangle' | 'triangle' | 'circle' | 'trapezoid' | 'custom';

/** Vision AI가 참조 사진에서 추출하는 정밀 건축 DNA */
export interface ArchitecturalDna {
  massingStyle: BuildingTemplateId;
  roofStyle: RoofStyle;
  roofPitchDeg: number; // 지붕 경사각 (0 ~ 38도)
  overhangScale: number; // 처마 돌출 비율 (0.06 ~ 0.42)
  windowWallRatio: number; // 외벽 대비 창호 비율 (0.25 ~ 0.85)
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
  role?: 'primary' | 'secondary';
}

export interface BeamMember {
  id: string;
  groupName?: string;
  startNodeId: string;
  endNodeId: string;
  stress: number;
  color?: string;
  material?: CadMaterial;
  radius?: number;
  role?: 'primary' | 'secondary';
}

export interface SolidPrimitive {
  id: string;
  groupName?: string;
  partRole?:
    | 'slab'
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
  /** 자유 변형 대지 경계 2D 꼭짓점 배열 ([x, z] 월드 좌표, 반시계/시계 폐곡선) */
  sitePolygon?: [number, number][];
  /** true이면 꼭짓점 드래그 시 기존 대지면적(siteAreaSqm)을 유지하도록 비율 보정 */
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
  activeSpecViz?: ActiveSpecVisualization | null;
}