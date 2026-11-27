// (조원호) 핀치 드래그 편집 버스
// HandBridge(Canvas 밖)가 핀치 down/move/up을 넣고, HandSceneLayer의 DragController(Canvas 안, 카메라 있음)가
// 화면 좌표 → 3D 거리로 바꿔서 onEdit으로 돌려줌 → HandBridge가 구조물에 적용.
// 연속 값이라 React state를 거치지 않음 (cameraGesture와 같은 방식)
import type { EditOp, PickDetail } from '../services/sketchOps';

export interface DragInput {
  /** 드래그마다 새 번호 (DragController가 새 드래그 시작 감지) */
  id: number;
  /** 핀치 확정 지점 (화면 0~1) */
  start: [number, number];
  /** 현재 지점 */
  screen: [number, number];
  /** 핀치 놓음 */
  ended: boolean;
}

export interface EditEvent {
  phase: 'start' | 'update' | 'end';
  op: EditOp | null;
  /** op 방향 기준 거리 (m, 0.25 스냅). + = 바깥/끄는 방향 */
  dist: number;
}

let seq = 0;

export const editBus = {
  drag: null as DragInput | null,
  /** 음성으로 정확한 거리 지정 ("2미터") → 드래그 중이면 이 값으로 고정 */
  overrideDist: null as number | null,
  /** HandBridge가 등록. update면 실제 적용된 거리 반환 (최소 두께·지면 제한) */
  onEdit: null as ((e: EditEvent) => { dist: number; through?: boolean } | void) | null,
};

export function beginDrag(screen: [number, number]) {
  editBus.overrideDist = null;
  editBus.drag = { id: ++seq, start: screen, screen, ended: false };
}
export function moveDrag(screen: [number, number]) {
  if (editBus.drag && !editBus.drag.ended) editBus.drag.screen = screen;
}
export function endDrag() {
  if (editBus.drag) editBus.drag.ended = true;
}

// ── 가리킨 지점 기록 (SelectionPicker → DragController/면 표시) ──
/** 커서가 이 시간 안에 맞춘 지점까지 유효 (핀치 확정 200ms 동안 커서가 고정돼 있으므로 넉넉히) */
const PICK_VALID_MS = 700;
const pickMemo: { hit: PickDetail | null; at: number } = { hit: null, at: 0 };

export function notePick(hit: PickDetail | null) {
  if (hit) {
    pickMemo.hit = hit;
    pickMemo.at = performance.now();
  }
}
export function recentPick(): PickDetail | null {
  return pickMemo.hit && performance.now() - pickMemo.at < PICK_VALID_MS ? pickMemo.hit : null;
}
