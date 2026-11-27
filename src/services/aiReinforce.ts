import { StructureState, NodePoint, BeamMember, CadMaterial } from '../types/cad';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

const MATERIAL_DEFAULT_COLORS: Record<CadMaterial, string> = {
  hologram: '#00f3ff',
  steel: '#e2e8f0',
  titanium: '#64748b',
  carbon: '#1e293b',
  gold: '#fbbf24',
};

// 로컬 와이어프레임 구체 생성기 (오프라인/지연 대비)
function createSphereWireframe(material: CadMaterial, color: string): { nodes: NodePoint[]; beams: BeamMember[] } {
  const nodes: NodePoint[] = [];
  const beams: BeamMember[] = [];
  const cx = 0, cy = 1.5, cz = 0, r = 1.0;
  const rings = 3; // 위도 링 수
  const segs = 8;  // 경도 분할 수

  nodes.push({ id: 'sp_top', position: [cx, cy + r, cz], isFixed: false, role: 'primary' });

  for (let i = 1; i <= rings; i++) {
    const phi = (Math.PI * i) / (rings + 1);
    const y = cy + r * Math.cos(phi);
    const ringR = r * Math.sin(phi);
    for (let j = 0; j < segs; j++) {
      const theta = (2 * Math.PI * j) / segs;
      nodes.push({
        id: `sp_${i}_${j}`,
        position: [
          Math.round((cx + ringR * Math.cos(theta)) * 20) / 20,
          Math.round(y * 20) / 20,
          Math.round((cz + ringR * Math.sin(theta)) * 20) / 20,
        ],
        isFixed: false,
        role: 'primary',
      });
    }
  }

  nodes.push({ id: 'sp_bot', position: [cx, cy - r, cz], isFixed: false, role: 'primary' });

  // 위도선 및 경도선 연결
  for (let j = 0; j < segs; j++) {
    beams.push({ id: `sb_top_${j}`, startNodeId: 'sp_top', endNodeId: `sp_1_${j}`, stress: 0.15, material, color, role: 'primary' });
    beams.push({ id: `sb_bot_${j}`, startNodeId: `sp_${rings}_${j}`, endNodeId: 'sp_bot', stress: 0.25, material, color, role: 'primary' });
  }
  for (let i = 1; i <= rings; i++) {
    for (let j = 0; j < segs; j++) {
      const nextJ = (j + 1) % segs;
      beams.push({ id: `sb_ring_${i}_${j}`, startNodeId: `sp_${i}_${j}`, endNodeId: `sp_${i}_${nextJ}`, stress: 0.18, material, color, role: 'primary' });
      if (i < rings) {
        beams.push({ id: `sb_vert_${i}_${j}`, startNodeId: `sp_${i}_${j}`, endNodeId: `sp_${i + 1}_${j}`, stress: 0.2, material, color, role: 'primary' });
      }
    }
  }
  return { nodes, beams };
}

// 범용 부분/전체 트러스 보강 Fallback (교량에 국한되지 않고 선택된 영역의 노드 간 삼각 브레이싱 수행)
function applyTargetedReinforcement(current: StructureState, prompt: string): StructureState {
  const primaryNodes: NodePoint[] = current.nodes
    .filter((n) => n.role !== 'reinforcement')
    .map((n) => ({ ...n, role: 'primary' }));
  const primaryIds = new Set(primaryNodes.map((n) => n.id));
  const primaryBeams: BeamMember[] = current.beams
    .filter((b) => b.role !== 'reinforcement' && primaryIds.has(b.startNodeId) && primaryIds.has(b.endNodeId))
    .map((b) => ({ ...b, role: 'primary', stress: 0.18 }));

  if (primaryNodes.length < 3) {
    return { ...current, statusMessage: '보강할 노드가 최소 3개 이상 필요합니다.' };
  }

  // 방향 키워드("오른쪽", "왼쪽", "상단", "하단")가 있으면 해당 영역 노드만 필터링
  let targetNodes = primaryNodes;
  if (prompt.includes('오른쪽') || prompt.includes('우측')) {
    targetNodes = primaryNodes.filter((n) => n.position[0] >= 0);
  } else if (prompt.includes('왼쪽') || prompt.includes('좌측')) {
    targetNodes = primaryNodes.filter((n) => n.position[0] <= 0);
  } else if (prompt.includes('상단') || prompt.includes('위')) {
    const avgY = primaryNodes.reduce((s, n) => s + n.position[1], 0) / primaryNodes.length;
    targetNodes = primaryNodes.filter((n) => n.position[1] >= avgY);
  } else if (prompt.includes('하단') || prompt.includes('아래')) {
    const avgY = primaryNodes.reduce((s, n) => s + n.position[1], 0) / primaryNodes.length;
    targetNodes = primaryNodes.filter((n) => n.position[1] <= avgY);
  }

  if (targetNodes.length < 2) targetNodes = primaryNodes;

  const newBeams = [...primaryBeams];
  let addedCount = 0;

  for (let i = 0; i < targetNodes.length; i++) {
    for (let j = i + 1; j < targetNodes.length; j++) {
      const a = targetNodes[i];
      const b = targetNodes[j];
      const dist = Math.hypot(a.position[0] - b.position[0], a.position[1] - b.position[1], a.position[2] - b.position[2]);
      const exists = newBeams.some(
        (beam) =>
          (beam.startNodeId === a.id && beam.endNodeId === b.id) ||
          (beam.startNodeId === b.id && beam.endNodeId === a.id)
      );
      if (!exists && dist > 0.25 && dist <= 1.75) {
        newBeams.push({
          id: `reinf_${i}_${j}_${Date.now()}`,
          startNodeId: a.id,
          endNodeId: b.id,
          stress: 0.15,
          material: current.activeMaterial,
          color: current.activeColor,
          role: 'reinforcement',
        });
        addedCount += 1;
      }
    }
  }

  return {
    ...current,
    nodes: primaryNodes,
    beams: newBeams,
    statusMessage: `지정 부위 트러스 보강 완료 (보강재 ${addedCount}개 추가)`,
  };
}

