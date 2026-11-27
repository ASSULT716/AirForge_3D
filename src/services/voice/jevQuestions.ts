//(조원호) Jev 질문 문구·옵션·임계값을 한 곳에 모음. 문구 수정은 여기서만.
// 원칙: Jev는 판단만(원자 질문), 결정·숫자는 voiceCommand.ts 코드가 함.
import type { CadMaterial, CadTool } from '../../types/cad';
import type { AngleCandidate } from './koreanNumber';

export const JEV_MODEL = 'jev-latest';
/** vite.config.ts 프록시 경로 (API 키는 dev 서버에서만 붙음, 브라우저에 노출 X) */
export const JEV_ENDPOINT = '/api/jev';
export const JEV_TIMEOUT_MS = 1500;

/** is_command Noul 임계값 */
export const IS_COMMAND_YES = 0.7;
export const IS_COMMAND_NO = 0.3;

export type Axis = 'x' | 'y' | 'z';
export type Material = CadMaterial;
export type Tool = CadTool;
/** other = 빠른 조작이 아닌 설계 요청 → Groq(executeNaturalCommand)로 넘김 */
export const INTENTS = ['rotate', 'change_material', 'change_tool', 'set_load', 'other'] as const;
export type Intent = (typeof INTENTS)[number];

/** Choice 옵션 이름 → 코드 값 */
export const AXIS_OPTION: Record<string, Axis | null> = {
  x_horizontal: 'x',
  y_vertical: 'y',
  z_depth: 'z',
  not_specified: null,
};
/** 오른손 법칙 기준 +각도 = 반시계 (Y축이면 위에서 볼 때) */
export const DIRECTION_SIGN: Record<string, number> = {
  counter_clockwise: 1,
  clockwise: -1,
  not_specified: 1,
};

/** Jev에 보내는 state. 판단에 필요한 것만 */
export function buildState(text: string) {
  return {
    spoken_text: text,
    app_context:
      'Voice control for a 3D structure editor (bridges, trusses, towers, buildings). The user speaks Korean to a speech recognizer, so `spoken_text` may contain recognition typos.',
  };
}

type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };

const MATERIAL_CRITERIA: Record<Material, string> = {
  steel: '강철, 철, 스틸, 쇠.',
  titanium: '티타늄.',
  carbon: '카본, 탄소섬유.',
  gold: '금, 골드, 황금.',
  stucco: '스타코, 회벽, 흰 벽 마감.',
  wood: '나무, 목재, 우드.',
  concrete: '콘크리트, 시멘트.',
  glass: '유리, 글라스.',
  hologram: '홀로그램, 기본 재질.',
};

const TOOL_CRITERIA: Record<Tool, string> = {
  draw: 'Placing nodes and beams: 그리기, 펜, 펜툴, 그리는 거.',
  erase: 'Deleting parts: 지우개, 지우기, 삭제.',
  move: 'Dragging parts to a new place: 이동, 옮기기, 무브.',
  deform: 'Bending or warping the shape: 왜곡, 변형, 구부리기.',
  spray: 'Painting color or material onto parts: 스프레이, 브러시, 브러쉬, 색칠, 칠하기.',
};

/** 한 요청에 묶어 보내는 원자 질문들 (speculative: intent와 무관하게 전부 물어봄) */
export function buildQuestions(angles: AngleCandidate[]): Record<string, Question> {
  const q: Record<string, Question> = {
    is_command: {
      type: 'noul',
      instructions: 'In `spoken_text`, is the user giving an instruction to the 3D editor?',
      criteria: {
        true: 'The user tells the editor to do something, such as rotating the structure, changing material, switching tool, setting a load, or building or changing a shape.',
        false: 'The user is chatting, thinking aloud, or talking to a teammate, for example "이거 좀 이상하네" or "잠깐만요".',
      },
    },
    negated: {
      type: 'noul',
      instructions: 'In `spoken_text`, is the user telling the editor not to do something, or to stop?',
      criteria: {
        true: 'The user forbids or stops an action, for example "돌리지 마", "그만", "멈춰".',
        false: 'The user asks the editor to do an action, for example "돌려줘", "유리로 바꿔".',
      },
    },
    undo: {
      type: 'noul',
      instructions: 'In `spoken_text`, does the user want to undo a change or put the structure back the way it was?',
      criteria: {
        true: 'The user asks to revert, for example "원래대로", "되돌려", "방금 거 취소".',
        false: 'The user asks for a new change, for example "30도 돌려", "나무로 바꿔".',
      },
    },
    intent: {
      type: 'choice',
      instructions: 'Which action does the user want the editor to perform in `spoken_text`?',
      criteria: {
        rotate: 'Turn the selected structure (돌려, 회전시켜, 뒤집어, 반바퀴).',
        change_material: 'Change what the structure is made of, also when the user says only a material name such as "스틸로" or "유리로" (재질, 강철, 나무, 유리, 콘크리트).',
        change_tool: 'Switch the editing tool (펜, 지우개, 이동, 왜곡, 스프레이).',
        set_load: 'Set the weight the structure must hold (하중, 킬로, kg, 톤, 버텨).',
        other: 'Build, add, delete, resize or redesign parts, or move the camera (집 지어줘, 기둥 추가해, 다리 만들어, 카메라 위에서 보여줘).',
      },
    },
    axis: {
      type: 'choice',
      instructions: 'Which rotation axis does the user name in `spoken_text`?',
      criteria: {
        x_horizontal: 'The left-right axis: X축, 엑스축, 가로축.',
        y_vertical: 'The up-down axis, spinning like a turntable: Y축, 와이축, 세로축, 수직축.',
        z_depth: 'The front-back axis: Z축, 제트축, 지축, 깊이 방향.',
        not_specified: 'The user names no axis.',
      },
    },
    direction: {
      type: 'choice',
      instructions: 'Which turning direction does the user say in `spoken_text`?',
      criteria: {
        clockwise: '시계 방향, 오른쪽으로.',
        counter_clockwise: '반시계 방향, 시계 반대 방향, 왼쪽으로.',
        not_specified: 'The user says no direction.',
      },
    },
    material: {
      type: 'choice',
      instructions: 'Which material does the user want the structure made of in `spoken_text`?',
      criteria: MATERIAL_CRITERIA,
    },
    tool: {
      type: 'choice',
      instructions: 'Which editing tool does the user want in `spoken_text`?',
      criteria: TOOL_CRITERIA,
    },
  };

  // 숫자는 코드가 후보를 만들고 Jev는 고르기만
  if (angles.length > 0) {
    const criteria: Record<string, string> = {};
    for (const a of angles) criteria[a.key] = `Turn by ${a.deg} degrees (said as "${a.phrase}").`;
    criteria.not_specified = 'The user says no rotation amount.';
    q.amount = {
      type: 'choice',
      instructions: 'How far does the user want the structure turned in `spoken_text`?',
      criteria,
    };
  }
  return q;
}
