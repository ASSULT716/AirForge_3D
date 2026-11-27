import { CadMaterial, SolidPrimitive } from '../types/cad';
import { estimateSinglePartCost, MATERIAL_CATALOG } from '../utils/buildingEstimator';
import FloatingPanel from './FloatingPanel';

interface Props {
  part: SolidPrimitive;
  defaultMaterial: CadMaterial;
  totalFloors: number;
  selectedFloorIndex: number | null;
  onSelectWholeFloor: (floorIndex: number | null) => void;
  onUpdateWholeFloor: (
    floorIndex: number,
    patch: { material?: CadMaterial; color?: string }
  ) => void;
  onUpdatePart: (updated: SolidPrimitive) => void;
  onDeletePart: (partId: string) => void;
  onClose: () => void;
}

const SELECTABLE_MATERIALS: CadMaterial[] = [
  'stucco',
  'wood',
  'concrete',
  'glass',
  'steel',
  'titanium',
  'gold',
];

export default function PartInspector({
  part,
  defaultMaterial,
  totalFloors,
  selectedFloorIndex,
  onSelectWholeFloor,
  onUpdateWholeFloor,
  onUpdatePart,
  onDeletePart,
  onClose,
}: Props) {
  const activeMat = part.material ?? defaultMaterial ?? 'stucco';
  const costInfo = estimateSinglePartCost(part, defaultMaterial);
  const isWholeFloorMode = selectedFloorIndex !== null;

  const handleScaleChange = (axisIdx: 0 | 1 | 2, newVal: number) => {
    const safeVal = Math.max(0.05, Math.min(12, newVal));
    const nextScale: [number, number, number] = [...part.scale];
    const nextPos: [number, number, number] = [...part.position];

    // 지면에 닿아 있는 부위는 높이(Y) 조절 시 바닥(y=0)에 계속 밀착되도록 중심 Y 자동 보정
    if (
      axisIdx === 1 &&
      part.position[1] >= 0 &&
      Math.abs(part.position[1] - part.scale[1] * 0.5) < 0.08
    ) {
      nextPos[1] = Number((safeVal * 0.5).toFixed(3));
    }

    nextScale[axisIdx] = Number(safeVal.toFixed(2));
    onUpdatePart({
      ...part,
      scale: nextScale,
      position: nextPos,
    });
  };

  const panelTitle = isWholeFloorMode
    ? selectedFloorIndex === 99
      ? '옥상층 전체 일괄 선택됨'
      : `지상 ${selectedFloorIndex}층 전체 일괄 선택됨`
    : `선택 부위: ${part.groupName || '건축 매스'} (${part.id})`;

  return (
    <FloatingPanel
      title={panelTitle}
      subtitle="PART & FLOOR INSPECTOR"
      initialX={Math.max(16, window.innerWidth - 340)}
      initialY={76}
      baseWidth={320}
      zIndex={48}
      onClose={() => {
        onSelectWholeFloor(null);
        onClose();
      }}
    >
      <div className="space-y-3 text-slate-800">
        {/* 층별 전체 일괄 선택 바 */}
        <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-sky-900">층 단위 일괄 선택</span>
            {isWholeFloorMode && (
              <button
                type="button"
                onClick={() => onSelectWholeFloor(null)}
                className="text-[10px] font-bold text-sky-700 underline cursor-pointer"
              >
                개별 요소로 복귀
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: Math.max(1, totalFloors) }, (_, i) => i + 1).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => onSelectWholeFloor(selectedFloorIndex === f ? null : f)}
                className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold border cursor-pointer transition ${
                  selectedFloorIndex === f
                    ? 'bg-sky-600 text-white border-sky-600'
                    : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
                }`}
              >
                {f}층 전체
              </button>
            ))}
            <button
              type="button"
              onClick={() => onSelectWholeFloor(selectedFloorIndex === 99 ? null : 99)}
              className={`px-2 py-0.5 rounded font-mono text-[10.5px] font-bold border cursor-pointer transition ${
                selectedFloorIndex === 99
                  ? 'bg-sky-600 text-white border-sky-600'
                  : 'bg-white text-slate-700 border-slate-300 hover:border-sky-400'
              }`}
            >
              옥상 전체
            </button>
          </div>
        </div>

        {/* 선택 부위 개별 산출 비용 (개별 요소 모드일 때 표시) */}
        {!isWholeFloorMode && (
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold text-slate-900">선택 부위 예상 자재비</div>
              <div className="text-[10px] text-slate-600">추정 물량 {costInfo.volumeM3} ㎥</div>
            </div>
            <div className="font-mono font-extrabold text-sm text-sky-700">
              {costInfo.costKrw.toLocaleString()} 원
            </div>
          </div>
        )}

        {/* 부위 또는 층 전체 마감 재질 선택 */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-700 block">
            {isWholeFloorMode
              ? `${selectedFloorIndex === 99 ? '옥상' : `${selectedFloorIndex}층`} 전체 마감 재질 일괄 변경`
              : '부위 마감 재질 변경'}
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {SELECTABLE_MATERIALS.map((matKey) => {
              const info = MATERIAL_CATALOG[matKey];
              const isSelected = !isWholeFloorMode && activeMat === matKey;
              return (
                <button
                  key={matKey}
                  type="button"
                  onClick={() => {
                    if (isWholeFloorMode && selectedFloorIndex !== null) {
                      onUpdateWholeFloor(selectedFloorIndex, {
                        material: matKey,
                        color: info.hex,
                      });
                    } else {
                      onUpdatePart({
                        ...part,
                        material: matKey,
                        color: info.hex,
                      });
                    }
                  }}
                  className={`p-1.5 rounded-lg border text-left text-[11px] flex items-center gap-1.5 cursor-pointer transition ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 font-bold shadow-sm'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-sky-400'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-slate-400 shrink-0"
                    style={{ backgroundColor: info.hex }}
                  />
                  <span className="truncate">{info.label.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 부위 크기 실시간 조절 (개별 요소 선택 시) */}
        {!isWholeFloorMode && (
          <div className="space-y-2 border-t border-slate-200 pt-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-slate-700">
                부위 치수 조절 (창호·배관·평면 연동)
              </span>
            </div>

            {(
              [
                { idx: 0, label: '가로 폭 (Width)', val: part.scale[0] },
                { idx: 1, label: '높이 (Height)', val: part.scale[1] },
                { idx: 2, label: '깊이 (Depth)', val: part.scale[2] },
              ] as const
            ).map((item) => (
              <div key={item.idx} className="space-y-0.5">
                <div className="flex justify-between text-[11px]">
                  <span className="text-slate-600">{item.label}</span>
                  <span className="font-mono font-bold text-slate-900">
                    {(item.val * 2.8).toFixed(1)} m
                  </span>
                </div>
                <input
                  type="range"
                  min={0.1}
                  max={8.0}
                  step={0.05}
                  value={item.val}
                  onChange={(e) => handleScaleChange(item.idx, parseFloat(e.target.value))}
                  className="w-full h-1.5 accent-sky-600 cursor-pointer"
                />
              </div>
            ))}
          </div>
        )}

        {!isWholeFloorMode && (
          <button
            type="button"
            onClick={() => onDeletePart(part.id)}
            className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-xs rounded-lg cursor-pointer transition"
          >
            이 부위만 삭제
          </button>
        )}
      </div>
    </FloatingPanel>
  );
}