// 네트워크/API 오류 시 사용자 의도에 맞춰 분기하는 안전 Fallback
function applyIntentFallback(userPrompt: string, current: StructureState): StructureState {
  if (userPrompt.includes('지우') || userPrompt.includes('삭제') || userPrompt.includes('초기화')) {
    if (userPrompt.includes('구체') || userPrompt.includes('공')) {
      const sphere = createSphereWireframe(current.activeMaterial, current.activeColor);
      return { ...current, ...sphere, isSimulating: false, statusMessage: '3D 와이어프레임 구체 생성 완료' };
    }
    return { ...current, nodes: [], beams: [], isSimulating: false, statusMessage: '캔버스 초기화 완료' };
  }
  if (userPrompt.includes('구체') || userPrompt.includes('공')) {
    const sphere = createSphereWireframe(current.activeMaterial, current.activeColor);
    return { ...current, ...sphere, isSimulating: false, statusMessage: '3D 와이어프레임 구체 생성 완료' };
  }
  return applyTargetedReinforcement(current, userPrompt);
}

export async function reinforceStructure(current: StructureState): Promise<StructureState> {
  return executeNaturalCommand(
    `현재 구조물의 형태를 유지하면서 ${current.targetLoadKg}kg 하중을 버틸 수 있도록 취약 부위에 대각선 트러스 보강재를 추가해줘.`,
    current
  );
}

