import { UnitDesignType } from '../types/cad';

interface Props {
  unitType: UnitDesignType;
  onClose: () => void;
}

export default function FloorPlanViewer({ unitType, onClose }: Props) {
  const placedFloors = Array.from(new Set(unitType.placements.map((p) => p.floor))).sort(
    (a, b) => a - b
  );

  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-40 w-[92vw] max-w-[440px] bg-slate-950/92 backdrop-blur-md border-2 border-cyan-400/70 rounded-2xl p-4 shadow-[0_0_40px_rgba(0,243,255,0.2)] text-slate-100">
      {/* 상단 도면 타이틀 */}
      <div className="flex items-start justify-between border-b border-cyan-500/30 pb-2.5 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: unitType.color }}
            />
            <span className="font-mono text-xs font-bold text-cyan-400 tracking-wider">
              ARCHITECTURAL FLOOR PLAN (2D)
            </span>
          </div>
          <h3 className="text-base font-bold text-white mt-0.5">{unitType.name}</h3>
          <p className="text-xs text-slate-300">
            전용면적 {unitType.areaSqm}㎡ · 총 {unitType.householdCount}세대 · KDS 활하중{' '}
            <span className="text-amber-300 font-bold">{unitType.liveLoadKn.toFixed(1)} kN/㎡</span>
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded cursor-pointer"
        >
          닫기 ✕
        </button>
      </div>

      {/* CAD 벡터 평면도 SVG */}
      <div className="bg-[#071324] border border-cyan-500/40 rounded-xl p-3">
        <svg viewBox="0 0 100 100" className="w-full h-[270px] select-none">
          {/* CAD 모눈 그리드 */}
          <defs>
            <pattern id="cadGrid" width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="#0ea5e9"
                strokeOpacity="0.14"
                strokeWidth="0.3"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#cadGrid)" />

          {/* 실별 구획 렌더링 */}
          {unitType.rooms.map((room, idx) => {
            const isBalcony = room.liveLoadKn >= 3.0;
            return (
              <g key={idx}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={isBalcony ? '#10b981' : unitType.color}
                  fillOpacity={isBalcony ? 0.16 : 0.12}
                  stroke={isBalcony ? '#34d399' : '#38bdf8'}
                  strokeWidth={isBalcony ? '0.6' : '0.9'}
                  strokeDasharray={isBalcony ? '1.5 1' : undefined}
                />
                {/* 창호 심볼 (상단 외벽) */}
                {room.y <= 5 && (
                  <line
                    x1={room.x + 3}
                    y1={room.y}
                    x2={room.x + room.w - 3}
                    y2={room.y}
                    stroke="#ffffff"
                    strokeWidth="1.4"
                  />
                )}
                {/* 실명 및 KDS 하중 표기 */}
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 - 1}
                  textAnchor="middle"
                  fill="#f8fafc"
                  fontSize="2.7"
                  fontWeight="bold"
                >
                  {room.name}
                </text>
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 + 2.8}
                  textAnchor="middle"
                  fill={isBalcony ? '#6ee7b7' : '#fbbf24'}
                  fontSize="2.3"
                >
                  {room.liveLoadKn.toFixed(1)} kN/㎡
                </text>
              </g>
            );
          })}

          {/* 외벽 두꺼운 마감선 */}
          <rect
            x="4"
            y="4"
            width="92"
            height="92"
            fill="none"
            stroke="#e2e8f0"
            strokeWidth="1.5"
          />

          {/* 현관 출입문 스윙 아크 */}
          <path
            d="M 16 96 A 7 7 0 0 1 23 89"
            fill="none"
            stroke="#fbbf24"
            strokeWidth="0.7"
            strokeDasharray="1 0.8"
          />
          <line x1="16" y1="96" x2="16" y2="89" stroke="#fbbf24" strokeWidth="0.9" />
        </svg>
      </div>

      {/* 우측 반투명 3D 건물 내 배치 위치 요약 */}
      <div className="mt-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs flex items-center justify-between gap-2">
        <span className="text-slate-300">우측 건물 내 배치 층수:</span>
        <span className="font-mono font-bold text-cyan-300">
          {placedFloors.length > 0 ? placedFloors.map((f) => `${f}F`).join(', ') : '전 층 분산 배치'}
        </span>
      </div>
    </div>
  );
}