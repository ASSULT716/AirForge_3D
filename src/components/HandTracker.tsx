//(조원호) MediaPipe 스켈레톤 + 핀치/음성
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { HandLandmarker, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as THREE from 'three';
import { CadTool } from '../types/cad';
import { createHandDetector, type HandDetector, type HandFrame } from '../services/handDetector';
import { cameraGesture, pushCameraOrbit, pushCameraPan } from '../services/cameraGesture';
import { detentDeg, handQuat, pickAxis, snapDeg, twistDeg, viewAxisToWorld, type Axis } from '../services/handRotate';

/** 움켜쥐기 회전 이벤트. axis = 월드 축 (축 잠금 전엔 null), deg = 잡은 순간 대비 누적 각도 */
export interface ObjectRotateEvent {
  phase: 'start' | 'update' | 'end';
  axis: Axis | null;
  deg: number;
}

/**
 * 핀치 = 마우스 버튼. down = 핀치 확정(200ms), move = 핀치 유지한 채 손 이동, up = 놓음.
 * screen = 화면 좌표 (0~1). down 지점은 모으기 직전 위치로 고정, move는 그 지점 + 손 이동량
 */
export interface PointerEvent2 {
  phase: 'down' | 'move' | 'up';
  screen: [number, number];
}

/** 음성 해석 결과 표시 (HandBridge가 채움). pending = "맞나요?" 확인 대기 */
export interface VoiceFeedback {
  label: string;
  tone: 'ok' | 'warn' | 'error' | 'info';
  pending?: boolean;
}

interface Props {
  activeTool: CadTool;
  /** 핀치 확정 시 호출. 스냅·기존 노드 병합·빔 연결은 App이 처리 */
  onPinchAction: (tool: CadTool, rawPos: [number, number, number], isNewStroke?: boolean) => void;
  /** 음성 최종 텍스트 / 직접 입력 → HandBridge가 Jev로 해석 (빠른 조작 외엔 Groq로 전달) */
  onVoiceCommand: (rawText: string) => void;
  voiceFeedback?: VoiceFeedback | null;
  /** 확인 대기 명령 실행(true) / 취소(false) */
  onVoiceConfirm?: (ok: boolean) => void;
  /** 3D 씬에 커서 표시용. 화면 좌표가 바뀔 때만 호출 (손 없으면 null) */
  onCursor?: (cursor: HandCursorState | null) => void;
  /** 양손 펴고 벌리기/모으기 → 카메라 줌. factor > 1 확대, < 1 축소 (프레임 간 상대 배율) */
  onCameraZoom?: (factor: number) => void;
  /**
   * ✌️(선택 커서) → 주먹: 선택 확정. App이 지금 가리키는 구조물을 선택 (가리킨 게 없으면 선택 해제).
   * 가리키는 대상 판정은 화면 투영이 필요해서 SceneCanvas가 함 (HandTracker는 커서만 보냄)
   */
  onSelect?: () => void;
  /** 핀치 down/move/up (선택·드래그 편집). 없으면 핀치 = onSelect */
  onPointer?: (e: PointerEvent2) => void;
  /**
   * 움켜쥐기 회전 (축 잠금). start = 잡음(원본 저장 시점), update = 축 잠긴 뒤 각도 변화, end = 놓음(15° 스냅된 최종값).
   * end에서 axis가 null이면 축 판정 전에 놓은 것 → 변화 없음
   */
  onObjectRotate?: (e: ObjectRotateEvent) => void;
}

export interface HandCursorState {
  /** 화면 좌표 (0~1, 좌상단 원점). 마우스 포인터처럼 3D 씬 캔버스 전체에 대응 */
  screen: [number, number];
  pinching: boolean;
  /** true면 다음 핀치가 직전 노드와 빔으로 이어짐 */
  chainActive: boolean;
  /** 선택 커서(✌️) 모드 */
  selecting: boolean;
}

// ─────────────────────────────────────────────────────────────
// 설정값
// ─────────────────────────────────────────────────────────────
/** 커서 화면 좌표 단위 (0~1). 1/1000 = 1080p에서 ~1px → 변화 감지만 줄이고 정밀도는 유지 */
const CURSOR_STEP = 0.001;
/** 오른손 커서가 움직이는 카메라 영역(정규화, 거울 기준). 화면 끝까지 손 뻗지 않아도 되게 */
const ACTIVE_X: [number, number] = [0.15, 0.85];
const ACTIVE_Y: [number, number] = [0.1, 0.9];
/**
 * 커서 감도 (1 = 손 위치를 화면에 그대로 대응, 0.5 = 손을 2배 움직여야 같은 거리).
 * 1 미만이면 마우스처럼 상대 이동: 손 이동량 × 감도만큼 커서가 움직이고 화면 끝에서 멈춤 (끝에서 손을 더 밀면 위치가 다시 맞춰짐).
 * 손이 HANDS_LOST_RESET_MS 이상 사라졌다 나타나면 손 위치로 다시 맞춤
 */
const CURSOR_SENSITIVITY = 0.5;
/**
 * 커서 One Euro 필터 (정규화 화면 좌표 기준).
 * 멈춰 있으면 컷오프 ≈ MIN_CUTOFF → 떨림 강하게 제거, 빠르게 움직이면 컷오프↑ → 지연 적음
 */
const CURSOR_MIN_CUTOFF = 1.2; // Hz. 작을수록 정지 시 더 안정
const CURSOR_BETA = 8; // 속도 반응. 클수록 빠른 움직임에 덜 끌림
const CURSOR_D_CUTOFF = 1; // Hz. 속도 추정 스무딩
/** 커서 기준 랜드마크: 5 = 검지 뿌리 관절 (핀치 동작에 영향 거의 없음) */
const CURSOR_LM = 5;
const PINCH_ON = 0.15; // (엄지-검지 거리) / (손목-중지MCP 거리). 손끝이 실제로 닿아야 ~0.15 이하
const PINCH_OFF = 0.3;
const PINCH_COOLDOWN_MS = 250;
/** ✌️가 이 시간 안에 주먹으로 바뀌면 선택 확정 (그 외 주먹은 체인 끊기만) */
const SELECT_FIST_WINDOW_MS = 600;

// ── 움켜쥐기 회전 (축 잠금) ──
/** 손 방향 쿼터니언 EMA (slerp 비율) */
const ROT_EMA = 0.35;
/** 한 축 성분이 이 각도를 넘어야 축 잠금 */
const ROT_LOCK_DEG = 12;
/** 가장 큰 성분이 두 번째보다 이 배수 이상 커야 잠금 (애매하면 더 돌릴 때까지 대기) */
const ROT_LOCK_RATIO = 1.8;
/** 출력 각도 데드존: 이보다 작은 변화는 무시 (손떨림) */
const ROT_DEADZONE_DEG = 2;
/** 놓을 때 스냅 단위 (회전 중 걸림 간격도 같음) */
const ROT_SNAP_DEG = 15;
/** 회전 중 걸림: 스냅 각도 ±이 범위 안이면 그 각도에 붙어 있음 (클수록 강하게 걸림, ROT_SNAP_DEG/2 미만) */
const ROT_DETENT_HOLD_DEG = 6.5;
/** 90° 배수는 더 강하게 걸림 (±이 범위). 이웃 15° 구간과 겹치면 중간값 없이 바로 다음 걸림으로 점프 (가장 딱딱함) */
const ROT_DETENT_STRONG_DEG = 11;
/**
 * 인식은 20~30Hz라 각도가 계단식으로 들어옴 → 화면 프레임마다 목표 각도로 보간해서 보냄.
 * 이 시간(≈인식 간격)에 걸쳐 따라감. 너무 크면 손보다 늦게 따라옴
 */
const ROT_INTERP_MS = 45;
/** 보간 중 이만큼 바뀔 때만 App에 전달 (App 리렌더 횟수 제한) */
const ROT_EMIT_STEP_DEG = 0.5;

// ── 카메라 드래그 (오른손 3손가락 = 팬, 왼손 3손가락 = 오빗) ──
/** 손바닥 중심 EMA */
const DRAG_EMA = 0.4;
/** 기준점에서 이 거리(정규화 화면) 이내 움직임은 무시 (손떨림). 넘으면 넘은 만큼만 적용 */
const DRAG_DEADZONE = 0.004;
/** 오빗 감도: 손을 웹캠 화면 폭만큼 옮기면 180°, 높이만큼 옮기면 120° */
const ORBIT_YAW_PER_UNIT = 180;
const ORBIT_PITCH_PER_UNIT = 120;

/** 드래그 추적 상태: 모드 진입 시 기준점 리셋 → 진입 순간 카메라가 튀지 않음 */
interface DragTrack {
  smooth: [number, number] | null;
  anchor: [number, number] | null;
}
const newDrag = (): DragTrack => ({ smooth: null, anchor: null });

/**
 * 손바닥 중심(중지MCP 9, 거울 좌표)을 따라가며 데드존 넘은 이동량 반환. 없으면 null
 * 데드존 안 떨림은 무시, 넘으면 기준점이 데드존 거리 유지하며 따라옴 → 천천히 움직여도 연속 적용
 */
function stepDrag(t: DragTrack, lm: NormalizedLandmark[]): [number, number] | null {
  const raw: [number, number] = [1 - lm[9].x, lm[9].y];
  t.smooth = t.smooth ? [lerp(t.smooth[0], raw[0], DRAG_EMA), lerp(t.smooth[1], raw[1], DRAG_EMA)] : raw;
  if (!t.anchor) {
    t.anchor = [...t.smooth];
    return null;
  }
  const dx = t.smooth[0] - t.anchor[0];
  const dy = t.smooth[1] - t.anchor[1];
  const len = Math.hypot(dx, dy);
  if (len <= DRAG_DEADZONE) return null;
  const k = 1 - DRAG_DEADZONE / len;
  const move: [number, number] = [dx * k, dy * k];
  t.anchor = [t.anchor[0] + move[0], t.anchor[1] + move[1]];
  return move;
}
/** 핀치가 이 시간 이상 유지돼야 노드 확정 (주먹 쥐는 도중 엄지·검지가 스치는 오인식 방지) */
const PINCH_CONFIRM_MS = 200;
/**
 * 핀치 손떨림 보정: 엄지·검지를 모으는 동작 자체가 커서를 흔듦 → 모으기 시작하기 직전 위치를 찍음.
 * 모으기 시작 = 핀치 비율이 PINCH_OFF 아래로 내려간 순간. 그보다 LEAD_MS 앞의 커서를 사용
 * (단, 핀치 시작보다 MAX_BACK_MS 이상 과거로는 안 감 → 손가락 붙인 채 조준해도 오래된 위치 안 찍힘)
 */
const PINCH_LOCK_LEAD_MS = 60;
const PINCH_LOCK_MAX_BACK_MS = 350;
const FIST_HOLD_MS = 350;
const HANDS_LOST_RESET_MS = 1000;
/**
 * 기하 주먹 보조 판정: 손끝 4개가 모두 손바닥 중심에서 (손 크기 × 이 값) 이내.
 * 비틀어 쥐거나 손가락이 가려져 접힘 판정이 흔들릴 때용 (예전 학습 분류기 Closed_Fist 대체).
 * 핀치·그리기 자세는 검지 끝이 멀어서 걸리지 않음. 움켜쥐기는 classifyPose에서 먼저 판정됨
 */
const FIST_TIP_MAX = 0.7;

// ── 양손 줌 ──
/** 양손이 이만큼 펴진 채 유지돼야 줌 모드 진입 (스쳐 지나가는 오인식 방지) */
const ZOOM_ENTER_MS = 250;
/** 줌 중 한 손이 잠깐 안 펴진 걸로 잡혀도 이 시간까진 유지 */
const ZOOM_EXIT_MS = 250;
const ZOOM_EMA = 0.3;
/** 손 간격 변화 ±3% 이내는 무시 (손떨림) */
const ZOOM_DEADZONE = 0.03;
/** 손 간격 2배 → 줌 2^GAIN 배 */
const ZOOM_GAIN = 1.6;

// ── 자세 분류 (docs/gesture-spec.md) ──
/** 같은 자세가 이 시간 유지돼야 모드 전환 (손가락 하나 차이 자세끼리 깜빡임 방지) */
const POSE_HOLD_MS = 200;
/** 움켜쥐기(회전 모드 진입)만 더 길게: 손 펴고 오므리는 중간 자세가 잠깐 grab으로 잡혀 의도치 않게 회전 들어가는 것 방지 */
const GRAB_HOLD_MS = 450;
/** 엄지 펴짐 비율 = (엄지끝↔새끼MCP) / (손목↔중지MCP). 접어서 손바닥에 붙이면 작아짐. 히스테리시스 */
const THUMB_OUT = 0.82;
const THUMB_IN = 0.74;
/**
 * 움켜쥐기 = 공을 가볍게 감싸 쥔 손 (완전히 오므린 손 아님).
 * 실측(TEST): 살짝 굽힌 손가락 곧음 s ≈ 0.94 vs 편 손 0.95 → 곧음만으론 구분 불가.
 *             대신 엄지가 손바닥 쪽으로 들어옴: 엄지 비율 t ≈ 1.12~1.15 vs 편 손 1.32~1.37
 * - 4손가락 모두 안 접힘 → 주먹·✌️·3손가락 배제
 * - 곧음 하한 → 갈고리처럼 깊게 오므린 손 배제
 * - 엄지 비율 상한 → 엄지를 벌린 편 손 배제 (핵심 구분)
 * 진입은 좁게, 해제는 넓게 (히스테리시스)
 */
const GRAB_STRAIGHT_MIN_ENTER = 0.7;
const GRAB_STRAIGHT_MIN_EXIT = 0.62;
const GRAB_THUMB_MAX_ENTER = 1.24;
const GRAB_THUMB_MAX_EXIT = 1.3;
/** 엄지끝↔검지끝 / 손 크기. 이보다 붙어 있으면 핀치이지 움켜쥐기 아님 */
const GRAB_MIN_GAP = 0.3;


// ─────────────────────────────────────────────────────────────
// 순수 유틸
// ─────────────────────────────────────────────────────────────

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
type Vec2 = [number, number];
const quantize = (v: number) => Math.round(v / CURSOR_STEP) * CURSOR_STEP;

/** One Euro 필터 (Casiez et al. 2012), 2D */
interface OneEuro2 {
  x: Vec2;
  dx: Vec2;
  t: number;
}
const smoothAlpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
function oneEuroStep(f: OneEuro2 | null, raw: Vec2, now: number): OneEuro2 {
  if (!f) return { x: raw, dx: [0, 0], t: now };
  const dt = Math.max(1e-3, (now - f.t) / 1000);
  const aD = smoothAlpha(CURSOR_D_CUTOFF, dt);
  const dx: Vec2 = [0, 1].map((i) => lerp(f.dx[i], (raw[i] - f.x[i]) / dt, aD)) as Vec2;
  const cutoff = CURSOR_MIN_CUTOFF + CURSOR_BETA * Math.hypot(dx[0], dx[1]);
  const a = smoothAlpha(cutoff, dt);
  return { x: [lerp(f.x[0], raw[0], a), lerp(f.x[1], raw[1], a)], dx, t: now };
}

const dist = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

/** 엄지·검지 거리를 손 크기로 정규화 → 카메라 거리와 무관한 핀치 비율 */
function pinchRatio(lm: NormalizedLandmark[]) {
  const size = dist(lm[0], lm[9]) || 1e-6;
  return dist(lm[4], lm[8]) / size;
}

const dist3 = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/**
 * 손가락이 접혔는지 (3D 월드 좌표, 미터): 끝마디가 PIP 관절보다 손목에 가까우면 접힘.
 * 2D로 보면 주먹 쥘 때 손끝이 카메라 쪽(깊이)으로 말려서 판정이 틀림 → 3D 사용.
 * 핀치할 땐 검지가 엄지 쪽으로 뻗어 있어서 안 접힘 → 주먹과 구분됨
 */
function isCurled(w: Landmark[], tip: number, pip: number) {
  return dist3(w[tip], w[0]) < dist3(w[pip], w[0]);
}

/** 기하 펼침 판정: 검지~새끼 4손가락 모두 안 접힘 */
function isGeometricOpen(w: Landmark[]) {
  return [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].every(([t, p]) => !isCurled(w, t, p));
}

/** 두 손바닥 중심(중지 MCP) 사이 화면 거리. x는 영상 비율 보정 → 사선/가로/세로 모두 같은 척도 */
function palmDistance(a: NormalizedLandmark[], b: NormalizedLandmark[], aspect: number) {
  return Math.hypot((a[9].x - b[9].x) * aspect, a[9].y - b[9].y);
}

/** 기하 주먹 판정: 검지~새끼 4손가락 중 3개 이상 접힘 (꽉 쥐면 새끼 추정이 흔들려서 3/4) */
function isGeometricFist(w: Landmark[]) {
  const curled = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([t, p]) => isCurled(w, t, p)).length;
  if (isCurled(w, 8, 6) && curled >= 3) return true;
  // 보조: 손끝 4개가 모두 손바닥 중심 가까이 (비틀어 쥔 주먹)
  const size = dist3(w[0], w[9]) || 1e-6;
  const c = { x: 0, y: 0, z: 0 };
  for (const i of [0, 5, 9, 13, 17]) {
    c.x += w[i].x / 5;
    c.y += w[i].y / 5;
    c.z += w[i].z / 5;
  }
  return [8, 12, 16, 20].every((i) => dist3(w[i], c as Landmark) / size < FIST_TIP_MAX);
}

