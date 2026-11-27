import { useState, useRef, useEffect } from 'react';
import {
  StructureState,
  NodePoint,
  CadTool,
  CadMaterial,
  CameraControlState,
  DesignCandidate,
  BuildingSpec,
} from './types/cad';
import { WEAK_BRIDGE_PRESET } from './data/presets';
import SceneCanvas from './components/SceneCanvas';
import HandTracker from './components/HandTracker';
import HudOverlay from './components/HudOverlay';
import QuotationModal from './components/QuotationModal';
import FloorPlanViewer from './components/FloorPlanViewer';
import FloorLoadPanel from './components/FloorLoadPanel';
import BuildingSpecBuilder from './components/BuildingSpecBuilder';
import {
  reinforceStructure,
  executeNaturalCommand,
  regenerateDesignVariation,
  buildFromSpecUI,
} from './services/aiReinforce';
import { downloadStructureAsSTL } from './utils/exportStl';

const snap = (v: number) => Math.round(v * 4) / 4;

export default function App() {
  const [structure, setStructure] = useState<StructureState>({
    ...WEAK_BRIDGE_PRESET,
    chatHistory: [
      {
        id: 'welcome',
        role: 'assistant',
        text: '건축 제원 설정 패널에서 면적·높이·가구 수·가구 디자인 유형 수·엘리베이터·계단·옥상·정원 면적을 한 번에 조정해 3D 건축물을 생성하세요.',
        timestamp: Date.now(),
      },
    ],
  });
  const [isReinforcing, setIsReinforcing] = useState(false);
  const [testVoiceInput, setTestVoiceInput] = useState('');
  const [isSpecBuilderOpen, setIsSpecBuilderOpen] = useState(true);
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const [quotationSnapshot, setQuotationSnapshot] = useState<string | null>(null);
  const [isQuotationOpen, setIsQuotationOpen] = useState(false);
  const lastDrawnNodeIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isChatExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [structure.chatHistory?.length, structure.activeCandidates?.length, isChatExpanded]);

  const selectedUnitType =
    structure.buildingSpec?.unitTypes?.find((u) => u.id === structure.selectedUnitTypeId) ?? null;

  const handleSubmitBuildingSpec = async (spec: BuildingSpec) => {
    if (isReinforcing) return;
    setIsReinforcing(true);
    setStructure((p) => ({
      ...p,
      statusMessage: `'${spec.projectName}' 건축법·KDS 하중 반영 3D 설계 생성 중...`,
    }));
    try {
      const nextState = await buildFromSpecUI(spec, structure);
      setStructure(nextState);
      setIsSpecBuilderOpen(false);
    } finally {
      setIsReinforcing(false);
    }
  };

  const handleOpenQuotation = () => {
    const canvasEl = document.querySelector('canvas');
    const dataUrl = canvasEl ? canvasEl.toDataURL('image/png') : null;
    setQuotationSnapshot(dataUrl);
    setIsQuotationOpen(true);
  };

  const handleRedesignSameSpec = async () => {
    if (isReinforcing) return;
    setIsChatExpanded(true);
    setIsReinforcing(true);
    setStructure((p) => ({
      ...p,
      statusMessage: '동일 제원 기반 새로운 건축 디자인 생성 중...',
    }));
    try {
      const nextState = await regenerateDesignVariation(structure);
      setStructure(nextState);
    } finally {
      setIsReinforcing(false);
    }
  };

  const handlePinchAction = (
    tool: CadTool,
    rawPos: [number, number, number],
    isNewStroke = false
  ) => {
    const pos: [number, number, number] = [
      snap(rawPos[0]),
      Math.max(0, snap(rawPos[1])),
      snap(rawPos[2]),
    ];

    setStructure((prev) => {
      if (tool === 'draw') {
        const existing = prev.nodes.find(
          (n) =>
            Math.hypot(n.position[0] - pos[0], n.position[1] - pos[1], n.position[2] - pos[2]) <
            0.15
        );
        const targetNode: NodePoint = existing ?? {
          id: `node_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          groupName: '스케치',
          position: pos,
          isFixed: pos[1] <= 0.05,
          role: 'primary',
        };

        const nextNodes = existing ? prev.nodes : [...prev.nodes, targetNode];
        const nextBeams = [...prev.beams];

        if (
          !isNewStroke &&
          lastDrawnNodeIdRef.current &&
          lastDrawnNodeIdRef.current !== targetNode.id
        ) {
          const prevNode = nextNodes.find((n) => n.id === lastDrawnNodeIdRef.current);
          if (prevNode) {
            nextBeams.push({
              id: `beam_${Date.now()}`,
              groupName: '스케치',
              startNodeId: prevNode.id,
              endNodeId: targetNode.id,
              stress: 0.2,
              color: prev.activeColor,
              material: prev.activeMaterial,
              role: 'primary',
            });
          }
        }
        lastDrawnNodeIdRef.current = targetNode.id;
        return { ...prev, nodes: nextNodes, beams: nextBeams };
      }

      if (tool === 'erase') {
        const targetNode = prev.nodes.find(
          (n) =>
            Math.hypot(n.position[0] - pos[0], n.position[1] - pos[1], n.position[2] - pos[2]) <
            0.35
        );
        if (!targetNode) return prev;
        return {
          ...prev,
          nodes: prev.nodes.filter((n) => n.id !== targetNode.id),
          beams: prev.beams.filter(
            (b) => b.startNodeId !== targetNode.id && b.endNodeId !== targetNode.id
          ),
        };
      }

      if (tool === 'move') {
        let nearestId: string | null = null;
        let minDist = 0.45;
        prev.nodes.forEach((n) => {
          if (n.isFixed) return;
          const d = Math.hypot(
            n.position[0] - pos[0],
            n.position[1] - pos[1],
            n.position[2] - pos[2]
          );
          if (d < minDist) {
            minDist = d;
            nearestId = n.id;
          }
        });
        if (!nearestId) return prev;
        return {
          ...prev,
          nodes: prev.nodes.map((n) => (n.id === nearestId ? { ...n, position: pos } : n)),
        };
      }

      if (tool === 'deform') {
        const center = prev.nodes.find(
          (n) =>
            !n.isFixed &&
            Math.hypot(n.position[0] - pos[0], n.position[1] - pos[1], n.position[2] - pos[2]) < 0.5
        );
        if (!center) return prev;
        const dx = pos[0] - center.position[0];
        const dy = pos[1] - center.position[1];
        const dz = pos[2] - center.position[2];

        return {
          ...prev,
          nodes: prev.nodes.map((n) => {
            if (n.isFixed) return n;
            const d = Math.hypot(
              n.position[0] - center.position[0],
              n.position[1] - center.position[1],
              n.position[2] - center.position[2]
            );
            if (d > 1.2) return n;
            const falloff = 1 - d / 1.2;
            return {
              ...n,
              position: [
                snap(n.position[0] + dx * falloff),
                Math.max(0, snap(n.position[1] + dy * falloff)),
                snap(n.position[2] + dz * falloff),
              ],
            };
          }),
        };
      }

      if (tool === 'spray') {
        const nodeMap = new Map(prev.nodes.map((n) => [n.id, n.position]));
        return {
          ...prev,
          beams: prev.beams.map((b) => {
            const p1 = nodeMap.get(b.startNodeId);
            const p2 = nodeMap.get(b.endNodeId);
            if (!p1 || !p2) return b;
            const mid: [number, number, number] = [
              (p1[0] + p2[0]) / 2,
              (p1[1] + p2[1]) / 2,
              (p1[2] + p2[2]) / 2,
            ];
            const d = Math.hypot(mid[0] - pos[0], mid[1] - pos[1], mid[2] - pos[2]);
            if (d <= 0.65) {
              return { ...b, color: prev.activeColor, material: prev.activeMaterial };
            }
            return b;
          }),
        };
      }

      return prev;
    });
  };

  const handleVoiceCommand = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    setIsChatExpanded(true);
    setIsReinforcing(true);
    setStructure((p) => ({ ...p, statusMessage: `AI 설계 분석 중: "${text}"...` }));
    try {
      const nextState = await executeNaturalCommand(text, structure);
      setStructure(nextState);
    } finally {
      setIsReinforcing(false);
    }
  };

  const handleApplyCandidate = (cand: DesignCandidate) => {
    setStructure((prev) => ({
      ...prev,
      isSimulating: false,
      solids: cand.solids,
      nodes: cand.nodes,
      beams: cand.beams,
      activeCandidates: undefined,
      statusMessage: `[${cand.title}] 적용 완료`,
      chatHistory: [
        ...(prev.chatHistory ?? []),
        {
          id: `msg_sel_${Date.now()}`,
          role: 'assistant',
          text: `'${cand.title}' 구성을 3D 작업실에 반영했습니다.`,
          timestamp: Date.now(),
        },
      ],
    }));
  };

  const handleReinforce = async () => {
    setIsReinforcing(true);
    try {
      const reinforced = await reinforceStructure({ ...structure, isSimulating: false });
      setStructure(reinforced);
    } finally {
      setIsReinforcing(false);
    }
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#050811]">
      <SceneCanvas
        structure={structure}
        onUpdateStress={(beams) => setStructure((prev) => ({ ...prev, beams }))}
      />

      <HandTracker
        activeTool={structure.activeTool}
        onPinchAction={handlePinchAction}
        onVoiceCommand={handleVoiceCommand}
      />

      <HudOverlay
        structure={structure}
        isReinforcing={isReinforcing}
        onToggleSimulation={() => setStructure((p) => ({ ...p, isSimulating: !p.isSimulating }))}
        onReinforce={handleReinforce}
        onChangeLoad={(targetLoadKg) => setStructure((p) => ({ ...p, targetLoadKg }))}
        onSelectTool={(activeTool: CadTool) => setStructure((p) => ({ ...p, activeTool }))}
        onChangeMaterial={(activeMaterial: CadMaterial) =>
          setStructure((p) => ({
            ...p,
            activeMaterial,
            solids: (p.solids ?? []).map((s) =>
              s.color === '#10b981' ? s : { ...s, material: activeMaterial }
            ),
            beams: p.beams.map((b) => ({ ...b, material: activeMaterial })),
          }))
        }
        onChangeColor={(activeColor: string) =>
          setStructure((p) => ({
            ...p,
            activeColor,
            solids: (p.solids ?? []).map((s) =>
              s.color === '#10b981' ? s : { ...s, color: activeColor }
            ),
            beams: p.beams.map((b) => ({ ...b, color: activeColor })),
          }))
        }
        onCameraControl={(cameraControl: CameraControlState) =>
          setStructure((p) => ({ ...p, cameraControl }))
        }
        onLoadPreset={(preset) => setStructure((p) => ({ ...preset, chatHistory: p.chatHistory }))}
        onReset={() => {
          setStructure((p) => ({
            ...p,
            solids: [],
            nodes: [],
            beams: [],
            buildingSpec: undefined,
            selectedUnitTypeId: null,
            isLoadHeatmapActive: false,
            isSimulating: false,
            activeCandidates: undefined,
            cameraControl: { mode: 'free' },
            statusMessage: '캔버스 초기화 완료',
          }));
          setIsSpecBuilderOpen(true);
        }}
      />

      {/* 중앙: 좌측 하단에서 선택한 방 유형의 2D 건축 평면도 */}
      {selectedUnitType && (
        <FloorPlanViewer
          unitType={selectedUnitType}
          onClose={() => setStructure((p) => ({ ...p, selectedUnitTypeId: null }))}
        />
      )}

      {/* 우측: 한국 건축구조기준(KDS 41 12 00) 층별 하중 스크롤바 & 반투명 화이트→레드 히트맵 패널 */}
      {structure.buildingSpec && (
        <FloorLoadPanel
          spec={structure.buildingSpec}
          isHeatmapActive={Boolean(structure.isLoadHeatmapActive)}
          onToggleHeatmap={(active) =>
            setStructure((p) => ({
              ...p,
              isLoadHeatmapActive: active,
              selectedUnitTypeId: active ? null : p.selectedUnitTypeId,
            }))
          }
          onChangeAllFloorsLoad={(loadKn) =>
            setStructure((p) => {
              if (!p.buildingSpec) return p;
              const nextMap: Record<number, number> = {};
              for (let f = 1; f <= p.buildingSpec.floors; f++) {
                nextMap[f] = loadKn;
              }
              return {
                ...p,
                buildingSpec: { ...p.buildingSpec, floorLoadsKn: nextMap },
              };
            })
          }
          onChangeFloorLoad={(floor, loadKn) =>
            setStructure((p) => {
              if (!p.buildingSpec) return p;
              return {
                ...p,
                buildingSpec: {
                  ...p.buildingSpec,
                  floorLoadsKn: {
                    ...(p.buildingSpec.floorLoadsKn ?? {}),
                    [floor]: loadKn,
                  },
                },
              };
            })
          }
        />
      )}

      {/* 우측 하단: 동일 기준 다른 디자인 뽑기 & 견적서·STL 출력 바 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col sm:flex-row gap-2 bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 p-3 rounded-xl shadow-2xl">
        <button
          onClick={handleRedesignSameSpec}
          disabled={isReinforcing}
          className="px-3.5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 transition"
        >
          같은 기준으로 다른 디자인 뽑기
        </button>
        <button
          onClick={handleOpenQuotation}
          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs rounded-lg cursor-pointer transition"
        >
          건축 견적서·법규 리포트 출력
        </button>
        <button
          onClick={() => downloadStructureAsSTL(structure)}
          className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs rounded-lg cursor-pointer transition"
        >
          3D 프린터 설계도 (.STL) 저장
        </button>
      </div>

      {/* 좌측 하단: 일괄 건축 제원 입력 패널 + 방 디자인 유형 선택기 + 후속 수정 채팅창 */}
      <div className="fixed bottom-4 left-4 z-50 w-[94vw] sm:w-[480px] max-h-[85vh] flex flex-col gap-2.5 bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 p-3.5 rounded-xl font-sans text-sm text-cyan-100 shadow-2xl">
        {/* 초반 일괄 제원 입력 패널 (열려 있을 때 표시) */}
        {isSpecBuilderOpen && (
          <BuildingSpecBuilder
            initialSpec={structure.buildingSpec}
            isGenerating={isReinforcing}
            onSubmitSpec={handleSubmitBuildingSpec}
            onClose={structure.buildingSpec ? () => setIsSpecBuilderOpen(false) : undefined}
          />
        )}

        {/* 방(세대) 디자인 유형 선택기 */}
        {structure.buildingSpec?.unitTypes && structure.buildingSpec.unitTypes.length > 0 && (
          <div className="bg-slate-900/95 border border-cyan-500/40 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-bold text-cyan-300">
                방(세대) 디자인 유형 선택 (중앙 평면도 + 우측 3D 배치)
              </span>
              {structure.selectedUnitTypeId && (
                <button
                  onClick={() => setStructure((p) => ({ ...p, selectedUnitTypeId: null }))}
                  className="text-amber-300 hover:underline cursor-pointer"
                >
                  선택 해제
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {structure.buildingSpec.unitTypes.map((ut) => {
                const isSelected = structure.selectedUnitTypeId === ut.id;
                return (
                  <button
                    key={ut.id}
                    onClick={() =>
                      setStructure((p) => ({
                        ...p,
                        selectedUnitTypeId: isSelected ? null : ut.id,
                        isLoadHeatmapActive: false,
                      }))
                    }
                    className={`p-2 rounded-lg border text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/25 border-cyan-300 shadow-[0_0_12px_rgba(34,211,238,0.35)]'
                        : 'bg-slate-950/80 border-slate-700 hover:border-cyan-500/50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: ut.color }}
                      />
                      <span className="font-mono font-bold text-xs text-white">{ut.code}</span>
                    </div>
                    <div className="text-[11px] text-slate-300 truncate mt-0.5">
                      {ut.areaSqm}㎡ · {ut.householdCount}세대
                    </div>
                    <div className="text-[10px] font-mono text-amber-300">
                      하중 {ut.liveLoadKn.toFixed(1)} kN/㎡
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* AI 코파일럿 헤더 + 제원 패널 열기 버튼 */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-1.5">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-400 tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            AIRFORGE AI ARCHITECT
          </div>
          <div className="flex items-center gap-1.5">
            {!isSpecBuilderOpen && (
              <button
                onClick={() => setIsSpecBuilderOpen(true)}
                className="px-2 py-0.5 text-xs font-bold bg-cyan-500/20 border border-cyan-400/50 rounded hover:bg-cyan-500/35 text-cyan-200 cursor-pointer"
              >
                제원 설정 패널 열기
              </button>
            )}
            <button
              onClick={() => setIsChatExpanded((prev) => !prev)}
              className="px-2 py-0.5 text-xs font-mono border border-cyan-500/40 rounded hover:bg-cyan-500/20 text-cyan-300 cursor-pointer"
            >
              {isChatExpanded ? '접기 ▼' : '펼치기 ▲'}
            </button>
          </div>
        </div>

        {/* 후속 수정 대화 로그 (제원 패널이 닫혀 있을 때 넓게 표시) */}
        {isChatExpanded && !isSpecBuilderOpen && (
          <div className="flex-1 min-h-[120px] max-h-[26vh] overflow-y-auto space-y-2 pr-1">
            {(structure.chatHistory ?? []).map((msg) => (
              <div
                key={msg.id}
                className={`p-2.5 rounded-lg text-xs leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-cyan-950/70 border border-cyan-500/40 text-white ml-8'
                    : 'bg-slate-900/95 border border-slate-700/80 text-cyan-100 mr-2'
                }`}
              >
                <span className="font-mono font-bold text-[10px] uppercase tracking-wider block mb-0.5 text-cyan-400">
                  {msg.role === 'user' ? 'ARCHITECT' : 'AIRFORGE AI'}
                </span>
                {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {isChatExpanded && structure.activeCandidates && structure.activeCandidates.length > 0 && (
          <div className="max-h-[22vh] overflow-y-auto space-y-1.5 border-t border-cyan-500/30 pt-2 pr-1">
            {structure.activeCandidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => handleApplyCandidate(cand)}
                className="w-full text-left p-2 rounded-lg border border-cyan-400/50 bg-cyan-950/50 hover:bg-cyan-500/25 transition cursor-pointer flex justify-between items-center gap-2"
              >
                <div>
                  <div className="font-bold text-xs text-white">{cand.title}</div>
                  <div className="text-[11px] text-cyan-200/85">{cand.description}</div>
                </div>
                <span className="shrink-0 px-2.5 py-1 bg-cyan-500 text-black font-bold rounded text-[11px]">
                  적용
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 후속 세부 명령 입력창 (재질 변경, 부분 삭제, 카메라 회전 등) */}
        <div className="flex items-center gap-2">
          <input
            value={testVoiceInput}
            onChange={(e) => setTestVoiceInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !isReinforcing) {
                handleVoiceCommand(testVoiceInput);
                setTestVoiceInput('');
              }
            }}
            disabled={isReinforcing}
            placeholder='후속 수정 명령 (예: "골드 재질로 바꿔", "다리만 지워")'
            className="flex-1 bg-black/70 border border-cyan-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-cyan-300"
          />
          <button
            onClick={() => {
              if (!isReinforcing) {
                handleVoiceCommand(testVoiceInput);
                setTestVoiceInput('');
              }
            }}
            disabled={isReinforcing}
            className="px-3.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
          >
            {isReinforcing ? '...' : '전송'}
          </button>
        </div>
      </div>

      {isQuotationOpen && (
        <QuotationModal
          structure={structure}
          snapshotDataUrl={quotationSnapshot}
          onClose={() => setIsQuotationOpen(false)}
        />
      )}
    </main>
  );
}