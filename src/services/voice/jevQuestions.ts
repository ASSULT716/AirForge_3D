//(조원호) Jev 질문 문구·옵션·임계값을 한 곳에 모음. 문구 수정은 여기서만.
// 원칙: Jev는 판단만(원자 질문), 결정·숫자는 voiceCommand.ts 코드가 함.
import type { CadMaterial, CadTool } from '../../types/cad';
import type { AngleCandidate, DistanceCandidate, ScaleCandidate } from './koreanNumber';

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
export const INTENTS = [
  'rotate',
  'push_pull',
  'move_part',
  'copy_part',
  'delete_part',
  'offset_face',
  'scale_part',
  'taper_face',
  'set_diameter',
  'dig_hole',
  'draw_shape',
  'change_material',
  'change_tool',
  'set_load',
  'other',
] as const;
export type Intent = (typeof INTENTS)[number];

/** 손 편집 모드 (음성 "면 크기 도구로" 등 모드만 바꿀 때). sketchOps EditMode의 부분집합 */
export type VoiceEditMode = 'pushpull' | 'offset' | 'taper' | 'move' | 'copy' | 'scale';
export const EDIT_MODE_OPTION: Record<string, VoiceEditMode | null> = {
  push_pull: 'pushpull',
  offset: 'offset',
  face_size: 'taper',
  move: 'move',
  copy: 'copy',
  whole_size: 'scale',
  none: null,
};

/** Choice 옵션 이름 → 코드 값 */
export const AXIS_OPTION: Record<string, Axis | null> = {
  x_horizontal: 'x',
  y_vertical: 'y',
  z_depth: 'z',
  not_specified: null,
};
/** 늘리기·이동·복사 방향 (화면 기준 → HandBridge가 카메라 방향으로 월드 축 변환) */
export type MoveDirection = 'up' | 'down' | 'left' | 'right' | 'front' | 'back';
export const MOVE_DIRECTION_OPTION: Record<string, MoveDirection | null> = {
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  toward_viewer: 'front',
  away_from_viewer: 'back',
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
  select: 'Picking parts without changing them: 선택, 고르기, 셀렉트.',
};