// ── 자세 분류 ──
/**
 * draw    = 중·약·새끼 접힘 (엄지·검지 자유 → 핀치 + 왼손 깊이)
 * select  = 검지·중지 펴짐, 약·새끼 접힘, 엄지 접힘 (✌️)
 * pan     = 엄지·검지·중지 펴짐, 약·새끼 접힘
 * grab    = 4손가락 모두 반쯤 굽힘 + 엄지·검지 끝 떨어짐 (공 움켜쥐기)
 * open    = 4손가락 펴짐 (손바닥이 카메라 쪽)
 */
export type HandPose = 'none' | 'draw' | 'select' | 'pan' | 'fist' | 'open' | 'grab';

interface PoseFlags {
  thumbOut: boolean;
  grab: boolean;
}
/** [엄지, 검지, 중지, 약지, 새끼] 펴짐 여부 */
type FingerState = [boolean, boolean, boolean, boolean, boolean];

interface PoseResult extends PoseFlags {
  pose: HandPose;
  fingers: FingerState;
  thumbRatio: number;
  /** 검지~새끼 평균 곧음 (움켜쥐기 판정·튜닝용) */
  straightness: number;
}

const FINGERS: ReadonlyArray<readonly [number, number]> = [
  [8, 6],
  [12, 10],
  [16, 14],
  [20, 18],
];

/** 검지~새끼 [MCP, PIP, DIP, TIP] */
const FINGER_JOINTS: ReadonlyArray<readonly [number, number, number, number]> = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];
/** 손가락별 곧음: MCP→TIP 직선 / 마디 길이 합 (1 = 일직선) */
function fingerStraightness(w: Landmark[]) {
  return FINGER_JOINTS.map(([m, p, d, t]) => {
    const path = dist3(w[m], w[p]) + dist3(w[p], w[d]) + dist3(w[d], w[t]);
    return dist3(w[m], w[t]) / (path || 1e-6);
  });
}

function classifyPose(w: Landmark[], prev: PoseFlags): PoseResult {
  const size = dist3(w[0], w[9]) || 1e-6;
  const thumbRatio = dist3(w[4], w[17]) / size;
  const thumbOut = prev.thumbOut ? thumbRatio > THUMB_IN : thumbRatio > THUMB_OUT;
  const [idx, mid, ring, pinky] = FINGERS.map(([t, p]) => isCurled(w, t, p));
  const openCount = [idx, mid, ring, pinky].filter((c) => !c).length;

  // 움켜쥐기: 4손가락 안 접힘 + 깊게 오므리지 않음 + 엄지가 손바닥 쪽으로 들어옴 + 엄지·검지 끝 떨어짐(붙으면 핀치)
  const straight = fingerStraightness(w);
  const straightness = straight.reduce((a, b) => a + b, 0) / straight.length;
  const minStraight = prev.grab ? GRAB_STRAIGHT_MIN_EXIT : GRAB_STRAIGHT_MIN_ENTER;
  const maxThumb = prev.grab ? GRAB_THUMB_MAX_EXIT : GRAB_THUMB_MAX_ENTER;
  const thumbGap = dist3(w[4], w[8]) / size;
  const grab = openCount === 4 && straightness >= minStraight && thumbRatio < maxThumb && thumbGap > GRAB_MIN_GAP;

  let pose: HandPose;
  // 펼침(open)보다 먼저: 살짝 굽힌 손도 4손가락 '안 접힘'이라 open 조건을 만족함
  if (grab) pose = 'grab';
  else if (isGeometricFist(w)) pose = 'fist';
  else if (mid && ring && pinky) pose = 'draw';
  else if (ring && pinky && !idx && !mid) pose = thumbOut ? 'pan' : 'select';
  else if (openCount === 4) pose = 'open';
  else pose = 'none';
  const fingers: FingerState = [thumbOut, !idx, !mid, !ring, !pinky];
  return { pose, fingers, thumbOut, grab, thumbRatio, straightness };
}

/** 원시 자세가 POSE_HOLD_MS 동안 같아야 stable 갱신 */
interface PoseHold {
  stable: HandPose;
  candidate: HandPose;
  since: number;
  flags: PoseFlags;
  fingers: FingerState | null;
  thumbRatio: number;
  straightness: number;
}
const newPoseHold = (): PoseHold => ({
  stable: 'none',
  candidate: 'none',
  since: 0,
  flags: { thumbOut: false, grab: false },
  fingers: null,
  thumbRatio: 0,
  straightness: 0,
});

function stepPose(h: PoseHold, r: PoseResult, now: number) {
  h.flags = { thumbOut: r.thumbOut, grab: r.grab };
  h.thumbRatio = r.thumbRatio;
  h.straightness = r.straightness;
  h.fingers = r.fingers;
  if (r.pose !== h.candidate) {
    h.candidate = r.pose;
    h.since = now;
  } else if (r.pose !== h.stable && now - h.since >= (r.pose === 'grab' ? GRAB_HOLD_MS : POSE_HOLD_MS)) {
    h.stable = r.pose;
  }
}

/** HUD에 보여줄 현재 모드 */
type UiMode = 'idle' | 'draw' | 'depth' | 'select' | 'pan' | 'orbit' | 'rotate' | 'fist' | 'zoom' | 'drag';
const MODE_LABEL: Record<UiMode, string> = {
  idle: '—',
  draw: '그리기',
  depth: '깊이',
  select: '선택',
  pan: '카메라 이동',
  orbit: '카메라 회전',
  rotate: '물체 회전',
  fist: '주먹',
  zoom: '줌',
  drag: '잡고 끌기',
};
const MODE_COLOR: Record<UiMode, string> = {
  idle: '#5f8f99',
  draw: '#00f3ff',
  depth: '#b478ff',
  select: '#7dff8a',
  pan: '#ffd54a',
  orbit: '#b478ff',
  rotate: '#ff9f43',
  fist: '#ff1e42',
  zoom: '#ffd54a',
  drag: '#ff1e42',
};
/** 이 모드에선 핀치(노드 찍기) 안 함 */
const NO_PINCH_POSES: ReadonlySet<HandPose> = new Set(['select', 'pan', 'grab']);
/** 이 모드에선 그리기 커서 숨김 */
const NO_CURSOR_POSES: ReadonlySet<HandPose> = new Set(['pan', 'grab']);

// ─────────────────────────────────────────────────────────────
// 제스처 테스트 (TEST 버튼): 자세를 순서대로 시키고 인식되는지 자동 채점
// ─────────────────────────────────────────────────────────────
const POSE_LABEL: Record<HandPose, string> = {
  none: '미분류',
  draw: '핀치 선택',
  select: '선택(V)',
  pan: '3손가락',
  fist: '주먹',
  open: '펼침',
  grab: '움켜쥐기',
};

/** 한 프레임의 인식 결과 요약 (테스트 채점용) */
interface PoseSnapshot {
  right: HandPose | null;
  left: HandPose | null;
  mode: UiMode;
  orbit: boolean;
  rightT: number;
  rightS: number;
  leftT: number;
  leftS: number;
  rightFingers: FingerState | null;
  leftFingers: FingerState | null;
  rightGrab: boolean;
  leftGrab: boolean;
  /** 동작 채점용 누적값 (단계 시작 시점 값과 비교) */
  selectFires: number;
  /** 회전 축 잠금된 화면 축 (0=x, 1=y, 2=z) / 그 축 각도 */
  rotView: number | null;
  rotViewDeg: number;
  panTravel: number;
  orbitTravel: number;
}

/** 손 모양 그림 한 손. fingers = [엄지, 검지, 중지, 약지, 새끼] 펴짐 */
interface GlyphHand {
  side: 'right' | 'left';
  fingers: FingerState | null;
  /** 움켜쥐기 자세로 그림 */
  grab?: boolean;
  /** 흐리게 (보조 손: 자세 상관없음) */
  dim?: boolean;
}
interface GlyphSpec {
  hands: GlyphHand[];
  /** drag = 움직이는 화살표, spread = 양손 벌리기 화살표 */
  arrows?: 'drag' | 'spread';
}

