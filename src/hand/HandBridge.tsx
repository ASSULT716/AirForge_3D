// (조원호) App ↔ 손 입력 연결점. App.tsx에는 <HandBridge ... /> 한 줄만 둠.
// HandTracker(웹캠·음성) + 손 선택 + 움켜쥐기 회전 처리. 3D 표시는 HandSceneLayer가 담당.
import { useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { CadTool, StructureState } from '../types/cad';
import HandTracker, { type HandCursorState, type ObjectRotateEvent, type PointerEvent2, type VoiceFeedback } from '../components/HandTracker';
import { cameraGesture, pushCameraZoom } from '../services/cameraGesture';
import { describeSelection, expandSelection, pruneSelection, type PickHit, type Selection } from '../services/selection';
import { applySession, startSession, type Axis, type RotateSession } from '../services/handRotate';
import { NEEDS_SELECTION, describeCommand, isModeOnly, interpretVoice, parseConfirmReply, type VoiceCommand } from '../services/voice/voiceCommand';
import { applyVoiceCommand } from '../services/voice/applyVoice';
import { voiceDiameterOp, voiceEditOp, voiceLatheOp, voiceOffsetOp } from '../services/voice/applyEditVoice';
import { parseBareDistance } from '../services/voice/koreanNumber';
import { DRAW_MODES, applyOp, deleteSelection, describeOp, scaleOp, type EditMode, type EditOp } from '../services/sketchOps';
import { handStore, hoveredForSelect, useHandState } from './handStore';
import { beginDrag, editBus, endDrag, moveDrag } from './editBus';
import { voiceHints, type VoiceHint } from './voiceHints';

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
/** 되돌리기 기록 수 */
const HISTORY_MAX = 30;
/** 편집 직후 이 시간 안에 거리만 말하면 ("2미터") 방금 편집을 그 거리로 고침 (스케치업 치수 입력) */
const RETYPE_WINDOW_MS = 10000;

let sidSeq = 0;
const newSid = () => `hx${Date.now().toString(36)}${(sidSeq++).toString(36)}`;

export const MODE_KO: Record<EditMode, string> = {
  pushpull: '늘리기',
  offset: '오프셋',
  move: '이동',
  copy: '복사',
  scale: '크기',
  taper: '면 크기',
  rect: '사각형',
  circle: '원',
};
const EDIT_MODES: EditMode[] = ['pushpull', 'offset', 'taper', 'move', 'copy', 'scale'];
const DRAW_MODE_LIST: EditMode[] = ['rect', 'circle'];

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

  // ── 되돌리기 기록 (손·음성 편집 전 상태) ──
  const history = useRef<StructureState[]>([]);
  /** 다시 실행 (되돌리기 한 상태들). 새 편집을 하면 비움 */
  const future = useRef<StructureState[]>([]);
  const [historyLen, setHistoryLen] = useState(0);
  const [futureLen, setFutureLen] = useState(0);
  /** 방금 편집함 (RETYPE_WINDOW_MS 동안) → 카드에 "2미터"로 고치기 추천 */
  const [recentEdit, setRecentEdit] = useState(false);
  const recentTimer = useRef(0);
  const markRecentEdit = () => {
    setRecentEdit(true);
    clearTimeout(recentTimer.current);
    recentTimer.current = window.setTimeout(() => setRecentEdit(false), RETYPE_WINDOW_MS);
  };
  const pushHistory = (prev: StructureState) => {
    history.current.push(prev);
    if (history.current.length > HISTORY_MAX) history.current.shift();
    future.current = [];
    setHistoryLen(history.current.length);
    setFutureLen(0);
  };
  const redo = (): boolean => {
    if (structureRef.current.isSimulating) return true;
    const next = future.current.pop();
    setFutureLen(future.current.length);
    if (!next) return false;
    history.current.push(structureRef.current);
    setHistoryLen(history.current.length);
    lastEdit.current = null;
    setStructure((p) => ({ ...next, isSimulating: p.isSimulating, statusMessage: '다시 실행' }));
    return true;
  };
  /** 되돌릴 게 없으면 false */
  const undo = (): boolean => {
    if (structureRef.current.isSimulating) {
      setStructure((p) => ({ ...p, statusMessage: '시뮬레이션 중엔 되돌릴 수 없어요' }));
      return true;
    }
    const prev = history.current.pop();
    setHistoryLen(history.current.length);
    if (!prev) return false;
    future.current.push(structureRef.current);
    setFutureLen(future.current.length);
    lastEdit.current = null;
    setStructure((p) => ({ ...prev, isSimulating: p.isSimulating, statusMessage: '되돌리기' }));
    return true;
  };

  const select = (sel: Selection | null) => {
    handStore.set({ selected: sel, face: null });
    setStructure((p) => ({
      ...p,
      selectedPartId: partIdOf(sel),
      statusMessage: sel ? `선택: ${describeSelection(sel)}` : '선택 해제',
    }));
  };

  // ✌️ 조준 → 주먹 확정. 이미 선택된 구조물을 다시 고르면 해제 (토글)
  const handleSelect = () => {
    const hovered = hoveredForSelect();
    const sel = hovered && hovered.key === handStore.get().selected?.key ? null : hovered;
    handStore.set({ selected: sel, face: null });
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
  const rotBase = useRef<StructureState | null>(null);
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
      rotBase.current = s;
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
    if (final) {
      lastAxis.current = axis;
      if (rotBase.current) pushHistory(rotBase.current);
      lastEdit.current = null;
    }
  };

  // ── 핀치 = 마우스: 구조물을 잡으면 선택 + 드래그 준비, 빈 곳이면 선택 해제 ──
  const handlePointer = (e: PointerEvent2) => {
    if (e.phase === 'move') return moveDrag(e.screen);
    if (e.phase === 'up') return endDrag();
    // 그리기 모드: 선택과 무관하게 바로 그리기 시작
    if (DRAW_MODES.has(handStore.get().editMode)) {
      if (!structureRef.current.isSimulating) beginDrag(e.screen);
      return;
    }
    const hovered = hoveredForSelect();
    const cur = handStore.get().selected;
    if (!hovered) {
      if (cur) select(null);
      return;
    }
    if (hovered.key !== cur?.key) select(hovered);
    if (!structureRef.current.isSimulating) beginDrag(e.screen);
  };

  // ── 드래그 편집 적용: 시작 순간 원본(base) + 거리 → 매번 원본에서 다시 계산 ──
  const editSes = useRef<{ base: StructureState; sid: string } | null>(null);
  /** 방금 끝난 편집 (거리만 말해서 고치기용) */
  const lastEdit = useRef<{ base: StructureState; op: EditOp; sid: string; dist: number; at: number } | null>(null);

  /** focus 요소가 속한 덩어리를 선택 (복사본·돌출 포함) */
  const reselect = (next: StructureState, focus?: PickHit) => {
    if (!focus) return;
    const sel = expandSelection(next, focus);
    if (sel) handStore.set({ selected: sel, face: null });
  };

  /** 편집 한 번 확정 (드래그 끝 · 음성). 기록 남기고 상태줄 표시 */
  const commitEdit = (base: StructureState, op: EditOp, dist: number, sid: string, via: string) => {
    const res = applyOp(base, op, dist, sid);
    if (res.dist === 0) {
      setStructure((p) => ({ ...base, isSimulating: p.isSimulating, statusMessage: `${via}: 변화 없음` }));
      return res;
    }
    pushHistory(base);
    const msg = `${via}: ${describeOp(op, res.dist, res.through)}`;
    setStructure((p) => ({ ...res.next, isSimulating: p.isSimulating, statusMessage: msg }));
    reselect(res.next, res.focus);
    lastEdit.current = { base, op, sid, dist: res.dist, at: performance.now() };
    markRecentEdit();
    // 스케치업 흐름: 오프셋 다음엔 안쪽 면을 밀고 당김
    if (op.kind === 'offset' || op.kind === 'bore_offset') {
      handStore.set({ editMode: 'pushpull', face: null });
      setVoiceFb({ label: '오프셋 완료 → 늘리기 모드: 안쪽 면을 핀치로 잡고 밀면 파여요', tone: 'ok' });
    }
    // 그린 도형은 바로 윗면을 끌어 올려 입체로
    if (op.kind === 'rect' || op.kind === 'circle') {
      handStore.set({ editMode: 'pushpull', face: null });
      setVoiceFb({ label: '그리기 완료 → 늘리기 모드: 윗면을 핀치로 잡고 위로 끌면 입체', tone: 'ok' });
    }
    return res;
  };

  useEffect(() => {
    editBus.onEdit = (e) => {
      if (e.phase === 'start') {
        editSes.current = { base: structureRef.current, sid: newSid() };
        return;
      }
      const ses = editSes.current;
      if (!ses) return;
      if (e.phase === 'end') {
        editSes.current = null;
        if (!e.op || e.dist === 0) {
          // 끌지 않고 놓음 = 선택만. 미리보기 중이던 변경은 원래대로
          if (structureRef.current !== ses.base) setStructure((p) => ({ ...ses.base, isSimulating: p.isSimulating }));
          return;
        }
        commitEdit(ses.base, e.op, e.dist, ses.sid, '손');
        return;
      }
      if (!e.op) return;
      const res = applyOp(ses.base, e.op, e.dist, ses.sid);
      setStructure((p) => ({ ...res.next, isSimulating: p.isSimulating }));
      return { dist: res.dist, through: res.through };
    };
    return () => {
      editBus.onEdit = null;
    };
  });

  const setMode = (m: EditMode) => {
    handStore.set({ editMode: m, face: null });
    setVoiceFb({ label: `${MODE_KO[m]} 모드: 핀치로 잡고 끌기`, tone: 'info' });
  };

  const deleteSelected = () => {
    const sel = handStore.get().selected;
    const s = structureRef.current;
    if (!sel || s.isSimulating) return false;
    pushHistory(s);
    lastEdit.current = null;
    handStore.set({ selected: null, face: null });
    setStructure((p) => ({ ...deleteSelection(p, sel), selectedPartId: null, statusMessage: `삭제: ${describeSelection(sel)}` }));
    return true;
  };

  // 키보드 보조: Delete = 삭제, Ctrl+Z = 되돌리기 (입력창 타이핑 중엔 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === 'Delete') deleteSelected();
      else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ── 음성: Jev로 빠른 조작 해석 → 실행 / 확인 대기 / Groq 전달 ──
  const [voiceFb, setVoiceFb] = useState<VoiceFeedback | null>(null);
  const pending = useRef<{ cmd: VoiceCommand; text: string; timer: number } | null>(null);
  /** 늦게 도착한 이전 발화의 Jev 응답 무시용 */
  const voiceSeq = useRef(0);

  const clearPending = () => {
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = null;
  };

  const runCommand = (cmd: VoiceCommand, text: string) => {
    const selected = handStore.get().selected;
    const s = structureRef.current;

    if (cmd.type === 'undo') {
      if (undo()) return setVoiceFb({ label: '되돌리기', tone: 'ok' });
      setVoiceFb({ label: '되돌릴 손 편집 없음 → AI 설계로 전달', tone: 'info' });
      return onVoiceCommand(text);
    }
    if (cmd.type === 'set_mode') return setMode(cmd.mode);
    if (NEEDS_SELECTION.has(cmd.type) && !selected && !isModeOnly(cmd)) {
      // 선택 없이 "건물 높이 늘려" 등 → 설계 요청으로 보고 AI에 넘김
      setVoiceFb({ label: `${describeCommand(cmd)}: 선택 없음 → AI 설계로 전달`, tone: 'info' });
      return onVoiceCommand(text);
    }
    if (cmd.type === 'delete') {
      deleteSelected();
      return setVoiceFb({ label: `삭제: ${selected!.label}`, tone: 'ok' });
    }
    if (cmd.type === 'draw') return setMode(cmd.shape);
    if (cmd.type === 'taper' || cmd.type === 'dig') {
      if (s.isSimulating) return setVoiceFb({ label: '시뮬레이션 중엔 편집할 수 없어요', tone: 'warn' });
      if (cmd.type === 'taper' && cmd.ratio === null) return setMode('taper');
      const r = voiceLatheOp(s, selected!, cmd);
      if ('error' in r) return setVoiceFb({ label: r.error, tone: 'warn' });
      let base = s;
      // 파기: 안쪽 원이 없으면 먼저 기본 테두리로 오프셋 (스케치업은 오프셋이 먼저지만 말로는 한 번에)
      if (r.pre) {
        const pre = applyOp(s, r.pre.op, r.pre.dist, newSid());
        if (pre.dist === 0) return setVoiceFb({ label: '면이 너무 작아서 팔 수 없어요', tone: 'warn' });
        base = pre.next;
      }
      const res = applyOp(base, r.op, r.dist, newSid());
      pushHistory(s);
      lastEdit.current = null;
      const label = `${selected!.label} ${describeOp(r.op, res.dist, res.through)}`;
      setStructure((p) => ({ ...res.next, isSimulating: p.isSimulating, statusMessage: `음성: ${label}` }));
      return setVoiceFb({ label, tone: 'ok' });
    }
    if (cmd.type === 'diameter') {
      if (s.isSimulating) return setVoiceFb({ label: '시뮬레이션 중엔 편집할 수 없어요', tone: 'warn' });
      const r = voiceDiameterOp(s, selected!, cmd);
      if ('error' in r) return setVoiceFb({ label: r.error, tone: 'warn' });
      const res = commitEdit(s, r.op, r.dist, newSid(), '음성');
      // 면 크기로 환산한 경우 dist가 비율이라 "2미터"로 고치기 대상에서 뺌
      if (r.op.kind === 'taper') lastEdit.current = null;
      if (res.dist === 0) return setVoiceFb({ label: `${describeCommand(cmd)}: 이미 그 크기예요`, tone: 'warn' });
      return setVoiceFb({ label: `${selected!.label} ${describeCommand(cmd)}`, tone: 'ok' });
    }
    if (cmd.type === 'scale') {
      if (s.isSimulating) return setVoiceFb({ label: '시뮬레이션 중엔 편집할 수 없어요', tone: 'warn' });
      if (cmd.factor === null) return setMode('scale');
      const op = scaleOp(s, selected!);
      const res = commitEdit(s, op, cmd.factor - 1, newSid(), '음성');
      return setVoiceFb({ label: `${selected!.label} ${describeOp(op, res.dist)}`, tone: 'ok' });
    }
    if (cmd.type === 'offset') {
      if (s.isSimulating) return setVoiceFb({ label: '시뮬레이션 중엔 편집할 수 없어요', tone: 'warn' });
      if (cmd.meters === null) return setMode('offset');
      const op = voiceOffsetOp(s, selected!, handStore.get().face, cameraGesture.cameraQuat);
      if (!op) return setVoiceFb({ label: '오프셋은 박스 면만 돼요', tone: 'warn' });
      const res = commitEdit(s, op, cmd.meters, newSid(), '음성');
      if (res.dist === 0) setVoiceFb({ label: '면이 너무 작아서 오프셋할 수 없어요', tone: 'warn' });
      return;
    }
    if (cmd.type === 'push_pull' || cmd.type === 'move' || cmd.type === 'copy') {
      if (s.isSimulating) return setVoiceFb({ label: '시뮬레이션 중엔 편집할 수 없어요', tone: 'warn' });
      // 거리 없이 "늘려" / "옮겨" → 그 모드로 바꾸고 손으로 끌게
      if (cmd.meters === null && cmd.type !== 'copy') return setMode(cmd.type === 'move' ? 'move' : 'pushpull');
      const r = voiceEditOp(s, selected!, cmd, cameraGesture.cameraQuat);
      if ('error' in r) return setVoiceFb({ label: r.error, tone: 'warn' });
      const res = commitEdit(s, r.op, r.dist, newSid(), '음성');
      return setVoiceFb({ label: res.dist === 0 ? `${describeCommand(cmd)}: 더 줄일 수 없어요` : `${selected!.label} ${describeOp(r.op, res.dist)}`, tone: res.dist === 0 ? 'warn' : 'ok' });
    }

    const res = applyVoiceCommand(s, cmd, selected);
    if (res.ok && (cmd.type === 'rotate' || cmd.type === 'set_material')) {
      pushHistory(s);
      lastEdit.current = null;
    }
    setStructure((p) => applyVoiceCommand(p, cmd, selected).next);
    if (res.ok && cmd.type === 'rotate') lastAxis.current = cmd.axis;
    if (res.ok && cmd.type === 'set_tool' && cmd.tool === 'move') handStore.set({ editMode: 'move', face: null });
    setVoiceFb({ label: res.message, tone: res.ok ? 'ok' : 'warn' });
  };

  /** 거리만 말함 ("2미터"): 드래그 중이면 그 거리로 고정, 방금 편집했으면 그 편집을 그 거리로 고침 */
  const handleBareDistance = (m: number): boolean => {
    if (editBus.drag && !editBus.drag.ended) {
      const sign = (handStore.get().drag?.dist ?? 0) < 0 ? -1 : 1;
      editBus.overrideDist = sign * m;
      setVoiceFb({ label: `정확히 ${sign * m}m (놓으면 확정)`, tone: 'ok' });
      return true;
    }
    const le = lastEdit.current;
    if (le && performance.now() - le.at < RETYPE_WINDOW_MS) {
      const d = Math.sign(le.dist || 1) * m;
      const res = applyOp(le.base, le.op, d, le.sid);
      const label = `고침: ${describeOp(le.op, res.dist, res.through)}`;
      setStructure((p) => ({ ...res.next, isSimulating: p.isSimulating, statusMessage: label }));
      reselect(res.next, res.focus);
      lastEdit.current = { ...le, dist: res.dist, at: performance.now() };
      markRecentEdit();
      setVoiceFb({ label, tone: 'ok' });
      return true;
    }
    return false;
  };

  const handleVoiceConfirm = (ok: boolean) => {
    const p = pending.current;
    clearPending();
    if (!p) return;
    if (ok) runCommand(p.cmd, p.text);
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

    // 거리만 말함 → Jev 안 거치고 바로 (드래그 중 정확한 값)
    const bare = parseBareDistance(text);
    if (bare !== null && handleBareDistance(bare)) return;

    const seq = ++voiceSeq.current;
    setVoiceFb({ label: `해석 중: "${text}"`, tone: 'info' });
    const it = await interpretVoice(text, { currentAxis: lastAxis.current });
    if (seq !== voiceSeq.current) return;

    switch (it.action) {
      case 'execute':
        return runCommand(it.command!, text);
      case 'confirm': {
        const timer = window.setTimeout(() => {
          pending.current = null;
          setVoiceFb({ label: '확인 시간 초과 → 취소', tone: 'info' });
        }, CONFIRM_TIMEOUT_MS);
        pending.current = { cmd: it.command!, text, timer };
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
    <>
      <ActionCard
        structure={structure}
        recentEdit={recentEdit}
        confirming={!!voiceFb?.pending}
        onSay={(text) => void handleVoice(text)}
        simulating={structure.isSimulating}
        canUndo={historyLen > 0}
        canRedo={futureLen > 0}
        onMode={setMode}
        onDelete={deleteSelected}
        onUndo={() => undo()}
        onRedo={() => redo()}
      />
      <HandTracker
        activeTool={structure.activeTool}
        onPinchAction={onPinchAction}
        onVoiceCommand={handleVoice}
        voiceFeedback={voiceFb}
        onVoiceConfirm={handleVoiceConfirm}
        onCursor={handleCursor}
        onCameraZoom={pushCameraZoom}
        onSelect={handleSelect}
        onPointer={handlePointer}
        onObjectRotate={handleObjectRotate}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// 다음 행동 안내 카드 (화면 위 가운데): 지금 할 수 있는 손 동작 · 음성 예시 · 모드 버튼
// ─────────────────────────────────────────────────────────────
/** 지금 모드의 손 동작 (음성 추천은 voiceHints.ts) */
const MODE_HELP: Record<EditMode, { hand: string }> = {
  pushpull: { hand: '면을 가리키고 핀치로 잡아 끌기 = 늘리기 / 줄이기 (오프셋한 안쪽 면은 끝까지 밀면 관통)' },
  offset: { hand: '박스 면을 가리키고 핀치로 안쪽으로 끌기 = 테두리 남기고 안쪽 면 → 자동으로 늘리기 모드' },
  move: { hand: '핀치로 잡아 끌기 = 끄는 방향 축으로 이동' },
  copy: { hand: '핀치로 잡아 끌기 = 복사본을 끌어다 놓기' },
  scale: { hand: '핀치로 잡아 중심에서 멀어지게 = 키우기, 가까이 = 줄이기 (0.1배 단위, 바닥 고정)' },
  taper: { hand: '원기둥 윗면/아랫면을 핀치로 잡아 가운데로 = 뾰족(원뿔), 밖으로 = 벌어짐(접시)' },
  rect: { hand: '바닥(또는 박스 윗면)에서 핀치로 모서리를 잡고 대각선으로 끌기' },
  circle: { hand: '핀치로 중심을 잡고 바깥으로 끌기 = 반지름' },
};
/** 음성 추천 칩: 클릭 = 그 문장을 말한 것과 같음 (마이크 없을 때도 사용 가능) */
function HintChips({ hints, onSay, label = '말해보세요' }: { hints: VoiceHint[]; onSay: (t: string) => void; label?: string }) {
  if (!hints.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1">
      <span className="mr-0.5 text-cyan-400/70">{label}</span>
      {hints.map((x) => (
        <button
          key={x.say}
          onClick={() => onSay(x.say)}
          title={x.why}
          className="rounded-full border border-cyan-300/50 bg-cyan-400/10 px-2 py-0.5 text-cyan-50 hover:bg-cyan-400/30"
        >
          "{x.say}"
        </button>
      ))}
    </div>
  );
}

function ActionCard(props: {
  structure: StructureState;
  recentEdit: boolean;
  confirming: boolean;
  onSay: (text: string) => void;
  simulating: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onMode: (m: EditMode) => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
}) {
  const { selected, editMode, drag, cursor } = useHandState();
  const hints = voiceHints({
    structure: props.structure,
    selected,
    editMode,
    dragging: !!drag,
    recentEdit: props.recentEdit,
    canUndo: props.canUndo,
    confirming: props.confirming,
  });
  const chips = <HintChips hints={hints} onSay={props.onSay} />;

  const box = 'pointer-events-auto rounded border border-cyan-400/50 bg-black/75 px-3 py-2 font-mono text-[12px] text-cyan-200 shadow-[0_0_18px_rgba(0,243,255,0.2)]';
  // HUD 상단 버튼줄(중력·하중 테스트 등, HudOverlay p-6) 바로 아래 왼쪽
  const wrap = 'fixed left-6 top-[76px] z-50 select-none';

  // 확인 대기: 응/아니
  if (props.confirming) {
    return (
      <div className={wrap}>
        <div className={`${box} border-[#ff9f43]/70`}>
          <div className="font-bold text-[#ff9f43]">이 명령 맞나요? (10초 안에 대답)</div>
          {chips}
        </div>
      </div>
    );
  }

  if (props.simulating) {
    return (
      <div className={wrap}>
        <div className={`${box} py-1`}>
          <span className="text-cyan-200/80">시뮬레이션 중 (편집은 정지 후)</span>
          {chips}
        </div>
      </div>
    );
  }

  // 드래그 중: 거리 크게 + 정확한 값 말하기 안내
  if (drag) {
    return (
      <div className={wrap}>
        <div className={`${box} border-[#ff1e42]/70`}>
          <div className="text-[18px] font-bold tabular-nums text-white">{drag.label}</div>
          <div className="mt-0.5 text-cyan-200/80">{drag.waiting ? '끄는 방향으로 축이 정해져요' : '놓으면 확정'}</div>
          <HintChips hints={hints} onSay={props.onSay} label="정확한 값" />
        </div>
      </div>
    );
  }

  const btn = (active: boolean) =>
    `rounded border px-2 py-0.5 ${active ? 'border-[#7dff8a] bg-[#7dff8a]/20 text-[#7dff8a]' : 'border-cyan-400/50 hover:bg-cyan-400/20'}`;
  const drawButtons = (
    <div className="flex shrink-0 items-center gap-1">
      <span className="text-cyan-400/70">그리기</span>
      {DRAW_MODE_LIST.map((m) => (
        <button key={m} onClick={() => props.onMode(editMode === m ? 'pushpull' : m)} className={btn(editMode === m)}>
          {MODE_KO[m]}
        </button>
      ))}
    </div>
  );
  const historyButtons = (
    <div className="flex gap-1">
      <button onClick={props.onUndo} disabled={!props.canUndo} className="rounded border border-cyan-400/50 px-2 py-0.5 hover:bg-cyan-400/20 disabled:opacity-40">
        되돌리기
      </button>
      <button onClick={props.onRedo} disabled={!props.canRedo} className="rounded border border-cyan-400/50 px-2 py-0.5 hover:bg-cyan-400/20 disabled:opacity-40">
        다시
      </button>
    </div>
  );

  // 그리기 모드 (선택과 무관)
  if (DRAW_MODES.has(editMode)) {
    const help = MODE_HELP[editMode];
    return (
      <div className={wrap}>
        <div className={`${box} w-[440px]`}>
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[#ffd54a]">{MODE_KO[editMode]} 그리기</span>
            {drawButtons}
          </div>
          <div className="mt-1.5">{help.hand}</div>
          <div className="mt-0.5 text-cyan-200/70">놓으면 얇은 판이 생기고 늘리기 모드로 → 윗면을 위로 끌면 입체</div>
          {chips}
          <div className="mt-1.5 flex justify-end">{historyButtons}</div>
        </div>
      </div>
    );
  }

  if (!selected) {
    return (
      <div className={wrap}>
        <div className={`${box} w-[470px] py-1.5`}>
          <div className="flex items-center justify-between gap-3">
            <span className="text-cyan-200/80">{cursor ? '구조물을 가리키고 핀치 = 선택 · 잡은 채 끌면 바로 늘리기' : '손을 카메라에 보여주세요'}</span>
            {drawButtons}
          </div>
          {chips}
        </div>
      </div>
    );
  }

  const help = MODE_HELP[editMode];
  return (
    <div className={wrap}>
      <div className={`${box} w-[470px]`}>
        <div className="truncate font-bold text-[#7dff8a]">선택: {describeSelection(selected)}</div>
        <div className="mt-1 flex items-center justify-between gap-2">
          <div className="flex shrink-0 gap-1">
            {EDIT_MODES.map((m) => (
              <button key={m} onClick={() => props.onMode(m)} className={btn(editMode === m)}>
                {MODE_KO[m]}
              </button>
            ))}
          </div>
          {drawButtons}
        </div>
        <div className="mt-1.5 grid grid-cols-[34px_1fr] gap-x-2 gap-y-0.5">
          <span className="text-cyan-400/70">손</span>
          <span>{help.hand}</span>
          <span />
          <span>움켜쥐기 = 회전 (주먹으로 확정)</span>
        </div>
        {chips}
        <div className="mt-1.5 flex justify-end gap-1">
          <button onClick={props.onDelete} className="rounded border border-[#ff1e42]/60 px-2 py-0.5 text-[#ff1e42] hover:bg-[#ff1e42]/20">
            삭제
          </button>
          {historyButtons}
        </div>
      </div>
    </div>
  );
}
