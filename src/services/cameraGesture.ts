// (조원호) 손 제스처 → 카메라 연속 조작 버스
// 60fps로 들어오는 값이라 React state를 거치지 않음 (App 리렌더 방지).
// HandTracker가 push, SceneCanvas(CameraController)가 useFrame에서 소비.

export const cameraGesture = {
  /** 아직 적용 안 된 줌량 (ln 배율). +면 확대(카메라 가까이), -면 축소 */
  pendingZoomLog: 0,
};

/** factor > 1 확대, < 1 축소 (프레임 간 상대 배율) */
export function pushCameraZoom(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  cameraGesture.pendingZoomLog += Math.log(factor);
}

/** useFrame에서 호출: 부드럽게 일부만 꺼내 씀 (남은 양은 다음 프레임으로) */
export function consumeCameraZoom(dt: number): number {
  const p = cameraGesture.pendingZoomLog;
  if (Math.abs(p) < 1e-4) {
    cameraGesture.pendingZoomLog = 0;
    return 0;
  }
  const take = p * (1 - Math.exp(-dt * 12));
  cameraGesture.pendingZoomLog -= take;
  return take;
}
