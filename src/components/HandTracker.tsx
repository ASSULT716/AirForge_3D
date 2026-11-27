//(조원호) MediaPipe 스켈레톤 + 핀치/음성
import { CadTool } from '../types/cad';

interface Props {
  activeTool: CadTool;
  onPinchAction: (tool: CadTool, rawPos: [number, number, number], isNewStroke?: boolean) => void;
  onVoiceCommand: (rawText: string) => void;
}

export default function HandTracker(_props: Props) {
  return null;
}