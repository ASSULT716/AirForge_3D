//(우윤상)아이언맨 HUD + 하중/프리셋 버튼
import { StructureState, CadTool, CadMaterial, CameraControlState } from '../types/cad';

interface Props {
  structure: StructureState;
  isReinforcing: boolean;
  onToggleSimulation: () => void;
  onReinforce: () => void;
  onChangeLoad: (kg: number) => void;
  onSelectTool: (tool: CadTool) => void;
  onChangeMaterial: (material: CadMaterial) => void;
  onChangeColor: (color: string) => void;
  onCameraControl: (control: CameraControlState) => void;
  onLoadPreset: (preset: StructureState) => void;
  onReset: () => void;
}

export default function HudOverlay({
  structure,
  isReinforcing,
  onToggleSimulation,
  onReinforce,
  onReset,
}: Props) {
  const maxStress = Math.round(
    structure.beams.reduce((max, b) => Math.max(max, b.stress), 0) * 100
  );

  return (
    <div className="fixed inset-0 pointer-events-none p-6 flex flex-col justify-between text-cyan-400 font-mono z-10">
      <div className="flex justify-between items-start">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button
            onClick={onToggleSimulation}
            className="px-4 py-2 border border-cyan-400 bg-black/70 hover:bg-cyan-500/20 cursor-pointer"
          >
            {structure.isSimulating ? '시뮬레이션 정지' : '중력·하중 테스트'}
          </button>
          <button
            onClick={onReinforce}
            disabled={isReinforcing}
            className="px-4 py-2 border border-cyan-400 bg-black/70 hover:bg-cyan-500/20 cursor-pointer disabled:opacity-50"
          >
            {isReinforcing ? 'AI 연산 중...' : `AI 구조 보강 (${structure.targetLoadKg}kg)`}
          </button>
          <button
            onClick={onReset}
            className="px-3 py-2 border border-red-400/60 text-red-300 bg-black/70 hover:bg-red-500/20 cursor-pointer"
          >
            초기화
          </button>
        </div>

        <div className="bg-black/70 border border-cyan-500/40 px-4 py-2 text-xs text-right space-y-1">
          <div>
            TOOL: <span className="text-white uppercase">{structure.activeTool}</span> | MAT:{' '}
            <span className="text-white uppercase">{structure.activeMaterial}</span>
          </div>
          <div>
            MAX STRESS:{' '}
            <span className={maxStress >= 60 ? 'text-red-400 font-bold' : 'text-cyan-300'}>
              {maxStress}%
            </span>
          </div>
          {structure.statusMessage && (
            <div className="text-cyan-200/80 max-w-xs truncate">{structure.statusMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}