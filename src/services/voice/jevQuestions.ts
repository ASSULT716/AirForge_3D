//(조원호) Jev 질문 문구·옵션·임계값을 한 곳에 모음. 문구 수정은 여기서만.
// 원칙: Jev는 판단만(원자 질문), 결정·숫자는 voiceCommand.ts 코드가 함.
import type { AngleCandidate } from './koreanNumber';

export const JEV_MODEL = 'jev-latest';
/** vite.config.ts 프록시 경로 (API 키는 dev 서버에서만 붙음, 브라우저에 노출 X) */
export const JEV_ENDPOINT = '/api/jev';
export const JEV_TIMEOUT_MS = 1500;

/** is_command Noul 임계값 */
export const IS_COMMAND_YES = 0.7;
export const IS_COMMAND_NO = 0.3;

export const AXES = ['x', 'y', 'z'] as const;
export type Axis = (typeof AXES)[number];
export const MATERIALS = ['steel', 'wood', 'aluminum', 'concrete'] as const;
export type Material = (typeof MATERIALS)[number];
export const TOOLS = ['draw', 'erase', 'select', 'brush'] as const;
export type Tool = (typeof TOOLS)[number];
export const INTENTS = ['rotate', 'select_axis', 'change_material', 'change_tool', 'set_load'] as const;
export type Intent = (typeof INTENTS)[number];

/** Choice 옵션 이름 → 코드 값 */
export const AXIS_OPTION: Record<string, Axis | null> = {
  x_horizontal: 'x',
  y_vertical: 'y',
  z_depth: 'z',
  not_specified: null,
};
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
      'Voice control for a 3D structure editor (bridges, trusses, towers). The user speaks Korean to a speech recognizer, so `spoken_text` may contain recognition typos.',
  };
}

type Question =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> };

/** 한 요청에 묶어 보내는 원자 질문들 (speculative: intent와 무관하게 전부 물어봄) */
export function buildQuestions(angles: AngleCandidate[]): Record<string, Question> {
  const q: Record<string, Question> = {
    is_command: {
      type: 'noul',
      instructions: 'In `spoken_text`, is the user giving an instruction to the 3D editor?',
      criteria: {
        true: 'The user tells the editor to do something, such as rotating the structure, choosing an axis, changing material, switching tool, or setting a load.',
        false: 'The user is chatting, thinking aloud, or talking to a teammate, for example "이거 좀 이상하네" or "잠깐만요".',
      },
    },
    intent: {
      type: 'choice',
      instructions: 'Which action does the user want the editor to perform in `spoken_text`?',
      criteria: {
        rotate: 'Turn the structure now (돌려, 회전시켜, 뒤집어, 반바퀴).',
        select_axis: 'Only choose which axis later rotations use, without asking to turn it now (for example "Y축으로 바꿔", "세로축 선택").',
        change_material: 'Change what the structure is made of (재질, 강철, 나무, 알루미늄, 콘크리트).',
        change_tool: 'Switch the editing tool (그리기, 지우개, 선택, 브러시).',
        set_load: 'Set the weight the structure must hold (하중, 킬로, kg, 톤, 버텨).',
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
      criteria: {
        steel: '강철, 철, 스틸.',
        wood: '나무, 목재, 우드.',
        aluminum: '알루미늄.',
        concrete: '콘크리트, 시멘트.',
      },
    },
    tool: {
      type: 'choice',
      instructions: 'Which editing tool does the user want in `spoken_text`?',
      criteria: {
        draw: 'Drawing nodes and beams: 그리기, 펜, 그리는 거.',
        erase: 'Deleting parts: 지우개, 지우기, 삭제.',
        select: 'Picking parts: 선택, 고르기.',
        brush: 'Freehand sketching: 브러시, 브러쉬, 붓, 스케치.',
      },
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
