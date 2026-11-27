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
  const floorList = Array.from({ length: floors }, (_, i) => floors - i); // 최상층부터 1층 순

  const currentValues = floorList.map(
    (f) => spec.floorLoadsKn?.[f] ?? range.legalBaseKn
  );
  const avgLoad =
    currentValues.reduce((a, b) => a + b, 0) / Math.max(1, currentValues.length);

  return (
    <div className="fixed top-20 right-4 z-40 w-[300px] max-h-[68vh] flex flex-col gap-2.5 bg-slate-950/90 backdrop-blur-md border border-cyan-500/45 p-3.5 rounded-xl text-xs text-slate-100 shadow-2xl">
      {/* 헤더 & 반투명 히트맵 토글 */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div>
          <div className="font-mono text-[10px] text-cyan-400 font-bold tracking-wider">
            KDS 41 12 00 LOAD ANALYZER
          </div>
          <div className="font-bold text-sm text-white">층별 설계하중 시뮬레이터</div>
        </div>
        <button
          onClick={() => onToggleHeatmap(!isHeatmapActive)}
          className={`px-2.5 py-1 rounded font-bold text-[11px] cursor-pointer transition ${
            isHeatmapActive
              ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,0.6)]'
              : 'bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:bg-slate-700'
          }`}
        >
          {isHeatmapActive ? '투명 히트맵 ON' : '투명 히트맵 OFF'}
        </button>
      </div>

      {/* 하얀색 -> 빨간색 하중 부담 컬러 레전드 */}
      <div className="space-y-1">
        <div className="flex justify-between text-[10px] text-slate-300">
          <span>여유 (0 kN/㎡)</span>
          <span>법정최대 ({range.legalMaxKn.toFixed(1)} kN/㎡)</span>
          <span className="text-rose-400 font-bold">위험 ({range.ultimateLimitKn.toFixed(1)})</span>
        </div>
        <div
          className="h-2.5 w-full rounded-full border border-slate-700"
          style={{
            background:
              'linear-gradient(90deg, #ffffff 0%, #fef08a 40%, #f97316 72%, #ff1e42 100%)',
          }}
        />
        <div className="text-[10px] text-slate-400 leading-snug">{range.standardNote}</div>
      </div>

      {/* 전 층 통합 하중 스크롤바 */}
      <div className="p-2.5 rounded-lg bg-slate-900/90 border border-cyan-500/30 space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="font-bold text-cyan-300">전 층 통합 하중 조절</span>
          <span className="font-mono font-bold text-amber-300">
            평균 {avgLoad.toFixed(1)} kN/㎡ ({Math.round(avgLoad * 102)} kgf/㎡)
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
          className="w-full accent-rose-500 cursor-pointer"
        />
        <div className="flex justify-between text-[10px] text-slate-400 font-mono">
          <span>0.0</span>
          <span className="text-emerald-400">기본 {range.legalBaseKn.toFixed(1)}</span>
          <span className="text-amber-400">법정최대 {range.legalMaxKn.toFixed(1)}</span>
          <span className="text-rose-400">극한 {range.ultimateLimitKn.toFixed(1)}</span>
        </div>
      </div>

      {/* 층별 개별 하중 스크롤바 리스트 */}
      <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
        {floorList.map((floorNum) => {
          const val = spec.floorLoadsKn?.[floorNum] ?? range.legalBaseKn;
          const isOverLegal = val > range.legalMaxKn;
          return (
            <div
              key={floorNum}
              className="p-2 rounded bg-slate-900/70 border border-slate-800 flex flex-col gap-1"
            >
              <div className="flex justify-between items-center text-[11px]">
                <span className="font-mono font-bold text-white">
                  {floorNum}F {floorNum === 1 ? '(저층/공용)' : floorNum === floors ? '(최상층)' : ''}
                </span>
                <span
                  className={`font-mono font-bold ${
                    isOverLegal ? 'text-rose-400' : 'text-cyan-300'
                  }`}
                >
                  {val.toFixed(1)} kN/㎡ {isOverLegal ? '⚠ 초과' : ''}
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
                className="w-full h-1.5 accent-cyan-400 cursor-pointer"
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}