/** 스텝에 맞는 '지금 손 모양' (목표 그림과 같은 배치) */
function liveHands(step: GestureTestStep, s: PoseSnapshot): GlyphHand[] {
  const right: GlyphHand = { side: 'right', fingers: s.rightFingers, grab: s.rightGrab };
  const left: GlyphHand = { side: 'left', fingers: s.leftFingers, grab: s.leftGrab };
  if (step.hand === 'right') return [right];
  if (step.hand === 'left') return [left, { ...right, dim: true }];
  return [left, right];
}

interface GestureTestStep {
  id: string;
  title: string;
  how: string;
  hand: 'right' | 'left' | 'both';
  /** 따라 할 손 모양 그림 */
  glyph: GlyphSpec;
  /** b = 단계 시작 시점 스냅샷 (동작 단계에서 누적값 비교용) */
  check: (s: PoseSnapshot, b: PoseSnapshot) => boolean;
  /** true = 자세 유지(1초) 대신 한 번 달성하면 바로 통과 (선택·회전·드래그 같은 동작) */
  instant?: boolean;
  /** 이 단계만 제한시간 다르게 (손 폈다 다시 쥐는 등 준비 동작이 긴 단계) */
  timeoutMs?: number;
  /** "지금:" 칸 표시 (없으면 인식된 자세 이름) */
  observe?: (s: PoseSnapshot, b: PoseSnapshot) => string;
}

const O = true;
const X = false;
const AXIS_LABEL = ['X', 'Y', 'Z'];
const rotObserve = (s: PoseSnapshot) =>
  s.rotView === null
    ? s.right === 'grab'
      ? '움켜쥐기 · 축 판정 중'
      : s.right
        ? POSE_LABEL[s.right]
        : '손 없음'
    : `${AXIS_LABEL[s.rotView]}축 ${Math.round(s.rotViewDeg)}°`;
const GESTURE_TEST_STEPS: GestureTestStep[] = [
  { id: 'draw', title: '핀치 선택', how: '오른손 엄지·검지만 펴고 중·약·새끼 접기', hand: 'right', glyph: { hands: [{ side: 'right', fingers: [O, O, X, X, X] }] }, check: (s) => s.right === 'draw' },
  { id: 'select', title: '선택 커서', how: '오른손 V자 (검지·중지만, 엄지는 접기)', hand: 'right', glyph: { hands: [{ side: 'right', fingers: [X, O, O, X, X] }] }, check: (s) => s.right === 'select' },
  {
    id: 'select_fist',
    title: '선택 확정 (동작)',
    how: 'V자 유지하다가 그대로 주먹 쥐기',
    hand: 'right',
    glyph: { hands: [{ side: 'right', fingers: [X, O, O, X, X] }, { side: 'right', fingers: [X, X, X, X, X] }] },
    instant: true,
    check: (s, b) => s.selectFires > b.selectFires,
  },
  {
    id: 'pan',
    title: '카메라 이동',
    how: '양손 보이게. 왼손은 펴고, 오른손 엄지·검지·중지 펴기',
    hand: 'right',
    glyph: {
      hands: [
        { side: 'right', fingers: [O, O, O, X, X] },
        { side: 'left', fingers: [O, O, O, O, O], dim: true },
      ],
      arrows: 'drag',
    },
    check: (s) => s.mode === 'pan',
    observe: (s) => (s.mode === 'pan' ? '카메라 이동' : s.right === 'pan' ? '오른손 OK · 왼손을 펴기' : s.right ? POSE_LABEL[s.right] : '손 없음'),
  },
  {
    id: 'pan_drag',
    title: '카메라 이동 (동작)',
    how: '왼손 편 채로, 오른손 3손가락을 좌우로 크게 움직이기',
    hand: 'right',
    glyph: {
      hands: [
        { side: 'right', fingers: [O, O, O, X, X] },
        { side: 'left', fingers: [O, O, O, O, O], dim: true },
      ],
      arrows: 'drag',
    },
    instant: true,
    check: (s, b) => s.panTravel - b.panTravel >= 0.15,
    observe: (s, b) => `${s.right ? POSE_LABEL[s.right] : '손 없음'} · 이동 ${Math.round(((s.panTravel - b.panTravel) / 0.15) * 100)}%`,
  },
  { id: 'fist', title: '주먹', how: '오른손 주먹 쥐기', hand: 'right', glyph: { hands: [{ side: 'right', fingers: [X, X, X, X, X] }] }, check: (s) => s.right === 'fist' },
  { id: 'grab', title: '움켜쥐기 (회전)', how: '오른손을 편 상태에서 공을 가볍게 감싸듯 손가락만 살짝 굽히기', hand: 'right', glyph: { hands: [{ side: 'right', fingers: [O, O, O, O, O], grab: true }] }, check: (s) => s.right === 'grab' },
  {
    id: 'rotate_y',
    title: 'Y축 회전 (동작)',
    how: '움켜쥔 채 문고리처럼 45° 이상 비틀기',
    hand: 'right',
    glyph: { hands: [{ side: 'right', fingers: [O, O, O, O, O], grab: true }] },
    instant: true,
    check: (s) => s.rotView === 1 && Math.abs(s.rotViewDeg) >= 45,
    observe: (s) => rotObserve(s),
  },
  {
    id: 'rotate_x',
    title: 'X축 회전 (동작)',
    how: '손 폈다가 다시 움켜쥐고, 팔은 그대로 두고 고개 끄덕이듯 손목만 앞(카메라 쪽)으로 30° 이상 숙이기',
    hand: 'right',
    glyph: { hands: [{ side: 'right', fingers: [O, O, O, O, O], grab: true }] },
    instant: true,
    timeoutMs: 15000,
    check: (s) => s.rotView === 0 && Math.abs(s.rotViewDeg) >= 30,
    // 이전 단계의 Y축 잠금이 남아 있으면 다시 잡으라고 안내
    observe: (s) => (s.rotView === 1 ? 'Y축 잠김 → 손 폈다가 다시 움켜쥐기' : rotObserve(s)),
  },
  {
    id: 'orbit',
    title: '카메라 회전',
    how: '양손 보이게. 오른손은 펴고, 왼손 엄지·검지·중지 펴기',
    hand: 'left',
    glyph: {
      hands: [
        { side: 'left', fingers: [O, O, O, X, X] },
        { side: 'right', fingers: [O, O, O, O, O], dim: true },
      ],
      arrows: 'drag',
    },
    check: (s) => s.orbit,
  },
  {
    id: 'orbit_drag',
    title: '카메라 회전 (동작)',
    how: '오른손 편 채로, 왼손 3손가락을 좌우로 크게 움직이기',
    hand: 'left',
    glyph: {
      hands: [
        { side: 'left', fingers: [O, O, O, X, X] },
        { side: 'right', fingers: [O, O, O, O, O], dim: true },
      ],
      arrows: 'drag',
    },
    instant: true,
    check: (s, b) => s.orbitTravel - b.orbitTravel >= 0.15,
    observe: (s, b) =>
      `${s.orbit ? '카메라 회전' : s.left ? POSE_LABEL[s.left] : '왼손 없음'} · 이동 ${Math.round(((s.orbitTravel - b.orbitTravel) / 0.15) * 100)}%`,
  },
  {
    id: 'zoom',
    title: '줌',
    how: '양손 손바닥을 카메라 쪽으로 펴고 벌리기',
    hand: 'both',
    glyph: {
      hands: [
        { side: 'left', fingers: [O, O, O, O, O] },
        { side: 'right', fingers: [O, O, O, O, O] },
      ],
      arrows: 'spread',
    },
    check: (s) => s.mode === 'zoom',
  },
];

/** 목표 자세가 연속으로 이만큼 유지되면 통과 */
const TEST_HOLD_MS = 1000;
/** 이 시간 안에 통과 못 하면 실패 */
const TEST_TIMEOUT_MS = 8000;
const stepTimeout = (idx: number) => GESTURE_TEST_STEPS[idx]?.timeoutMs ?? TEST_TIMEOUT_MS;
/** 단계 사이 쉬는 시간 (통과/실패 표시) */
const TEST_GAP_MS = 800;

interface TestResult {
  id: string;
  title: string;
  pass: boolean;
  skipped: boolean;
  /** 단계 시작 → 처음 인식까지 (ms) */
  timeMs: number | null;
  /** 해당 손의 엄지 비율 / 손가락 곧음 평균 (인식된 프레임 기준, 없으면 전체) */
  t: number | null;
  s: number | null;
  /** 대신 가장 많이 인식된 것과 비율 */
  topMiss: string | null;
  missPct: number;
}

interface GestureTest {
  active: boolean;
  idx: number;
  stepStart: number;
  matchSince: number;
  firstMatchAt: number;
  skip: boolean;
  misses: Record<string, number>;
  missFrames: number;
  matchAcc: { t: number; s: number; n: number };
  /** 현재 단계 시작 시점 스냅샷 */
  base: PoseSnapshot | null;
  allAcc: { t: number; s: number; n: number };
  lastFlash: 'pass' | 'fail' | 'skip' | null;
  results: TestResult[];
}

const newGestureTest = (now: number, active = true): GestureTest => ({
  active,
  idx: 0,
  stepStart: now,
  matchSince: 0,
  firstMatchAt: 0,
  skip: false,
  misses: {},
  missFrames: 0,
  matchAcc: { t: 0, s: 0, n: 0 },
  allAcc: { t: 0, s: 0, n: 0 },
  lastFlash: null,
  base: null,
  results: [],
});

function observedLabel(step: GestureTestStep, s: PoseSnapshot): string {
  if (step.hand === 'both') return s.mode === 'zoom' ? '줌' : `오른 ${s.right ? POSE_LABEL[s.right] : '없음'} / 왼 ${s.left ? POSE_LABEL[s.left] : '없음'}`;
  const p = step.hand === 'right' ? s.right : s.left;
  if (!p) return step.hand === 'right' ? '손 안 보임' : '왼손 안 보임';
  if (step.hand === 'left' && p === 'pan' && !s.orbit) return '3손가락 (오른손이 핀치 선택 자세라 무시됨)';
  return POSE_LABEL[p];
}

/** 매 프레임 호출. 단계 사이 쉬는 시간엔 stepStart가 미래라서 아무것도 안 함 */
function tickGestureTest(test: GestureTest, s: PoseSnapshot, now: number) {
  if (!test.active || now < test.stepStart) return;
  const step = GESTURE_TEST_STEPS[test.idx];

  const finish = (pass: boolean, skipped: boolean) => {
    const acc = test.matchAcc.n ? test.matchAcc : test.allAcc;
    let topMiss: string | null = null;
    let topN = 0;
    for (const [k, n] of Object.entries(test.misses)) if (n > topN) [topMiss, topN] = [k, n];
    test.results.push({
      id: step.id,
      title: step.title,
      pass,
      skipped,
      timeMs: test.firstMatchAt ? test.firstMatchAt - test.stepStart : null,
      t: acc.n ? acc.t / acc.n : null,
      s: acc.n ? acc.s / acc.n : null,
      topMiss,
      missPct: test.missFrames ? topN / test.missFrames : 0,
    });
    test.lastFlash = skipped ? 'skip' : pass ? 'pass' : 'fail';
    test.idx += 1;
    test.stepStart = now + TEST_GAP_MS;
    test.matchSince = 0;
    test.firstMatchAt = 0;
    test.base = null;
    test.misses = {};
    test.missFrames = 0;
    test.matchAcc = { t: 0, s: 0, n: 0 };
    test.allAcc = { t: 0, s: 0, n: 0 };
    if (test.idx >= GESTURE_TEST_STEPS.length) test.active = false;
  };

  if (test.skip) {
    test.skip = false;
    finish(false, true);
    return;
  }

  const [t, st] = step.hand === 'left' ? [s.leftT, s.leftS] : [s.rightT, s.rightS];
  test.allAcc.t += t;
  test.allAcc.s += st;
  test.allAcc.n += 1;

  if (!test.base) test.base = s;
  if (step.check(s, test.base)) {
    if (step.instant) {
      test.firstMatchAt = now;
      return finish(true, false);
    }
    test.matchAcc.t += t;
    test.matchAcc.s += st;
    test.matchAcc.n += 1;
    if (!test.firstMatchAt) test.firstMatchAt = now;
    if (!test.matchSince) test.matchSince = now;
    else if (now - test.matchSince >= TEST_HOLD_MS) return finish(true, false);
  } else {
    test.matchSince = 0;
    // 동작 단계는 진행률 숫자를 빼고 집계 (같은 상태끼리 묶이게)
    const k = step.observe ? step.observe(s, test.base).replace(/\s*·?\s*[-\d.]+[%°]/g, '').trim() || '-' : observedLabel(step, s);
    test.misses[k] = (test.misses[k] ?? 0) + 1;
    test.missFrames += 1;
  }
  if (now - test.stepStart > stepTimeout(test.idx)) finish(false, false);
}

