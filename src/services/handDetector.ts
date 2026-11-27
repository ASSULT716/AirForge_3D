// (조원호) 손 랜드마크 검출기: 기본은 Web Worker (메인 스레드 안 막음), 실패 시 메인 스레드로 자동 폴백.
// URL 옵션: ?delegate=GPU (기본 CPU) / ?noworker (메인 스레드 강제, 비교용)
import { HandLandmarker, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { HAND_OPTIONS, type HandWorkerIn, type HandWorkerOut } from '../workers/handWorkerProtocol';

// HandLandmarker = GestureRecognizer에서 제스처 분류기만 뺀 것 (랜드마크 모델 동일). 자세는 전부 기하 판정
const LOCAL_MODEL_URL = `${import.meta.env.BASE_URL}models/hand_landmarker.task`;
const REMOTE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';
/** 워커가 이 시간 안에 모델 로딩을 못 끝내면 메인 스레드로 폴백 */
const WORKER_INIT_TIMEOUT_MS = 30000;

export interface HandFrame {
  landmarks: NormalizedLandmark[][];
  worldLandmarks: Landmark[][];
  /** 순수 추론 시간 (ms) */
  inferMs: number;
}

export interface HandDetector {
  kind: 'worker' | 'main';
  delegate: 'CPU' | 'GPU';
  /**
   * 현재 비디오 프레임 처리 요청. 결과는 onResult로 한 번 옴 (main은 동기, worker는 비동기).
   * 프레임 캡처 실패 등으로 버려지면 onResult(null) → 호출 측은 busy만 풀면 됨
   */
  submit(video: HTMLVideoElement, ts: number): void;
  close(): void;
}

/** 기본 CPU: 내장 그래픽에선 three.js 렌더와 GPU를 나눠 써서 GPU delegate가 더 느림 (실측 99ms vs 55ms) */
function delegateOrder(): Array<'CPU' | 'GPU'> {
  const forced = new URLSearchParams(location.search).get('delegate')?.toUpperCase();
  return forced === 'GPU' ? ['GPU', 'CPU'] : ['CPU', 'GPU'];
}

const modelUrls = () => [new URL(LOCAL_MODEL_URL, location.href).href, REMOTE_MODEL_URL];

export async function createHandDetector(onResult: (f: HandFrame | null) => void): Promise<HandDetector> {
  const models = modelUrls();
  const delegates = delegateOrder();
  if (!new URLSearchParams(location.search).has('noworker') && typeof Worker !== 'undefined') {
    try {
      return await createWorkerDetector(models, delegates, onResult);
    } catch (e) {
      console.warn('[handDetector] 워커 초기화 실패 → 메인 스레드로 폴백', e);
    }
  }
  return createMainDetector(models, delegates, onResult);
}

function createWorkerDetector(
  models: string[],
  delegates: Array<'CPU' | 'GPU'>,
  onResult: (f: HandFrame | null) => void,
): Promise<HandDetector> {
  return new Promise((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('../workers/handLandmarker.worker.ts', import.meta.url), { type: 'module' });
    } catch (e) {
      reject(e);
      return;
    }
    const post = (m: HandWorkerIn, transfer: Transferable[] = []) => worker.postMessage(m, transfer);
    let closed = false;
    let frameId = 0;
    const fail = (err: unknown) => {
      clearTimeout(timer);
      worker.terminate();
      reject(err);
    };
    const timer = setTimeout(() => fail(new Error('워커 모델 로딩 시간 초과')), WORKER_INIT_TIMEOUT_MS);
    worker.onerror = (e) => fail(new Error(e.message || '워커 스크립트 오류'));

    worker.onmessage = (e: MessageEvent<HandWorkerOut>) => {
      const m = e.data;
      if (m.type === 'ready') {
        clearTimeout(timer);
        worker.onerror = (ev) => console.error('[handDetector] 워커 오류', ev.message);
        resolve({
          kind: 'worker',
          delegate: m.delegate,
          submit(video, ts) {
            // 비디오 프레임 → ImageBitmap (transfer라 복사 없음). 워커가 close 함
            createImageBitmap(video)
              .then((bitmap) => {
                if (closed) return bitmap.close();
                post({ type: 'frame', id: ++frameId, ts, bitmap }, [bitmap]);
              })
              .catch((err) => {
                console.warn('[handDetector] 프레임 캡처 실패', err);
                if (!closed) onResult(null);
              });
          },
          close() {
            closed = true;
            post({ type: 'close' });
            worker.terminate();
          },
        });
      } else if (m.type === 'error') {
        fail(new Error(m.message));
      } else if (m.type === 'result') {
        if (closed) return;
        if (m.error) {
          console.warn('[handDetector] 추론 실패', m.error);
          onResult(null);
        } else onResult(m);
      }
    };
    post({ type: 'init', models, delegates });
  });
}

async function createMainDetector(
  models: string[],
  delegates: Array<'CPU' | 'GPU'>,
  onResult: (f: HandFrame | null) => void,
): Promise<HandDetector> {
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
  let lastErr: unknown;
  for (const model of models) {
    for (const delegate of delegates) {
      try {
        const lm = await HandLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: model, delegate }, ...HAND_OPTIONS });
        let lastTs = -1;
        return {
          kind: 'main',
          delegate,
          submit(video, ts) {
            const t = Math.max(ts, lastTs + 1);
            lastTs = t;
            const t0 = performance.now();
            let r;
            try {
              r = lm.detectForVideo(video, t);
            } catch (e) {
              console.error('[handDetector] detect 실패', e);
              onResult(null);
              return;
            }
            onResult({ landmarks: r.landmarks, worldLandmarks: r.worldLandmarks, inferMs: performance.now() - t0 });
          },
          close: () => lm.close(),
        };
      } catch (e) {
        lastErr = e;
        console.warn(`[handDetector] 생성 실패 (${delegate}, ${model})`, e);
      }
    }
  }
  throw lastErr;
}
