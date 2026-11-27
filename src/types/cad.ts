export type CadTool = 'draw' | 'erase' | 'move' | 'deform' | 'spray';
export type CadMaterial =
  | 'hologram'
  | 'steel'
  | 'titanium'
  | 'carbon'
  | 'gold'
  | 'stucco'
  | 'wood'
  | 'concrete'
  | 'glass';
export type SolidShape = 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus';
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
  | 'twin-pavilion';

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
  x: number; // 0~100 정규화 좌표 (%)
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

export interface BuildingSpec {
  projectName: string;
  usageType: DesignCategory;
  templateId?: BuildingTemplateId;
  siteAreaSqm: number;
  buildingAreaSqm: number;
  totalFloorAreaSqm: number;
  undergroundAreaSqm: number;
  undergroundFloors: number;
  heightMeters: number;
  floors: number;
  households: number;
  unitTypeCount: number;
  unitTypes?: UnitDesignType[];
  exteriorWindows?: ExteriorWindow3D[];
  mepPipes?: MepPipe3D[];
  floorLoadsKn?: Record<number, number>;
  elevators: number;
  stairs: number;
  rooftops: number;
  gardenAreaSqm: number;
  designConcept?: string;
}

/**
 * (조원호) 회전체 원기둥 단면 (shape === 'cylinder'일 때만). 없으면 일반 원기둥.
 * 스케치업 "면 스케일"(원뿔·원뿔대·접시)과 "원형 면 오프셋 + 밀기"(컵·파이프)용
 */
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
    | 'exterior_wall'
    | 'interior_wall'
    | 'roof'
    | 'basement'
    | 'garden'
    | 'site_boundary'
    | 'core'
    | 'sculpture';
  shape: SolidShape;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: CadMaterial;
  isFixed?: boolean;
  floorIndex?: number; // -1: 지하, 1~N: 지상층, 99: 옥상
  lathe?: LatheProfile;
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

export interface ActiveSpecVisualization {
  paramKey: string;
  label: string;
  formattedValue: string;
  deltaText?: string;
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
  selectedPartId?: string | null;
  isLoadHeatmapActive?: boolean;
  showMepPipes?: boolean;
  activeSpecViz?: ActiveSpecVisualization | null;
}