/** 결과를 텍스트로 (클립보드 복사 → 튜닝 요청용) */
function formatTestResults(results: TestResult[]) {
  const pass = results.filter((r) => r.pass).length;
  const lines = results.map((r) => {
    const mark = r.pass ? 'O' : r.skipped ? '-' : 'X';
    const time = r.timeMs != null ? ` ${(r.timeMs / 1000).toFixed(1)}s` : '';
    const tg = r.t != null ? ` t${r.t.toFixed(2)} s${r.s!.toFixed(2)}` : '';
    const miss = !r.pass && r.topMiss ? ` → ${r.topMiss} ${Math.round(r.missPct * 100)}%` : '';
    return `${mark} ${r.title}${time}${tg}${miss}`;
  });
  return [`제스처 테스트 ${pass}/${results.length} 통과 (THUMB ${THUMB_IN}/${THUMB_OUT}, GRAB s≥${GRAB_STRAIGHT_MIN_ENTER} t<${GRAB_THUMB_MAX_ENTER}, gap>${GRAB_MIN_GAP})`, ...lines].join('\n');
}

interface TestUi {
  running: boolean;
  idx: number;
  progress: number;
  remainingS: number;
  observed: string;
  flash: GestureTest['lastFlash'];
  inGap: boolean;
  /** 지금 카메라가 보는 손 모양 (목표 그림과 비교용) */
  live: GlyphHand[];
  results: TestResult[];
}

const VOICE_TONE: Record<VoiceFeedback['tone'], string> = {
  ok: 'text-[#00f3ff]',
  warn: 'text-[#ff9f43]',
  error: 'text-[#ff1e42]',
  info: 'text-cyan-200/70',
};

