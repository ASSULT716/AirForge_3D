// (조원호) MediaPipe HandLandmarker를 메인 스레드 밖에서 실행.
// 저사양 기기에서 추론(수십 ms)이 3D 렌더·HUD를 멈추지 않게 함.
// 모듈 워커에선 importScripts가 안 되므로 ES 모듈판 WASM 로더(vision_wasm_module_internal)를 씀
import { HandLandmarker } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_module_internal.wasm?url';
import { HAND_OPTIONS, type HandWorkerIn, type HandWorkerOut } from './handWorkerProtocol';

const ctx = self as unknown as {
  postMessage(m: HandWorkerOut): void;
  onmessage: ((e: MessageEvent<HandWorkerIn>) => void) | null;
};

let landmarker: HandLandmarker | null = null;
/** detectForVideo 타임스탬프는 단조 증가해야 함 */
let lastTs = -1;

async function init(models: string[], delegates: Array<'CPU' | 'GPU'>) {
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
  let lastErr: unknown;
  for (const model of models) {
    for (const delegate of delegates) {
      try {
        landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: model, delegate },
          ...HAND_OPTIONS,
        });
        ctx.postMessage({ type: 'ready', delegate });
        return;
      } catch (e) {
        lastErr = e;
        console.warn(`[handWorker] 생성 실패 (${delegate}, ${model})`, e);
      }
    }
  }
  ctx.postMessage({ type: 'error', message: String(lastErr) });
}

ctx.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === 'init') {
    void init(msg.models, msg.delegates);
    return;
  }
  if (msg.type === 'frame') {
    const { bitmap } = msg;
    try {
      if (!landmarker) return;
      const ts = Math.max(msg.ts, lastTs + 1);
      lastTs = ts;
      const t0 = performance.now();
      const res = landmarker.detectForVideo(bitmap, ts);
      ctx.postMessage({
        type: 'result',
        id: msg.id,
        landmarks: res.landmarks,
        worldLandmarks: res.worldLandmarks,
        inferMs: performance.now() - t0,
      });
    } catch (err) {
      ctx.postMessage({ type: 'result', id: msg.id, landmarks: [], worldLandmarks: [], inferMs: 0, error: String(err) });
    } finally {
      bitmap.close();
    }
    return;
  }
  if (msg.type === 'close') {
    landmarker?.close();
    landmarker = null;
  }
};
