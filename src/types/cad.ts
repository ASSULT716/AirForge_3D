//데이터 규격 파일 (팀장 외 수정 금지)
export interface NodePoint {
  id: string;
  position: [number, number, number]; // [x, y, z] 미터 단위 (0.25m 그리드 스냅)
  isFixed: boolean; // 바닥/벽 고정 지점 여부
}

export interface BeamMember {
  id: string;
  startNodeId: string;
  endNodeId: string;
  stress: number; // 0.0 (안전/Cyan) ~ 1.0 (파손위험/Red)
}

export interface StructureState {
  nodes: NodePoint[];
  beams: BeamMember[];
  targetLoadKg: number;
  isSimulating: boolean;
}