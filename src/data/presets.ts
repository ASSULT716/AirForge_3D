//초기 테스트용 3D 교량 데이터 파일
import { StructureState } from '../types/cad';

export const WEAK_BRIDGE_PRESET: StructureState = {
  targetLoadKg: 50,
  isSimulating: false,
  nodes: [
    { id: 'n1', position: [-2, 1, 0], isFixed: true },
    { id: 'n2', position: [-1, 1, 0], isFixed: false },
    { id: 'n3', position: [0, 1, 0], isFixed: false },
    { id: 'n4', position: [1, 1, 0], isFixed: false },
    { id: 'n5', position: [2, 1, 0], isFixed: true },
  ],
  beams: [
    { id: 'b1', startNodeId: 'n1', endNodeId: 'n2', stress: 0.2 },
    { id: 'b2', startNodeId: 'n2', endNodeId: 'n3', stress: 0.85 },
    { id: 'b3', startNodeId: 'n3', endNodeId: 'n4', stress: 0.85 },
    { id: 'b4', startNodeId: 'n4', endNodeId: 'n5', stress: 0.2 },
  ],
};