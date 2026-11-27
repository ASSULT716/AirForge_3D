//(조원호) MediaPipe 스켈레톤 + 핀치/음성
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { GestureRecognizer, type Landmark, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import wasmLoaderUrl from '@mediapipe/tasks-vision/vision_wasm_internal.js?url';
import wasmBinaryUrl from '@mediapipe/tasks-vision/vision_wasm_internal.wasm?url';
import { CadTool } from '../types/cad';

interface Props {
  activeTool: CadTool;
  /** 핀치 확정 시 호출. 스냅·기존 노드 병합·빔 연결은 App이 처리 */
  onPinchAction: (tool: CadTool, rawPos: [number, number, number], isNewStroke?: boolean) => void;
  /** 음성 최종 텍스트 / 직접 입력 → App(executeNaturalCommand)이 해석 */
  onVoiceCommand: (rawText: string) => void;
  /** 3D 씬에 커서 표시용. 스냅된 월드 좌표가 바뀔 때만 호출 (손 없으면 null) */
  onCursor?: (cursor: HandCursorState | null) => void;
}

export interface HandCursorState {
  /** 핀치 시 노드가 찍힐 스냅 좌표 */
  position: [number, number, number];
  pinching: boolean;
  /** true면 다음 핀치가 직전 노드와 빔으로 이어짐 */
  chainActive: boolean;
}

// ─────────────────────────────────────────────────────────────
// 설정값 (SceneCanvas 카메라 확정되면 WORLD_* 범위만 맞추면 됨)
// ─────────────────────────────────────────────────────────────
const GRID = 0.25;
const WORLD_X: [number, number] = [-4, 4];
const WORLD_Y: [number, number] = [0, 4]; // 화면 아래 = 지면(y=0)
const WORLD_Z: [number, number] = [-2, 2];
/** 오른손 커서가 움직이는 카메라 영역(정규화, 거울 기준). 화면 끝까지 손 뻗지 않아도 되게 */
const ACTIVE_X: [number, number] = [0.15, 0.85];
const ACTIVE_Y: [number, number] = [0.1, 0.9];
/** 왼손 손목 높이 → z 매핑 영역. 손 올리면 화면 안쪽(-z) */
const DEPTH_Y: [number, number] = [0.2, 0.8];

const EMA_ALPHA = 0.35; // 클수록 반응 빠름, 작을수록 부드러움
const PINCH_ON = 0.3; // (엄지-검지 거리) / (손목-중지MCP 거리)
const PINCH_OFF = 0.45;
const PINCH_COOLDOWN_MS = 250;
/** 핀치가 이 시간 이상 유지돼야 노드 확정 (주먹 쥐는 도중 엄지·검지가 스치는 오인식 방지) */
const PINCH_CONFIRM_MS = 120;
const FIST_HOLD_MS = 350;
const HANDS_LOST_RESET_MS = 1000;
/** GestureRecognizer가 이 점수 이상으로 Closed_Fist라고 하면 주먹 */
const FIST_SCORE = 0.6;

const LOCAL_MODEL_URL = `${import.meta.env.BASE_URL}models/gesture_recognizer.task`;
const REMOTE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task';

// ─────────────────────────────────────────────────────────────
// 순수 유틸
// ─────────────────────────────────────────────────────────────
type Vec3 = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const invLerp = (lo: number, hi: number, v: number) => clamp((v - lo) / (hi - lo), 0, 1);
const snap = (v: number) => {
  const s = Math.round(v / GRID) * GRID;
  return s === 0 ? 0 : s; // -0 제거
};
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

/** 기하 주먹 판정: 검지~새끼 4손가락 중 3개 이상 접힘 (꽉 쥐면 새끼 추정이 흔들려서 3/4) */
function isGeometricFist(w: Landmark[]) {
  const curled = [
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ].filter(([t, p]) => isCurled(w, t, p)).length;
  return isCurled(w, 8, 6) && curled >= 3;
}

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

// ── MediaPipe GestureRecognizer 초기화 (랜드마크 + 학습된 제스처 분류 동시 제공) (로컬 모델 → 실패 시 CDN, GPU → 실패 시 CPU) ──
async function createRecognizer(): Promise<GestureRecognizer> {
  const fileset = { wasmLoaderPath: wasmLoaderUrl, wasmBinaryPath: wasmBinaryUrl };
  const attempts: Array<{ model: string; delegate: 'GPU' | 'CPU' }> = [
    { model: LOCAL_MODEL_URL, delegate: 'GPU' },
    { model: LOCAL_MODEL_URL, delegate: 'CPU' },
    { model: REMOTE_MODEL_URL, delegate: 'GPU' },
    { model: REMOTE_MODEL_URL, delegate: 'CPU' },
  ];
  let lastErr: unknown;
  for (const a of attempts) {
    try {
      return await GestureRecognizer.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: a.model, delegate: a.delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        // 두 번째 손(왼손)이 잘 잡히도록 HandLandmarker 때보다 낮춤
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        cannedGesturesClassifierOptions: { scoreThreshold: 0.3 },
      });
    } catch (e) {
      lastErr = e;
      console.warn(`[HandTracker] recognizer 생성 실패 (${a.delegate}, ${a.model})`, e);
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────
// 컴포넌트
// ─────────────────────────────────────────────────────────────
type TrackStatus = 'off' | 'loading' | 'tracking' | 'error';

interface HudInfo {
  cursor: Vec3 | null;
  pinching: boolean;
  hands: number;
  chainLen: number;
  hint: string;
  gesture: string;
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
  const [info, setInfo] = useState<HudInfo>({ cursor: null, pinching: false, hands: 0, chainLen: 0, hint: '', gesture: '' });

  const [micOn, setMicOn] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [voiceMsg, setVoiceMsg] = useState('');
  const [manualText, setManualText] = useState('');
  const speechSupported = typeof window !== 'undefined' && !!getSpeechCtor();

  // ── 그리기 상태 (렌더와 무관하므로 ref) ──
  const draw = useRef({
    smoothCursor: null as [number, number] | null, // 정규화 화면좌표 EMA
    smoothDepth: 0.5, // 왼손 높이 EMA (0~1)
    zLayer: 0,
    pinching: false,
    lastPinchAt: 0,
    pinchSince: 0,
    pinchCommitted: false,
    fistSince: 0,
    lastHandsAt: 0,
    chainLen: 0, // 현재 스트로크 노드 수 (0 = 다음 핀치가 새 스트로크)
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

  // ── 핀치 확정 → App에 도구 동작 위임 ──
  const commitPoint = useCallback((pos: Vec3): string => {
    const d = draw.current;
    const tool = propsRef.current.activeTool;
    const isNewStroke = d.chainLen === 0;
    propsRef.current.onPinchAction(tool, pos, isNewStroke);
    if (tool !== 'draw') return tool;
    d.chainLen += 1;
    return isNewStroke ? (pos[1] <= 0 ? '고정 노드에서 시작' : '스트로크 시작') : '빔 연결';
  }, []);

  // ── 카메라 + MediaPipe 루프 ──
  useEffect(() => {
    if (!cameraOn) return;
    let cancelled = false;
    let raf = 0;
    let stream: MediaStream | null = null;
    let landmarker: GestureRecognizer | null = null;
    let lastVideoTime = -1;
    let lastInfoKey = '';
    let lastHint = '';

    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;

    const pushInfo = (next: HudInfo) => {
      const k = `${next.cursor?.join(',')}|${next.pinching}|${next.hands}|${next.chainLen}|${next.hint}|${next.gesture}`;
      if (k !== lastInfoKey) {
        lastInfoKey = k;
        setInfo(next);
        propsRef.current.onCursor?.(
          next.cursor ? { position: next.cursor, pinching: next.pinching, chainActive: next.chainLen > 0 } : null,
        );
      }
    };

    const process = (now: number) => {
      const res = landmarker!.recognizeForVideo(video, now);
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
      const top = drawIdx >= 0 ? res.gestures[drawIdx]?.[0] : undefined;
      const gesture = top && top.categoryName !== 'None' ? top.categoryName : '';

      if (hands.length > 0) d.lastHandsAt = now;
      else if (d.chainLen > 0 && now - d.lastHandsAt > HANDS_LOST_RESET_MS) breakChain();

      // 왼손 → z 레이어 (안 보이면 마지막 값 유지)
      if (depthHand) {
        d.smoothDepth = lerp(d.smoothDepth, depthHand[0].y, EMA_ALPHA);
        const t = invLerp(DEPTH_Y[0], DEPTH_Y[1], d.smoothDepth); // 0=위, 1=아래
        d.zLayer = snap(lerp(WORLD_Z[0], WORLD_Z[1], t));
      }

      let cursor: Vec3 | null = null;
      if (drawHand) {
        // 엄지·검지 중간점 = 커서 (핀치할 때 커서가 튀지 않음)
        const rawX = 1 - (drawHand[4].x + drawHand[8].x) / 2;
        const rawY = (drawHand[4].y + drawHand[8].y) / 2;
        d.smoothCursor = d.smoothCursor
          ? [lerp(d.smoothCursor[0], rawX, EMA_ALPHA), lerp(d.smoothCursor[1], rawY, EMA_ALPHA)]
          : [rawX, rawY];

        const tx = invLerp(ACTIVE_X[0], ACTIVE_X[1], d.smoothCursor[0]);
        const ty = invLerp(ACTIVE_Y[0], ACTIVE_Y[1], d.smoothCursor[1]);
        cursor = [snap(lerp(WORLD_X[0], WORLD_X[1], tx)), snap(lerp(WORLD_Y[1], WORLD_Y[0], ty)), d.zLayer];

        // 주먹 판정을 먼저 (학습 모델 분류): 주먹 쥐는 동안 엄지·검지가 가까워져도 핀치로 안 봄
        // 모델(Closed_Fist) 또는 기하 판정 중 하나라도 주먹이면 주먹
        const modelFist = top?.categoryName === 'Closed_Fist' && top.score >= FIST_SCORE;
        const world = res.worldLandmarks[drawIdx];
        const fist = modelFist || (!!world && isGeometricFist(world));
        // 검지가 접혀 있으면 엄지가 닿아도 핀치 아님 (주먹 쥐는 과정에서 흔함)
        const indexCurled = !!world && isCurled(world, 8, 6);

        // 핀치 (히스테리시스 + 유지시간 확인)
        const ratio = pinchRatio(drawHand);
        if (fist || indexCurled) {
          d.pinching = false;
        } else if (!d.pinching && ratio < PINCH_ON) {
          d.pinching = true;
          d.pinchSince = now;
          d.pinchCommitted = false;
        } else if (d.pinching && ratio > PINCH_OFF) {
          d.pinching = false;
        }

        if (
          d.pinching &&
          !d.pinchCommitted &&
          now - d.pinchSince >= PINCH_CONFIRM_MS &&
          now - d.lastPinchAt > PINCH_COOLDOWN_MS
        ) {
          d.pinchCommitted = true;
          d.lastPinchAt = now;
          lastHint = commitPoint(cursor);
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
        d.pinching = false;
        d.fistSince = 0;
      }

      renderOverlay(ctx, canvas, hands, drawHand, d.smoothCursor, d.pinching, (i) => {
        const g = res.gestures[i]?.[0]?.categoryName ?? '';
        if (i !== drawIdx) return `DEPTH z=${d.zLayer.toFixed(2)}`;
        // 진단: 손가락별 접힘(검·중·약·새 ●=접힘) + 핀치 비율 + 모델 제스처
        const w = res.worldLandmarks[i];
        const curl = w
          ? [[8, 6], [12, 10], [16, 14], [20, 18]].map(([t, q]) => (isCurled(w, t, q) ? '●' : '○')).join('')
          : '????';
        return `${curl} p${pinchRatio(hands[i]).toFixed(2)} ${g || '-'}`;
      });
      pushInfo({ cursor, pinching: d.pinching, hands: hands.length, chainLen: d.chainLen, hint: lastHint, gesture });
    };

    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!landmarker || video.readyState < 2 || video.currentTime === lastVideoTime) return;
      lastVideoTime = video.currentTime;
      try {
        process(performance.now());
      } catch (e) {
        console.error('[HandTracker] detect 실패', e);
      }
    };

    (async () => {
      setStatus('loading');
      setErrorMsg('');
      try {
        const [lm, s] = await Promise.all([
          createRecognizer(),
          navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 60 }, facingMode: 'user' },
            audio: false,
          }),
        ]);
        if (cancelled) {
          lm.close();
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        landmarker = lm;
        stream = s;
        video.srcObject = s;
        await video.play();
        if (cancelled) return;
        setStatus('tracking');
        raf = requestAnimationFrame(loop);
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
      stream?.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      landmarker?.close();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
  }, [cameraOn, breakChain, commitPoint]);

  // ── 음성 인식 ──
  const submitText = useCallback((text: string) => {
    setVoiceMsg(`전송: "${text}"`);
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
      className="fixed bottom-4 right-4 z-50 w-[320px] select-none font-mono text-[11px] text-cyan-300"
    >
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

        {/* 상단 상태줄 */}
        <div className="absolute left-0 right-0 top-0 flex items-center justify-between bg-black/50 px-2 py-1">
          <span className={shownStatus === 'error' ? 'text-[#ff1e42]' : ''}>{statusLabel[shownStatus]}</span>
          <button
            onClick={() => setCameraOn((v) => !v)}
            className="rounded border border-cyan-400/60 px-1.5 hover:bg-cyan-400/20"
          >
            {cameraOn ? 'CAM ON' : 'CAM OFF'}
          </button>
        </div>

        {/* 하단 좌표 readout */}
        {shownStatus === 'tracking' && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-between bg-black/50 px-2 py-1">
            <span>
              {info.cursor
                ? `X ${info.cursor[0].toFixed(2)}  Y ${info.cursor[1].toFixed(2)}  Z ${info.cursor[2].toFixed(2)}`
                : 'X —  Y —  Z —'}
            </span>
            <span className={info.pinching ? 'text-[#ff1e42]' : ''}>
              {`${info.pinching ? 'PINCH' : info.gesture || '—'} · 체인 ${info.chainLen}`}
            </span>
          </div>
        )}
      </div>

      {info.hint && shownStatus === 'tracking' && <div className="mt-1 text-cyan-200/80">▸ {info.hint}</div>}

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
      </div>
    </div>
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
    for (const { start, end } of GestureRecognizer.HAND_CONNECTIONS) {
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
