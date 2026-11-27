import { UnitDesignType } from '../types/cad';
import FloatingPanel from './FloatingPanel';

interface Props {
  unitType: UnitDesignType;
  onClose: () => void;
}

export default function FloorPlanViewer({ unitType, onClose }: Props) {
  const placedFloors = Array.from(new Set(unitType.placements.map((p) => p.floor))).sort(
    (a, b) => a - b
  );
  const stretchX = Math.max(0.68, Math.min(1.42, unitType.aspectRatio || 1.0));

  // 각 방의 상대 면적 비율에 따라 실제 ㎡ 수치 산출
  const totalBoxArea = unitType.rooms.reduce((acc, r) => acc + r.w * r.h, 0) || 1;

  // 생성된 방들의 바운딩 박스를 계산해 건물 가로·세로 비례와 일치하는 외벽 폴리곤 생성
  const minX = Math.min(...unitType.rooms.map((r) => r.x));
  const minY = Math.min(...unitType.rooms.map((r) => r.y));
  const maxX = Math.max(...unitType.rooms.map((r) => r.x + r.w));
  const maxY = Math.max(...unitType.rooms.map((r) => r.y + r.h));

  return (
    <FloatingPanel
      title={unitType.name}
      subtitle={`전용 ${unitType.areaSqm}㎡ · ${unitType.householdCount}세대 · 건물비례 ${stretchX}x`}
      initialX={16}
      initialY={68}
      baseWidth={345}
      zIndex={46}
      onClose={onClose}
    >
      <div className="bg-[#f8fafc] border border-slate-200 rounded-xl p-2">
        <svg viewBox="0 0 100 100" className="w-full h-[225px] select-none">
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

          {/* 건물 실제 비율에 연동된 외벽 외곽선 */}
          <rect
            x={minX}
            y={minY}
            width={Math.max(10, maxX - minX)}
            height={Math.max(10, maxY - minY)}
            fill="#ffffff"
            stroke="#0f172a"
            strokeWidth="2.3"
          />

          {/* 동적 재설계된 각 실 구획 + 실별 면적(㎡) + 창호 + 수도·전기 노드 */}
          {unitType.rooms.map((room, idx) => {
            const isTerrace = room.liveLoadKn >= 3.0;
            const roomSqm = Math.max(
              2,
              Math.round((unitType.areaSqm * (room.w * room.h)) / totalBoxArea)
            );

            return (
              <g key={idx}>
                <rect
                  x={room.x}
                  y={room.y}
                  width={room.w}
                  height={room.h}
                  fill={isTerrace ? '#dcfce7' : unitType.color}
                  fillOpacity={isTerrace ? 0.55 : 0.13}
                  stroke={isTerrace ? '#16a34a' : '#1e293b'}
                  strokeWidth={isTerrace ? '0.8' : '1.35'}
                  strokeDasharray={isTerrace ? '1.8 1' : undefined}
                />

                {(room.windows ?? []).map((wDir, wIdx) => {
                  if (wDir === 'N') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + 1.5}
                        y1={room.y}
                        x2={room.x + room.w - 1.5}
                        y2={room.y}
                        stroke="#0284c7"
                        strokeWidth="2.1"
                      />
                    );
                  }
                  if (wDir === 'S') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + 1.5}
                        y1={room.y + room.h}
                        x2={room.x + room.w - 1.5}
                        y2={room.y + room.h}
                        stroke="#0284c7"
                        strokeWidth="2.1"
                      />
                    );
                  }
                  if (wDir === 'E') {
                    return (
                      <line
                        key={wIdx}
                        x1={room.x + room.w}
                        y1={room.y + 1.5}
                        x2={room.x + room.w}
                        y2={room.y + room.h - 1.5}
                        stroke="#0284c7"
                        strokeWidth="2.1"
                      />
                    );
                  }
                  return (
                    <line
                      key={wIdx}
                      x1={room.x}
                      y1={room.y + 1.5}
                      x2={room.x}
                      y2={room.y + room.h - 1.5}
                      stroke="#0284c7"
                      strokeWidth="2.1"
                    />
                  );
                })}

                {room.hasWater && (
                  <circle cx={room.x + 2.8} cy={room.y + 2.8} r="1.35" fill="#2563eb" />
                )}
                {room.hasPower && (
                  <circle cx={room.x + room.w - 2.8} cy={room.y + 2.8} r="1.35" fill="#d97706" />
                )}

                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 - 0.4}
                  textAnchor="middle"
                  fill="#0f172a"
                  fontSize="2.5"
                  fontWeight="bold"
                >
                  {room.name}
                </text>
                <text
                  x={room.x + room.w / 2}
                  y={room.y + room.h / 2 + 2.6}
                  textAnchor="middle"
                  fill="#0369a1"
                  fontSize="2.2"
                  fontWeight="bold"
                >
                  {roomSqm}㎡
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-600 px-1">
        <span className="flex items-center gap-1">
          <span className="w-2.5 h-1 bg-slate-900 inline-block" /> 내·외벽
          <span className="w-2.5 h-1 bg-sky-600 inline-block ml-1" /> 창호
          <span className="w-2 h-2 rounded-full bg-blue-600 inline-block ml-1" /> 수도
          <span className="w-2 h-2 rounded-full bg-amber-600 inline-block ml-1" /> 전기
        </span>
        <span className="font-mono font-bold text-sky-700">
          3D 위치: {placedFloors.map((f) => `${f}F`).join(', ')} ({unitType.placements.length}개소)
        </span>
      </div>
    </FloatingPanel>
  );
}