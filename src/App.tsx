import { useState, useRef, useEffect } from 'react';
import {
  StructureState,
  NodePoint,
  CadTool,
  CadMaterial,
  CameraControlState,
  DesignCandidate,
} from './types/cad';
import { WEAK_BRIDGE_PRESET, TABLE_3D_PRESET } from './data/presets';
import SceneCanvas from './components/SceneCanvas';
import HandTracker from './components/HandTracker';
import HudOverlay from './components/HudOverlay';
import { reinforceStructure, executeNaturalCommand } from './services/aiReinforce';

const snap = (v: number) => Math.round(v * 4) / 4;

export default function App() {
  const [structure, setStructure] = useState<StructureState>({
    ...WEAK_BRIDGE_PRESET,
    chatHistory: [
      {
        id: 'welcome',
        role: 'assistant',
        text: '안녕하세요! AirForge 3D 코파일럿입니다. 만들고 싶은 구조물이나 수정할 부분을 말씀해 주세요.',
        timestamp: Date.now(),
      },
    ],
  });
  const [isReinforcing, setIsReinforcing] = useState(false);
  const [testVoiceInput, setTestVoiceInput] = useState('');
  const [isChatExpanded, setIsChatExpanded] = useState(true);
  const lastDrawnNodeIdRef = useRef<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isChatExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [structure.chatHistory?.length, structure.activeCandidates?.length, isChatExpanded]);

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
    setStructure((p) => ({ ...p, statusMessage: `AI 생각 중: "${text}"...` }));
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
          text: `좋습니다! '${cand.title}' 구성을 3D 작업실에 반영했습니다. 추가로 수정하거나 재질을 바꿀 부분이 있을까요?`,
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
            solids: (p.solids ?? []).map((s) => ({ ...s, material: activeMaterial })),
            beams: p.beams.map((b) => ({ ...b, material: activeMaterial })),
          }))
        }
        onChangeColor={(activeColor: string) =>
          setStructure((p) => ({
            ...p,
            activeColor,
            solids: (p.solids ?? []).map((s) => ({ ...s, color: activeColor })),
            beams: p.beams.map((b) => ({ ...b, color: activeColor })),
          }))
        }
        onCameraControl={(cameraControl: CameraControlState) =>
          setStructure((p) => ({ ...p, cameraControl }))
        }
        onLoadPreset={(preset) => setStructure((p) => ({ ...preset, chatHistory: p.chatHistory }))}
        onReset={() =>
          setStructure((p) => ({
            ...p,
            solids: [],
            nodes: [],
            beams: [],
            isSimulating: false,
            activeCandidates: undefined,
            cameraControl: { mode: 'free' },
            statusMessage: '캔버스 초기화 완료',
          }))
        }
      />

      {/* 확장형 대화형 AI 코파일럿 & 다중 예상 시안(Candidate) 패널 */}
      <div className="fixed bottom-4 left-4 z-50 w-[94vw] sm:w-[580px] max-h-[82vh] flex flex-col gap-2.5 bg-slate-950/90 backdrop-blur-md border border-cyan-500/50 p-4 rounded-xl font-sans text-sm text-cyan-100 shadow-2xl">
        {/* 상단 헤더 + 접기/펼치기 버튼 */}
        <div className="flex items-center justify-between border-b border-cyan-500/30 pb-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-cyan-400 tracking-wider">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            AIRFORGE AI ARCHITECT
          </div>
          <button
            onClick={() => setIsChatExpanded((prev) => !prev)}
            className="px-2.5 py-1 text-xs font-mono border border-cyan-500/40 rounded hover:bg-cyan-500/20 text-cyan-300 cursor-pointer"
          >
            {isChatExpanded ? '창 접기 ▼' : '대화창 펼치기 ▲'}
          </button>
        </div>

        {/* 대화 히스토리 (펼쳤을 때만 표시) */}
        {isChatExpanded && (
          <div className="flex-1 min-h-[180px] max-h-[42vh] overflow-y-auto space-y-2.5 pr-1.5">
            {(structure.chatHistory ?? []).map((msg) => (
              <div
                key={msg.id}
                className={`p-3 rounded-lg leading-relaxed whitespace-pre-wrap break-words ${
                  msg.role === 'user'
                    ? 'bg-cyan-950/70 border border-cyan-500/40 text-white ml-10'
                    : 'bg-slate-900/95 border border-slate-700/80 text-cyan-100 mr-4'
                }`}
              >
                <span className="font-mono font-bold text-[11px] uppercase tracking-wider block mb-1 text-cyan-400">
                  {msg.role === 'user' ? 'USER' : 'AIRFORGE AI'}
                </span>
                {msg.text}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
        )}

        {/* 애매한 명령일 때 나타나는 3가지 예상 결과물 시안 선택 카드 */}
        {isChatExpanded && structure.activeCandidates && structure.activeCandidates.length > 0 && (
          <div className="max-h-[28vh] overflow-y-auto space-y-2 border-t border-cyan-500/30 pt-2.5 pr-1">
            <div className="text-xs text-amber-300 font-bold">
              예상 결과물 시안 (클릭하여 3D 씬에 즉시 적용):
            </div>
            {structure.activeCandidates.map((cand) => (
              <button
                key={cand.id}
                onClick={() => handleApplyCandidate(cand)}
                className="w-full text-left p-2.5 rounded-lg border border-cyan-400/50 bg-cyan-950/50 hover:bg-cyan-500/25 transition cursor-pointer flex justify-between items-center gap-3"
              >
                <div className="space-y-0.5">
                  <div className="font-bold text-sm text-white">{cand.title}</div>
                  <div className="text-xs text-cyan-200/85 leading-snug">{cand.description}</div>
                </div>
                <span className="shrink-0 px-3 py-1.5 bg-cyan-500 text-black font-bold rounded text-xs">
                  적용
                </span>
              </button>
            ))}
          </div>
        )}

        {/* 빠른 테스트 칩 */}
        <div className="flex flex-wrap gap-1.5 pt-1 border-t border-slate-800">
          {['건물 세워줘', '다리만 지워', '3D 테이블 로드'].map((sample) => (
            <button
              key={sample}
              onClick={() => {
                if (sample === '3D 테이블 로드') {
                  setStructure((p) => ({ ...TABLE_3D_PRESET, chatHistory: p.chatHistory }));
                } else {
                  handleVoiceCommand(sample);
                }
              }}
              className="px-2.5 py-1 text-xs border border-cyan-500/35 rounded hover:bg-cyan-500/20 text-cyan-300 cursor-pointer"
            >
              {sample}
            </button>
          ))}
        </div>

        {/* 텍스트 명령 입력창 */}
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
            placeholder='예: "건물 세워줘", "2번 시안으로 골드 재질 적용", "다리만 지워"'
            className="flex-1 bg-black/70 border border-cyan-500/50 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-cyan-300"
          />
          <button
            onClick={() => {
              if (!isReinforcing) {
                handleVoiceCommand(testVoiceInput);
                setTestVoiceInput('');
              }
            }}
            disabled={isReinforcing}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-sm rounded-lg cursor-pointer disabled:opacity-50"
          >
            {isReinforcing ? '...' : '전송'}
          </button>
        </div>
      </div>
    </main>
  );
}