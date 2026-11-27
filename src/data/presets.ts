import { StructureState } from '../types/cad';

export const WEAK_BRIDGE_PRESET: StructureState = {
  targetLoadKg: 50,
  isSimulating: false,
  activeTool: 'draw',
  activeColor: '#00f3ff',
  activeMaterial: 'hologram',
  cameraControl: { mode: 'free' },
  statusMessage: '일자형 교량 프리셋 로드됨',
  solids: [],
  nodes: [
    { id: 'n1', groupName: '다리', position: [-2, 1, 0], isFixed: true, role: 'primary' },
    { id: 'n2', groupName: '다리', position: [-1, 1, 0], isFixed: false, role: 'primary' },
    { id: 'n3', groupName: '다리', position: [0, 1, 0], isFixed: false, role: 'primary' },
    { id: 'n4', groupName: '다리', position: [1, 1, 0], isFixed: false, role: 'primary' },
    { id: 'n5', groupName: '다리', position: [2, 1, 0], isFixed: true, role: 'primary' },
  ],
  beams: [
    { id: 'b1', groupName: '다리', startNodeId: 'n1', endNodeId: 'n2', stress: 0.2, role: 'primary' },
    { id: 'b2', groupName: '다리', startNodeId: 'n2', endNodeId: 'n3', stress: 0.85, role: 'primary' },
    { id: 'b3', groupName: '다리', startNodeId: 'n3', endNodeId: 'n4', stress: 0.85, role: 'primary' },
    { id: 'b4', groupName: '다리', startNodeId: 'n4', endNodeId: 'n5', stress: 0.2, role: 'primary' },
  ],
};

export const TABLE_3D_PRESET: StructureState = {
  targetLoadKg: 80,
  isSimulating: false,
  activeTool: 'draw',
  activeColor: '#cbd5e1',
  activeMaterial: 'steel',
  cameraControl: { mode: 'free' },
  statusMessage: '3D 4발 테이블 프리셋 로드됨',
  solids: [],
  nodes: [
    { id: 't1', groupName: '테이블', position: [-1, 0, -0.75], isFixed: true, role: 'primary' },
    { id: 't2', groupName: '테이블', position: [1, 0, -0.75], isFixed: true, role: 'primary' },
    { id: 't3', groupName: '테이블', position: [1, 0, 0.75], isFixed: true, role: 'primary' },
    { id: 't4', groupName: '테이블', position: [-1, 0, 0.75], isFixed: true, role: 'primary' },
    { id: 't5', groupName: '테이블', position: [-1, 1.25, -0.75], isFixed: false, role: 'primary' },
    { id: 't6', groupName: '테이블', position: [1, 1.25, -0.75], isFixed: false, role: 'primary' },
    { id: 't7', groupName: '테이블', position: [1, 1.25, 0.75], isFixed: false, role: 'primary' },
    { id: 't8', groupName: '테이블', position: [-1, 1.25, 0.75], isFixed: false, role: 'primary' },
    { id: 't9', groupName: '테이블', position: [0, 1.25, 0], isFixed: false, role: 'primary' },
  ],
  beams: [
    { id: 'tb1', groupName: '테이블', startNodeId: 't1', endNodeId: 't5', stress: 0.3, role: 'primary' },
    { id: 'tb2', groupName: '테이블', startNodeId: 't2', endNodeId: 't6', stress: 0.3, role: 'primary' },
    { id: 'tb3', groupName: '테이블', startNodeId: 't3', endNodeId: 't7', stress: 0.3, role: 'primary' },
    { id: 'tb4', groupName: '테이블', startNodeId: 't4', endNodeId: 't8', stress: 0.3, role: 'primary' },
    { id: 'tb5', groupName: '테이블', startNodeId: 't5', endNodeId: 't6', stress: 0.4, role: 'primary' },
    { id: 'tb6', groupName: '테이블', startNodeId: 't6', endNodeId: 't7', stress: 0.4, role: 'primary' },
    { id: 'tb7', groupName: '테이블', startNodeId: 't7', endNodeId: 't8', stress: 0.4, role: 'primary' },
    { id: 'tb8', groupName: '테이블', startNodeId: 't8', endNodeId: 't5', stress: 0.4, role: 'primary' },
    { id: 'tb9', groupName: '테이블', startNodeId: 't5', endNodeId: 't9', stress: 0.85, role: 'primary' },
    { id: 'tb10', groupName: '테이블', startNodeId: 't7', endNodeId: 't9', stress: 0.85, role: 'primary' },
  ],
};