import { useState, useRef, useEffect, useMemo } from 'react';
import {
  StructureState,
  NodePoint,
  CadTool,
  CadMaterial,
  CameraControlState,
  DesignCandidate,
  BuildingSpec,
  SolidPrimitive,
} from './types/cad';
import { WEAK_BRIDGE_PRESET } from './data/presets';
import SceneCanvas from './components/SceneCanvas';
import HandBridge from './hand/HandBridge';
import HudOverlay from './components/HudOverlay';
import QuotationModal from './components/QuotationModal';
import FloorPlanViewer from './components/FloorPlanViewer';
import FloorLoadPanel from './components/FloorLoadPanel';
import BuildingSpecBuilder from './components/BuildingSpecBuilder';
import PartInspector from './components/PartInspector';
import FloatingPanel from './components/FloatingPanel';
import {
  reinforceStructure,
  executeNaturalCommand,
  regenerateDesignVariation,
  buildFromSpecUI,
} from './services/aiReinforce';
import { syncBuildingWithSolids } from './utils/buildingEstimator';
import { downloadStructureAsSTL } from './utils/exportStl';
import {
  generateWatertightArchitecture,
  getDefaultSpecForCategory,
} from './utils/architectureGenerator';

const snap = (v: number) => Math.round(v * 4) / 4;

