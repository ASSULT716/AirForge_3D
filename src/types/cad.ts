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
  | 'courtyard-pavilion'
  | 'cantilever-studio'
  | 'gable-garden';

export type RoofStyle =
  | 'flat-overhang'
  | 'gable'
  | 'shed'
  | 'butterfly'
  | 'split-gable';

export type InteriorTheme =
  | 'warm-wood'
  | 'minimal-gallery'
  | 'industrial-loft'
  | 'japandi';

export type StudioViewMode = 'exterior' | 'interior_cutaway';

export type SiteShape =
  | 'rectangle'
  | 'triangle'
  | 'circle'
  | 'trapezoid'
  | 'freeform';

export interface SitePoint2D {
  x: number;
  z: number;
}

export interface BuildingTemplateOption {
  id: BuildingTemplateId;
  name: string;
  subtitle: string;
  concept: string;
  roofStyle: RoofStyle;
  primaryMaterial: CadMaterial;
  accentMaterial: CadMaterial;
  wallColor: string;
  roofColor: string;
  interiorTheme: InteriorTheme;
  interiorWallColor: string;
  interiorFloorColor: string;
  openPlanRatio: number;
  gardenMultiplier: number;
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
    | 'core'
    | 'basement'
    | 'garden'
    | 'sculpture'
    | 'site_boundary';
  shape: 'box' | 'sphere' | 'cone' | 'cylinder' | 'torus';
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
  roofStyle?: RoofStyle;
  accentMaterial?: CadMaterial;
  interiorTheme?: InteriorTheme;
  interiorWallColor?: string;
  interiorFloorColor?: string;
  openPlanRatio?: number;
  siteShape?: SiteShape;
  customSitePoints?: SitePoint2D[];
  isSiteDrawingActive?: boolean;
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
  customRoofColor?: string;
  styleSummary?: string;
  photoCount?: number;
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
  isLoadHeatmapActive?: boolean;
  showMepPipes?: boolean;
  viewMode?: StudioViewMode;
  activeSpecViz?: ActiveSpecVisualization | null;
}