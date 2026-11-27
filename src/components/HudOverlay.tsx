//(우윤상)아이언맨 HUD + 하중/프리셋 버튼
import { StructureState } from '../types/cad';

interface Props {
  structure: StructureState;
  isReinforcing: boolean;
  onToggleSimulation: () => void;
  onReinforce: () => void;
  onChangeLoad: (kg: number) => void;
  onLoadPreset: (preset: StructureState) => void;
  onReset: () => void;
}

export default function HudOverlay({ structure, onToggleSimulation, onReinforce }: Props) {
  return (
    <div className="fixed inset-0 pointer-events-none p-6 flex flex-col justify-between text-cyan-400 font-mono">
      <div className="pointer-events-auto flex gap-2">
        <button onClick={onToggleSimulation} className="px-4 py-2 border border-cyan-400 bg-black/60">
          {structure.isSimulating ? '시뮬레이션 정지' : '중력·하중 테스트'}
        </button>
        <button onClick={onReinforce} className="px-4 py-2 border border-cyan-400 bg-black/60">
          AI 구조 보강 ({structure.targetLoadKg}kg)
        </button>
      </div>
    </div>
  );
}