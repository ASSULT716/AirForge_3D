// (조원호) 손 입력 상태 공유 store
// HandBridge(Canvas 밖)와 HandSceneLayer(Canvas 안)가 App/SceneCanvas props를 거치지 않고 통신.
// → 공유 파일(App.tsx, SceneCanvas.tsx)에는 연결점 1줄씩만 남기기 위함
import { useSyncExternalStore } from 'react';
import type { Selection } from '../services/selection';

export interface SceneHandCursor {
  position: [number, number, number];
  pinching: boolean;
  /** 핀치하면 이 좌표에서 커서까지 빔이 생김 (없으면 새 스트로크) */
  linkFrom: [number, number, number] | null;
  /** 선택 커서(✌️) 모드: 초록 링 + 가리킨 구조물 하이라이트 */
  selecting: boolean;
}

export interface HandState {
  cursor: SceneHandCursor | null;
  /** 선택 커서가 가리키는 구조물 (노랑) */
  hover: Selection | null;
  /** 확정된 선택 (초록) */
  selected: Selection | null;
}

let state: HandState = { cursor: null, hover: null, selected: null };
const listeners = new Set<() => void>();

export const handStore = {
  get: () => state,
  set(patch: Partial<HandState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useHandState(): HandState {
  return useSyncExternalStore(handStore.subscribe, handStore.get);
}

/** 선택 커서가 구조물에서 벗어난 뒤에도 이 시간 동안은 주먹 쥐면 그 구조물 선택 (주먹 쥐는 사이 커서가 흔들림) */
const HOVER_GRACE_MS = 600;
const hoverMemo: { sel: Selection | null; until: number } = { sel: null, until: 0 };

/** HandSceneLayer → hover 변경 시 호출 */
export function setHover(sel: Selection | null) {
  if (sel) {
    hoverMemo.sel = sel;
    hoverMemo.until = Infinity;
  } else {
    hoverMemo.until = performance.now() + HOVER_GRACE_MS;
  }
  handStore.set({ hover: sel });
}

/** 주먹 확정 시점에 선택할 대상 (grace 시간 포함) */
export function hoveredForSelect(): Selection | null {
  return hoverMemo.sel && performance.now() < hoverMemo.until ? hoverMemo.sel : null;
}
