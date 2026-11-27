import { UnitDesignType } from '../types/cad';

interface Props {
  unitType: UnitDesignType;
  onClose: () => void;
}

export default function FloorPlanViewer({ unitType, onClose }: Props) {
  const placedFloors = Array.from(new Set(unitType.placements.map((p) => p.floor))).sort(
    (a, b) => a - b
  );

  const outerOutlinePoints =
    unitType.planLayout === 'L-courtyard'
      ? '4,4 52,4 52,46 96,46 96,96 4,96'
      : unitType.planLayout === 'U-terrace'
      ? '4,8 34,8 34,64 64,64 64,8 96,8 96,96 4,96'
      : '16,10 96,10 96,30 88,30 88,94 16,94 16,80 4,80 4,22 16,22';

  const stretchX = Math.max(0.75, Math.min(1.35, unitType.aspectRatio || 1.0));

  return (
    <div className="fixed top-20 left-4 z-40 w-[330px] bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl p-3.5 shadow-xl text-slate-800">
      <div className="flex items-start justify-between border-b border-slate-200 pb-2 mb-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-sm inline-block"
              style={{ backgroundColor: unitType.color }}
            />
            <span className="font-mono text-[10px] font-bold text-sky-600 tracking-wider">
              WALLS & MEP FLOOR PLAN (3D SYNC)
            </span>
          </div>
          <h3 className="text-sm font-bold text-slate-900 mt-0.5">{unitType.name}</h3>
          <p className="text-[11px] text-slate-500">
            전용 {unitType.areaSqm}㎡ · {unitType.householdCount}세대 · 외형비율 {stretchX}x
          </p>
        </div>
        <button
          onClick={onClose}
          className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-xs text-slate-600 rounded cursor-pointer"
        >
          닫기 ✕
        </button>
      </div>

      <div className="bg-[#f8fafc] border border-slate-200 rounded-xl p-2">
        <svg viewBox="0 0 100 100" className="w-full h-[215px] select-none">
          <defs>
            <pattern id="archGridLight" width="10" height="10" patternUnits="userSpaceOnUse">
              <path
                d="M 10 0 L 0 0 0 10"
                fill="none"
                stroke="#cbd5e1"
                strokeOpacity="0.45"
                strokeWidth="0.35"
              />
            </pattern>
          </defs>
          <rect x="0" y="0" width="100" height="100" fill="url(#archGridLight)" />

          {/* 굵은 외벽(Exterior Wall) 윤곽선 */}
          <polygon
            points={outerOutlinePoints}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />

          {/* 각 실 구획 + 내벽(Interior Wall) + 외벽 창호 */}
          {unitType.rooms.map((room, idx) => {
            const isTerrace = room.liveLoadKn >= 3.0;
            return (
              <g key={idx}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={isTerrace ? '#dcfce7' : unitType.color}
                  fillOpacity={isTerrace ? 0.55 : 0.12}
                  stroke={isTerrace ? '#16a34a' : '#1e293b'}
                  strokeWidth={isTerrace ? '0.8' : '1.4'}
                  strokeDasharray={isTerrace ? '1.8 1' : undefined}
                />

                {/* 외벽 창호 심볼 */}
                {(room.windows ?? []).map((wDir, wIdx) => {
                  if (wDir === 'N') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + 2}
                        y1={room.y}
                        x2={room.x + room.w - 2}
                        y2={room.y}
                        stroke="#0284c7"
                        strokeWidth="2.2"
                      />
                    );
                  }
                  if (wDir === 'S') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + 2}
                        y1={room.y + room.h}
                        x2={room.x + room.w - 2}
                        y2={room.y + room.h}
                        stroke="#0284c7"
                        strokeWidth="2.2"
                      />
                    );
                  }
                  if (wDir === 'E') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + room.w}
                        y1={room.y + 2}
                        x2={room.x + room.w}
                        y2={room.y + room.h - 2}
                        stroke="#0284c7"
                        strokeWidth="2.2"
                      />
                    );
                  }
                  return (
                    <line
                      key={wIdx}
                      x1={room.x}
                      y1={room.y + 2}
                      x2={room.x}
                      y2={room.y + room.h - 2}
                      stroke="#0284c7"
                      strokeWidth="2.2"
                    />
                  );
                })}

                {room.hasWater && (
                  <circle cx={room.x + 3.2} cy={room.y + 3.2} r="1.4" fill="#2563eb" />
                )}
                {room.hasPower && (
                  <circle cx={room.x + room.w - 3.2} cy={room.y + 3.2} r="1.4" fill="#d97706" />
                )}

                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 + 0.8}
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="2.7"
                  fontWeight="bold"
                >
                  {room.name}
                </text>
              </g>
            );
          })}

          <polyline
            points="48,76 22,76 22,68"
            fill="none"
            stroke="#2563eb"
            strokeWidth="0.85"
            strokeDasharray="1.4 0.9"
          />
          <polyline
            points="52,76 76,76 76,34 26,34"
            fill="none"
            stroke="#d97706"
            strokeWidth="0.85"
            strokeDasharray="1.4 0.9"
          />
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-1 bg-slate-900 inline-block" /> 외벽·내벽
          <span className="w-2.5 h-1 bg-sky-600 inline-block ml-1" /> 창호
          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block ml-1" /> 수도
          <span className="w-2 h-2 rounded-full bg-amber-600 inline-block ml-1" /> 전기
        </span>
        <span className="font-mono font-bold text-sky-700">
          {placedFloors.map((f) => `${f}F`).join(', ')}
        </span>
      </div>
    </div>
  );
}