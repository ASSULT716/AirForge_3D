# HandTracker 고려사항 (feat/hand-voice)

`src/components/HandTracker.tsx` 구현 중 발견한, **내 파일만으로는 해결 못 하는 것들**과 팀 협의가 필요한 항목.

## 1. 현재 노드 목록을 props로 못 받음 (우선순위: 높음)

현재 `Props`는 `onAddElement`, `onVoiceCommand` 두 개뿐 → HandTracker는 씬에 어떤 노드가 있는지 모름.

생기는 문제:
- 프리셋 노드(`n1`~`n5`)나 AI 보강 노드에 빔을 이어붙일 수 없음
- 같은 좌표에 중복 노드 생성 가능 (내가 만든 노드끼리만 중복 방지 중)
- HUD에서 프리셋/리셋을 누르면 내가 기억하는 노드 ID가 stale 해짐
  - 임시 대응: 패널 밖 클릭 시 체인·노드 기억 초기화

제안 (팀장 승인 필요, `App.tsx` 1줄):
```tsx
// HandTracker.tsx
interface Props {
  nodes?: NodePoint[]; // optional → 안 넘겨도 지금처럼 동작
  ...
}
// App.tsx
<HandTracker nodes={structure.nodes} ... />
```

## 2. `onAddElement`가 노드를 반드시 추가함 (우선순위: 높음)

`(node, beam?) => void` 시그니처라서 **기존 노드 두 개를 잇는 빔만 추가**하는 게 불가능.
→ 삼각형 닫기(트러스 삼각화)를 손으로 못 함.

제안: `onAddElement(node: NodePoint | null, beam?: BeamMember)` 또는 `onAddBeam(beam)` 콜백 추가.

## 3. 3D 커서(고스트 노드) 표시 (우선순위: 중간)

HandTracker는 R3F `<Canvas>` 밖에 있음 → 손 커서를 3D 씬 안에 그릴 수 없음.
현재는 웹캠 미리보기 패널에 2D 커서 + `X/Y/Z` 좌표만 표시.

제안: `onCursorMove?: (pos: [x,y,z] | null, pinching: boolean) => void` 콜백 → App state → SceneCanvas에서 반투명 구체로 렌더.
60fps로 App setState 하면 무거우므로 ref/zustand 같은 외부 store 권장.

## 4. 좌표 매핑 범위 = SceneCanvas 카메라와 맞춰야 함

`HandTracker.tsx` 상단 상수:
- `WORLD_X = [-4, 4]`, `WORLD_Y = [0, 4]`, `WORLD_Z = [-2, 2]`
- 이현수 님 카메라 위치/FOV 확정되면 이 값만 조정

## 5. 음성 인식 브라우저 제약 (시연 리스크)

- Web Speech API는 **Google Chrome / Edge**에서만 안정 동작
- **Chromium(NixOS 패키지 포함)은 구글 API 키가 없어서 `network` 에러**로 실패
- Firefox 미지원
- 대응: 패널에 직접 입력창(`100kg` → 적용) 내장. 시연 노트북은 Chrome 사용 권장
- 인식 문장 예: "하중 50킬로", "100kg 버텨줘", "이백오십 킬로그램", "1.5톤"

## 6. 음성 하중 → 즉시 AI 보강 호출

`App.handleVoiceCommand`가 하중 변경과 동시에 `reinforceStructure`를 호출함.
HandTracker는 **최종(final) 인식 결과에서만** 콜백을 부르지만, 연속으로 말하면 API가 여러 번 호출될 수 있음.
→ App 쪽 `isReinforcing` 중 재호출 무시 로직 권장.

## 현재 조작법 (데모용)

| 동작 | 결과 |
|---|---|
| 오른손 엄지+검지 핀치 | 커서 위치(0.25m 스냅)에 노드 생성, 직전 노드와 빔 연결 |
| y=0 위치에서 핀치 | 고정 노드(`isFixed: true`) |
| 왼손 위/아래 | z 레이어 변경 (위 = 안쪽 -z) |
| 오른손 주먹 0.35초 (GestureRecognizer `Closed_Fist`) | 체인 끊기 (다음 핀치는 새 시작점) |
| 손 1초 이상 안 보임 / `Esc` | 체인 끊기 |
| 내가 만든 노드 위에서 핀치 | 그 노드에서 체인 다시 시작 (새 노드 X) |

## 7. 시연 거리 (실측)

- 카메라에 너무 가까우면 왼손 손목이 z 매핑 범위(`DEPTH_Y`, 화면 높이 20~80%)를 못 벗어나서 **z가 안 움직임**
- 노트북 웹캠 기준 **50~70cm** 떨어져서 양손이 다 화면에 들어오게
- 패널 손목 라벨(`DRAW` / `DEPTH z=…`)로 양손 인식 여부 바로 확인 가능
