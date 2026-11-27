//(우윤상)아이언맨 HUD + 초기화 버튼
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

export default function HudOverlay({ structure, onReset }: Props) {
  const maxStress = Math.round(
    structure.beams.reduce((max, b) => Math.max(max, b.stress), 0) * 100
  );

  return (
    <div className="fixed inset-0 pointer-events-none p-6 flex flex-col justify-between text-cyan-400 font-mono z-10">
      <div className="flex justify-between items-start">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button
            onClick={onReset}
            className="px-3.5 py-2 bg-white/95 hover:bg-rose-50 border border-slate-300 text-slate-700 hover:text-rose-700 font-bold text-xs rounded-xl shadow-sm cursor-pointer transition"
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