export async function executeNaturalCommand(
  userPrompt: string,
  current: StructureState
): Promise<StructureState> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || apiKey === '여기에_API_키_입력') {
    return applyIntentFallback(userPrompt, current);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are AirForge 3D, a versatile 3D CAD & Spatial Design AI Copilot.
Analyze the user's Korean command and return ONLY a valid JSON object matching this exact schema:
{
  "intent": "create_or_replace" | "reinforce_part" | "camera_only" | "style_or_tool" | "clear",
  "replyMessage": "Short Korean confirmation message",
  "shouldModifyGeometry": boolean,
  "nodes": [{ "id": "string", "position": [x, y, z], "isFixed": boolean, "role": "primary" | "reinforcement" }],
  "beams": [{ "id": "string", "startNodeId": "string", "endNodeId": "string", "stress": number, "role": "primary" | "reinforcement" }],
  "activeTool": "draw" | "erase" | "move" | "deform" | "spray",
  "activeMaterial": "hologram" | "steel" | "titanium" | "carbon" | "gold",
  "activeColor": "#hex",
  "applyStyleToAllBeams": boolean,
  "targetLoadKg": number,
  "isSimulating": boolean,
  "camera": {
    "mode": "free" | "auto_rotate" | "step_rotate" | "preset",
    "yawDeg": number,
    "pitchDeg": number,
    "speed": number,
    "zoomFactor": number,
    "preset": "front" | "top" | "iso"
  }
}

CRITICAL RULES:
1. "create_or_replace" (e.g. "다 지우고 구체 띄워봐", "피라미드 만들어줘", "의자 설계해줘"):
   - Set shouldModifyGeometry: true.
   - Ignore/discard old bridge nodes! Generate ONLY the requested 3D shape (12~26 nodes, well-connected wireframe beams).
   - For a floating sphere ("구체"), center at [0, 1.5, 0] with radius 1.0, isFixed: false. For grounded objects (chair, tower), nodes at y=0 have isFixed: true.
2. "reinforce_part" (sub-feature: ONLY when user explicitly asks to reinforce/보강):
   - Set shouldModifyGeometry: true.
   - Keep existing primary nodes/beams intact. Add triangulation/bracing beams (role: "reinforcement", stress: 0.15) ONLY to the specific area the user mentioned (e.g., "오른쪽 다리", "상단", or overall if unspecified). Never force bridge shapes onto non-bridge objects.
3. "camera_only" (e.g. "확대해줘", "축소해줘", "반바퀴만 위로 천천히 돌려봐"):
   - Set shouldModifyGeometry: false and return empty nodes/beams arrays (the client preserves existing geometry).
   - zoomFactor is MAGNIFICATION: > 1.0 zooms IN (e.g., "확대" = 1.6), < 1.0 zooms OUT (e.g., "축소" = 0.6), no zoom = 1.0.
   - step_rotate: "반바퀴" = 180, "한바퀴" = 360, "위로" = positive pitchDeg (e.g. 25), "천천히" = speed 0.35, "빠르게" = speed 2.2.`,
          },
          {
            role: 'user',
            content: JSON.stringify({
              command: userPrompt,
              currentState: {
                targetLoadKg: current.targetLoadKg,
                activeTool: current.activeTool,
                activeMaterial: current.activeMaterial,
                activeColor: current.activeColor,
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
      const errText = await response.text();
      console.error('[AirForge] Groq API Error:', response.status, errText);
      return applyIntentFallback(userPrompt, current);
    }

    const data = await response.json();
    const res = JSON.parse(data.choices[0].message.content);

    const nextMaterial: CadMaterial = res.activeMaterial || current.activeMaterial;
    const materialChanged = nextMaterial !== current.activeMaterial;
    const nextColor =
      res.activeColor && res.activeColor.startsWith('#')
        ? res.activeColor
        : materialChanged
        ? MATERIAL_DEFAULT_COLORS[nextMaterial]
        : current.activeColor;

    let nextNodes = current.nodes;
    let nextBeams = current.beams;

    if (res.intent === 'clear') {
      nextNodes = [];
      nextBeams = [];
    } else if (res.shouldModifyGeometry && Array.isArray(res.nodes) && res.nodes.length > 0) {
      const validIds = new Set(res.nodes.map((n: NodePoint) => n.id));
      nextNodes = res.nodes.map((n: any) => ({
        id: String(n.id),
        position: [
          Number(n.position?.[0] ?? 0),
          Number(n.position?.[1] ?? 0),
          Number(n.position?.[2] ?? 0),
        ],
        isFixed: Boolean(n.isFixed),
        role: n.role === 'reinforcement' ? 'reinforcement' : 'primary',
      }));
      nextBeams = (res.beams || [])
        .filter((b: any) => validIds.has(b.startNodeId) && validIds.has(b.endNodeId))
        .map((b: any) => ({
          id: String(b.id),
          startNodeId: String(b.startNodeId),
          endNodeId: String(b.endNodeId),
          stress: Math.max(0.05, Math.min(1, Number(b.stress ?? 0.2))),
          color: nextColor,
          material: nextMaterial,
          role: b.role === 'reinforcement' ? 'reinforcement' : 'primary',
        }));
    } else if (res.applyStyleToAllBeams || materialChanged || nextColor !== current.activeColor) {
      nextBeams = current.beams.map((b) => ({
        ...b,
        color: nextColor,
        material: nextMaterial,
      }));
    }

    const cam = res.camera || { mode: 'free' };
    return {
      ...current,
      nodes: nextNodes,
      beams: nextBeams,
      activeTool: res.activeTool || current.activeTool,
      activeMaterial: nextMaterial,
      activeColor: nextColor,
      targetLoadKg: res.targetLoadKg > 0 ? res.targetLoadKg : current.targetLoadKg,
      isSimulating: typeof res.isSimulating === 'boolean' ? res.isSimulating : current.isSimulating,
      cameraControl: {
        mode: cam.mode || 'free',
        yawDeg: Number(cam.yawDeg ?? 0),
        pitchDeg: Number(cam.pitchDeg ?? 0),
        speed: Number(cam.speed ?? 1.0),
        zoomFactor: Number(cam.zoomFactor ?? 1.0),
        preset: cam.preset || 'iso',
        commandId: Date.now(),
      },
      statusMessage: res.replyMessage || '명령 실행 완료',
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[AirForge] API Fallback:', err);
    return applyIntentFallback(userPrompt, current);
  }
}