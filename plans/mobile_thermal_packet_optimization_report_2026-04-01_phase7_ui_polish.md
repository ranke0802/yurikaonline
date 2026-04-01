# 모바일 발열/패킷 최적화 작업 보고서 (UI 합성/미니맵 경량화)

작성일: 2026-04-01

## 범위

- 기존 조작 체감과 UI 기능은 유지한 채 모바일 저전력 모드에서 남아 있던 합성 비용을 추가로 줄이는 작업
- 미니맵 redraw를 상태 기반으로 제한해, 바뀐 것이 없을 때는 캔버스 재렌더를 건너뛰도록 개선
- 작업 대상:
  - `src/js/ui/UIManager.js`
  - `src/css/style.css`
  - `index.html`

## 이번 작업에서 적용한 내용

### 1. 미니맵 dirty redraw 캐시 추가

- 미니맵 렌더 전에 로컬 플레이어, 원격 플레이어, 살아 있는 몬스터들의 좌표를 캔버스 해상도 기준으로 양자화한 signature를 계산
- signature가 이전 프레임과 같으면 footer 좌표만 갱신하고 실제 캔버스 clear/draw는 건너뛰도록 변경
- 캔버스가 교체되거나 해상도가 바뀐 경우에는 기존 캐시를 무시하고 다시 그리도록 보정

### 2. 모바일 저전력 모드 blur 추가 정리

- 기존에는 `chat/minimap/menu`만 일부 저전력 처리되었는데, 여전히 모바일 구간 일부에서 `backdrop-filter`가 다시 살아나는 경로가 있었음
- 이번에는 `body.low-power-pwa` 기준으로 아래 요소들의 blur를 강제로 제거
  - 미니맵 컨테이너
  - 미니맵 메뉴
  - 인벤토리 아이템 상세 오버레이
  - 확인 모달/사망 모달 계열
- blur 제거 후에도 가독성이 떨어지지 않도록 배경색과 테두리 명도는 조금 더 높여 유지

### 3. 인코딩 깨짐 점검 및 복구

- `README.md`, `plans/`, `src/`, `index.html`, `sw.js`, `package.json` 기준으로 깨진 문자 검색을 재실시
- 실제 파일 내용 기준으로 확인된 깨짐은 조이스틱 `paw-icon` 텍스트 한 군데였고, 이를 `🐾`로 정상 복구

## 기대 효과

- 모바일에서 HUD/모달 합성 비용 감소
- 가만히 있거나 주변 상태 변화가 거의 없을 때 미니맵 캔버스 redraw 감소
- 저전력 모드에서 발열과 배터리 소모를 추가로 완화
- 인코딩 깨짐으로 인한 UI 표시 문제 방지

## 검증

- `node --check src/js/ui/UIManager.js`
- `git diff --check`
- `rg -n "<replacement-char>" README.md plans src index.html sw.js package.json`
- `rg -n "\?[가-힣]" README.md plans src index.html sw.js package.json`

검증 결과:

- `node --check` 통과
- `git diff --check` 통과
- replacement character 패턴 미검출
- `\?[가-힣]` 패턴 검색으로 `index.html`의 `paw-icon` 깨짐을 발견 후 복구

## 주의점

- 이번 변경은 미니맵 redraw 조건과 모바일 blur 적용 범위를 줄인 것이지, HUD 구조나 조작 방식을 바꾼 것은 아님
- 미니맵 signature는 캔버스 해상도 대비 눈에 보이지 않는 수준의 작은 이동은 redraw를 생략할 수 있도록 양자화되어 있음
