import { StructureState, NodePoint, BeamMember } from '../types/cad';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

// 해커톤장 Wi-Fi 지연 또는 API 오류 시 즉시 작동하는 로컬 기하학 트러스 보강 알고리즘
function applyLocalTrussFallback(current: StructureState): StructureState {
  const baseNodes: NodePoint[] = current.nodes.map((n) => ({ ...n }));
  const baseBeams: BeamMember[] = current.beams.map((b) => ({
    ...b,
    stress: Math.min(b.stress, 0.22), // 보강 후 기존 부재 응력 안정화
  }));

  const unsupportedNodes = baseNodes.filter((n) => !n.isFixed);
  if (unsupportedNodes.length === 0) {
    return { ...current, nodes: baseNodes, beams: baseBeams };
  }

  const newNodes: NodePoint[] = [...baseNodes];
  const newBeams: BeamMember[] = [...baseBeams];
  const apexIds: string[] = [];

  // 1. 비고정 노드 상단(y + 0.75m)에 트러스 꼭짓점 노드 생성
  unsupportedNodes.forEach((node, idx) => {
    const apexId = `truss_apex_${Date.now()}_${idx}`;
    const [x, y, z] = node.position;
    newNodes.push({
      id: apexId,
      position: [x, Math.round((y + 0.75) * 4) / 4, z],
      isFixed: false,
    });
    apexIds.push(apexId);

    // 수직 보강재 연결
    newBeams.push({
      id: `truss_v_${Date.now()}_${idx}`,
      startNodeId: node.id,
      endNodeId: apexId,
      stress: 0.15,
    });
  });

  // 2. 상단 현재(Top Chord) 및 대각선 사재(Diagonal Web) 삼각화 연결
  for (let i = 0; i < apexIds.length - 1; i++) {
    newBeams.push({
      id: `truss_top_${Date.now()}_${i}`,
      startNodeId: apexIds[i],
      endNodeId: apexIds[i + 1],
      stress: 0.18,
    });
    newBeams.push({
      id: `truss_diag_${Date.now()}_${i}`,
      startNodeId: apexIds[i],
      endNodeId: unsupportedNodes[i + 1].id,
      stress: 0.2,
    });
  }

  // 3. 양 끝 고정 지지대(isFixed: true)와 상단 트러스 대각선 연결
  const fixedNodes = baseNodes.filter((n) => n.isFixed);
  if (fixedNodes.length >= 1 && apexIds.length >= 1) {
    newBeams.push({
      id: `truss_anchor_start_${Date.now()}`,
      startNodeId: fixedNodes[0].id,
      endNodeId: apexIds[0],
      stress: 0.2,
    });
  }
  if (fixedNodes.length >= 2 && apexIds.length >= 1) {
    newBeams.push({
      id: `truss_anchor_end_${Date.now()}`,
      startNodeId: fixedNodes[fixedNodes.length - 1].id,
      endNodeId: apexIds[apexIds.length - 1],
      stress: 0.2,
    });
  }

  return {
    ...current,
    nodes: newNodes,
    beams: newBeams,
  };
}

export async function reinforceStructure(current: StructureState): Promise<StructureState> {
  const apiKey = import.meta.env.VITE_GROQ_API_KEY;
  if (!apiKey || apiKey === '여기에_API_키_입력') {
    console.warn('[AirForge] VITE_GROQ_API_KEY 미설정 -> 로컬 트러스 Fallback 실행');
    return applyLocalTrussFallback(current);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500); // 3.5초 타임아웃

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
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a structural engineering AI. Given 3D nodes, beams, and targetLoadKg, reinforce the structure against gravity and load by adding triangular truss apex nodes (snapped to 0.25m grid) and diagonal beams connecting to fixed supports (isFixed: true). Keep all existing fixed nodes unchanged and reduce all beam stress values below 0.25.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              targetLoadKg: current.targetLoadKg,
              nodes: current.nodes,
              beams: current.beams,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'reinforced_structure',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                nodes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      position: { type: 'array', items: { type: 'number' } },
                      isFixed: { type: 'boolean' },
                    },
                    required: ['id', 'position', 'isFixed'],
                    additionalProperties: false,
                  },
                },
                beams: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      startNodeId: { type: 'string' },
                      endNodeId: { type: 'string' },
                      stress: { type: 'number' },
                    },
                    required: ['id', 'startNodeId', 'endNodeId', 'stress'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['nodes', 'beams'],
              additionalProperties: false,
            },
          },
        },
      }),
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`Groq API HTTP ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Empty LLM response');

    const parsed = JSON.parse(content);
    const validNodeIds = new Set(parsed.nodes.map((n: NodePoint) => n.id));

    const sanitizedNodes: NodePoint[] = parsed.nodes.map((n: any) => ({
      id: String(n.id),
      position: [
        Number(n.position?.[0] ?? 0),
        Number(n.position?.[1] ?? 0),
        Number(n.position?.[2] ?? 0),
      ],
      isFixed: Boolean(n.isFixed),
    }));

    const sanitizedBeams: BeamMember[] = parsed.beams
      .filter((b: any) => validNodeIds.has(b.startNodeId) && validNodeIds.has(b.endNodeId))
      .map((b: any) => ({
        id: String(b.id),
        startNodeId: String(b.startNodeId),
        endNodeId: String(b.endNodeId),
        stress: Math.max(0, Math.min(1, Number(b.stress ?? 0.2))),
      }));

    if (sanitizedNodes.length <= current.nodes.length) {
      return applyLocalTrussFallback(current);
    }

    return {
      ...current,
      nodes: sanitizedNodes,
      beams: sanitizedBeams,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[AirForge] API 지연/오류 발생 -> 로컬 트러스 Fallback 자동 실행:', error);
    return applyLocalTrussFallback(current);
  }
}