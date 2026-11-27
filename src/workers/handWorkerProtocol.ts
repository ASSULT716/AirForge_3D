// (조원호) HandTracker ↔ handLandmarker.worker 메시지 규격
import type { Landmark, NormalizedLandmark } from '@mediapipe/tasks-vision';

/** 워커·메인 폴백 공통 HandLandmarker 옵션 */
export const HAND_OPTIONS = {
  runningMode: 'VIDEO' as const,
  numHands: 2,
  minHandDetectionConfidence: 0.5,
  minHandPresenceConfidence: 0.5,
  minTrackingConfidence: 0.5,
};

export type HandWorkerIn =
  | { type: 'init'; models: string[]; delegates: Array<'CPU' | 'GPU'> }
  /** bitmap은 transfer로 넘김 (워커가 close) */
  | { type: 'frame'; id: number; ts: number; bitmap: ImageBitmap }
  | { type: 'close' };

export type HandWorkerOut =
  | { type: 'ready'; delegate: 'CPU' | 'GPU' }
  | { type: 'error'; message: string }
  | {
      type: 'result';
      id: number;
      landmarks: NormalizedLandmark[][];
      worldLandmarks: Landmark[][];
      inferMs: number;
      error?: string;
    };
