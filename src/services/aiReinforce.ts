import {
  StructureState,
  NodePoint,
  BeamMember,
  CadMaterial,
  SolidPrimitive,
  SolidShape,
  DesignCandidate,
  ChatMessage,
} from '../types/cad';

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

// 서브 기능: 요청받은 부위만 트러스 보강
function applyTargetedReinforcement(current: StructureState, prompt: string, prefix: string): StructureState {
  const primaryNodes: NodePoint[] = current.nodes
    .filter((n) => n.role !== 'reinforcement')
    .map((n) => ({ ...n, role: 'primary' }));
  const primaryIds = new Set(primaryNodes.map((n) => n.id));
  const primaryBeams: BeamMember[] = current.beams
    .filter((b) => b.role !== 'reinforcement' && primaryIds.has(b.startNodeId) && primaryIds.has(b.endNodeId))
    .map((b) => ({ ...b, role: 'primary', stress: 0.18 }));

  let targetNodes = primaryNodes;
  if (prompt.includes('오른쪽') || prompt.includes('우측')) {
    targetNodes = primaryNodes.filter((n) => n.position[0] >= 0);
  } else if (prompt.includes('왼쪽') || prompt.includes('좌측')) {
    targetNodes = primaryNodes.filter((n) => n.position[0] <= 0);
  }
  if (targetNodes.length < 2) targetNodes = primaryNodes;

  const newBeams = [...primaryBeams];
  let added = 0;
  for (let i = 0; i < targetNodes.length; i++) {
    for (let j = i + 1; j < targetNodes.length; j++) {
      const a = targetNodes[i];
      const b = targetNodes[j];
      const dist = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      const exists = newBeams.some(
        (bm) => (bm.startNodeId === a.id && bm.endNodeId === b.id) || (bm.startNodeId === b.id && bm.endNodeId === a.id)
      );
      if (!exists && dist > 0.25 && dist <= 1.8) {
        newBeams.push({
          id: `reinf_${i}_${j}_${Date.now()}`,
          groupName: a.groupName ?? '보강구조',
          startNodeId: a.id,
          endNodeId: b.id,
          stress: 0.15,
          material: current.activeMaterial,
          color: current.activeColor,
          role: 'reinforcement',
        });
        added += 1;
      }
    }
  }

  return {
    ...current,
    nodes: primaryNodes,
    beams: newBeams,
    statusMessage: `${prefix} 지정 부위 보강 완료 (${added}개 부재 추가)`,
  };
}

export async function reinforceStructure(current: StructureState): Promise<StructureState> {
  return executeNaturalCommand(
    `현재 모델의 취약 부위만 ${current.targetLoadKg}kg 하중을 견디도록 트러스 지지대로 보강해줘.`,
    current
  );
}

export async function executeNaturalCommand(
  userPrompt: string,
  current: StructureState
): Promise<StructureState> {
  const userMsg: ChatMessage = {
    id: `msg_u_${Date.now()}`,
    role: 'user',
    text: userPrompt,
    timestamp: Date.now(),
  };

  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || apiKey === '여기에_API_키_입력') {
    return applyTargetedReinforcement(current, userPrompt, '[.env 키 확인 필요]');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12000);
  const bounds = computeSceneBounds(current);

  // 현재 씬에 존재하는 그룹명 목록 추출
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
        temperature: 0.25,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are AirForge 3D's Conversational AI CAD Architect.
You collaborate with the user in natural, friendly Korean—asking clarifying questions and offering 3 distinct 3D preview candidates whenever a request is ambiguous, while executing precise operations immediately when details are clear.

