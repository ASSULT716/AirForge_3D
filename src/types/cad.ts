export type CadTool = 'draw' | 'erase' | 'move' | 'deform' | 'spray';
export type CadMaterial = 'hologram' | 'steel' | 'titanium' | 'carbon' | 'gold';

export interface CameraControlState {
  mode: 'free' | 'auto_rotate' | 'step_rotate' | 'preset';
  yawDeg?: number;
  pitchDeg?: number;
  speed?: number;
  zoomFactor?: number;
  preset?: 'front' | 'top' | 'iso';
  commandId?: number;
}

export interface NodePoint {
  id: string;
  position: [number, number, number];
  isFixed: boolean;
  role?: 'primary' | 'reinforcement';
}

export interface BeamMember {
  id: string;
  startNodeId: string;
  endNodeId: string;
  stress: number;
  color?: string;
  material?: CadMaterial;
  radius?: number;
  role?: 'primary' | 'reinforcement';
}

export interface StructureState {
  nodes: NodePoint[];
  beams: BeamMember[];
  targetLoadKg: number;
  isSimulating: boolean;
  activeTool: CadTool;
  activeColor: string;
  activeMaterial: CadMaterial;
  cameraControl: CameraControlState;
  statusMessage?: string;
}