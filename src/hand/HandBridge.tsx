// (조원호) App ↔ 손 입력 연결점. App.tsx에는 <HandBridge ... /> 한 줄만 둠.
// HandTracker(웹캠·음성) + 손 선택 + 움켜쥐기 회전 처리. 3D 표시는 HandSceneLayer가 담당.
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CadTool, StructureState } from '../types/cad';
import HandTracker, { type HandCursorState, type ObjectRotateEvent, type VoiceFeedback } from '../components/HandTracker';
import { pushCameraZoom } from '../services/cameraGesture';
import { describeSelection, pruneSelection, type Selection } from '../services/selection';
import { applySession, startSession, type Axis, type RotateSession } from '../services/handRotate';
import { interpretVoice, parseConfirmReply, type VoiceCommand } from '../services/voice/voiceCommand';
import { applyVoiceCommand } from '../services/voice/applyVoice';
import { handStore, hoveredForSelect } from './handStore';

interface Props {
  structure: StructureState;
  setStructure: Dispatch<SetStateAction<StructureState>>;
  /** 핀치 확정 → 노드·빔 생성 (App 소유. 팀장 도구 move/deform도 같은 함수) */
  onPinchAction: (tool: CadTool, rawPos: [number, number, number], isNewStroke?: boolean) => void;
  /** 빠른 조작이 아닌 음성 / Jev 실패 → App(Groq AI 설계)으로 원문 전달 */
  onVoiceCommand: (rawText: string) => void;
  /** 직전에 그린 노드 (그리기 제거 후 미사용. App 연결점 유지용) */
  lastDrawnNodeIdRef: MutableRefObject<string | null>;
}

/** 단일 솔리드 선택이면 팀장의 PartInspector가 열리도록 selectedPartId도 맞춤 */
const partIdOf = (sel: Selection | null) =>
  sel && sel.nodeIds.length === 0 && sel.solidIds.length === 1 ? sel.solidIds[0] : null;

/** "이 명령 맞나요?" 대기 시간. 지나면 자동 취소 */
const CONFIRM_TIMEOUT_MS = 10000;