Return ONLY valid JSON matching this schema:
{
  "intent": "clarify_and_preview" | "delete_part" | "clear" | "replace_scene" | "add_object" | "transform_existing" | "reinforce_part" | "style_or_tool" | "camera_only",
  "assistantReply": "Conversational Korean response (spoken-friendly, concise, asks specific follow-up details if ambiguous)",
  "candidates": [
    {
      "id": "cand_1",
      "title": "시안 1: 짧은 제목",
      "description": "형태, 층수/치수, 배치 위치 요약",
      "solids": [{ "id": "s1", "groupName": "건물", "shape": "box|sphere|cylinder|cone|torus", "position": [x,y,z], "scale": [sx,sy,sz], "rotation": [rx,ry,rz], "color": "#hex or null", "material": "hologram|steel|titanium|carbon|gold or null", "isFixed": boolean }],
      "nodes": [{ "id": "n1", "groupName": "건물", "position": [x,y,z], "isFixed": boolean, "role": "primary" }],
      "beams": [{ "id": "b1", "groupName": "건물", "startNodeId": "n1", "endNodeId": "n2", "stress": 0.2, "role": "primary" }]
    }
  ],
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

CRITICAL RULES:
1. PARTIAL DELETION ("다리만 지워", "건물 지워", "보강재만 삭제해", "왼쪽 구조물 지워"):
   - NEVER use "clear" unless the user says "다 지워" or "전체 초기화"!
   - Use intent: "delete_part" and populate "deleteFilter.groupNames" (matching existingGroups such as ["다리"] or ["건물"]) and/or "deleteFilter.region".
   - If the user says an ambiguous deletion like "저거 지워" or "하나 지워" when existingGroups has 2+ items (e.g., ["다리", "건물"]), use "clarify_and_preview" with empty candidates and ask: "현재 화면에 건물과 다리가 있습니다. 어떤 구조물을 지울까요? (예: '다리만 지워')"
2. CONVERSATIONAL CLARIFICATION & 3 PREVIEW CANDIDATES ("clarify_and_preview"):
   - Trigger this when the user gives an underspecified design prompt (e.g., "건물 세워줘", "다리 만들어줘", "의자 디자인해줘", "멋진 구조물 추가해줘") WITHOUT specifying exact dimensions, style, or sub-type!
   - In "assistantReply", naturally ask for details (e.g., "어떤 스타일로 만들어 드릴까요? 층수나 재질, 원하는 위치를 말씀해 주시거나 아래 3가지 예상 시안 중 마음에 드는 것을 선택해 주세요.")
   - Generate 3 genuinely distinct 3D candidates in "candidates" (e.g., for "건물 세워줘": 1. 3층 계단식 오피스 빌딩, 2. 원통형 스파이럴 타워, 3. 피라미드 첨탑 랜드마크).
   - IMPORTANT: If existing objects are already in the scene (sceneBounds.isEmpty === false) and the user didn't say "다 지우고", each candidate MUST include the existing solids/nodes/beams PLUS the new object offset at x = sceneBounds.maxX + 1.5 so nothing gets accidentally wiped!
3. DIRECT EXECUTION ("add_object", "replace_scene", "transform_existing", "reinforce_part"):
   - Trigger when the user gives concrete details OR replies to your question (e.g. "2번 시안으로 해줘", "3층 스틸 건물로 오른쪽에 세워줘", "다 지우고 금색 구체 띄워").
   - Always assign a clear Korean "groupName" (e.g. "건물", "다리", "구체") to every solid, node, and beam so future partial edits/deletions work accurately.
   - Grounded objects must sit cleanly on y = 0 (center y = scaleY / 2).
   - Leave activeMaterial, activeColor, activeTool, targetLoadKg, isSimulating as NULL unless explicitly requested.`,
          },
          ...recentHistory,
          {
            role: 'user',
            content: JSON.stringify({
              command: userPrompt,
              existingGroups,
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
        groupName: s.groupName ? String(s.groupName) : '구조물',
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
        groupName: n.groupName ? String(n.groupName) : '구조물',
        position: [Number(n.position?.[0] ?? 0), Number(n.position?.[1] ?? 0), Number(n.position?.[2] ?? 0)],
        isFixed: Boolean(n.isFixed),
        role: n.role === 'reinforcement' ? 'reinforcement' : 'primary',
      }));

    const mapBeams = (arr: any[], validIds: Set<string>): BeamMember[] =>
      (arr || [])
        .filter((b: any) => validIds.has(b.startNodeId) && validIds.has(b.endNodeId))
        .map((b: any) => ({
          id: String(b.id),
          groupName: b.groupName ? String(b.groupName) : '구조물',
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

    if (res.intent === 'clarify_and_preview') {
      nextCandidates = (res.candidates || []).slice(0, 3).map((c: any, idx: number) => {
        const cNodes = mapNodes(c.nodes);
        const validIds = new Set(cNodes.map((n) => n.id));
        return {
          id: String(c.id || `cand_${idx + 1}`),
          title: String(c.title || `시안 ${idx + 1}`),
          description: String(c.description || ''),
          solids: mapSolids(c.solids),
          nodes: cNodes,
          beams: mapBeams(c.beams, validIds),
        };
      });
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
    } else if (res.intent === 'replace_scene' || res.intent === 'transform_existing') {
      nextSolids = mapSolids(res.solids);
      nextNodes = mapNodes(res.nodes);
      const validIds = new Set(nextNodes.map((n) => n.id));
      nextBeams = mapBeams(res.beams, validIds);
    } else if (res.intent === 'add_object') {
      const addedSolids = mapSolids(res.solids);
      const addedNodes = mapNodes(res.nodes);
      const allNodes = [...nextNodes, ...addedNodes];
      const validIds = new Set(allNodes.map((n) => n.id));
      const addedBeams = mapBeams(res.beams, validIds);
      nextSolids = [...nextSolids, ...addedSolids];
      nextNodes = allNodes;
      nextBeams = [...nextBeams, ...addedBeams];
    } else if (res.intent === 'reinforce_part') {
      if ((res.nodes || []).length > 0 || (res.beams || []).length > 0) {
        const mergedNodes = (res.nodes || []).length > 0 ? mapNodes(res.nodes) : nextNodes;
        const validIds = new Set(mergedNodes.map((n) => n.id));
        nextNodes = mergedNodes;
        nextBeams = mapBeams(res.beams, validIds);
      } else {
        return applyTargetedReinforcement(current, userPrompt, '[AI 보강]');
      }
    } else if (res.intent === 'style_or_tool' || matChanged || Boolean(res.activeColor)) {
      nextSolids = nextSolids.map((s) => ({ ...s, material: nextMaterial, color: nextColor }));
      nextBeams = nextBeams.map((b) => ({ ...b, material: nextMaterial, color: nextColor }));
    }

    const assistantText = String(res.assistantReply || '명령을 처리했습니다.');
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
      activeTool: res.activeTool ?? current.activeTool,
      activeMaterial: nextMaterial,
      activeColor: nextColor,
      targetLoadKg: typeof res.targetLoadKg === 'number' && res.targetLoadKg > 0 ? res.targetLoadKg : current.targetLoadKg,
      isSimulating: typeof res.isSimulating === 'boolean' ? res.isSimulating : current.isSimulating,
      cameraControl: nextCamera,
      statusMessage: assistantText,
      chatHistory: [...(current.chatHistory ?? []), userMsg, assistantMsg].slice(-12),
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