/** 한 요청에 묶어 보내는 원자 질문들 (speculative: intent와 무관하게 전부 물어봄) */
export function buildQuestions(
  angles: AngleCandidate[],
  distances: DistanceCandidate[] = [],
  scales: ScaleCandidate[] = [],
): Record<string, Question> {
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
        push_pull: 'Make the selected part longer, taller, thicker, shorter or thinner by pushing or pulling one side. Any sentence with 늘려 or 줄여 is this action, even with a direction such as 위로, unless 지름 or 반지름 is said (위로 1미터 늘려, 늘려, 높여, 키워, 두껍게, 줄여, 낮춰, 당겨, 밀어, 돌출).',
        move_part: 'Move the whole selected part to another place without changing its size or shape (옮겨, 이동시켜, 올려, 내려). Not for 늘려 or 줄여.',
        copy_part: 'Make a copy of the selected part (복사, 하나 더, 똑같이 하나 더, 복제).',
        delete_part: 'Remove the selected part (지워, 삭제, 없애, 빼).',
        scale_part: 'Resize the whole selected part evenly by a factor, said with 배 or 절반, without naming a face. Never when 윗면, 아랫면, 면, 지름 or 반지름 is said (전체 크기, 두 배로 키워, 1.5배, 절반으로 줄여).',
        taper_face: 'Make only one face (면) of a cylinder narrower or wider, like a cone, a funnel or a dish, including when the user only names the face-size action (면 크기, 면 크기 조절, 면만 줄여, 윗면 두 배로, 윗면 절반으로, 아랫면 1.5배, 윗면 줄여, 위를 좁게, 뾰족하게, 원뿔로 만들어, 아래를 벌려, 접시처럼).',
        set_diameter: 'Set the width of the selected round part (cylinder, cone, ball) to an exact size, said with 지름, 직경 or 반지름, even with 늘려 or 줄여 (지름 5미터로 해줘, 지름 2m로, 반지름 1미터, 직경 3미터, 윗면 지름 1미터로, 지름 50센티로 줄여).',
        dig_hole: 'Hollow out or drill into the selected part, like a cup, a pot or a pipe (파줘, 속 비워, 구멍 내, 뚫어, 컵처럼, 파이프로).',
        draw_shape: 'Start drawing a new flat shape on the floor (사각형 그리기, 네모 그려, 원 그리기, 동그라미, 바닥 그리기).',
        offset_face: 'Draw a smaller face inside a face, leaving a border, usually to cut a window, door or recess (오프셋, 안쪽에 테두리, 창문 틀, 안쪽 면 만들어).',
        change_material: 'Change what the structure is made of, also when the user says only a material name such as "스틸로" or "유리로" (재질, 강철, 나무, 유리, 콘크리트).',
        change_tool: 'Switch the editing tool or editing mode without giving any amount (펜, 지우개, 이동, 왜곡, 스프레이, 늘리기 모드, 오프셋 도구, 면 크기 도구, 복사 모드, 크기 도구, ~도구로 바꿔, ~모드).',
        set_load: 'Set the weight the structure must hold (하중, 킬로, kg, 톤, 버텨).',
        other: 'Build, add or redesign parts, or move the camera (집 지어줘, 기둥 추가해, 다리 만들어, 카메라 위에서 보여줘).',
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
    move_direction: {
      type: 'choice',
      instructions: 'Toward which side does the user want the part pushed, pulled, moved or copied in `spoken_text`?',
      criteria: {
        up: '위로, 위쪽, 높이, 올려.',
        down: '아래로, 아래쪽, 내려, 밑으로.',
        left: '왼쪽으로, 좌측.',
        right: '오른쪽으로, 우측.',
        toward_viewer: '앞으로, 내 쪽으로, 이쪽으로.',
        away_from_viewer: '뒤로, 뒤쪽, 안쪽으로, 저쪽으로.',
        not_specified: 'The user names no side.',
      },
    },
    resize: {
      type: 'choice',
      instructions: 'Does the user want the part bigger or smaller in `spoken_text`?',
      criteria: {
        grow: 'Bigger, longer, taller or thicker: 늘려, 키워, 높여, 길게, 두껍게, 당겨.',
        shrink: 'Smaller, shorter, lower or thinner: 줄여, 낮춰, 짧게, 얇게, 밀어 넣어.',
        not_specified: 'The user does not say bigger or smaller.',
      },
    },
    face_end: {
      type: 'choice',
      instructions: 'Which end of the part does the user talk about in `spoken_text`?',
      criteria: {
        top: '윗면, 위, 꼭대기, 위쪽.',
        bottom: '아랫면, 아래, 밑면, 바닥.',
        not_specified: 'The user names no end.',
      },
    },
    shape: {
      type: 'choice',
      instructions: 'Which shape does the user want to draw in `spoken_text`?',
      criteria: {
        rectangle: '사각형, 네모, 직사각형, 박스, 바닥판.',
        circle: '원, 동그라미, 원형, 원기둥.',
        not_specified: 'The user names no shape.',
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
    edit_mode: {
      type: 'choice',
      instructions: 'Which pinch-drag editing mode does the user name in `spoken_text`?',
      criteria: {
        push_pull: 'Push/pull a face to make it longer or shorter: 늘리기, 밀고 당기기, 푸시풀.',
        offset: 'Draw a smaller face inside a face: 오프셋, 안쪽 테두리.',
        face_size: 'Resize only one face of a cylinder, top or bottom: 면 크기, 면 스케일, 윗면 크기, 아랫면 크기.',
        move: 'Move the part: 이동, 옮기기.',
        copy: 'Copy the part: 복사, 복제.',
        whole_size: 'Resize the whole part: 전체 크기, 크기 도구, 스케일.',
        none: 'The user names a drawing tool such as 펜, 지우개, 왜곡, 스프레이, 선택, or no editing mode at all.',
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
  if (scales.length > 0) {
    const criteria: Record<string, string> = {};
    for (const c of scales) criteria[c.key] = `${c.factor} times the current size (said as "${c.phrase}").`;
    criteria.not_specified = 'The user says no size factor.';
    q.scale_factor = {
      type: 'choice',
      instructions: 'By what factor does the user want the part resized in `spoken_text`?',
      criteria,
    };
  }
  if (distances.length > 0) {
    const criteria: Record<string, string> = {};
    for (const d of distances) criteria[d.key] = `${d.meters} meters (said as "${d.phrase}").`;
    criteria.not_specified = 'The user says no distance.';
    q.distance = {
      type: 'choice',
      instructions: 'Which length does the user say in `spoken_text`: how far to push, pull, move or copy the part, or how wide (지름, 반지름) to make it?',
      criteria,
    };
  }
  return q;
}
