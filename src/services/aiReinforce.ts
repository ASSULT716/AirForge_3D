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
import {
  evaluateBuildingSpec,
  MATERIAL_CATALOG,
  syncBuildingWithSolids,
} from '../utils/buildingEstimator';
import {
  generateWatertightArchitecture,
  BUILDING_TEMPLATES_BY_CATEGORY,
} from '../utils/architectureGenerator';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

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
    `현재 구조물의 취약 부위만 ${current.targetLoadKg}kg 하중을 견디도록 트러스 보강 부재를 추가해줘.`,
    current
  );
}

export async function buildFromSpecUI(
  spec: BuildingSpec,
  current: StructureState
): Promise<StructureState> {
  const { spec: fullSpec, solids, nodes, beams } = generateWatertightArchitecture(
    spec,
    current.activeMaterial
  );
  const report = evaluateBuildingSpec(fullSpec, current.activeMaterial);
  const eok = (report.totalMaterialCost / 100000000).toFixed(1);

  const summary = `'${fullSpec.projectName}' (${fullSpec.usageType}) 건축물을 생성했습니다.\n• 내벽·외벽·창호 ${fullSpec.exteriorWindows?.length ?? 0}개소·옥상 난간·수도/전기 배관 ${fullSpec.mepPipes?.length ?? 0}계통 빈틈없이 조립 완료\n• 총 예상 공사 자재비: 약 ${eok}억 원`;

  return {
    ...current,
    buildingSpec: fullSpec,
    solids,
    nodes,
    beams,
    activeSpecViz: null,
    statusMessage: `'${fullSpec.projectName}' 생성 완료`,
    chatHistory: [
      ...(current.chatHistory ?? []),
      {
        id: `msg_build_${Date.now()}`,
        role: 'assistant' as const,
        text: summary,
        timestamp: Date.now(),
      },
    ].slice(-14),
  };
}

export async function regenerateDesignVariation(current: StructureState): Promise<StructureState> {
  const spec = current.buildingSpec;
  if (!spec || spec.usageType === '3D 디자인') {
    return executeNaturalCommand(
      '기존 조건을 유지하면서 세계적인 건축가 작품처럼 조형미가 뛰어난 새로운 3D 디자인으로 다시 생성해줘.',
      current
    );
  }
  const list = BUILDING_TEMPLATES_BY_CATEGORY[spec.usageType];
  const curIdx = list.findIndex((t) => t.id === spec.templateId);
  const nextTpl = list[(curIdx + 1) % list.length];

  return buildFromSpecUI(
    {
      ...spec,
      templateId: nextTpl.id,
      projectName: `AirForge ${nextTpl.name}`,
      designConcept: nextTpl.concept,
    },
    current
  );
}

