import { BuildingSpec } from '../types/cad';
import { getKdsLoadRange } from '../utils/buildingEstimator';
import FloatingPanel from './FloatingPanel';

interface Props {
  spec: BuildingSpec;
  isHeatmapActive: boolean;
  onToggleHeatmap: (active: boolean) => void;
  onChangeAllFloorsLoad: (loadKn: number) => void;
  onChangeFloorLoad: (floor: number, loadKn: number) => void;
}

export default function FloorLoadPanel({
  spec,
  isHeatmapActive,
  onToggleHeatmap,
  onChangeAllFloorsLoad,
  onChangeFloorLoad,
}: Props) {
  const kds = getKdsLoadRange(spec.usageType);
  const floors = Math.max(1, spec.floors);
  const firstLoad = spec.floorLoadsKn?.[1] ?? kds.legalBaseKn;
  const sliderMaxKn = Number((kds.designCapacityKn * 1.35).toFixed(1));

  return (
    <FloatingPanel
      title="설계하중 시뮬레이터 (KDS 41 12 00)"
      subtitle="PHYSICAL LOAD & COLUMN STRESS"
      initialX={Math.max(16, window.innerWidth - 340)}
      initialY={76}
      baseWidth={320}
      zIndex={45}
    >
      <div className="space-y-2.5 text-xs text-slate-800">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-600">
            법정 기준 {kds.legalBaseKn} kN/㎡ · 한계 {kds.designCapacityKn} kN/㎡
          </span>
          <button
            type="button"
            onClick={() => onToggleHeatmap(!isHeatmapActive)}
            className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer transition border shrink-0 ${
              isHeatmapActive
                ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                : 'bg-sky-50 text-sky-800 border-sky-300 hover:bg-sky-100'
            }`}
          >
            {isHeatmapActive ? '하중 응력 표시 ON' : '하중 응력 표시 OFF'}
          </button>
        </div>

        {/* 전층 일괄 활하중 조절 */}
        <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
          <div className="flex justify-between text-[11px]">
            <span className="font-bold text-slate-700">전층 일괄 활하중 설정</span>
            <span className="font-mono font-bold text-sky-700">{firstLoad.toFixed(1)} kN/㎡</span>
          </div>
          <input
            type="range"
            min={kds.minKn}
            max={sliderMaxKn}
            step={0.5}
            value={firstLoad}
            onChange={(e) => {
              onToggleHeatmap(true);
              onChangeAllFloorsLoad(parseFloat(e.target.value));
            }}
            className="w-full h-1.5 accent-sky-600 cursor-pointer"
          />
        </div>

        {/* 층별 개별 하중 슬라이더 (하층부 기둥으로 누적 하중 전달) */}
        <div className="max-h-[28vh] overflow-y-auto pr-1 space-y-1.5">
          {Array.from({ length: floors }, (_, i) => floors - i).map((f) => {
            const loadVal = spec.floorLoadsKn?.[f] ?? kds.legalBaseKn;
            const ratio = loadVal / Math.max(0.5, kds.designCapacityKn);
            const statusText =
              ratio > 1.0 ? '한계 초과' : ratio > 0.78 ? '주의' : '안전';
            const statusColor =
              ratio > 1.0
                ? 'text-rose-600 bg-rose-50 border-rose-200'
                : ratio > 0.78
                ? 'text-amber-700 bg-amber-50 border-amber-200'
                : 'text-emerald-700 bg-emerald-50 border-emerald-200';

            return (
              <div
                key={f}
                className="p-2 rounded-lg bg-white border border-slate-200 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-slate-900">지상 {f}층 ({f}F)</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono font-bold text-slate-700">
                      {loadVal.toFixed(1)} kN/㎡
                    </span>
                    <span className={`px-1.5 py-0.2 rounded border text-[10px] font-bold ${statusColor}`}>
                      {statusText}
                    </span>
                  </div>
                </div>
                <input
                  type="range"
                  min={kds.minKn}
                  max={sliderMaxKn}
                  step={0.5}
                  value={loadVal}
                  onChange={(e) => {
                    onToggleHeatmap(true);
                    onChangeFloorLoad(f, parseFloat(e.target.value));
                  }}
                  className="w-full h-1.5 accent-sky-600 cursor-pointer"
                />
              </div>
            );
          })}
        </div>

        <p className="text-[10px] text-slate-500 leading-snug">
          * 외부 정원은 하중에서 제외되며, 상부층 하중이 누적되는 하층부 수직 기둥·코어부터 붉게 가시화됩니다.
        </p>
      </div>
    </FloatingPanel>
  );
}