// ── Web Speech API 최소 타입 (lib.dom에 없음) ──
interface SpeechResultAlt { transcript: string }
interface SpeechResult { isFinal: boolean; 0: SpeechResultAlt }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface SpeechErrorEvent { error: string }
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRecognitionLike;
const getSpeechCtor = (): SpeechCtor | undefined => {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

// ── MediaPipe HandLandmarker 초기화 (로컬 모델 → 실패 시 CDN, CPU → 실패 시 GPU) ──
/** 실제 WebGL 렌더러 이름. SwiftShader/llvmpipe 등이면 GPU 가속이 꺼진 것 (GPU delegate가 CPU보다 느려짐) */
function webglRenderer(): string {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') ?? document.createElement('canvas').getContext('webgl');
    if (!gl) return 'no-webgl';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch {
    return 'unknown';
  }
}
const SOFTWARE_GL = /swiftshader|llvmpipe|software|basic render/i;

// ─────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────
type TrackStatus = 'off' | 'loading' | 'tracking' | 'error';

interface HudInfo {
  cursor: Vec2 | null;
  pinching: boolean;
  hands: number;
  chainLen: number;
  hint: string;
  gesture: string;
  mode: UiMode;
  /** 왼손 3손가락 = 카메라 회전 자세 */
  orbit: boolean;
  /** 회전 중 표시: "Y축 +45°" / "축 판정 중" (회전 아니면 '') */
  rot: string;
}

const PANEL_W = 320;
const PANEL_H = 180;

export default function HandTracker(props: Props) {
  // App이 매 렌더마다 새 콜백을 넘기므로 ref로 최신값만 참조 (루프 재시작 방지)
  const propsRef = useRef(props);
  useLayoutEffect(() => {
    propsRef.current = props;
  });

  const panelRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [cameraOn, setCameraOn] = useState(true);
  const [status, setStatus] = useState<TrackStatus>('off');
  const [errorMsg, setErrorMsg] = useState('');
  const [info, setInfo] = useState<HudInfo>({
    cursor: null,
    pinching: false,
    hands: 0,
    chainLen: 0,
    hint: '',
    gesture: '',
    mode: 'idle',
    orbit: false,
    rot: '',
  });

  const [testUi, setTestUi] = useState<TestUi | null>(null);
  const [copied, setCopied] = useState(false);
  /** 손 인식 처리 속도 (0.5초마다 갱신). fps = 초당 처리 프레임, ms = 프레임당 인식 시간 평균 */
  /** inf = 추론 시간, logic = 내 제스처 처리 시간, lat = 프레임 캡처 → 결과 도착 (워커 왕복 포함) (ms 평균) */
  const [perf, setPerf] = useState<{ fps: number; inf: number; logic: number; lat: number } | null>(null);
  /** delegate + 실행 위치(워커/메인) + WebGL 렌더러 (소프트웨어 렌더러면 경고) */
  const [backend, setBackend] = useState<{ delegate: string; worker: boolean; gl: string; soft: boolean } | null>(null);
  /** 웹캠이 실제로 협상한 해상도·fps (요청값과 다를 수 있음 → 60 안 나오면 카메라 하드웨어 한계) */
  /** max = 카메라가 지원한다고 알린 최대 fps (getCapabilities, 미지원 브라우저면 0) */
  const [camInfo, setCamInfo] = useState<{ w: number; h: number; fps: number; max: number } | null>(null);
  /** 카메라가 실제로 보내주는 프레임 수 (1초마다 측정). 설정값은 60이어도 어두우면 노출 때문에 30으로 떨어지는 경우가 많음 */
  const [camRealFps, setCamRealFps] = useState(0);

  const [micOn, setMicOn] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceMsg, setVoiceMsg] = useState('');
  const [manualText, setManualText] = useState('');
  const speechSupported = typeof window !== 'undefined' && !!getSpeechCtor();

  // ── 그리기 상태 (렌더와 무관하므로 ref) ──
  const draw = useRef({
    smoothCursor: null as OneEuro2 | null, // 정규화 화면좌표 (One Euro)
    /** 상대 이동 커서 (화면 0~1) / 직전 프레임 손 위치 (활성 영역 기준) */
    relCursor: null as Vec2 | null,
    prevHandScreen: null as Vec2 | null,
    pinching: false,
    lastPinchAt: 0,
    pinchSince: 0,
    pinchCommitted: false,
    /** 최근 커서 기록 (핀치 직전 위치 찾기용, ~0.5초) */
    cursorHist: [] as { t: number; p: Vec2 }[],
    /** 엄지·검지가 모이기 시작한 시각 (비율이 PINCH_OFF 아래로 내려간 순간) */
    closeStart: 0,
    prevPinchRatio: 1,
    /** 핀치 중 고정된 찍을 위치 */
    pinchPos: null as Vec2 | null,
    /** 핀치 확정 후 놓기 전까지 (마우스 버튼 눌림) */
    pointerDown: false,
    /** 핀치 확정 순간의 실제 커서 (드래그 이동량 기준) */
    pointerOrigin: null as Vec2 | null,
    lastPointer: null as Vec2 | null,
    fistSince: 0,
    lastHandsAt: 0,
    chainLen: 0, // 현재 스트로크 노드 수 (0 = 다음 핀치가 새 스트로크)
    rightPose: newPoseHold(),
    leftPose: newPoseHold(),
    /** 제스처 테스트 진행 상태. active 동안 노드 찍기·줌 적용 안 함 */
    test: newGestureTest(0, false),
    /** 마지막으로 stable 자세가 ✌️였던 시각 */
    lastSelectAt: 0,
    prevRightStable: 'none' as HandPose,
    /** ✌️ 유지 중 마지막 커서. 주먹 쥐는 동안 손끝이 움직여도 조준점 고정 */
    selectCursor: null as Vec2 | null,
    /** 움켜쥐기 회전 세션 */
    rot: {
      active: false,
      q0: new THREE.Quaternion(),
      qSmooth: new THREE.Quaternion(),
      /** 잠긴 뷰 축 번호 (0=x, 1=y, 2=z), 잠기기 전 null */
      view: null as number | null,
      world: null as { axis: Axis; sign: 1 | -1 } | null,
      /** 마지막으로 보낸 각도 (데드존 기준) */
      out: 0,
      /** 화면 프레임 보간된 각도 / 마지막으로 App에 보낸 각도 */
      shown: 0,
      emitted: 0,
      /** 잠긴 화면 축 기준 각도 (TEST 채점용, 월드 부호 미적용) */
      viewDeg: 0,
      /** 회전 중 오른손이 마지막으로 보인 시각 */
      seenAt: 0,
    },
    panDrag: newDrag(),
    orbitDrag: newDrag(),
    /** 카메라 조작 잠금: 먼저 시작한 쪽이 끝날 때까지 다른 모드(팬·오빗·물체 회전) 진입 금지 */
    camMode: null as 'pan' | 'orbit' | null,
    /** TEST 채점용 누적 카운터 (테스트 중에도 증가, 실제 동작만 막음) */
    selectFires: 0,
    panTravel: 0,
    orbitTravel: 0,
    zoom: {
      active: false,
      since: 0, // 양손 펼침 시작 시각 (진입 대기)
      offSince: 0, // 펼침 풀린 시각 (종료 대기)
      smooth: 0, // 손 간격 EMA
      anchor: 0, // 마지막으로 줌을 적용한 기준 간격
      total: 1, // 이번 줌 세션 누적 배율 (HUD 표시용)
    },
  });

  const breakChain = useCallback(() => {
    draw.current.chainLen = 0;
  }, []);

  // HUD에서 프리셋/리셋/도구 변경 시 이전 스트로크와 이어지지 않게 패널 밖 클릭 시 체인 끊기
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (panelRef.current?.contains(e.target as Node)) return;
      breakChain();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') breakChain();
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [breakChain]);

  // ── 카메라 + MediaPipe 루프 ──
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    let raf = 0;
    /** requestVideoFrameCallback 핸들 (지원 안 하는 브라우저는 rAF 폴백) */
    let vfc = 0;
    let stream: MediaStream | null = null;
    let detector: HandDetector | null = null;
    let lastVideoTime = -1;
    /** 검출기가 프레임 처리 중 (결과 올 때까지 새 프레임 안 보냄) */
    let busy = false;
    /** 처리 중에 새 카메라 프레임이 왔음 → 결과 오자마자 최신 프레임 보냄 (밀린 프레임은 버림) */
    let pending = false;
    let submittedAt = 0;
    let lastInfoKey = '';
    let lastCursorKey = '';
    let lastHint = '';
    let lastTestKey = '';
    let testWasActive = false;

    const pushTest = (now: number) => {
      const t = draw.current.test;
      // 중간에 중단(STOP)된 테스트는 패널을 다시 띄우지 않음
      if (!t.active && t.idx < GESTURE_TEST_STEPS.length) return;
      const inGap = t.active && now < t.stepStart;
      const progress = t.active && t.matchSince ? Math.min(1, (now - t.matchSince) / TEST_HOLD_MS) : 0;
      const remainingS = t.active ? Math.max(0, Math.ceil((stepTimeout(t.idx) - Math.max(0, now - t.stepStart)) / 1000)) : 0;
      const observed = lastObserved;
      const step = GESTURE_TEST_STEPS[Math.min(t.idx, GESTURE_TEST_STEPS.length - 1)];
      const live = t.active && lastSnap ? liveHands(step, lastSnap) : [];
      const liveKey = live.map((h) => `${h.fingers?.map(Number).join('') ?? '-'}${h.grab ? 'g' : ''}`).join('/');
      const k = `${t.active}|${t.idx}|${Math.round(progress * 10)}|${remainingS}|${observed}|${inGap}|${t.results.length}|${liveKey}`;
      if (k === lastTestKey) return;
      lastTestKey = k;
      setTestUi({
        running: t.active,
        idx: t.idx,
        progress,
        remainingS,
        observed,
        flash: t.lastFlash,
        inGap,
        live,
        results: [...t.results],
      });
    };
    let lastObserved = '';
    let lastSnap: PoseSnapshot | null = null;
    // FPS 측정 (0.5초 창)
    let perfStart = performance.now();
    let perfFrames = 0;
    let perfInf = 0;
    let perfLogic = 0;
    let perfLat = 0;

    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const pushInfo = (next: HudInfo) => {
      // 커서는 촘촘하게 움직이므로 씬 커서(onCursor)는 매번 갱신, HUD 리렌더(setInfo)는 1% 단위로만
      const coarse = next.cursor?.map((v) => Math.round(v * 100)).join(',');
      const k = `${coarse}|${next.pinching}|${next.hands}|${next.chainLen}|${next.hint}|${next.gesture}|${next.mode}|${next.orbit}|${next.rot}`;
      const ck = `${next.cursor?.join(',')}|${next.pinching}|${next.chainLen}`;
      if (k !== lastInfoKey) {
        lastInfoKey = k;
        setInfo(next);
      }
      if (ck !== lastCursorKey) {
        lastCursorKey = ck;
        propsRef.current.onCursor?.(
          next.cursor
            ? {
                screen: next.cursor,
                pinching: next.pinching,
                chainActive: next.chainLen > 0,
                selecting: true, // 그리기 기능 제거 → 커서는 항상 선택용
              }
            : null,
        );
      }
    };

    const process = (res: HandFrame, now: number) => {
      const d = draw.current;
      const hands = res.landmarks;

      // 거울 기준 x가 큰 손 = 사용자 오른손(그리기), 작은 손 = 왼손(깊이)
      // handedness 라벨은 셀카 반전 여부에 따라 뒤바뀌어서 위치 기반이 더 안정적
      let drawIdx = -1;
      let depthIdx = -1;
      if (hands.length === 1) {
        drawIdx = 0;
      } else if (hands.length >= 2) {
        const mx = (i: number) => 1 - hands[i][0].x;
        [depthIdx, drawIdx] = mx(0) < mx(1) ? [0, 1] : [1, 0];
      }
      const drawHand = drawIdx >= 0 ? hands[drawIdx] : null;
      const depthHand = depthIdx >= 0 ? hands[depthIdx] : null;

      if (hands.length > 0) d.lastHandsAt = now;
      else if (d.chainLen > 0 && now - d.lastHandsAt > HANDS_LOST_RESET_MS) breakChain();
      // 손이 오래 안 보였으면 상대 커서를 손 위치로 다시 맞춤
      if (!hands.length && now - d.lastHandsAt > HANDS_LOST_RESET_MS) d.relCursor = null;

      // ── 자세 분류 (200ms 유지돼야 stable 갱신) ──
      const drawWorld = drawIdx >= 0 ? res.worldLandmarks[drawIdx] : undefined;
      const depthWorld = depthIdx >= 0 ? res.worldLandmarks[depthIdx] : undefined;
      if (drawWorld) stepPose(d.rightPose, classifyPose(drawWorld, d.rightPose.flags), now);
      else d.rightPose = newPoseHold();
      if (depthWorld) stepPose(d.leftPose, classifyPose(depthWorld, d.leftPose.flags), now);
      else d.leftPose = newPoseHold();
      const rightPose = d.rightPose.stable;

      // ── ✌️ → 주먹 = 선택 확정 ──
      // 회전 중 옆으로 세운 손이 ✌️로 오인되면 확정 주먹이 선택으로 번짐 → 회전 중엔 기록 안 함
      if (rightPose === 'select' && !d.rot.active) d.lastSelectAt = now;
      if (rightPose === 'fist' && d.prevRightStable !== 'fist' && now - d.lastSelectAt < SELECT_FIST_WINDOW_MS) {
        d.selectFires += 1;
        if (!d.test.active) {
          propsRef.current.onSelect?.();
          breakChain(); // 선택하면 그리던 스트로크도 끝
          lastHint = '선택 확정';
        }
      }
      d.prevRightStable = rightPose;

      // ── 움켜쥐기 → 회전 (축 잠금, 1:1, 주먹 쥐면 15° 스냅 확정) ──
      // 한번 들어가면 주먹 전까지 유지: 손을 옆으로 세우면 움켜쥐기 인식이 자주 풀려서 자세로 유지 판정하면 끊김
      const r = d.rot;
      // 테스트 중엔 각도 계산만 하고 구조물엔 적용 안 함
      const emitRot = (e: ObjectRotateEvent) => !d.test.active && propsRef.current.onObjectRotate?.(e);
      // 줌 중엔 회전 안 함 (양손 펼침 = 줌이 우선)
      if (r.active && drawWorld) r.seenAt = now;
      const rotStart = !r.active && rightPose === 'grab' && !!drawWorld && !d.zoom.active && !d.camMode;
      // 주먹 = 확정. 손이 화면 밖으로 오래 나가도 확정 (안 그러면 회전 모드에 갇힘)
      const rotHold = r.active && rightPose !== 'fist' && now - r.seenAt < HANDS_LOST_RESET_MS;
      if ((rotStart || rotHold) && drawWorld) {
        const qNow = handQuat(drawWorld);
        if (!r.active) {
          r.seenAt = now;
          r.active = true;
          r.q0.copy(qNow);
          r.qSmooth.copy(qNow);
          r.view = null;
          r.world = null;
          r.out = 0;
          r.shown = 0;
          r.emitted = 0;
          r.viewDeg = 0;
          emitRot({ phase: 'start', axis: null, deg: 0 });
        } else {
          r.qSmooth.slerp(qNow, ROT_EMA);
          // 잡은 순간 대비 회전 (뷰 좌표): dq = q_now · q0⁻¹
          const delta = r.qSmooth.clone().multiply(r.q0.clone().invert());
          const tw = [0, 1, 2].map((i) => twistDeg(delta, i));
          if (r.view === null) {
            const a = pickAxis(tw, ROT_LOCK_DEG, ROT_LOCK_RATIO);
            if (a !== null) {
              r.view = a;
              r.world = viewAxisToWorld(a, cameraGesture.cameraQuat);
            }
          }
          if (r.view !== null) r.viewDeg = tw[r.view];
          if (r.view !== null && r.world) {
            const raw = tw[r.view] * r.world.sign;
            // 15°마다 탁 걸림 → 정확한 각도에 맞추기 쉬움
            const target = detentDeg(raw, ROT_SNAP_DEG, ROT_DETENT_HOLD_DEG, ROT_DETENT_STRONG_DEG);
            const onDetent = target === snapDeg(target, ROT_SNAP_DEG);
            // 목표 각도만 갱신. 실제 전달은 animateRot이 화면 프레임마다 보간해서 함
            // 걸림 각도는 데드존 무시하고 바로 붙임 (안 그러면 13.5° 같은 데서 멈춤)
            if (onDetent ? target !== r.out : Math.abs(target - r.out) > ROT_DEADZONE_DEG) r.out = target;
          }
        }
      } else if (r.active && !rotHold) {
        r.active = false;
        const final = r.world ? snapDeg(r.out, ROT_SNAP_DEG) : 0;
        emitRot({ phase: 'end', axis: r.world?.axis ?? null, deg: final });
        // 확정한 주먹이 ✌️→주먹 선택으로 이어지지 않게
        d.lastSelectAt = 0;
        lastHint = r.world
          ? `회전 확정: ${r.world.axis.toUpperCase()}축 ${final >= 0 ? '+' : ''}${final}°`
          : '회전 취소 (축 판정 전에 놓음)';
      }

      // ── 양손 펼침 + 간격 변화 → 카메라 줌 ──
      const z = d.zoom;
      const isOpen = (i: number) => {
        // 움켜쥐기로 잡힌 손도 4손가락이 펴져 있으면 펼침으로 봄 → 양손이면 줌이 우선 (TEST: 줌 중 왼손이 움켜쥐기로 오인됨)
        const w = res.worldLandmarks[i];
        return !!w && isGeometricOpen(w);
      };
      // 오른손이 조준(draw·select) 자세면 줌·카메라 회전 진입 금지 (조준 중 화면이 움직이면 안 됨)
      const depthPriority = rightPose === 'draw' || rightPose === 'select';
      const bothOpen =
        !d.rot.active &&
        !depthPriority && !!drawHand && !!depthHand && isOpen(drawIdx) && isOpen(depthIdx);
      if (bothOpen) {
        z.offSince = 0;
        const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
        const dNow = palmDistance(drawHand, depthHand, aspect);
        if (!z.active) {
          if (!z.since) z.since = now;
          if (now - z.since >= ZOOM_ENTER_MS && dNow > 1e-3) {
            z.active = true;
            z.smooth = dNow;
            z.anchor = dNow;
            z.total = 1;
            d.pinching = false;
            d.smoothCursor = null;
            d.prevHandScreen = null;
            lastHint = '줌 모드: 벌리면 확대 / 모으면 축소';
          }
        } else {
          z.smooth = lerp(z.smooth, dNow, ZOOM_EMA);
          const logR = Math.log(z.smooth / z.anchor);
          if (Math.abs(logR) > ZOOM_DEADZONE) {
            // 데드존 넘은 만큼만 적용하고 기준점이 따라감 → 떨림은 무시, 움직임은 연속
            const sign = Math.sign(logR);
            const factor = Math.exp((logR - sign * ZOOM_DEADZONE) * ZOOM_GAIN);
            if (!d.test.active) propsRef.current.onCameraZoom?.(factor);
            z.total *= factor;
            z.anchor = z.smooth / Math.exp(sign * ZOOM_DEADZONE);
          }
        }
      } else {
        z.since = 0;
        if (z.active) {
          if (!z.offSince) z.offSince = now;
          else if (now - z.offSince > ZOOM_EXIT_MS) {
            z.active = false;
            z.offSince = 0;
            lastHint = `줌 종료 (x${z.total.toFixed(2)})`;
          }
        }
      }
      const zooming = z.active;

      let cursor: Vec2 | null = null;
      if (zooming) {
        // 줌 중엔 그리기 정지: 커서 숨김 + 핀치/주먹 판정 안 함
        d.smoothCursor = null;
        d.prevHandScreen = null;
        d.pinching = false;
        d.fistSince = 0;
      } else if (drawHand) {
        // 커서 = 검지 뿌리 관절(index_mcp, 5번). 엄지·검지를 모아도 거의 안 움직임
        // (손끝 중간점은 엄지가 더 많이 움직이고 손끝이 겹치면 인식도 흔들려서 핀치할 때 커서가 떨렸음)
        const rawX = 1 - drawHand[CURSOR_LM].x;
        const rawY = drawHand[CURSOR_LM].y;
        d.smoothCursor = oneEuroStep(d.smoothCursor, [rawX, rawY], now);

        // 카메라 활성 영역 → 3D 씬 화면 전체 (마우스 포인터처럼 깊이 없음. 카메라 시점과 무관)
        // 활성 영역 밖도 그대로 (상대 이동 계산용, 절대 위치는 clamp)
        const handScreen: Vec2 = [
          (d.smoothCursor.x[0] - ACTIVE_X[0]) / (ACTIVE_X[1] - ACTIVE_X[0]),
          (d.smoothCursor.x[1] - ACTIVE_Y[0]) / (ACTIVE_Y[1] - ACTIVE_Y[0]),
        ];
        let screenPos: Vec2 = [clamp(handScreen[0], 0, 1), clamp(handScreen[1], 0, 1)];
        if (CURSOR_SENSITIVITY < 1) {
          // 손 사라졌다 다시 나타남(오래) → 손 위치로 다시 맞춤
          if (!d.relCursor) d.relCursor = screenPos;
          // 커서가 숨는 자세(카메라 이동·움켜쥐기) 동안엔 멈춰 둠 → 다시 나타날 때 그 자리
          else if (d.prevHandScreen && !NO_CURSOR_POSES.has(rightPose)) {
            d.relCursor = [
              clamp(d.relCursor[0] + (handScreen[0] - d.prevHandScreen[0]) * CURSOR_SENSITIVITY, 0, 1),
              clamp(d.relCursor[1] + (handScreen[1] - d.prevHandScreen[1]) * CURSOR_SENSITIVITY, 0, 1),
            ];
          }
          d.prevHandScreen = handScreen;
          screenPos = d.relCursor;
        }
        const snapped: Vec2 = [quantize(screenPos[0]), quantize(screenPos[1])];
        // 카메라 이동·움켜쥐기 중엔 커서 숨김 (EMA는 계속 → 모드 복귀 시 커서 안 튐)
        if (rightPose === 'select') {
          // 원시 자세가 아직 ✌️일 때만 조준점 갱신. 주먹으로 접는 중(200ms 확인 대기)엔 마지막 조준점 유지
          if (d.rightPose.candidate === 'select' || !d.selectCursor) d.selectCursor = snapped;
          cursor = d.selectCursor;
        } else {
          d.selectCursor = null;
          if (!NO_CURSOR_POSES.has(rightPose)) cursor = snapped;
        }

        // 주먹 판정을 먼저 (기하 판정): 주먹 쥐는 동안 엄지·검지가 가까워져도 핀치로 안 봄
        // 기하 주먹 판정 (접힘 3/4 또는 손끝이 손바닥 중심 가까이). 즉시 판정, 유지시간은 FIST_HOLD_MS
        const fist = !!drawWorld && isGeometricFist(drawWorld);
        // 검지가 접혀 있으면 엄지가 닿아도 핀치 아님 (주먹 쥐는 과정에서 흔함)
        const indexCurled = !!drawWorld && isCurled(drawWorld, 8, 6);

        // 핀치 (히스테리시스 + 유지시간 확인). 선택·카메라 이동·움켜쥐기 모드에선 핀치 안 함
        const ratio = pinchRatio(drawHand);
        if (d.prevPinchRatio >= PINCH_OFF && ratio < PINCH_OFF) d.closeStart = now;
        d.prevPinchRatio = ratio;
        if (!d.pinching) {
          d.cursorHist.push({ t: now, p: snapped });
          while (d.cursorHist.length && now - d.cursorHist[0].t > 500) d.cursorHist.shift();
        }
        if (fist || indexCurled || NO_PINCH_POSES.has(rightPose)) {
          d.pinching = false;
        } else if (!d.pinching && ratio < PINCH_ON) {
          d.pinching = true;
          d.pinchSince = now;
          d.pinchCommitted = false;
          // 모으기 시작 직전 위치로 고정
          const target = Math.max(d.closeStart - PINCH_LOCK_LEAD_MS, now - PINCH_LOCK_MAX_BACK_MS);
          const h = d.cursorHist.find((e) => e.t >= target) ?? d.cursorHist[d.cursorHist.length - 1];
          d.pinchPos = h ? h.p : snapped;
        } else if (d.pinching && ratio > PINCH_OFF) {
          d.pinching = false;
        }
        if (!d.pinching) d.pinchPos = null;
        else if (d.pinchPos && cursor) cursor = d.pinchPos; // 핀치 중엔 커서도 고정 표시

        if (
          d.pinching &&
          !d.pinchCommitted &&
          now - d.pinchSince >= PINCH_CONFIRM_MS &&
          now - d.lastPinchAt > PINCH_COOLDOWN_MS &&
          !d.test.active // 테스트 중엔 노드 안 찍음
        ) {
          // 핀치 = 마우스 버튼 down. 선택/드래그 판정은 HandBridge (가리킨 대상은 SceneCanvas가 커서 위치로 판정)
          d.pinchCommitted = true;
          d.lastPinchAt = now;
          d.selectFires += 1;
          const p = propsRef.current;
          if (p.onPointer) {
            d.pointerDown = true;
            d.pointerOrigin = snapped;
            d.lastPointer = d.pinchPos ?? snapped;
            p.onPointer({ phase: 'down', screen: d.lastPointer });
          } else {
            p.onSelect?.();
            lastHint = '선택 확정';
          }
        }
        // 핀치 유지한 채 이동 = 드래그: 확정 지점 + 손 이동량 (커서도 같이 움직임)
        if (d.pointerDown && d.pinching && d.pinchPos && d.pointerOrigin) {
          const pos: Vec2 = [
            clamp(d.pinchPos[0] + snapped[0] - d.pointerOrigin[0], 0, 1),
            clamp(d.pinchPos[1] + snapped[1] - d.pointerOrigin[1], 0, 1),
          ];
          cursor = pos;
          if (!d.lastPointer || pos[0] !== d.lastPointer[0] || pos[1] !== d.lastPointer[1]) {
            d.lastPointer = pos;
            propsRef.current.onPointer?.({ phase: 'move', screen: pos });
          }
        }

        // 주먹 유지 → 체인 끊기
        if (fist) {
          if (!d.fistSince) d.fistSince = now;
          else if (d.chainLen > 0 && now - d.fistSince > FIST_HOLD_MS) {
            breakChain();
            lastHint = '체인 끊음';
          }
        } else {
          d.fistSince = 0;
        }
      } else {
        d.smoothCursor = null;
        d.prevHandScreen = null;
        d.pinching = false;
        d.fistSince = 0;
      }

      // 핀치가 어떤 이유로든 풀리면 (손 펴기·주먹·줌·손 사라짐) 버튼 up
      if (d.pointerDown && !d.pinching) {
        d.pointerDown = false;
        propsRef.current.onPointer?.({ phase: 'up', screen: d.lastPointer ?? [0.5, 0.5] });
        d.pointerOrigin = null;
      }

      // ── HUD 모드 ──
      // ── 모드 배타: 줌 > 물체 회전 > (팬 | 오빗, 먼저 시작한 쪽 유지) > 손 자세 ──
      // 카메라 이동·회전은 서로 거울 자세: 한 손 3손가락 + 반대 손 펼침 (한 손만 보이면 안 움직임 → 오작동 방지)
      const panWant =
        !zooming && !d.rot.active && !!drawHand && rightPose === 'pan' && depthIdx >= 0 && isOpen(depthIdx);
      const orbitWant =
        !zooming && !d.rot.active && !!depthHand && d.leftPose.stable === 'pan' && drawIdx >= 0 && isOpen(drawIdx);
      if ((d.camMode === 'pan' && !panWant) || (d.camMode === 'orbit' && !orbitWant)) d.camMode = null;
      if (!d.camMode) d.camMode = panWant ? 'pan' : orbitWant ? 'orbit' : null;
      const orbit = d.camMode === 'orbit';
      let mode: UiMode = 'idle';
      if (zooming) mode = 'zoom';
      else if (d.rot.active) mode = 'rotate';
      else if (d.camMode) mode = d.camMode;
      else if (d.pointerDown) mode = 'drag';
      else if (drawHand) {
        const byPose: Record<HandPose, UiMode> = {
          none: 'idle',
          open: 'idle',
          draw: 'select',
          select: 'select',
          pan: 'pan',
          grab: 'rotate',
          fist: 'fist',
        };
        // grab 자세여도 회전이 실제로 시작 안 됐으면(카메라 조작 중 등) 회전으로 표시 안 함
        mode = rightPose === 'grab' ? 'idle' : byPose[rightPose];
      }

      // ── 카메라 드래그: 오른손 3손가락 = 팬, 왼손 3손가락 = 오빗 (한 번에 하나만, 테스트 중엔 안 움직임) ──
      if (d.camMode === 'pan' && drawHand) {
        const m = stepDrag(d.panDrag, drawHand);
        if (m) d.panTravel += Math.hypot(m[0], m[1]);
        if (m && !d.test.active) pushCameraPan(m[0], m[1]);
      } else d.panDrag = newDrag();
      if (orbit && depthHand) {
        const m = stepDrag(d.orbitDrag, depthHand);
        if (m) d.orbitTravel += Math.hypot(m[0], m[1]);
        if (m && !d.test.active) pushCameraOrbit(m[0] * ORBIT_YAW_PER_UNIT, m[1] * ORBIT_PITCH_PER_UNIT);
      } else d.orbitDrag = newDrag();

      // ── 제스처 테스트 채점 ──
      if (d.test.active || testWasActive) {
        const snap: PoseSnapshot = {
          right: drawHand ? rightPose : null,
          left: depthHand ? d.leftPose.stable : null,
          mode,
          orbit,
          rightT: d.rightPose.thumbRatio,
          rightS: d.rightPose.straightness,
          leftT: d.leftPose.thumbRatio,
          leftS: d.leftPose.straightness,
          rightFingers: drawHand ? d.rightPose.fingers : null,
          leftFingers: depthHand ? d.leftPose.fingers : null,
          rightGrab: !!drawHand && d.rightPose.flags.grab,
          leftGrab: !!depthHand && d.leftPose.flags.grab,
          selectFires: d.selectFires,
          rotView: d.rot.active ? d.rot.view : null,
          rotViewDeg: d.rot.viewDeg,
          panTravel: d.panTravel,
          orbitTravel: d.orbitTravel,
        };
        lastSnap = snap;
        const t = d.test;
        if (t.active && now >= t.stepStart) {
          const step = GESTURE_TEST_STEPS[t.idx];
          lastObserved = step.observe ? step.observe(snap, t.base ?? snap) : observedLabel(step, snap);
        }
        tickGestureTest(t, snap, now);
        pushTest(now);
        testWasActive = t.active;
      }

      const zoomLine = zooming && drawHand && depthHand ?([drawHand[9], depthHand[9]] as const) : null;
      const overlayCursor = cursor && d.smoothCursor ? d.smoothCursor.x : null;
      renderOverlay(ctx, canvas, hands, drawHand, overlayCursor, d.pinching, zoomLine, (i) => {
        // 진단: 손가락별 접힘(검·중·약·새 ●=접힘) + 엄지 비율(t) + 손가락 곧음(s) → 임계값 튜닝용
        const w = res.worldLandmarks[i];
        const curl = w ? FINGERS.map(([t, q]) => (isCurled(w, t, q) ? '●' : '○')).join('') : '????';
        const hold = i === drawIdx ? d.rightPose : d.leftPose;
        const tu = `t${hold.thumbRatio.toFixed(2)} s${hold.straightness.toFixed(2)}`;
        if (i !== drawIdx) {
          const role = orbit ? 'ORBIT' : 'LEFT';
          return `${role} ${curl} ${tu}`;
        }
        return `${curl} p${pinchRatio(hands[i]).toFixed(2)} ${tu}`;
      });
      pushInfo({
        cursor,
        pinching: d.pinching,
        hands: hands.length,
        chainLen: d.chainLen,
        hint: lastHint,
        gesture: zooming ? `ZOOM x${z.total.toFixed(2)}` : drawHand && rightPose !== 'none' ? POSE_LABEL[rightPose] : '',
        mode,
        orbit,
        rot: !d.rot.active
          ? ''
          : d.rot.world
            ? `${d.rot.world.axis.toUpperCase()}축 ${d.rot.out >= 0 ? '+' : ''}${Math.round(d.rot.out)}°`
            : '축 판정 중',
      });
    };

    // 새 카메라 프레임이 디코딩되는 즉시 처리 (rAF 폴링은 프레임 도착 후 다음 화면 갱신까지 최대 16ms 더 기다림)
    const hasVfc = 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
    const schedule = () => {
      if (cancelled) return;
      if (hasVfc) vfc = video.requestVideoFrameCallback(loop);
      else raf = requestAnimationFrame(loop);
    };
    // ── 회전 보간: 인식 결과 사이를 화면 프레임(60Hz)으로 채움 ──
    let animRaf = 0;
    let animLast = performance.now();
    const animateRot = () => {
      animRaf = requestAnimationFrame(animateRot);
      const now = performance.now();
      const dt = now - animLast;
      animLast = now;
      const r = draw.current.rot;
      if (!r.active || !r.world || r.shown === r.out) return;
      // 걸림 각도로 들어갈 땐 보간 없이 바로 → "딱" 걸리는 느낌. 걸림 사이 이동만 부드럽게
      if (r.out === snapDeg(r.out, ROT_SNAP_DEG)) r.shown = r.out;
      else r.shown += (r.out - r.shown) * Math.min(1, dt / ROT_INTERP_MS);
      if (Math.abs(r.out - r.shown) < 0.05) r.shown = r.out;
      if (Math.abs(r.shown - r.emitted) >= ROT_EMIT_STEP_DEG || r.shown === r.out) {
        if (r.shown === r.emitted) return;
        r.emitted = r.shown;
        if (!draw.current.test.active) propsRef.current.onObjectRotate?.({ phase: 'update', axis: r.world.axis, deg: r.shown });
      }
    };
    animRaf = requestAnimationFrame(animateRot);

    const submit = () => {
      if (!detector || video.readyState < 2) return;
      busy = true;
      pending = false;
      submittedAt = performance.now();
      detector.submit(video, submittedAt);
    };
    const onResult = (f: HandFrame | null) => {
      busy = false;
      if (cancelled) return;
      if (f) {
        try {
          const t0 = performance.now();
          process(f, t0);
          const t1 = performance.now();
          perfFrames += 1;
          perfInf += f.inferMs;
          perfLogic += t1 - t0;
          perfLat += t0 - submittedAt;
          if (t1 - perfStart >= 500) {
            setPerf({
              fps: (perfFrames * 1000) / (t1 - perfStart),
              inf: perfInf / perfFrames,
              logic: perfLogic / perfFrames,
              lat: perfLat / perfFrames,
            });
            perfStart = t1;
            perfFrames = perfInf = perfLogic = perfLat = 0;
          }
        } catch (e) {
          console.error('[HandTracker] 처리 실패', e);
        }
      }
      if (pending) submit();
    };
    let camFrames = 0;
    let camStart = performance.now();
    let camShown = -1;
    const loop = () => {
      schedule();
      if (!detector || video.readyState < 2) return;
      // 실제 카메라 fps 측정 (rVFC = 새 프레임마다 1회. rAF 폴백이면 화면 주사율이 찍히므로 측정 안 함)
      if (hasVfc) {
        camFrames += 1;
        const t = performance.now();
        if (t - camStart >= 1000) {
          const real = Math.round((camFrames * 1000) / (t - camStart));
          if (real !== camShown) setCamRealFps((camShown = real));
          camFrames = 0;
          camStart = t;
        }
      }
      // rAF 폴백일 때만 의미 있음 (rVFC는 새 프레임마다 한 번씩만 호출됨)
      if (!hasVfc && video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      if (busy) pending = true;
      else submit();
    };

    (async () => {
      setStatus('loading');
      setErrorMsg('');
      try {
        const [lm, s] = await Promise.all([
          createHandDetector(onResult),
          // MediaPipe는 내부에서 192~224px로 줄여 쓰므로 720p는 낭비 (디코드·GPU 업로드 비용만 큼).
          // 싼 웹캠은 저해상도에서만 60fps 모드가 있는 경우가 많음 → 해상도보다 fps 우선
          navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 640 },
              height: { ideal: 360 },
              aspectRatio: { ideal: 16 / 9 },
              frameRate: { ideal: 60 },
              facingMode: 'user',
            },
            audio: false,
          }),
        ]);
        if (cancelled) {
          lm.close();
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        detector = lm;
        stream = s;
        video.srcObject = s;
        await video.play();
        if (cancelled) return;
        const gl = webglRenderer();
        setBackend({ delegate: lm.delegate, worker: lm.kind === 'worker', gl, soft: SOFTWARE_GL.test(gl) });
        console.info('[HandTracker] 검출기', lm.kind, lm.delegate, '/ WebGL', gl);
        const track = s.getVideoTracks()[0];
        const st = track?.getSettings();
        if (st) {
          // getCapabilities는 Firefox 등에서 없음 → 0 (판정은 실측값으로)
          const caps = typeof track.getCapabilities === 'function' ? track.getCapabilities() : undefined;
          const max = caps?.frameRate?.max ?? 0;
          setCamInfo({ w: st.width ?? 0, h: st.height ?? 0, fps: st.frameRate ?? 0, max });
          console.info('[HandTracker] 카메라 설정', st, '/ 최대 fps', max || '알 수 없음');
        }
        setStatus('tracking');
        schedule();
      } catch (e) {
        if (cancelled) return;
        console.error('[HandTracker] 초기화 실패', e);
        setStatus('error');
        setErrorMsg(e instanceof DOMException && e.name === 'NotAllowedError' ? '카메라 권한 거부됨' : String(e));
      }
    })();

    return () => {
      cancelled = true;
      propsRef.current.onCursor?.(null);
      cancelAnimationFrame(raf);
      cancelAnimationFrame(animRaf);
      if (vfc) video.cancelVideoFrameCallback(vfc);
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      detector?.close();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPerf(null);
      setCamInfo(null);
      setBackend(null);
    };
  }, [cameraOn, breakChain]);

  // ── 음성 인식 ──
  const submitText = useCallback((text: string) => {
    setVoiceMsg('');
    propsRef.current.onVoiceCommand(text);
  }, []);

  useEffect(() => {
    if (!micOn) return;
    const Ctor = getSpeechCtor();
    if (!Ctor) return;

    let active = true;
    const rec = new Ctor();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;

    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0].transcript.trim();
        setVoiceText(text);
        if (r.isFinal && text) submitText(text);
      }
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      // network: Chromium 계열(구글 API 키 없음)에서 주로 발생 → Chrome 사용 또는 직접 입력
      setVoiceMsg(`음성 오류: ${e.error}`);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'network') {
        active = false;
        setMicOn(false);
      }
    };
    // continuous여도 브라우저가 주기적으로 끊음 → 자동 재시작
    rec.onend = () => {
      if (active) {
        try {
          rec.start();
        } catch {
          /* 이미 시작됨 */
        }
      }
    };

    try {
      rec.start();
    } catch (e) {
      console.error('[HandTracker] 음성 시작 실패', e);
    }

    return () => {
      active = false;
      rec.onend = null;
      rec.abort();
    };
  }, [micOn, submitText]);

  const onManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    const text = manualText.trim();
    if (!text) return;
    submitText(text);
    setManualText('');
  };

  // ── 제스처 테스트 제어 ──
  const startTest = () => {
    // 첫 단계 전에도 잠깐 준비 시간
    draw.current.test = newGestureTest(performance.now() + TEST_GAP_MS);
    setCopied(false);
    setTestUi({ running: true, idx: 0, progress: 0, remainingS: Math.ceil(stepTimeout(0) / 1000), observed: '', flash: null, inGap: true, live: [], results: [] });
  };
  const skipStep = () => {
    draw.current.test.skip = true;
  };
  const stopTest = () => {
    draw.current.test.active = false;
    setTestUi(null);
  };
  const copyResults = async () => {
    if (!testUi) return;
    try {
      await navigator.clipboard.writeText(formatTestResults(testUi.results));
      setCopied(true);
    } catch (e) {
      console.warn('[HandTracker] 클립보드 복사 실패', e);
    }
  };

  // ── UI ──
  const shownStatus: TrackStatus = cameraOn ? status : 'off';
  const statusLabel: Record<TrackStatus, string> = {
    off: '카메라 꺼짐',
    loading: '모델 로딩 중…',
    tracking: info.hands ? `손 ${info.hands}개 추적` : '손을 보여주세요',
    error: errorMsg || '오류',
  };

  return (
    <div
      ref={panelRef}
      className="fixed bottom-[78px] right-4 z-50 w-[320px] select-none font-mono text-[11px] text-cyan-300"
    >
      {/* 상태줄: 카메라 화면 위에 띄움 (화면 위에 겹치면 손 영상이 가려짐) */}
      <div className="mb-1.5 flex flex-col gap-1">
        <div className="flex items-center justify-between rounded border border-cyan-400/40 bg-black/70 px-2 py-1">
          <span className={shownStatus === 'error' ? 'text-[#ff1e42]' : ''}>{statusLabel[shownStatus]}</span>
          <div className="flex gap-1">
            <button
              onClick={testUi?.running ? stopTest : startTest}
              disabled={shownStatus !== 'tracking'}
              className="rounded border border-[#7dff8a]/70 px-1.5 text-[#7dff8a] hover:bg-[#7dff8a]/20 disabled:opacity-40"
              title="제스처를 순서대로 시키고 인식 정확도를 채점"
            >
              {testUi?.running ? 'STOP' : 'TEST'}
            </button>
            <button
              onClick={() => setCameraOn((v) => !v)}
              className="rounded border border-cyan-400/60 px-1.5 hover:bg-cyan-400/20"
            >
              {cameraOn ? 'CAM ON' : 'CAM OFF'}
            </button>
          </div>
        </div>
        <div className="flex flex-wrap gap-1 empty:hidden">
          {shownStatus === 'tracking' && perf && (
            <span
              className="rounded border border-cyan-400/30 bg-black/70 px-1.5 py-0.5 tabular-nums"
              style={{ color: perf.fps >= 55 ? '#7dff8a' : perf.fps >= 30 ? '#ffd54a' : '#ff1e42' }}
              title={`손 인식: 초당 처리 프레임/카메라 최대 · 추론+제스처처리 · 캡처→결과 지연 · W=워커 M=메인스레드${camInfo ? ` · 카메라 ${camInfo.w}x${camInfo.h} 설정 ${Math.round(camInfo.fps)}fps · 지원 최대 ${camInfo.max ? Math.round(camInfo.max) : '?'}fps · 실측 ${camRealFps || '?'}fps` : ''}${backend ? ` · WebGL: ${backend.gl}` : ''}`}
            >
              {`${Math.round(perf.fps)}${camRealFps ? `/${camRealFps}` : camInfo ? `/${Math.round(camInfo.fps)}` : ''}fps · 인식${perf.inf.toFixed(0)}+${perf.logic.toFixed(0)} 지연${perf.lat.toFixed(0)}ms`}
              {backend && ` · ${backend.delegate}${backend.worker ? '·W' : '·M'}${backend.soft ? '·SW' : ''}`}
            </span>
          )}
          {shownStatus === 'tracking' && camInfo && (() => {
            // 지원 최대가 60 미만이면 하드웨어 한계, 지원은 되는데 실측이 낮으면 조명(노출) 문제
            const hwLimit = camInfo.max > 0 && camInfo.max < 55;
            const lowReal = camRealFps > 0 && camRealFps < 50;
            if (!hwLimit && !lowReal) return null;
            return (
              <span
                className="rounded border border-[#ffd54a]/60 bg-black/70 px-1.5 py-0.5 text-[#ffd54a]"
                title={hwLimit ? '이 카메라는 60fps 모드가 없음' : '카메라는 60fps 지원하지만 실제로는 덜 나옴. 보통 어두워서 노출 시간이 길어진 것 → 조명을 밝게'}
              >
                {hwLimit ? `카메라 최대 ${Math.round(camInfo.max)}fps` : `카메라 ${camRealFps}fps · 조명 확인`}
              </span>
            );
          })()}
        </div>
      </div>

      <div
        className="relative overflow-hidden rounded border border-cyan-400/60 bg-black/70 shadow-[0_0_18px_rgba(0,243,255,0.25)]"
        style={{ width: PANEL_W, height: PANEL_H }}
      >
        <video
          ref={videoRef}
          className="absolute inset-0 h-full w-full -scale-x-100 object-cover opacity-50"
          playsInline
          muted
        />
        <canvas ref={canvasRef} width={PANEL_W * 2} height={PANEL_H * 2} className="absolute inset-0 h-full w-full" />

        {/* 현재 모드 배지 */}
        {shownStatus === 'tracking' && info.hands > 0 && (
          <div className="absolute left-2 top-2 flex gap-1 text-[13px] font-bold">
            <span
              className="rounded border bg-black/70 px-2 py-0.5"
              style={{ color: MODE_COLOR[info.mode], borderColor: MODE_COLOR[info.mode] }}
            >
              {MODE_LABEL[info.mode]}
              {info.rot && ` · ${info.rot}`}
            </span>
          </div>
        )}

        {/* 하단 좌표 readout */}
        {shownStatus === 'tracking' && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-between bg-black/50 px-2 py-1">
            <span>
              {info.cursor
                ? `X ${Math.round(info.cursor[0] * 100)}%  Y ${Math.round(info.cursor[1] * 100)}%`
                : 'X —  Y —'}
            </span>
            <span className={info.pinching ? 'text-[#ff1e42]' : ''}>
              {info.pinching ? 'PINCH' : info.gesture || '—'}
            </span>
          </div>
        )}
      </div>

      {info.hint && shownStatus === 'tracking' && <div className="mt-1 text-cyan-200/80">▸ {info.hint}</div>}

      {/* 제스처 테스트 */}
      {testUi && <GestureTestPanel ui={testUi} copied={copied} onSkip={skipStep} onStop={stopTest} onRetry={startTest} onCopy={copyResults} />}

      {/* 음성/하중 입력 */}
      <div className="mt-2 rounded border border-cyan-400/40 bg-black/70 p-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setVoiceMsg(micOn ? '' : '듣는 중… 예: "반바퀴 돌려봐"');
              setMicOn(!micOn);
            }}
            disabled={!speechSupported}
            className={`rounded border px-2 py-0.5 ${
              micOn ? 'border-[#ff1e42] text-[#ff1e42]' : 'border-cyan-400/60 hover:bg-cyan-400/20'
            } disabled:opacity-40`}
          >
            {micOn ? '● MIC' : 'MIC'}
          </button>
          <form onSubmit={onManualSubmit} className="flex flex-1 gap-1">
            <input
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              placeholder="하중 100kg / 반바퀴 돌려봐"
              className="w-full rounded border border-cyan-400/40 bg-transparent px-1.5 py-0.5 outline-none focus:border-cyan-300"
            />
            <button type="submit" className="rounded border border-cyan-400/60 px-2 hover:bg-cyan-400/20">
              적용
            </button>
          </form>
        </div>
        {!speechSupported && <div className="mt-1 text-cyan-200/60">이 브라우저는 음성 인식 미지원 → 직접 입력</div>}
        {voiceText && <div className="mt-1 truncate text-cyan-100">“{voiceText}”</div>}
        {voiceMsg && <div className="mt-0.5 text-cyan-200/70">{voiceMsg}</div>}
        {props.voiceFeedback && (
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className={`truncate ${VOICE_TONE[props.voiceFeedback.tone]}`}>{props.voiceFeedback.label}</span>
            {props.voiceFeedback.pending && (
              <>
                <button onClick={() => props.onVoiceConfirm?.(true)} className="rounded border border-[#00f3ff]/70 px-1.5 hover:bg-cyan-400/20">
                  실행
                </button>
                <button onClick={() => props.onVoiceConfirm?.(false)} className="rounded border border-cyan-400/40 px-1.5 hover:bg-cyan-400/20">
                  취소
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 제스처 테스트 패널
// ─────────────────────────────────────────────────────────────
function GestureTestPanel(props: {
  ui: TestUi;
  copied: boolean;
  onSkip: () => void;
  onStop: () => void;
  onRetry: () => void;
  onCopy: () => void;
}) {
  const { ui, copied } = props;
  const total = GESTURE_TEST_STEPS.length;
  const btn = 'rounded border px-2 py-0.5 hover:bg-white/10';

  if (!ui.running) {
    const pass = ui.results.filter((r) => r.pass).length;
    return (
      <div className="mt-2 rounded border border-[#7dff8a]/60 bg-black/85 p-2">
        <div className="mb-1 flex items-center justify-between">
          <span className={`font-bold ${pass === total ? 'text-[#7dff8a]' : 'text-[#ffd54a]'}`}>
            결과 {pass}/{total} 통과
          </span>
          <div className="flex gap-1">
            <button onClick={props.onCopy} className={`${btn} border-cyan-400/60`}>
              {copied ? '복사됨' : '복사'}
            </button>
            <button onClick={props.onRetry} className={`${btn} border-[#7dff8a]/70 text-[#7dff8a]`}>
              다시
            </button>
            <button onClick={props.onStop} className={`${btn} border-cyan-400/40`}>
              닫기
            </button>
          </div>
        </div>
        <ul className="space-y-0.5">
          {ui.results.map((r) => (
            <li key={r.id} className={r.pass ? 'text-[#7dff8a]' : r.skipped ? 'text-cyan-200/50' : 'text-[#ff1e42]'}>
              <span className="inline-block w-4">{r.pass ? 'O' : r.skipped ? '-' : 'X'}</span>
              {r.title}
              <span className="text-cyan-200/70">
                {r.timeMs != null && ` ${(r.timeMs / 1000).toFixed(1)}s`}
                {r.t != null && ` t${r.t.toFixed(2)} s${r.s!.toFixed(2)}`}
              </span>
              {!r.pass && r.topMiss && (
                <div className="pl-4 text-cyan-200/60">
                  대신 인식: {r.topMiss} ({Math.round(r.missPct * 100)}%)
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const step = GESTURE_TEST_STEPS[Math.min(ui.idx, total - 1)];
  const last = ui.results[ui.results.length - 1];
  return (
    <div className="mt-2 rounded border border-[#7dff8a]/60 bg-black/85 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-cyan-200/70">
          제스처 테스트 {Math.min(ui.idx + 1, total)}/{total}
        </span>
        <div className="flex gap-1">
          <button onClick={props.onSkip} disabled={ui.inGap} className={`${btn} border-cyan-400/60 disabled:opacity-40`}>
            건너뛰기
          </button>
          <button onClick={props.onStop} className={`${btn} border-[#ff1e42]/70 text-[#ff1e42]`}>
            중단
          </button>
        </div>
      </div>

      {ui.inGap && last ? (
        <div className={`py-3 text-center text-base font-bold ${last.pass ? 'text-[#7dff8a]' : 'text-[#ff1e42]'}`}>
          {last.pass ? `${last.title} 통과` : last.skipped ? `${last.title} 건너뜀` : `${last.title} 실패`}
        </div>
      ) : (
        <>
          <div className="text-base font-bold text-[#7dff8a]">{step.title}</div>
          <div className="text-cyan-100">{step.how}</div>
          <div className="mt-1 flex items-end justify-around">
            <div className="flex flex-col items-center">
              <HandGlyph spec={step.glyph} size={64} />
              <span className="text-[10px] text-[#7dff8a]">따라 하기</span>
            </div>
            <div className="flex flex-col items-center">
              <HandGlyph spec={{ hands: ui.live, arrows: step.glyph.arrows }} target={step.glyph} size={48} live />
              <span className="text-[10px] text-cyan-200/70">지금 인식 (빨강 = 다름)</span>
            </div>
          </div>
          <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-cyan-900/50">
            <div
              className="h-full bg-[#7dff8a] transition-[width] duration-100"
              style={{ width: `${Math.round(ui.progress * 100)}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-cyan-200/80">
            <span>지금: {ui.inGap ? '준비…' : ui.observed || '—'}</span>
            <span>{ui.remainingS}s</span>
          </div>
        </>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 손 모양 그림 (SVG). 사용자가 화면(거울) 속 자기 손과 같은 방향으로 보이게:
// 오른손 = 엄지가 왼쪽, 왼손 = 엄지가 오른쪽
// ─────────────────────────────────────────────────────────────
const GLYPH_ON = '#7dff8a';
const GLYPH_LIVE = '#00f3ff';
const GLYPH_BAD = '#ff1e42';
const GLYPH_OFF = '#1d3a40';

/** 검지~새끼: [중심 x, 펼 때 끝 y] (viewBox 100×120, 오른손 기준) */
const FINGER_GEOM: Array<[number, number]> = [
  [36, 16],
  [48, 8],
  [60, 14],
  [71, 26],
];

function GlyphHandSvg({
  hand,
  target,
  live,
}: {
  hand: GlyphHand;
  target?: GlyphHand;
  live?: boolean;
}) {
  const stroke = hand.dim ? '#3b6a73' : '#00f3ff';
  const base = live ? GLYPH_LIVE : GLYPH_ON;
  const colorOf = (i: number) => {
    const on = hand.fingers?.[i];
    // 목표와 다르면 빨강 (보조 손은 비교 안 함)
    if (live && target && !target.dim && target.fingers && hand.fingers && target.fingers[i] !== on) return GLYPH_BAD;
    if (hand.dim) return on ? '#2f5a62' : GLYPH_OFF;
    return on ? base : GLYPH_OFF;
  };
  const flip = hand.side === 'left' ? 'translate(100 0) scale(-1 1)' : undefined;

  if (!hand.fingers) {
    return (
      <g transform={flip}>
        <rect x="26" y="40" width="50" height="60" rx="14" fill="none" stroke="#3b6a73" strokeDasharray="5 4" strokeWidth="2" />
        <text x="51" y="78" textAnchor="middle" fontSize="22" fill="#3b6a73" transform={flip ? 'translate(102 0) scale(-1 1)' : undefined}>
          ?
        </text>
      </g>
    );
  }

  if (hand.grab) {
    // 움켜쥐기: 반쯤 굽힌 손가락이 공을 감싸는 모양
    const badGrab = live && target && !target.dim && !target.grab;
    const c = badGrab ? GLYPH_BAD : base;
    return (
      <g transform={flip}>
        {/* 편 손에서 손가락만 살짝 굽힘 + 손 앞에 가볍게 쥔 공 */}
        <rect x="28" y="56" width="50" height="46" rx="13" fill="#0e2a31" stroke={badGrab ? GLYPH_BAD : stroke} strokeWidth="2.5" />
        {FINGER_GEOM.map(([cx, tipY], k) => (
          <path
            key={k}
            d={`M${cx} 60 L${cx} ${tipY + 14} Q${cx} ${tipY + 2} ${cx - 6} ${tipY + 2}`}
            stroke={c}
            strokeWidth="8"
            strokeLinecap="round"
            fill="none"
          />
        ))}
        <path d="M28 88 Q14 74 18 58 Q20 52 25 51" stroke={c} strokeWidth="8" strokeLinecap="round" fill="none" />
        <circle cx="52" cy="52" r="17" fill="#ff9f43" fillOpacity="0.22" stroke="#ff9f43" strokeWidth="2.5" />
      </g>
    );
  }

  const badPalm = live && target && !target.dim && target.grab;
  const [thumbOn] = hand.fingers;
  return (
    <g transform={flip}>
      {/* 손바닥 */}
      <rect x="28" y="52" width="50" height="50" rx="13" fill="#0e2a31" stroke={badPalm ? GLYPH_BAD : stroke} strokeWidth="2.5" />
      {/* 검지~새끼 */}
      {FINGER_GEOM.map(([cx, tipY], k) => {
        const i = k + 1;
        const on = hand.fingers![i];
        const c = colorOf(i);
        return on ? (
          <rect key={i} x={cx - 5} y={tipY} width="10" height={58 - tipY} rx="5" fill={c} fillOpacity="0.85" stroke={c} strokeWidth="1.5" />
        ) : (
          <rect key={i} x={cx - 5.5} y="44" width="11" height="16" rx="5.5" fill={c} stroke={c === GLYPH_BAD ? c : stroke} strokeWidth="1.5" />
        );
      })}
      {/* 엄지 */}
      {thumbOn ? (
        <rect
          x="14"
          y="54"
          width="11"
          height="34"
          rx="5.5"
          transform="rotate(-38 26 86)"
          fill={colorOf(0)}
          fillOpacity="0.85"
          stroke={colorOf(0)}
          strokeWidth="1.5"
        />
      ) : (
        <rect x="32" y="74" width="34" height="11" rx="5.5" fill={colorOf(0)} stroke={colorOf(0) === GLYPH_BAD ? GLYPH_BAD : stroke} strokeWidth="1.5" />
      )}
    </g>
  );
}

function HandGlyph({ spec, target, size, live }: { spec: GlyphSpec; target?: GlyphSpec; size: number; live?: boolean }) {
  const n = Math.max(1, spec.hands.length);
  const w = 100 * n + (spec.arrows === 'spread' ? 30 : 0);
  return (
    <svg viewBox={`0 0 ${w} 120`} height={size} width={(size * w) / 120} className="overflow-visible">
      {spec.hands.map((h, i) => {
        const x = i * 100 + (spec.arrows === 'spread' && i > 0 ? 30 : 0);
        return (
          <g key={i} transform={`translate(${x} 0)`}>
            <GlyphHandSvg hand={h} target={target?.hands[i]} live={live} />
            <text x="50" y="117" textAnchor="middle" fontSize="13" fill={h.dim ? '#3b6a73' : '#8fdbe3'}>
              {h.side === 'right' ? '오른손' : '왼손'}
            </text>
          </g>
        );
      })}
      {spec.arrows === 'spread' && (
        <path d={`M${100 + 2} 70 h26 M${100 + 2} 70 l6 -6 M${100 + 2} 70 l6 6 M${128} 70 l-6 -6 M${128} 70 l-6 6`} stroke="#ffd54a" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}
      {spec.arrows === 'drag' && (
        <path d="M8 22 h20 M8 22 l5 -5 M8 22 l5 5 M28 22 l-5 -5 M28 22 l-5 5" stroke="#ffd54a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// 2D 오버레이 렌더링 (웹캠 미리보기 위 스켈레톤)
// ─────────────────────────────────────────────────────────────
function renderOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hands: NormalizedLandmark[][],
  drawHand: NormalizedLandmark[] | null,
  cursor: [number, number] | null,
  pinching: boolean,
  zoomLine: readonly [NormalizedLandmark, NormalizedLandmark] | null,
  labelOf: (i: number) => string,
) {
  const { width: w, height: h } = canvas;
  ctx.clearRect(0, 0, w, h);

  // 활성 영역 가이드
  ctx.strokeStyle = 'rgba(0,243,255,0.25)';
  ctx.setLineDash([6, 6]);
  ctx.lineWidth = 2;
  ctx.strokeRect(ACTIVE_X[0] * w, ACTIVE_Y[0] * h, (ACTIVE_X[1] - ACTIVE_X[0]) * w, (ACTIVE_Y[1] - ACTIVE_Y[0]) * h);
  ctx.setLineDash([]);

  hands.forEach((lm, i) => {
    const isDraw = lm === drawHand;
    const px = (p: NormalizedLandmark) => (1 - p.x) * w;
    const py = (p: NormalizedLandmark) => p.y * h;

    ctx.strokeStyle = isDraw ? 'rgba(0,243,255,0.9)' : 'rgba(180,120,255,0.8)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
      ctx.moveTo(px(lm[start]), py(lm[start]));
      ctx.lineTo(px(lm[end]), py(lm[end]));
    }
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    for (const p of lm) {
      ctx.beginPath();
      ctx.arc(px(p), py(p), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // 진단 라벨: 이 손을 무엇으로 쓰는지 (손목 아래)
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = isDraw ? '#00f3ff' : '#b478ff';
    ctx.fillText(labelOf(i), px(lm[0]) - 40, Math.min(h - 8, py(lm[0]) + 30));
  });

  // 줌 중: 두 손바닥을 잇는 선
  if (zoomLine) {
    const [a, b] = zoomLine;
    ctx.strokeStyle = '#ffd54a';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 8]);
    ctx.beginPath();
    ctx.moveTo((1 - a.x) * w, a.y * h);
    ctx.lineTo((1 - b.x) * w, b.y * h);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (cursor) {
    const cx = cursor[0] * w;
    const cy = cursor[1] * h;
    ctx.strokeStyle = pinching ? '#ff1e42' : '#00f3ff';
    ctx.fillStyle = pinching ? 'rgba(255,30,66,0.35)' : 'rgba(0,243,255,0.15)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, pinching ? 10 : 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}
