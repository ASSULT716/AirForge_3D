// (이현수) R3F 3D 공간 + Rapier3D 물리
import { StructureState } from '../types/cad';

interface Props {
  structure: StructureState;
  onUpdateStress: (updatedBeams: StructureState['beams']) => void;
}

export default function SceneCanvas({ structure }: Props) {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#050811] text-cyan-400">
      [3D 홀로그램 캔버스 영역 - 노드 {structure.nodes.length}개 로드됨]
    </div>
  );
}