export default function App() {
  const initialArch = useMemo(() => {
    const defSpec = getDefaultSpecForCategory('단독주택', 'L-courtyard');
    return generateWatertightArchitecture(defSpec, 'stucco');
  }, []);

  const [structure, setStructure] = useState<StructureState>({
    ...WEAK_BRIDGE_PRESET,
    buildingSpec: initialArch.spec,
    solids: initialArch.solids,
    nodes: initialArch.nodes,
    beams: initialArch.beams,
    activeMaterial: 'stucco',
    activeColor: '#f5f2eb',
    selectedFloorIndex: null,
    showMepPipes: false,
    viewMode: 'exterior',
    activeSpecViz: null,
    chatHistory: [
      {
        id: 'welcome',
        role: 'assistant',
        text: '기본 단독주택 템플릿이 배치되었습니다. 상단에서 원하는 집 느낌 사진을 여러 장 올리면 외벽·지붕·층별 매스·실내 벽체와 가구까지 자동으로 재설계됩니다.',
        timestamp: Date.now(),
      },
    ],
  });
  const [isReinforcing, setIsReinforcing] = useState(false);
  const [testVoiceInput, setTestVoiceInput] = useState('');
  const [isSpecBuilderOpen, setIsSpecBuilderOpen] = useState(true);
  const [isFree3DMode, setIsFree3DMode] = useState(false);
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

  const selectedPart =
    (structure.solids ?? []).find((s) => s.id === structure.selectedPartId) ?? null;

  const handleSubmitBuildingSpec = async (spec: BuildingSpec, overrideMaterial?: CadMaterial) => {
    if (isReinforcing) return;
    setIsFree3DMode(false);
    setIsReinforcing(true);
    const matToUse = overrideMaterial ?? structure.activeMaterial;
    setStructure((p) => ({
      ...p,
      activeMaterial: matToUse,
      statusMessage: `'${spec.projectName}' 건축 매스·지붕·실내 인테리어 동기화 중...`,
    }));
    try {
      const nextState = await buildFromSpecUI(spec, { ...structure, activeMaterial: matToUse });
      setStructure(nextState);
      setIsSpecBuilderOpen(false);
    } finally {
      setIsReinforcing(false);
    }
  };

  const handleSelectFree3DMode = () => {
    setIsFree3DMode(true);
    setIsSpecBuilderOpen(false);
    setIsChatExpanded(true);
    setStructure((p) => ({
      ...p,
      buildingSpec: undefined,
      selectedUnitTypeId: null,
      selectedFloorIndex: null,
      isLoadHeatmapActive: false,
      viewMode: 'exterior',
      statusMessage: '3D 디자인 (3D 프린팅·자유 조형) 대화 모드 활성화',
      chatHistory: [
        ...(p.chatHistory ?? []),
        {
          id: `msg_3d_${Date.now()}`,
          role: 'assistant',
          text: '3D 디자인 (3D 프린팅·자유 조형) 모드로 전환되었습니다. 만들고 싶은 3D 모델이나 부품을 말씀해 주세요.',
          timestamp: Date.now(),
        },
      ],
    }));
  };

  const handleUpdatePart = (updatedPart: SolidPrimitive) => {
    setStructure((prev) => {
      const nextSolids = (prev.solids ?? []).map((s) =>
        s.id === updatedPart.id ? updatedPart : s
      );
      const nextBuildingSpec = prev.buildingSpec
        ? syncBuildingWithSolids(prev.buildingSpec, nextSolids)
        : undefined;
      return {
        ...prev,
        solids: nextSolids,
        buildingSpec: nextBuildingSpec,
      };
    });
  };

  const handleDeletePart = (partId: string) => {
    setStructure((prev) => {
      const nextSolids = (prev.solids ?? []).filter((s) => s.id !== partId);
      const nextBuildingSpec =
        prev.buildingSpec && nextSolids.length > 0
          ? syncBuildingWithSolids(prev.buildingSpec, nextSolids)
          : prev.buildingSpec;
      return {
        ...prev,
        solids: nextSolids,
        buildingSpec: nextBuildingSpec,
        selectedPartId: null,
      };
    });
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
      statusMessage: '동일 제원 기반 새로운 예술 건축 디자인 생성 중...',
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
    const fromId = isNewStroke ? null : lastDrawnNodeIdRef.current;
    const uid = () => `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newNodeId = `node_${uid()}`;
    const beamId = `beam_${uid()}`;

    setStructure((prev) => {
      if (tool === 'draw') {
        const existing = prev.nodes.find(
          (n) =>
            Math.hypot(n.position[0] - pos[0], n.position[1] - pos[1], n.position[2] - pos[2]) <
            0.15
        );
        const targetNode: NodePoint = existing ?? {
          id: newNodeId,
          groupName: '스케치',
          position: pos,
          isFixed: pos[1] <= 0.05,
          role: 'primary',
        };

        const nextNodes = existing ? prev.nodes : [...prev.nodes, targetNode];
        const nextBeams = [...prev.beams];

        const duplicate = prev.beams.some(
          (b) =>
            (b.startNodeId === fromId && b.endNodeId === targetNode.id) ||
            (b.startNodeId === targetNode.id && b.endNodeId === fromId)
        );
        if (
          fromId &&
          fromId !== targetNode.id &&
          !duplicate &&
          nextNodes.some((n) => n.id === fromId)
        ) {
          nextBeams.push({
            id: beamId,
            groupName: '스케치',
            startNodeId: fromId,
            endNodeId: targetNode.id,
            stress: 0.2,
            color: prev.activeColor,
            material: prev.activeMaterial,
            role: 'primary',
          });
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
    setStructure((p) => ({ ...p, statusMessage: `AI 설계 반영 중: "${text}"...` }));
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
    <main className="relative w-screen h-screen overflow-hidden bg-[#eef2f6]">
      <SceneCanvas
        structure={structure}
        onUpdateStress={(beams) => setStructure((prev) => ({ ...prev, beams }))}
        onSelectPart={(selectedPartId) =>
          setStructure((prev) => ({
            ...prev,
            selectedPartId,
            selectedFloorIndex: null,
          }))
        }
      />

      {/* 손·음성 입력 연결점 */}
      <HandBridge
        structure={structure}
        setStructure={setStructure}
        onPinchAction={handlePinchAction}
        onVoiceCommand={handleVoiceCommand}
        lastDrawnNodeIdRef={lastDrawnNodeIdRef}
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
              s.partRole === 'garden' || s.partRole === 'interior_wall' || s.partRole === 'furniture'
                ? s
                : { ...s, material: activeMaterial }
            ),
            beams: p.beams.map((b) => ({ ...b, material: activeMaterial })),
          }))
        }
        onChangeColor={(activeColor: string) =>
          setStructure((p) => ({
            ...p,
            activeColor,
            solids: (p.solids ?? []).map((s) =>
              s.partRole === 'garden' || s.partRole === 'interior_wall' || s.partRole === 'furniture'
                ? s
                : { ...s, color: activeColor }
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
            selectedPartId: null,
            selectedFloorIndex: null,
            showMepPipes: false,
            viewMode: 'exterior',
            isLoadHeatmapActive: false,
            isSimulating: false,
            activeCandidates: undefined,
            cameraControl: { mode: 'free' },
            statusMessage: '캔버스 초기화 완료',
          }));
          if (!isFree3DMode) {
            setIsSpecBuilderOpen(true);
          }
        }}
      />

      {/* 좌측 상단: 방 유형 2D 평면도 */}
      {selectedUnitType && (
        <FloorPlanViewer
          unitType={selectedUnitType}
          onClose={() => setStructure((p) => ({ ...p, selectedUnitTypeId: null }))}
        />
      )}

      {/* 우측 상단: 개별 요소 및 층 전체 일괄 선택 인스펙터 */}
      {selectedPart && (
        <PartInspector
          part={selectedPart}
          defaultMaterial={structure.activeMaterial}
          totalFloors={structure.buildingSpec?.floors ?? 1}
          selectedFloorIndex={structure.selectedFloorIndex ?? null}
          onSelectWholeFloor={(floorIdx) =>
            setStructure((p) => ({ ...p, selectedFloorIndex: floorIdx }))
          }
          onUpdateWholeFloor={(floorIdx, patch) =>
            setStructure((p) => ({
              ...p,
              solids: (p.solids ?? []).map((s) =>
                s.floorIndex === floorIdx
                  ? {
                      ...s,
                      material: patch.material ?? s.material,
                      color: patch.color ?? s.color,
                    }
                  : s
              ),
            }))
          }
          onUpdatePart={handleUpdatePart}
          onDeletePart={handleDeletePart}
          onClose={() =>
            setStructure((p) => ({
              ...p,
              selectedPartId: null,
              selectedFloorIndex: null,
            }))
          }
        />
      )}

      {/* 우측 상단: KDS 41 12 00 하중 시뮬레이터 */}
      {!selectedPart && structure.buildingSpec && (
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

      {/* 우측 하단: 실내 투시 뷰 · 배관 투시 · 다른 디자인 뽑기 · 견적서 · STL 출력 */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-wrap gap-2 bg-white/95 backdrop-blur-md border border-slate-300 p-2.5 rounded-xl shadow-lg">
        {structure.buildingSpec && (
          <>
            <button
              onClick={() =>
                setStructure((p) => ({
                  ...p,
                  viewMode: p.viewMode === 'interior_cutaway' ? 'exterior' : 'interior_cutaway',
                  selectedUnitTypeId: null,
                  isLoadHeatmapActive: false,
                }))
              }
              className={`px-3 py-2 font-bold text-xs rounded-lg cursor-pointer transition border ${
                structure.viewMode === 'interior_cutaway'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
            >
              {structure.viewMode === 'interior_cutaway'
                ? '실내 투시 ON (지붕·전면벽 오픈)'
                : '실내 투시 보기'}
            </button>
            <button
              onClick={() => setStructure((p) => ({ ...p, showMepPipes: !p.showMepPipes }))}
              className={`px-3 py-2 font-bold text-xs rounded-lg cursor-pointer transition border ${
                structure.showMepPipes
                  ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                  : 'bg-slate-50 text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
            >
              {structure.showMepPipes ? '수도·전기 배관 투시 ON' : '수도·전기 배관 투시 OFF'}
            </button>
          </>
        )}
        <button
          onClick={handleRedesignSameSpec}
          disabled={isReinforcing}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50 transition"
        >
          같은 기준으로 다른 디자인 뽑기
        </button>
        {!isFree3DMode && (
          <button
            onClick={handleOpenQuotation}
            className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-white font-bold text-xs rounded-lg cursor-pointer transition"
          >
            건축 견적서·법규 리포트
          </button>
        )}
        <button
          onClick={() => downloadStructureAsSTL(structure)}
          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-lg cursor-pointer transition"
        >
          3D 프린터 설계도 (.STL)
        </button>
      </div>

      {/* 좌측 하단: 제원 설정 + 다중 사진 무드보드 + 방 유형 + 대화형 수정창 */}
      <FloatingPanel
        title={isFree3DMode ? '3D DESIGN & PRINTING STUDIO' : 'AIRFORGE ARCHITECT STUDIO'}
        subtitle="DRAG BAR TO MOVE · RESIZE"
        initialX={16}
        initialY={Math.max(64, window.innerHeight - 640)}
        baseWidth={480}
        zIndex={50}
        headerRightExtra={
          (!isSpecBuilderOpen || isFree3DMode) && (
            <button
              type="button"
              onClick={() => {
                setIsFree3DMode(false);
                setIsSpecBuilderOpen(true);
              }}
              className="px-2 py-0.5 text-[10.5px] font-bold bg-sky-50 border border-sky-300 rounded hover:bg-sky-100 text-sky-800 cursor-pointer"
            >
              제원·사진 설정
            </button>
          )
        }
      >
        <div className="flex flex-col gap-2 font-sans text-sm text-slate-800">
          {isSpecBuilderOpen && !isFree3DMode && (
            <BuildingSpecBuilder
              initialSpec={structure.buildingSpec}
              isGenerating={isReinforcing}
              onLivePreviewSpec={(nextSpec, activeViz, overrideMaterial) => {
                const matToUse = overrideMaterial ?? structure.activeMaterial;
                const built = generateWatertightArchitecture(nextSpec, matToUse);
                setStructure((p) => ({
                  ...p,
                  activeMaterial: matToUse,
                  buildingSpec: built.spec,
                  solids: built.solids,
                  nodes: built.nodes,
                  beams: built.beams,
                  activeSpecViz: activeViz,
                }));
              }}
              onSubmitSpec={handleSubmitBuildingSpec}
              onSelectFree3DMode={handleSelectFree3DMode}
              onClose={structure.buildingSpec ? () => setIsSpecBuilderOpen(false) : undefined}
            />
          )}

          {/* 방(세대) 디자인 유형 선택기 */}
          {structure.buildingSpec?.unitTypes && structure.buildingSpec.unitTypes.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-bold text-slate-800">
                  방 디자인 유형 (평면도 + 전체 건물 내 3D 위치 표시)
                </span>
                {structure.selectedUnitTypeId && (
                  <button
                    onClick={() => setStructure((p) => ({ ...p, selectedUnitTypeId: null }))}
                    className="text-sky-600 font-bold hover:underline cursor-pointer"
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
                          viewMode: 'exterior',
                          isLoadHeatmapActive: false,
                        }))
                      }
                      className={`p-1.5 rounded-lg border text-left transition cursor-pointer ${
                        isSelected
                          ? 'bg-sky-50 border-sky-500 shadow-sm'
                          : 'bg-white border-slate-200 hover:border-sky-300'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: ut.color }}
                        />
                        <span className="font-mono font-bold text-xs text-slate-900">{ut.code}</span>
                      </div>
                      <div className="text-[10.5px] text-slate-600 truncate mt-0.5">
                        {ut.areaSqm}㎡ · {ut.householdCount}세대
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 대화창 접기/펼치기 바 */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-1">
            <span className="font-mono text-[11px] font-bold text-sky-700">AI DESIGN CHAT</span>
            <button
              onClick={() => setIsChatExpanded((prev) => !prev)}
              className="px-2 py-0.5 text-[11px] font-mono border border-slate-300 rounded hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              {isChatExpanded ? '대화 접기 ▼' : '대화 펼치기 ▲'}
            </button>
          </div>

          {isChatExpanded && (!isSpecBuilderOpen || isFree3DMode) && (
            <div className="flex-1 min-h-[120px] max-h-[26vh] overflow-y-auto space-y-2 pr-1">
              {(structure.chatHistory ?? []).map((msg) => (
                <div
                  key={msg.id}
                  className={`p-2.5 rounded-xl text-xs leading-relaxed whitespace-pre-wrap break-words ${
                    msg.role === 'user'
                      ? 'bg-sky-600 text-white ml-8 shadow-sm'
                      : 'bg-slate-100 border border-slate-200 text-slate-800 mr-2'
                  }`}
                >
                  <span
                    className={`font-mono font-bold text-[10px] uppercase tracking-wider block mb-0.5 ${
                      msg.role === 'user' ? 'text-sky-100' : 'text-sky-700'
                    }`}
                  >
                    {msg.role === 'user' ? 'DESIGNER' : 'AIRFORGE AI'}
                  </span>
                  {msg.text}
                </div>
              ))}
              <div ref={chatEndRef} />
            </div>
          )}

          {isChatExpanded && structure.activeCandidates && structure.activeCandidates.length > 0 && (
            <div className="max-h-[20vh] overflow-y-auto space-y-1.5 border-t border-slate-200 pt-2 pr-1">
              {structure.activeCandidates.map((cand) => (
                <button
                  key={cand.id}
                  onClick={() => handleApplyCandidate(cand)}
                  className="w-full text-left p-2 rounded-lg border border-sky-300 bg-sky-50 hover:bg-sky-100 transition cursor-pointer flex justify-between items-center gap-2"
                >
                  <div>
                    <div className="font-bold text-xs text-slate-900">{cand.title}</div>
                    <div className="text-[11px] text-slate-600">{cand.description}</div>
                  </div>
                  <span className="shrink-0 px-2.5 py-1 bg-sky-600 text-white font-bold rounded text-[11px]">
                    적용
                  </span>
                </button>
              ))}
            </div>
          )}

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
              placeholder={
                isFree3DMode
                  ? '3D 프린팅 모델 생성·부분 수정 (예: "드론 프레임 만들어줘")'
                  : '부분 수정 명령 (예: "2층을 목재로 바꿔줘", "지붕 높이만 1.5배 키워줘")'
              }
              className="flex-1 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 outline-none focus:border-sky-500"
            />
            <button
              onClick={() => {
                if (!isReinforcing) {
                  handleVoiceCommand(testVoiceInput);
                  setTestVoiceInput('');
                }
              }}
              disabled={isReinforcing}
              className="px-3.5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-lg cursor-pointer disabled:opacity-50"
            >
              {isReinforcing ? '...' : '전송'}
            </button>
          </div>
        </div>
      </FloatingPanel>

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