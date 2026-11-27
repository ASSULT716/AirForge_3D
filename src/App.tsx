//(공통) 전체 모듈 조립 메인 파일
import { useState } from 'react';
import { StructureState, NodePoint, BeamMember } from './types/cad';
import { WEAK_BRIDGE_PRESET } from './data/presets';
import SceneCanvas from './components/SceneCanvas';
import HandTracker from './components/HandTracker';
import HudOverlay from './components/HudOverlay';
import { reinforceStructure } from './services/aiReinforce';

export default function App() {
  const [structure, setStructure] = useState<StructureState>(WEAK_BRIDGE_PRESET);
  const [isReinforcing, setIsReinforcing] = useState(false);

  const handleAddElement = (node: NodePoint, beam?: BeamMember) => {
    setStructure((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
      beams: beam ? [...prev.beams, beam] : prev.beams,
    }));
  };

  const handleReinforce = async () => {
    setIsReinforcing(true);
    try {
      const reinforced = await reinforceStructure(structure);
      setStructure(reinforced);
    } finally {
      setIsReinforcing(false);
    }
  };

  const handleVoiceCommand = async (loadKg: number) => {
    const updated = { ...structure, targetLoadKg: loadKg };
    setStructure(updated);
    setIsReinforcing(true);
    try {
      const reinforced = await reinforceStructure(updated);
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
      <HandTracker onAddElement={handleAddElement} onVoiceCommand={handleVoiceCommand} />
      <HudOverlay
        structure={structure}
        isReinforcing={isReinforcing}
        onToggleSimulation={() => setStructure((p) => ({ ...p, isSimulating: !p.isSimulating }))}
        onReinforce={handleReinforce}
        onChangeLoad={(targetLoadKg) => setStructure((p) => ({ ...p, targetLoadKg }))}
        onLoadPreset={(preset) => setStructure(preset)}
        onReset={() => setStructure({ nodes: [], beams: [], targetLoadKg: 50, isSimulating: false })}
      />
    </main>
  );
}