export default function HandBridge({ structure, setStructure, onPinchAction, onVoiceCommand }: Props) {
  const structureRef = useRef(structure);
  structureRef.current = structure;

  // 삭제·리셋·프리셋 로드·회전으로 구조물이 바뀌면 선택 정리 (center도 갱신)
  useEffect(() => {
    const { hover, selected } = handStore.get();
    if (!hover && !selected) return;
    handStore.set({
      hover: hover && pruneSelection(structure, hover),
      selected: selected && pruneSelection(structure, selected),
    });
  }, [structure]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handStore.set({ selected: null });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleCursor = (c: HandCursorState | null) => {
    if (!c) return handStore.set({ cursor: null });
    handStore.set({ cursor: { screen: c.screen, pinching: c.pinching, selecting: c.selecting } });
  };

  // ✌️ 조준 → 주먹 확정. 이미 선택된 구조물을 다시 고르면 해제 (토글)
  const handleSelect = () => {
    const hovered = hoveredForSelect();
    const sel = hovered && hovered.key === handStore.get().selected?.key ? null : hovered;
    handStore.set({ selected: sel });
    setStructure((p) => ({
      ...p,
      selectedPartId: partIdOf(sel),
      statusMessage: sel ? `선택: ${describeSelection(sel)}` : '선택 해제',
    }));
  };

  // 움켜쥐기 회전: 잡은 순간 원본 저장 → 매번 원본에 적용 (선택 없으면 회전 안 함)
  /** 축을 말하지 않은 회전에 쓸 축 (직전 회전 축, 기본 Y = 턴테이블) */
  const lastAxis = useRef<Axis>('y');
  const rotSession = useRef<RotateSession | null>(null);
  const handleObjectRotate = (e: ObjectRotateEvent) => {
    const s = structureRef.current;
    const selected = handStore.get().selected;
    if (e.phase === 'start') {
      if (s.isSimulating) {
        rotSession.current = null;
        setStructure((p) => ({ ...p, statusMessage: '시뮬레이션 중엔 회전할 수 없어요' }));
        return;
      }
      // 선택된 게 없으면 회전 안 함 (전체 회전 금지)
      if (!selected) {
        rotSession.current = null;
        setStructure((p) => ({ ...p, statusMessage: '회전할 구조물을 먼저 선택하세요' }));
        return;
      }
      rotSession.current = startSession(s, selected.nodeIds, selected.solidIds);
      return;
    }
    const ses = rotSession.current;
    if (!ses) return;
    if (e.phase === 'end') rotSession.current = null;
    if (!e.axis) return;
    const { axis, deg } = e;
    // 0°로 놓으면 원위치 (그리드 재스냅으로 비스듬한 구조물이 틀어지지 않게 final 처리 안 함)
    const final = e.phase === 'end' && deg !== 0;
    setStructure((p) => {
      const next = applySession(p, ses, axis, deg, final);
      if (e.phase !== 'end') return next;
      const target = selected?.label ?? '';
      return { ...next, statusMessage: `회전: ${target} ${axis.toUpperCase()}축 ${deg >= 0 ? '+' : ''}${deg}°` };
    });
    if (final) lastAxis.current = axis;
  };

  // ── 음성: Jev로 빠른 조작 해석 → 실행 / 확인 대기 / Groq 전달 ──
  const [voiceFb, setVoiceFb] = useState<VoiceFeedback | null>(null);
  const pending = useRef<{ cmd: VoiceCommand; timer: number } | null>(null);
  /** 늦게 도착한 이전 발화의 Jev 응답 무시용 */
  const voiceSeq = useRef(0);

  const clearPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const runCommand = (cmd: VoiceCommand) => {
    const selected = handStore.get().selected;
    const res = applyVoiceCommand(structureRef.current, cmd, selected);
    setStructure((p) => applyVoiceCommand(p, cmd, selected).next);
    if (res.ok && cmd.type === 'rotate') lastAxis.current = cmd.axis;
    setVoiceFb({ label: res.message, tone: res.ok ? 'ok' : 'warn' });
  };

  const handleVoiceConfirm = (ok: boolean) => {
    const p = pending.current;
    clearPending();
    if (!p) return;
    if (ok) runCommand(p.cmd);
    else setVoiceFb({ label: '취소했어요', tone: 'info' });
  };

  const handleVoice = async (rawText: string) => {
    const text = rawText.trim();
    if (!text) return;

    // 확인 대기 중 "응"/"아니" → 승인/취소
    if (pending.current) {
      const reply = parseConfirmReply(text);
      if (reply) return handleVoiceConfirm(reply === 'yes');
      clearPending();
    }

    const seq = ++voiceSeq.current;
    setVoiceFb({ label: `해석 중: "${text}"`, tone: 'info' });
    const it = await interpretVoice(text, { currentAxis: lastAxis.current });
    if (seq !== voiceSeq.current) return;

    switch (it.action) {
      case 'execute':
        return runCommand(it.command!);
      case 'confirm': {
        const timer = window.setTimeout(() => {
          pending.current = null;
          setVoiceFb({ label: '확인 시간 초과 → 취소', tone: 'info' });
        }, CONFIRM_TIMEOUT_MS);
        pending.current = { cmd: it.command!, timer };
        return setVoiceFb({ label: it.label, tone: 'warn', pending: true });
      }
      case 'ignore':
        return setVoiceFb({ label: it.label, tone: 'info' });
      case 'forward':
        setVoiceFb({ label: it.error ? `${it.error} → AI 설계로 전달` : it.label, tone: it.error ? 'error' : 'info' });
        return onVoiceCommand(text);
    }
  };

  useEffect(() => clearPending, []);

  return (
    <HandTracker
      activeTool={structure.activeTool}
      onPinchAction={onPinchAction}
      onVoiceCommand={handleVoice}
      voiceFeedback={voiceFb}
      onVoiceConfirm={handleVoiceConfirm}
      onCursor={handleCursor}
      onCameraZoom={pushCameraZoom}
      onSelect={handleSelect}
      onObjectRotate={handleObjectRotate}
    />
  );
}