const SYSTEM_PROMPT = `You are AirForge 3D's Lead Architectural Sculptor & 3D Printing CAD Copilot.

Return ONLY valid JSON matching this exact schema:
{
  "intent": "build_architecture" | "modify_in_place" | "delete_part" | "clear" | "replace_scene" | "add_object" | "style_or_tool" | "camera_only",
  "assistantReply": "Natural, professional Korean response",
  "buildingSpec": {
    "projectName": "string",
    "usageType": "단독주택" | "공동주택" | "업무·상업시설" | "복합문화시설" | "3D 디자인",
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
    "designConcept": "string"
  } | null,
  "partPatches": [
    {
      "id": "existing solid id or empty to match by groupName",
      "groupName": "target groupName (e.g. 지붕, 메인동, 별채, 기둥)",
      "position": [x, y, z] | null,
      "scale": [sx, sy, sz] | null,
      "rotation": [rx, ry, rz] | null,
      "color": "#hex" | null,
      "material": "stucco|wood|concrete|glass|steel|titanium|gold" | null
    }
  ],
  "deleteFilter": {
    "groupNames": [],
    "solidIds": [],
    "nodeIds": [],
    "region": "all" | "left" | "right" | "top" | "bottom" | "reinforcement"
  },
  "solids": [],
  "nodes": [],
  "beams": [],
  "activeTool": "draw" | "erase" | "move" | "deform" | "spray" | null,
  "activeMaterial": "stucco" | "wood" | "concrete" | "glass" | "steel" | "titanium" | "gold" | null,
  "activeColor": "#hex" | null,
  "targetLoadKg": number | null,
  "isSimulating": boolean | null,
  "camera": { "changed": boolean, "mode": "free"|"auto_rotate"|"step_rotate"|"preset", "yawDeg": number, "pitchDeg": number, "speed": number, "zoomFactor": number, "preset": "front"|"top"|"iso" }
}

CRITICAL DESIGN & EDITING RULES:
1. BRIGHT GALLERY-WORTHY ARCHITECTURE ("build_architecture"):
   - NEVER make a plain single rectangle or ugly random stack! Compose an iconic, museum-grade modern architectural sculpture using 12-18 harmonious, interlocking volumes with bright daylight colors:
     * Warm White Stucco ("#f8fafc", material: "stucco"), Natural Oak Wood louvers/soffits ("#e7d5be", material: "wood"), Light Architectural Concrete ("#e2e8f0", material: "concrete"), Sky-tinted Low-E Glass ("#bae6fd", material: "glass"), Soft Mint Garden Lawn ("#86efac", thin slab y=0.03).
     * Compose an L-shaped or U-shaped courtyard ground floor, dramatic cantilevered 2nd/3rd floor volumes rotated or offset at clean architectural angles, floating roof canopies, sculptural cylindrical/conical atrium skylights, and slender perimeter columns (nodes & beams).
     * Give descriptive Korean "groupName" to each part (e.g., "1층 메인동", "2층 캔틸레버동", "경사 지붕", "중정 정원", "수직 코어", "테라스 데크") so the user can later modify specific parts!
   - If undergroundFloors > 0 and undergroundAreaSqm > 0: place a clean light-slate basement volume below y = 0 (center y = -0.3 * undergroundFloors, scaleY = 0.6 * undergroundFloors, color "#cbd5e1", material "concrete").
   - All above-ground grounded elements must rest flush on y = 0 (center y = scaleY / 2).

2. IN-PLACE PARTIAL MODIFICATION ("modify_in_place") — VERY IMPORTANT:
   - When the user asks to modify an existing part (e.g. "지붕을 높여줘", "2층을 나무 재질로 바꿔줘", "왼쪽 날개를 넓혀줘", "특정 부위 색/크기 변경"), DO NOT return "clear" or "replace_scene" and DO NOT spawn duplicate solids!
   - Instead, use intent: "modify_in_place" and populate "partPatches" matching the existing solid's "id" or "groupName" from currentState.solids, specifying ONLY the updated scale/position/rotation/material/color!

3. 3D PRINTING / FREE 3D DESIGN MODE ("replace_scene" or "add_object"):
   - When usageType is "3D 디자인" (e.g. mechanical bracket, vase, drone frame, figurine, custom 3D printable part), generate clean, manifold, watertight 3D printable geometry using smooth solids (cylinder, torus, cone, sphere, box) in bright studio colors ("#f8fafc", "#e2e8f0", "#bae6fd", "#fde68a").`;

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
              currentBuildingSpec: lockedSpec ?? current.buildingSpec ?? null,
              sceneBounds: bounds,
              currentState: {
                activeMaterial: current.activeMaterial,
                activeColor: current.activeColor,
                solids: (current.solids ?? []).map((s) => ({
                  id: s.id,
                  groupName: s.groupName,
                  shape: s.shape,
                  position: s.position,
                  scale: s.scale,
                  rotation: s.rotation,
                  color: s.color,
                  material: s.material,
                })),
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
        ? MATERIAL_CATALOG[nextMaterial]?.hex ?? current.activeColor
        : current.activeColor;

    const mapSolids = (arr: any[]): SolidPrimitive[] =>
      (arr || []).map((s: any, idx: number) => {
        const mat: CadMaterial = s.material ?? nextMaterial ?? 'stucco';
        const col =
          s.color && String(s.color).startsWith('#')
            ? String(s.color)
            : MATERIAL_CATALOG[mat]?.hex ?? '#f8fafc';
        return {
          id: String(s.id || `solid_${Date.now()}_${idx}`),
          groupName: s.groupName ? String(s.groupName) : '건축 매스',
          shape: (['sphere', 'box', 'cylinder', 'cone', 'torus'].includes(s.shape) ? s.shape : 'box') as SolidShape,
          position: [Number(s.position?.[0] ?? 0), Number(s.position?.[1] ?? 1), Number(s.position?.[2] ?? 0)],
          scale: [Number(s.scale?.[0] ?? 1), Number(s.scale?.[1] ?? 1), Number(s.scale?.[2] ?? 1)],
          rotation: s.rotation ? [Number(s.rotation[0] ?? 0), Number(s.rotation[1] ?? 0), Number(s.rotation[2] ?? 0)] : undefined,
          color: col,
          material: mat,
          isFixed: Boolean(s.isFixed),
        };
      });

    const mapNodes = (arr: any[]): NodePoint[] =>
      (arr || []).map((n: any) => ({
        id: String(n.id),
        groupName: n.groupName ? String(n.groupName) : '기둥 코어',
        position: [Number(n.position?.[0] ?? 0), Number(n.position?.[1] ?? 0), Number(n.position?.[2] ?? 0)],
        isFixed: Boolean(n.isFixed),
        role: n.role === 'reinforcement' ? 'reinforcement' : 'primary',
      }));

    const mapBeams = (arr: any[], validIds: Set<string>): BeamMember[] =>
      (arr || [])
        .filter((b: any) => validIds.has(b.startNodeId) && validIds.has(b.endNodeId))
        .map((b: any) => ({
          id: String(b.id),
          groupName: b.groupName ? String(b.groupName) : '기둥 코어',
          startNodeId: String(b.startNodeId),
          endNodeId: String(b.endNodeId),
          stress: Math.max(0.05, Math.min(1, Number(b.stress ?? 0.2))),
          color: '#cbd5e1',
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
          projectName: String(res.buildingSpec.projectName || 'AirForge 모던 중정 단독주택'),
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
          exteriorWindows: current.buildingSpec?.exteriorWindows,
          mepPipes: current.buildingSpec?.mepPipes,
          floorLoadsKn: current.buildingSpec?.floorLoadsKn,
          elevators: Number(res.buildingSpec.elevators ?? 0),
          stairs: Number(res.buildingSpec.stairs || 1),
          rooftops: Number(res.buildingSpec.rooftops || 1),
          gardenAreaSqm: Number(res.buildingSpec.gardenAreaSqm || 80),
          designConcept: res.buildingSpec.designConcept ? String(res.buildingSpec.designConcept) : undefined,
        }
      : current.buildingSpec;

    let assistantText = String(res.assistantReply || '설계를 반영했습니다.');

    if (res.intent === 'modify_in_place' && Array.isArray(res.partPatches) && res.partPatches.length > 0) {
      // 기존 도형을 지우거나 중복 생성하지 않고 해당 부위만 제자리 수정
      nextSolids = nextSolids.map((solid) => {
        const patch = res.partPatches.find(
          (p: any) =>
            (p.id && p.id === solid.id) ||
            (p.groupName &&
              solid.groupName &&
              solid.groupName.toLowerCase().includes(String(p.groupName).toLowerCase()))
        );
        if (!patch) return solid;
        const patchedMat: CadMaterial = patch.material ?? solid.material ?? 'stucco';
        const patchedColor =
          patch.color && String(patch.color).startsWith('#')
            ? String(patch.color)
            : patch.material
            ? MATERIAL_CATALOG[patchedMat]?.hex ?? solid.color
            : solid.color;
        return {
          ...solid,
          position: Array.isArray(patch.position)
            ? [Number(patch.position[0]), Number(patch.position[1]), Number(patch.position[2])]
            : solid.position,
          scale: Array.isArray(patch.scale)
            ? [Number(patch.scale[0]), Number(patch.scale[1]), Number(patch.scale[2])]
            : solid.scale,
          rotation: Array.isArray(patch.rotation)
            ? [Number(patch.rotation[0]), Number(patch.rotation[1]), Number(patch.rotation[2])]
            : solid.rotation,
          material: patchedMat,
          color: patchedColor,
        };
      });

      if (nextBuildingSpec) {
        nextBuildingSpec = syncBuildingWithSolids(nextBuildingSpec, nextSolids);
      }
    } else if (res.intent === 'build_architecture') {
      if (nextBuildingSpec) {
        // 건축 제원(BuildingSpec)이 있는 경우: 빈틈없는 내벽·외벽·창호·옥상 엔진으로 일체형 생성
        const built = generateWatertightArchitecture(nextBuildingSpec, nextMaterial);
        nextSolids = built.solids;
        nextNodes = built.nodes;
        nextBeams = built.beams;
        nextBuildingSpec = built.spec;

        const report = evaluateBuildingSpec(nextBuildingSpec, nextMaterial);
        const eok = (report.totalMaterialCost / 100000000).toFixed(1);
        assistantText += `\n\n[건축·설비·자재비 자동 연동 결과]\n• 내벽·외벽·창호 ${nextBuildingSpec.exteriorWindows?.length ?? 0}개소 및 수도·전기 배관 ${nextBuildingSpec.mepPipes?.length ?? 0}계통 빈틈없이 배치 완료\n• 총 예상 공사 자재비: 약 ${eok}억 원`;
      } else {
        // 건축 제원 없이 자유 조형(3D 디자인)만 요청한 경우: 기존 AI 솔리드 매핑 유지
        nextSolids = mapSolids(res.solids);
        nextNodes = mapNodes(res.nodes);
        const validIds = new Set(nextNodes.map((n) => n.id));
        nextBeams = mapBeams(res.beams, validIds);
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

      if (nextBuildingSpec && nextSolids.length > 0) {
        nextBuildingSpec = syncBuildingWithSolids(nextBuildingSpec, nextSolids);
      }
    } else if (res.intent === 'clear') {
      nextSolids = [];
      nextNodes = [];
      nextBeams = [];
      nextBuildingSpec = undefined;
    } else if (res.intent === 'replace_scene') {
      nextSolids = mapSolids(res.solids);
      nextNodes = mapNodes(res.nodes);
      const validIds = new Set(nextNodes.map((n) => n.id));
      nextBeams = mapBeams(res.beams, validIds);
      if (nextBuildingSpec && nextBuildingSpec.usageType !== '3D 디자인') {
        nextBuildingSpec = syncBuildingWithSolids(nextBuildingSpec, nextSolids);
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
      if (nextBuildingSpec && nextBuildingSpec.usageType !== '3D 디자인') {
        nextBuildingSpec = syncBuildingWithSolids(nextBuildingSpec, nextSolids);
      }
    } else if (res.intent === 'style_or_tool' || matChanged || Boolean(res.activeColor)) {
      nextSolids = nextSolids.map((s) =>
        s.color === '#86efac' || s.color === '#10b981'
          ? s
          : { ...s, material: nextMaterial, color: nextColor }
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
      selectedPartId: res.intent === 'clear' ? null : current.selectedPartId,
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