import { useState, useRef } from 'react';
import {
  StructureState,
  NodePoint,
  CadTool,
  CadMaterial,
  CameraControlState,
} from './types/cad';
import { WEAK_BRIDGE_PRESET, TABLE_3D_PRESET } from './data/presets';
import SceneCanvas from './components/SceneCanvas';
import HandTracker, { type HandCursorState } from './components/HandTracker';
import HudOverlay from './components/HudOverlay';
import { reinforceStructure, executeNaturalCommand } from './services/aiReinforce';
import { pushCameraZoom } from './services/cameraGesture';

const snap = (v: number) => Math.round(v * 4) / 4;

export default function App() {
  const [structure, setStructure] = useState<StructureState>(WEAK_BRIDGE_PRESET);
  const [isReinforcing, setIsReinforcing] = useState(false);
  const [testVoiceInput, setTestVoiceInput] = useState('');
  const lastDrawnNodeIdRef = useRef<string | null>(null);
  const [handCursor, setHandCursor] = useState<HandCursorState | null>(null);
  const linkFrom =
    handCursor?.chainActive && structure.activeTool === 'draw'
      ? structure.nodes.find((n) => n.id === lastDrawnNodeIdRef.current)?.position ?? null
      : null;

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

    // StrictMode는 업데이터를 두 번 실행함 → ID·연결 시작점은 업데이터 밖에서 미리 고정
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
            startNodeId: fromId,
            endNodeId: targetNode.id,
            stress: 0.2,
            color: prev.activeColor,
            material: prev.activeMaterial,
            role: 'primary',
          });
        }
        // 두 번 실행돼도 같은 값 → 안전
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

    setIsReinforcing(true);
    setStructure((p) => ({ ...p, statusMessage: `AI 해석 중: "${text}"...` }));
    try {
      const nextState = await executeNaturalCommand(text, structure);
      setStructure(nextState);
    } finally {
      setIsReinforcing(false);
    }
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
        handCursor={handCursor && { position: handCursor.position, pinching: handCursor.pinching, linkFrom }}
      />

      <HandTracker
        activeTool={structure.activeTool}
        onPinchAction={handlePinchAction}
        onVoiceCommand={handleVoiceCommand}
        onCursor={setHandCursor}
        onCameraZoom={pushCameraZoom}
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
            beams: p.beams.map((b) => ({ ...b, material: activeMaterial })),
          }))
        }
        onChangeColor={(activeColor: string) =>
          setStructure((p) => ({
            ...p,
            activeColor,
            beams: p.beams.map((b) => ({ ...b, color: activeColor })),
          }))
        }
        onCameraControl={(cameraControl: CameraControlState) =>
          setStructure((p) => ({ ...p, cameraControl }))
        }
        onLoadPreset={(preset) => setStructure(preset)}
        onReset={() =>
          setStructure((p) => ({
            ...p,
            nodes: [],
            beams: [],
            isSimulating: false,
            cameraControl: { mode: 'free' },
            statusMessage: '캔버스 초기화 완료',
          }))
        }
      />

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-black/80 border border-cyan-500/50 px-3 py-2 rounded font-mono text-xs text-cyan-300">
        <button
          onClick={() => setStructure(TABLE_3D_PRESET)}
          className="px-2 py-1 border border-cyan-500/50 hover:bg-cyan-500/20 cursor-pointer"
        >
          3D 테이블 로드
        </button>
        <input
          value={testVoiceInput}
          onChange={(e) => setTestVoiceInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleVoiceCommand(testVoiceInput);
              setTestVoiceInput('');
            }
          }}
          placeholder='명령 테스트: "반바퀴만 위로 천천히 돌려봐", "다 지우고 금색 구체 띄워봐"'
          className="w-96 bg-transparent border-b border-cyan-500/50 px-2 py-1 text-white outline-none"
        />
        <button
          onClick={() => {
            handleVoiceCommand(testVoiceInput);
            setTestVoiceInput('');
          }}
          className="px-3 py-1 bg-cyan-500 text-black font-bold cursor-pointer"
        >
          실행
        </button>
      </div>
    </main>
  );
}