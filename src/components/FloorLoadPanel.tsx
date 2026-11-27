import { BuildingSpec } from '../types/cad';
import { getKdsLoadRange } from '../utils/buildingEstimator';

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
  const range = getKdsLoadRange(spec.usageType);
  const floors = Math.max(1, spec.floors);
  const floorList = Array.from({ length: floors }, (_, i) => floors - i);

  const currentValues = floorList.map(
    (f) => spec.floorLoadsKn?.[f] ?? range.legalBaseKn
  );
  const avgLoad =
    currentValues.reduce((a, b) => a + b, 0) / Math.max(1, currentValues.length);
  const safetyReservePct = Math.max(
    0,
    Math.round(((range.designCapacityKn - avgLoad) / range.designCapacityKn) * 100)
  );

  return (
    <div className="fixed top-20 right-4 z-40 w-[290px] max-h-[64vh] flex flex-col gap-2 bg-white/95 backdrop-blur-md border border-slate-300 p-3 rounded-2xl text-xs text-slate-800 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 pb-2">
        <div>
          <div className="font-mono text-[10px] text-sky-600 font-bold tracking-wider">
            KDS 41 12 00 STRUCTURAL SAFETY
          </div>
          <div className="font-bold text-sm text-slate-900">층별 설계하중 시뮬레이터</div>
        </div>
        <button
          onClick={() => onToggleHeatmap(!isHeatmapActive)}
          className={`px-2.5 py-1 rounded-lg font-bold text-[11px] cursor-pointer transition ${
            isHeatmapActive
              ? 'bg-rose-600 text-white shadow-sm'
              : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
          }`}
        >
          {isHeatmapActive ? '투명 히트맵 ON' : '투명 히트맵 OFF'}
        </button>
      </div>

      {/* 여유 안전율(1.5x) 게이지 & 화이트 -> 레드 컬러 바 */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-slate-600">
          <span>여유 (안전율 {safetyReservePct}%)</span>
          <span>법정최대 ({range.legalMaxKn.toFixed(1)})</span>
          <span className="text-rose-600 font-bold">극한 ({range.ultimateLimitKn.toFixed(1)})</span>
        </div>
        <div
          className="h-2.5 w-full rounded-full border border-slate-300"
          style={{
            background:
              'linear-gradient(90deg, #ffffff 0%, #fef9c3 48%, #fb923c 76%, #ef4444 100%)',
          }}
        />
        <div className="text-[10px] text-slate-500 leading-snug">{range.standardNote}</div>
      </div>

      {/* 전 층 통합 하중 스크롤바 */}
      <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
        <div className="flex justify-between items-center">
          <span className="font-bold text-slate-800">전 층 통합 하중</span>
          <span className="font-mono font-bold text-sky-700">
            평균 {avgLoad.toFixed(1)} kN/㎡ (여유 {safetyReservePct}%)
          </span>
        </div>
        <input
          type="range"
          min={range.minKn}
          max={range.ultimateLimitKn}
          step={0.1}
          value={Number(avgLoad.toFixed(1))}
          onChange={(e) => {
            onToggleHeatmap(true);
            onChangeAllFloorsLoad(parseFloat(e.target.value));
          }}
          className="w-full accent-sky-600 cursor-pointer"
        />
      </div>

      {/* 층별 개별 하중 스크롤바 */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {floorList.map((floorNum) => {
          const val = spec.floorLoadsKn?.[floorNum] ?? range.legalBaseKn;
          const isOverCapacity = val > range.designCapacityKn;
          return (
            <div
              key={floorNum}
              className="p-1.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col gap-1"
            >
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-mono font-bold text-slate-800">{floorNum}F</span>
                <span
                  className={`font-mono font-bold ${
                    isOverCapacity ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {val.toFixed(1)} kN/㎡ {isOverCapacity ? '⚠ 한계초과' : '✓ 여유'}
                </span>
              </div>
              <input
                type="range"
                min={range.minKn}
                max={range.ultimateLimitKn}
                step={0.1}
                value={val}
                onChange={(e) => {
                  onToggleHeatmap(true);
                  onChangeFloorLoad(floorNum, parseFloat(e.target.value));
                }}
                className="w-full h-1.5 accent-sky-600 cursor-pointer"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}