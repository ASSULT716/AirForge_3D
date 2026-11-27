export type CadTool = 'draw' | 'erase' | 'move' | 'deform' | 'spray';
export type CadMaterial = 'hologram' | 'steel' | 'titanium' | 'carbon' | 'gold';
export type SolidShape = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus';

export interface CameraControlState {
  mode: 'free' | 'auto_rotate' | 'step_rotate' | 'preset';
  yawDeg?: number;
  pitchDeg?: number;
  speed?: number;
  zoomFactor?: number;
  preset?: 'front' | 'top' | 'iso';
  commandId?: number;
}

export interface UnitRoomZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  liveLoadKn: number;
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
  rooms: UnitRoomZone[];
  placements: UnitPlacement3D[];
}

export interface BuildingSpec {
  projectName: string;
  usageType: '단독주택' | '공동주택' | '업무·상업시설' | '복합문화시설';
  siteAreaSqm: number;           // 대지면적 (㎡)
  buildingAreaSqm: number;       // 건축면적 (㎡)
  totalFloorAreaSqm: number;     // 지상 연면적 (㎡)
  undergroundAreaSqm: number;    // 지하 연면적 (㎡)
  undergroundFloors: number;     // 지하 층수
  heightMeters: number;          // 지상 높이 (m)
  floors: number;                // 지상 층수
  households: number;            // 총 가구(세대) 수 (단독주택은 1세대 또는 다가구 세대수)
  unitTypeCount: number;         // 가구 디자인 유형 개수
  unitTypes?: UnitDesignType[];
  floorLoadsKn?: Record<number, number>;
  elevators: number;             // 엘리베이터 수
  stairs: number;                // 계단 수
  rooftops: number;              // 옥상 수
  gardenAreaSqm: number;         // 정원(조경) 면적 (㎡)
  designConcept?: string;
}

export interface SolidPrimitive {
  id: string;
  groupName?: string;
  shape: SolidShape;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: CadMaterial;
  isFixed?: boolean;
  floorIndex?: number;
}

export interface NodePoint {
  id: string;
  groupName?: string;
  position: [number, number, number];
  isFixed: boolean;
  role?: 'primary' | 'reinforcement';
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
  role?: 'primary' | 'reinforcement';
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

export interface StructureState {
  solids?: SolidPrimitive[];
  nodes: NodePoint[];
  beams: BeamMember[];
  targetLoadKg: number;
  isSimulating: boolean;
  activeTool: CadTool;
  activeColor: string;
  activeMaterial: CadMaterial;
  cameraControl: CameraControlState;
  statusMessage?: string;
  chatHistory?: ChatMessage[];
  activeCandidates?: DesignCandidate[];
  buildingSpec?: BuildingSpec;
  selectedUnitTypeId?: string | null;
  isLoadHeatmapActive?: boolean;
}