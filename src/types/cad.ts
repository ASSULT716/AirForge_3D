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

export interface SolidPrimitive {
  id: string;
  groupName?: string; // 예: "다리", "건물", "의자" (부분 삭제·수정 식별용)
  shape: SolidShape;
  position: [number, number, number];
  scale: [number, number, number];
  rotation?: [number, number, number];
  color?: string;
  material?: CadMaterial;
  isFixed?: boolean;
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
}