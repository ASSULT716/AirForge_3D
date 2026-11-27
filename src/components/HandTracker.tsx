//(조원호) MediaPipe 스켈레톤 + 핀치/음성
import { NodePoint, BeamMember } from '../types/cad';

interface Props {
  onAddElement: (node: NodePoint, beam?: BeamMember) => void;
  onVoiceCommand: (loadKg: number, rawText: string) => void;
}

export default function HandTracker(_props: Props) {
  return null; // 팀원 A가 웹캠 및 R3F 스켈레톤 구현
}