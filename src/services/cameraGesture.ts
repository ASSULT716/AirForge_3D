// (조원호) 손 제스처 → 카메라 연속 조작 버스
// 60fps로 들어오는 값이라 React state를 거치지 않음 (App 리렌더 방지).
// HandTracker가 push, SceneCanvas(CameraController)가 useFrame에서 소비.

export const cameraGesture = {
  /** 아직 적용 안 된 줌량 (ln 배율). +면 확대(카메라 가까이), -면 축소 */
  pendingZoomLog: 0,
  /**
   * 현재 3D 카메라 방향 쿼터니언 [x, y, z, w] (SceneCanvas가 매 프레임 기록).
   * 손 회전을 "화면 기준"에서 "월드 축"으로 바꿀 때 씀 (HandTracker는 Canvas 밖이라 카메라 접근 불가)
   */
  cameraQuat: [0, 0, 0, 1] as [number, number, number, number],
};

/** factor > 1 확대, < 1 축소 (프레임 간 상대 배율) */
export function pushCameraZoom(factor: number) {
  if (!Number.isFinite(factor) || factor <= 0) return;
  cameraGesture.pendingZoomLog += Math.log(factor);
}

// ── 팬(평행이동) / 오빗(회전): 손 드래그 누적량. SceneCanvas가 매 프레임 전부 꺼내 씀 ──
const pending = { panX: 0, panY: 0, yawDeg: 0, pitchDeg: 0 };

/** 화면 정규화 단위 (1 = 화면 폭/높이 전체). +x 오른쪽, +y 아래로 손을 움직임 */
export function pushCameraPan(dx: number, dy: number) {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
  pending.panX += dx;
  pending.panY += dy;
}

/** 도 단위. +yaw = 손을 오른쪽으로, +pitch = 손을 아래로 */
export function pushCameraOrbit(dYawDeg: number, dPitchDeg: number) {
  if (!Number.isFinite(dYawDeg) || !Number.isFinite(dPitchDeg)) return;
  pending.yawDeg += dYawDeg;
  pending.pitchDeg += dPitchDeg;
}

/** 쌓인 팬·오빗량을 꺼내고 0으로 (손 입력은 HandTracker에서 이미 스무딩됨) */
export function consumeCameraDrag() {
  const out = { ...pending };
  pending.panX = pending.panY = pending.yawDeg = pending.pitchDeg = 0;
  return out;
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
