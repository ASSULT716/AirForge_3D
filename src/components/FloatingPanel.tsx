import React, { useRef, useState } from 'react';

interface FloatingPanelProps {
  title: string;
  subtitle?: string;
  initialX: number;
  initialY: number;
  baseWidth: number;
  zIndex?: number;
  onClose?: () => void;
  headerRightExtra?: React.ReactNode;
  children: React.ReactNode;
}

export default function FloatingPanel({
  title,
  subtitle,
  initialX,
  initialY,
  baseWidth,
  zIndex = 45,
  onClose,
  headerRightExtra,
  children,
}: FloatingPanelProps) {
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const [viewMode, setViewMode] = useState<'minimized' | 'normal' | 'expanded'>('normal');
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(
    null
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      origX: pos.x,
      origY: pos.y,
    };

    const handleMove = (ev: PointerEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startX;
      const dy = ev.clientY - dragRef.current.startY;
      const nextX = Math.max(8, Math.min(window.innerWidth - 220, dragRef.current.origX + dx));
      const nextY = Math.max(8, Math.min(window.innerHeight - 60, dragRef.current.origY + dy));
      setPos({ x: nextX, y: nextY });
    };

    const handleUp = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  };

  const currentWidth =
    viewMode === 'minimized'
      ? Math.min(280, baseWidth)
      : viewMode === 'expanded'
      ? Math.min(window.innerWidth - 24, Math.round(baseWidth * 1.28))
      : Math.min(window.innerWidth - 24, baseWidth);

  return (
    <div
      style={{
        left: pos.x,
        top: pos.y,
        width: currentWidth,
        zIndex,
      }}
      className="fixed bg-white/95 backdrop-blur-md border border-slate-300 rounded-2xl shadow-xl text-slate-800 flex flex-col transition-[width] duration-150"
    >
      {/* 드래그 가능한 상단 타이틀 바 */}
      <div
        onPointerDown={handlePointerDown}
        title="드래그하여 창 위치 이동"
        className="flex items-center justify-between px-3 py-2 border-b border-slate-200 bg-slate-50/90 rounded-t-2xl cursor-grab active:cursor-grabbing select-none"
      >
        <div className="min-w-0 pr-2">
          {subtitle && (
            <span className="font-mono text-[9.5px] font-bold text-sky-600 tracking-wider block truncate">
              {subtitle}
            </span>
          )}
          <div className="text-xs font-bold text-slate-900 truncate flex items-center gap-1.5">
            <span className="text-slate-400 text-[10px]">⋮⋮</span>
            <span>{title}</span>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {headerRightExtra}
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'minimized' ? 'normal' : 'minimized'))}
            title={viewMode === 'minimized' ? '창 펼치기' : '창 축소(최소화)'}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-white hover:bg-slate-200 border border-slate-300 rounded text-slate-700 cursor-pointer"
          >
            {viewMode === 'minimized' ? '□' : '–'}
          </button>
          <button
            type="button"
            onClick={() => setViewMode((m) => (m === 'expanded' ? 'normal' : 'expanded'))}
            title={viewMode === 'expanded' ? '기본 크기로 복원' : '창 확대'}
            className="px-1.5 py-0.5 text-[10px] font-mono bg-white hover:bg-sky-100 border border-slate-300 rounded text-sky-700 cursor-pointer"
          >
            {viewMode === 'expanded' ? '축소' : '확대'}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="px-1.5 py-0.5 text-[10px] bg-slate-200 hover:bg-rose-100 hover:text-rose-700 rounded text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 본문 영역 */}
      {viewMode !== 'minimized' && (
        <div
          className={`p-3 overflow-y-auto ${
            viewMode === 'expanded' ? 'max-h-[84vh]' : 'max-h-[74vh]'
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}