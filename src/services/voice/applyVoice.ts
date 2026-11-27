//(조원호) 음성 명령 → StructureState 변경 (순수 함수). 선택이 있으면 선택 대상만, 없으면 HUD 버튼과 동일하게 전체.
import type { StructureState } from '../../types/cad';
import type { Selection } from '../selection';
import { applySession, startSession } from '../handRotate';
import { describeCommand, type VoiceCommand } from './voiceCommand';

/** HUD 재질 버튼(App.tsx)과 같은 규칙: 잔디 색 솔리드는 재질 유지 */
const KEEP_MATERIAL_COLORS = new Set(['#86efac', '#10b981']);

export interface ApplyResult {
  next: StructureState;
  ok: boolean;
  message: string;
}

export function applyVoiceCommand(s: StructureState, cmd: VoiceCommand, selected: Selection | null): ApplyResult {
  const label = describeCommand(cmd);
  const done = (next: StructureState, message = label): ApplyResult => ({ next: { ...next, statusMessage: `음성: ${message}` }, ok: true, message });
  const fail = (message: string): ApplyResult => ({ next: { ...s, statusMessage: message }, ok: false, message });

  switch (cmd.type) {
    case 'rotate': {
      if (s.isSimulating) return fail('시뮬레이션 중엔 회전할 수 없어요');
      if (!selected) return fail('회전할 구조물을 먼저 선택하세요');
      const ses = startSession(s, selected.nodeIds, selected.solidIds);
      return done(applySession(s, ses, cmd.axis, cmd.deg, true), `${selected.label} ${label}`);
    }
    case 'set_material': {
      const m = cmd.material;
      if (selected) {
        const beamIds = new Set(selected.beamIds);
        const solidIds = new Set(selected.solidIds);
        return done(
          {
            ...s,
            solids: (s.solids ?? []).map((x) => (solidIds.has(x.id) ? { ...x, material: m } : x)),
            beams: s.beams.map((b) => (beamIds.has(b.id) ? { ...b, material: m } : b)),
          },
          `${selected.label} ${label}`,
        );
      }
      return done({
        ...s,
        activeMaterial: m,
        solids: (s.solids ?? []).map((x) => (x.color && KEEP_MATERIAL_COLORS.has(x.color) ? x : { ...x, material: m })),
        beams: s.beams.map((b) => ({ ...b, material: m })),
      });
    }
    case 'set_tool':
      return done({ ...s, activeTool: cmd.tool });
    case 'set_load':
      return done({ ...s, targetLoadKg: cmd.kg });
    default:
      // 늘리기·이동·복사·삭제·되돌리기는 편집 기록·카메라가 필요해서 HandBridge가 처리
      return fail(`${label}: 여기서 처리하지 않는 명령`);
  }
}
