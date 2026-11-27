import {
  StructureState,
  NodePoint,
  BeamMember,
  CadMaterial,
  SolidPrimitive,
  SolidShape,
  DesignCandidate,
  ChatMessage,
  BuildingSpec,
} from '../types/cad';
import { evaluateBuildingSpec, hydrateBuildingSpec } from '../utils/buildingEstimator';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MATERIAL_DEFAULT_COLORS: Record<CadMaterial, string> = {
  hologram: '#00f3ff',
  steel: '#e2e8f0',
  titanium: '#64748b',
  carbon: '#1e293b',
  gold: '#fbbf24',
};

function computeSceneBounds(current: StructureState) {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;

  (current.solids ?? []).forEach((s) => {
    const [x, y, z] = s.position;
    const [sx, sy, sz] = s.scale;
    minX = Math.min(minX, x - sx * 0.5);
    maxX = Math.max(maxX, x + sx * 0.5);
    minY = Math.min(minY, y - sy * 0.5);
    maxY = Math.max(maxY, y + sy * 0.5);
    minZ = Math.min(minZ, z - sz * 0.5);
    maxZ = Math.max(maxZ, z + sz * 0.5);
  });

  current.nodes.forEach((n) => {
    const [x, y, z] = n.position;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  });

  if (!Number.isFinite(minX)) {
    return { isEmpty: true, minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
  }
  return {
    isEmpty: false,
    minX: Number(minX.toFixed(2)),
    maxX: Number(maxX.toFixed(2)),
    minY: Number(minY.toFixed(2)),
    maxY: Number(maxY.toFixed(2)),
    minZ: Number(minZ.toFixed(2)),
    maxZ: Number(maxZ.toFixed(2)),
  };
}

export async function reinforceStructure(current: StructureState): Promise<StructureState> {
  return executeNaturalCommand(
    `현재 건축물의 취약 부위만 ${current.targetLoadKg}kg 하중을 견디도록 트러스 구조로 보강해줘.`,
    current
  );
}

// UI 패널에서 스크롤바·입력칸으로 한 번에 전달한 제원을 즉시 3D 건축물로 생성
// src/services/aiReinforce.ts 내 buildFromSpecUI, regenerateDesignVariation, SYSTEM_PROMPT, nextBuildingSpec 교체

export async function buildFromSpecUI(
  spec: BuildingSpec,
  current: StructureState
): Promise<StructureState> {
  const prompt = `[건축 제원 일괄 확정 생성] 프로젝트명:${spec.projectName}, 주용도:${spec.usageType}, 대지면적:${spec.siteAreaSqm}㎡, 건축면적:${spec.buildingAreaSqm}㎡, 지상연면적:${spec.totalFloorAreaSqm}㎡, 지하:${spec.undergroundFloors}개층(지하연면적:${spec.undergroundAreaSqm}㎡), 높이:${spec.heightMeters}m, 지상:${spec.floors}층, 총가구:${spec.households}세대, 가구디자인유형:${spec.unitTypeCount}종, 엘리베이터:${spec.elevators}대, 계단:${spec.stairs}개소, 옥상:${spec.rooftops}개소, 정원면적:${spec.gardenAreaSqm}㎡, 디자인컨셉:${spec.designConcept || '중정형 모던 단독주택'} 조건으로 한국 건축법과 KDS 41 12 00 하중 기준을 반영해 3D 건축물(지상 + 지하층 매스 포함)을 즉시 생성해줘.`;
  return executeNaturalCommand(prompt, { ...current, buildingSpec: spec }, spec);
}

export async function regenerateDesignVariation(current: StructureState): Promise<StructureState> {
  const spec = current.buildingSpec;
  if (!spec) {
    return executeNaturalCommand(
      '현재 건축 조건을 유지하면서 완전히 새로운 하이엔드 건축 디자인으로 다시 설계해줘.',
      current
    );
  }
  return executeNaturalCommand(
    `[동일 기준 다른 디자인 생성] 기존 건축 제원(용도:${spec.usageType}, 대지:${spec.siteAreaSqm}㎡, 지상연면적:${spec.totalFloorAreaSqm}㎡, 지하:${spec.undergroundFloors}층/${spec.undergroundAreaSqm}㎡, 높이:${spec.heightMeters}m/${spec.floors}층, 총가구:${spec.households}세대, 가구디자인유형:${spec.unitTypeCount}종, 엘리베이터:${spec.elevators}대, 계단:${spec.stairs}개소, 옥상:${spec.rooftops}개소, 정원:${spec.gardenAreaSqm}㎡)은 100% 동일하게 유지하되, 이전 디자인(${spec.designConcept || '기본형'})과는 완전히 다른 독창적이고 미학적인 3D 건축 디자인으로 건물을 다시 생성해줘.`,
    current,
    spec
  );
}

const SYSTEM_PROMPT = `You are AirForge 3D's Senior Architectural Design & Structural Code AI Copilot for professional architects and designers.

Return ONLY valid JSON matching this exact schema:
{
  "intent": "build_architecture" | "clarify_and_preview" | "delete_part" | "clear" | "replace_scene" | "add_object" | "transform_existing" | "reinforce_part" | "style_or_tool" | "camera_only",
  "assistantReply": "Natural, professional Korean response summarizing the generated architecture",
  "buildingSpec": {
    "projectName": "string",
    "usageType": "단독주택" | "공동주택" | "업무·상업시설" | "복합문화시설",
    "siteAreaSqm": number,
    "buildingAreaSqm": number,
    "totalFloorAreaSqm": number,
    "undergroundAreaSqm": number,
    "undergroundFloors": number,
    "heightMeters": number,
    "floors": number,
    "households": number,
    "unitTypeCount": number,
    "elevators": number,
    "stairs": number,
    "rooftops": number,
    "gardenAreaSqm": number,
    "designConcept": "string (e.g. 중정형 모던 단독주택)"
  } | null,
  "candidates": [],
  "deleteFilter": {
    "groupNames": ["다리"],
    "solidIds": [],
    "nodeIds": [],
    "region": "all" | "left" | "right" | "top" | "bottom" | "reinforcement"
  },
  "solids": [],
  "nodes": [],
  "beams": [],
  "activeTool": "draw" | "erase" | "move" | "deform" | "spray" | null,
  "activeMaterial": "hologram" | "steel" | "titanium" | "carbon" | "gold" | null,
  "activeColor": "#hex" | null,
  "targetLoadKg": number | null,
  "isSimulating": boolean | null,
  "camera": { "changed": boolean, "mode": "free"|"auto_rotate"|"step_rotate"|"preset", "yawDeg": number, "pitchDeg": number, "speed": number, "zoomFactor": number, "preset": "front"|"top"|"iso" }
}

DIRECT ARCHITECTURAL GENERATION RULES (NO RE-QUESTIONING):
1. NEVER ask follow-up questions for building specs! Immediately use intent: "build_architecture" whenever building creation or redesign is requested.
2. AESTHETIC KDS 41 12 00 ARCHITECTURAL GENERATION ("build_architecture"):
   - Design the structure considering Korean Building Code & KDS 41 12 00 design live loads.
   - Compose 10-18 coordinated primitives & structural columns:
     * If undergroundFloors > 0 and undergroundAreaSqm > 0: place subterranean basement foundation volumes below ground (y < 0, e.g. center y = -0.35 * undergroundFloors, scaleY = 0.7 * undergroundFloors, color "#334155") representing the underground basement structure!
     * Grounded green garden deck(s) ("#10b981", thin slab y=0.04)
     * Above-ground main architectural volumes (detached house courtyard/cantilevered volumes or multi-story stepped volumes) resting flush on y = 0 (center y = scaleY / 2)
     * Rooftop terrace slabs (rooftops count) with rooftop garden greenery ("#10b981")
     * Vertical elevator & stair core towers (elevators & stairs count)
     * Perimeter load-bearing columns (nodes & beams) scaled appropriately to support structural loads!
   - Set "groupName": "건물" on every generated element.
3. PARTIAL DELETION ("delete_part"):
   - Filter by deleteFilter.groupNames or region without wiping unrelated groups.
4. STATE PRESERVATION:
   - Leave activeMaterial, activeColor, activeTool, targetLoadKg, isSimulating as NULL unless explicitly requested.`;

export async function executeNaturalCommand(
  userPrompt: string,
  current: StructureState,
  lockedSpec?: BuildingSpec
): Promise<StructureState> {
  const userMsg: ChatMessage = {
    id: `msg_u_${Date.now()}`,
    role: 'user',
    text: userPrompt,
    timestamp: Date.now(),
  };

  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || apiKey === '여기에_API_키_입력') {
    return {
      ...current,
      statusMessage: '[.env 키 확인 필요] VITE_GROQ_API_KEY를 설정해 주세요.',
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 14000);
  const bounds = computeSceneBounds(current);

  const existingGroups = Array.from(
    new Set([
      ...(current.solids ?? []).map((s) => s.groupName).filter(Boolean),
      ...current.nodes.map((n) => n.groupName).filter(Boolean),
    ])
  );

  const recentHistory = (current.chatHistory ?? []).slice(-4).map((m) => ({
    role: m.role,
    content: m.text,
  }));

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai/gpt-oss-120b',
        reasoning_effort: 'medium',
        max_completion_tokens: 4096,
        temperature: 0.3,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT,
          },
          ...recentHistory,
          {
            role: 'user',
            content: JSON.stringify({
              command: userPrompt,
              existingGroups,
              currentBuildingSpec: lockedSpec ?? current.buildingSpec ?? null,
              sceneBounds: bounds,
              currentState: {
                activeMaterial: current.activeMaterial,
                activeColor: current.activeColor,
                solids: current.solids ?? [],
                nodes: current.nodes,
                beams: current.beams,
              },
            }),
          },
        ],
      }),
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      return {
        ...current,
        statusMessage: `[API 오류 ${response.status}] 다시 시도해 주세요.`,
      };
    }

    const data = await response.json();
    const res = JSON.parse(data.choices[0].message.content);

    const nextMaterial: CadMaterial = res.activeMaterial ?? current.activeMaterial;
    const matChanged = Boolean(res.activeMaterial && res.activeMaterial !== current.activeMaterial);
    const nextColor: string =
      res.activeColor && typeof res.activeColor === 'string' && res.activeColor.startsWith('#')
        ? res.activeColor
        : matChanged
        ? MATERIAL_DEFAULT_COLORS[nextMaterial]
        : current.activeColor;

    const mapSolids = (arr: any[]): SolidPrimitive[] =>
      (arr || []).map((s: any, idx: number) => ({
        id: String(s.id || `solid_${Date.now()}_${idx}`),
        groupName: s.groupName ? String(s.groupName) : '건물',
        shape: (['sphere', 'box', 'cylinder', 'cone', 'torus'].includes(s.shape) ? s.shape : 'box') as SolidShape,
        position: [Number(s.position?.[0] ?? 0), Number(s.position?.[1] ?? 1), Number(s.position?.[2] ?? 0)],
        scale: [Number(s.scale?.[0] ?? 1), Number(s.scale?.[1] ?? 1), Number(s.scale?.[2] ?? 1)],
        rotation: s.rotation ? [Number(s.rotation[0] ?? 0), Number(s.rotation[1] ?? 0), Number(s.rotation[2] ?? 0)] : undefined,
        color: s.color && String(s.color).startsWith('#') ? String(s.color) : nextColor,
        material: s.material ?? nextMaterial,
        isFixed: Boolean(s.isFixed),
      }));

    const mapNodes = (arr: any[]): NodePoint[] =>
      (arr || []).map((n: any) => ({
        id: String(n.id),
        groupName: n.groupName ? String(n.groupName) : '건물',
        position: [Number(n.position?.[0] ?? 0), Number(n.position?.[1] ?? 0), Number(n.position?.[2] ?? 0)],
        isFixed: Boolean(n.isFixed),
        role: n.role === 'reinforcement' ? 'reinforcement' : 'primary',
      }));

    const mapBeams = (arr: any[], validIds: Set<string>): BeamMember[] =>
      (arr || [])
        .filter((b: any) => validIds.has(b.startNodeId) && validIds.has(b.endNodeId))
        .map((b: any) => ({
          id: String(b.id),
          groupName: b.groupName ? String(b.groupName) : '건물',
          startNodeId: String(b.startNodeId),
          endNodeId: String(b.endNodeId),
          stress: Math.max(0.05, Math.min(1, Number(b.stress ?? 0.2))),
          color: nextColor,
          material: nextMaterial,
          role: b.role === 'reinforcement' ? 'reinforcement' : 'primary',
        }));

    let nextSolids: SolidPrimitive[] = current.solids ?? [];
    let nextNodes: NodePoint[] = current.nodes;
    let nextBeams: BeamMember[] = current.beams;
    let nextCandidates: DesignCandidate[] | undefined = undefined;

    let nextBuildingSpec: BuildingSpec | undefined = lockedSpec
      ? {
          ...lockedSpec,
          designConcept: res.buildingSpec?.designConcept
            ? String(res.buildingSpec.designConcept)
            : lockedSpec.designConcept,
        }
      : res.buildingSpec
      ? {
          projectName: String(res.buildingSpec.projectName || 'AirForge 모던 단독주택'),
          usageType: res.buildingSpec.usageType || '단독주택',
          siteAreaSqm: Number(res.buildingSpec.siteAreaSqm || 450),
          buildingAreaSqm: Number(res.buildingSpec.buildingAreaSqm || 210),
          totalFloorAreaSqm: Number(res.buildingSpec.totalFloorAreaSqm || 420),
          undergroundAreaSqm: Number(res.buildingSpec.undergroundAreaSqm ?? 180),
          undergroundFloors: Number(res.buildingSpec.undergroundFloors ?? 1),
          heightMeters: Number(res.buildingSpec.heightMeters || 10),
          floors: Number(res.buildingSpec.floors || 2),
          households: Number(res.buildingSpec.households || 1),
          unitTypeCount: Number(res.buildingSpec.unitTypeCount || 2),
          unitTypes: current.buildingSpec?.unitTypes,
          floorLoadsKn: current.buildingSpec?.floorLoadsKn,
          elevators: Number(res.buildingSpec.elevators ?? 0),
          stairs: Number(res.buildingSpec.stairs || 1),
          rooftops: Number(res.buildingSpec.rooftops || 1),
          gardenAreaSqm: Number(res.buildingSpec.gardenAreaSqm || 80),
          designConcept: res.buildingSpec.designConcept ? String(res.buildingSpec.designConcept) : undefined,
        }
      : current.buildingSpec;

    let assistantText = String(res.assistantReply || '명령을 처리했습니다.');

    if (res.intent === 'build_architecture') {
      nextSolids = mapSolids(res.solids);
      nextNodes = mapNodes(res.nodes);
      const validIds = new Set(nextNodes.map((n) => n.id));
      nextBeams = mapBeams(res.beams, validIds);

      if (nextBuildingSpec) {
        nextBuildingSpec = hydrateBuildingSpec(nextBuildingSpec, nextSolids);
        const report = evaluateBuildingSpec(nextBuildingSpec, nextMaterial);
        const eok = (report.totalMaterialCost / 100000000).toFixed(1);
        assistantText += `\n\n[KDS 건축법·자재비 자동 산출]\n• 세대 구성: 총 ${nextBuildingSpec.households}세대 (${nextBuildingSpec.unitTypeCount}개 디자인 유형 — 아래에서 평면도/배치 선택)\n• 법정 부설주차장: 필수 ${report.requiredParkingCount}대 (${report.requiredParkingAreaSqm.toLocaleString()}㎡)\n• 총 예상 자재비: 약 ${eok}억 원`;
      }
    } else if (res.intent === 'delete_part') {
      const df = res.deleteFilter || {};
      const targetGroups: string[] = (df.groupNames || []).map((g: string) => g.toLowerCase());
      const targetSolidIds = new Set<string>(df.solidIds || []);
      const targetNodeIds = new Set<string>(df.nodeIds || []);
      const region: string = df.region || 'all';

      const matchesGroup = (g?: string) => {
        if (!g || targetGroups.length === 0) return false;
        const lower = g.toLowerCase();
        return targetGroups.some((tg) => lower.includes(tg) || tg.includes(lower));
      };

      const matchesRegion = (pos: [number, number, number], role?: string) => {
        if (region === 'reinforcement') return role === 'reinforcement';
        if (region === 'left') return pos[0] < -0.2;
        if (region === 'right') return pos[0] > 0.2;
        if (region === 'top') return pos[1] > 1.2;
        if (region === 'bottom') return pos[1] <= 0.5;
        return false;
      };

      nextSolids = nextSolids.filter(
        (s) => !targetSolidIds.has(s.id) && !matchesGroup(s.groupName) && !matchesRegion(s.position)
      );

      const removedNodeIds = new Set<string>();
      nextNodes = nextNodes.filter((n) => {
        const shouldRemove =
          targetNodeIds.has(n.id) || matchesGroup(n.groupName) || matchesRegion(n.position, n.role);
        if (shouldRemove) removedNodeIds.add(n.id);
        return !shouldRemove;
      });

      nextBeams = nextBeams.filter(
        (b) =>
          !removedNodeIds.has(b.startNodeId) &&
          !removedNodeIds.has(b.endNodeId) &&
          !matchesGroup(b.groupName) &&
          !(region === 'reinforcement' && b.role === 'reinforcement')
      );
    } else if (res.intent === 'clear') {
      nextSolids = [];
      nextNodes = [];
      nextBeams = [];
      nextBuildingSpec = undefined;
    } else if (res.intent === 'replace_scene' || res.intent === 'transform_existing') {
      nextSolids = mapSolids(res.solids);
      nextNodes = mapNodes(res.nodes);
      const validIds = new Set(nextNodes.map((n) => n.id));
      nextBeams = mapBeams(res.beams, validIds);
      if (nextBuildingSpec) {
        nextBuildingSpec = hydrateBuildingSpec(nextBuildingSpec, nextSolids);
      }
    } else if (res.intent === 'add_object') {
      const addedSolids = mapSolids(res.solids);
      const addedNodes = mapNodes(res.nodes);
      const allNodes = [...nextNodes, ...addedNodes];
      const validIds = new Set(allNodes.map((n) => n.id));
      const addedBeams = mapBeams(res.beams, validIds);
      nextSolids = [...nextSolids, ...addedSolids];
      nextNodes = allNodes;
      nextBeams = [...nextBeams, ...addedBeams];
    } else if (res.intent === 'style_or_tool' || matChanged || Boolean(res.activeColor)) {
      nextSolids = nextSolids.map((s) =>
        s.color === '#10b981' ? s : { ...s, material: nextMaterial, color: nextColor }
      );
      nextBeams = nextBeams.map((b) => ({ ...b, material: nextMaterial, color: nextColor }));
    }

    const assistantMsg: ChatMessage = {
      id: `msg_a_${Date.now()}`,
      role: 'assistant',
      text: assistantText,
      candidates: nextCandidates,
      timestamp: Date.now(),
    };

    const cam = res.camera;
    const nextCamera =
      cam && cam.changed
        ? {
            mode: cam.mode || 'free',
            yawDeg: Number(cam.yawDeg ?? 0),
            pitchDeg: Number(cam.pitchDeg ?? 0),
            speed: Number(cam.speed ?? 1.0),
            zoomFactor: Number(cam.zoomFactor ?? 1.0),
            preset: cam.preset || 'iso',
            commandId: Date.now(),
          }
        : current.cameraControl;

    return {
      ...current,
      solids: nextSolids,
      nodes: nextNodes,
      beams: nextBeams,
      buildingSpec: nextBuildingSpec,
      selectedUnitTypeId: res.intent === 'clear' ? null : current.selectedUnitTypeId,
      activeTool: res.activeTool ?? current.activeTool,
      activeMaterial: nextMaterial,
      activeColor: nextColor,
      targetLoadKg:
        typeof res.targetLoadKg === 'number' && res.targetLoadKg > 0
          ? res.targetLoadKg
          : current.targetLoadKg,
      isSimulating:
        typeof res.isSimulating === 'boolean' ? res.isSimulating : current.isSimulating,
      cameraControl: nextCamera,
      statusMessage: assistantText.split('\n')[0],
      chatHistory: [...(current.chatHistory ?? []), userMsg, assistantMsg].slice(-14),
      activeCandidates: nextCandidates,
    };
  } catch {
    clearTimeout(timeoutId);
    return {
      ...current,
      statusMessage: '[네트워크 지연] 명령을 다시 실행해 주세요.',
    };
  }
}