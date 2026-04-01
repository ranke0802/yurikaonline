# Yurika Online (유리카 온라인)
> **Service Link:** [https://yurika-online.web.app/](https://yurika-online.web.app/)

<!-- AUTO_VERSION_BLOCK_START -->
## Build Metadata
- 배포 버전: **0.01.34**
- 마지막 버전 갱신: 2026-04-01
<!-- AUTO_VERSION_BLOCK_END -->

Yurika Online은 HTML5 Canvas와 Firebase를 기반으로 만든 실시간 웹 MMORPG입니다. 로그인, 캐릭터 성장, 튜토리얼, 멀티플레이어 동기화, 전투 UI를 한 프로젝트 안에서 다루고 있습니다.

현재 버전: **0.01.34**

## 핵심 기능

- 실시간 멀티플레이어: Firebase Realtime Database 기반 위치, 상태, 전투 동기화
- 전투 시스템: 체인 라이트닝, 매직 미사일, 파이어볼, 앱솔루트 베리어
- 성장 시스템: 레벨, 스탯, 스킬 강화, 인벤토리, 퀘스트 보상
- 온보딩: 프롤로그와 단계형 기본 튜토리얼
- 반응형 UI: PC, 모바일 세로, 모바일 가로 레이아웃 분기
- 배포 안정화: 서비스 워커와 버전 기반 캐시 무효화

## 최근 업데이트

### 0.01.22

- 세로모드에서 상태창, 스킬창, 인벤토리창이 함께 보이던 팝업 숨김 우선순위 문제를 수정했습니다.
- 인벤토리 UX 개선 방향을 PC, 모바일 세로, 모바일 가로 기준으로 정리한 설계서를 추가했습니다.

### 0.01.21

- 모바일 인벤토리 상단의 큰 장착 무기/골드 카드를 제거하고, 슬롯판 중심 구조로 다시 정리했습니다.
- 골드와 장착 무기를 일반 슬롯형 유틸 칸으로 통합해 화면 점유를 줄였습니다.
- 모바일 세로/가로에서 인벤토리 스크롤 영역 계산을 다시 맞추고, 착용 장비는 노란 테두리로 바로 보이게 바꿨습니다.

### 0.01.20

- 인벤토리를 300칸 기준으로 확장하고, 하단에 현재 사용 슬롯 수를 `n/300` 형식으로 표시하도록 정리했습니다.
- 인벤토리 우측 고정 상세 패널을 제거하고, 클릭 또는 터치 시 상세 모달이 뜨는 구조로 바꿨습니다.
- PC, 모바일 세로, 모바일 가로 각각에 맞는 인벤토리 레이아웃을 따로 구성해 슬롯 밀도와 상세 모달 형태를 분리했습니다.

### 0.01.16

- 대왕 슬라임 등장곡을 빠른 전투형에서 느리고 음침한 질감의 JSON BGM으로 다시 구성했습니다.
- `rich_string`, `warp_bass`, `fm_bell`, `harp` 조합으로 부드럽지만 불길한 분위기를 강화했습니다.
- 기존처럼 절대적으로 시끄러운 보스전 BGM이 아니라, 등장 순간의 공포감이 오래 남도록 템포와 타격감을 낮췄습니다.

### 0.01.15

- 모바일 발열 완화를 위해 모바일 DPR 제한, 렌더 FPS 캡, HUD 및 미니맵 갱신 빈도 최적화를 적용했습니다.
- PWA 아이콘을 다시 프레이밍하고 `apple-touch-icon`까지 추가해 설치 아이콘 가장자리 품질을 정리했습니다.
- 파티 초대/응답 모달 흐름, 파티 패널 편의성, 파티 보상 공유 규칙을 보강했습니다.

### 0.01.03

- 모바일 세로/가로 레이아웃 충돌을 분리 정리했습니다.
- 회전 이후 튜토리얼 가이드와 하이라이트 위치를 다시 계산하도록 보강했습니다.
- HUD와 팝업 배치를 안전 영역 기준으로 다시 조정했습니다.

### 0.01.02

- 모바일 가로 HUD를 전용 레이아웃으로 재배치했습니다.
- 튜토리얼 문구를 `desktop`, `mobile-portrait`, `mobile-landscape`로 분기했습니다.
- 튜토리얼 하이라이트 박스와 반응형 안내 문구를 추가했습니다.

### 0.01.01

- 튜토리얼 스킬 툴팁 설명을 강화했습니다.
- 인벤토리 닫기 단계와 팝업 이벤트 흐름을 안정화했습니다.
- 버전 자동화 훅을 추가해 커밋 시 버전 정보를 함께 갱신하도록 했습니다.

## 실행 방법

이 프로젝트는 정적 웹 서버로 실행하면 됩니다. `live-server` 기준으로 점검했고, Windows PowerShell에서 `npx live-server --port=8080`처럼 실행하면 환경에 따라 `listen EACCES: permission denied 0.0.0.0:8080`가 날 수 있습니다.

원인:

- `8080` 포트가 로컬 환경에서 막혀 있거나 다른 정책에 걸릴 수 있습니다.
- `live-server`가 기본적으로 `0.0.0.0`에 바인딩하려고 해서, Windows 환경에서 더 까다롭게 막히는 경우가 있습니다.

권장 기준:

- 같은 PC에서만 실행할 때는 `127.0.0.1`
- 기본 포트는 `8081` 또는 `5500`
- 가장 쉬운 방법은 `npm start`

### Windows PowerShell

프로젝트 루트에서:

```powershell
npm start
```

브라우저에서 접속:

```text
http://127.0.0.1:8081
```

수동 실행이 필요하면:

```powershell
npx -y live-server . --host=127.0.0.1 --port=8081 --no-browser
```

`8081`이 이미 사용 중이면:

```powershell
npx -y live-server . --host=127.0.0.1 --port=5500 --no-browser
```

### Windows CMD

프로젝트 루트에서:

```cmd
npm start
```

수동 실행:

```cmd
npx -y live-server . --host=127.0.0.1 --port=8081 --no-browser
```

### macOS / Linux

프로젝트 루트에서:

```bash
npm start
```

수동 실행:

```bash
npx -y live-server . --host=127.0.0.1 --port=8081 --no-browser
```

포트를 바꾸고 싶다면:

```bash
npx -y live-server . --host=127.0.0.1 --port=5500 --no-browser
```

### WSL

WSL에서도 같은 방식으로 실행하면 됩니다.

```bash
npm start
```

또는:

```bash
npx -y live-server . --host=127.0.0.1 --port=8081 --no-browser
```

Windows 브라우저에서는 보통 아래 주소로 접속하면 됩니다.

```text
http://127.0.0.1:8081
```

### 실기기 확인

휴대폰이나 태블릿에서 확인할 때는 로컬 LAN 서버 대신 Firebase 배포 주소를 사용합니다.

- 로컬 실행 방법은 개발 PC에서 브라우저로 확인하는 용도입니다.
- 모바일 실기기 확인은 배포 후 서비스 링크로 접속하는 흐름을 기준으로 합니다.
- 이 README에서는 휴대폰용 로컬 서버 실행 방법은 안내하지 않습니다.

## 버전 관리

- `version.txt`를 단일 버전 기준으로 사용합니다.
- 커밋 전 `.githooks/pre-commit`에서 `scripts/sync-version.js`가 실행됩니다.
- 이 스크립트는 `version.txt`, `src/js/main.js`, `src/js/world/scenes/LoginScene.js`, `index.html`, `sw.js`, `README.md`를 같은 버전으로 맞춥니다.
- `index.html`의 서비스 워커, CSS, 메인 모듈 쿼리스트링도 같은 버전으로 동기화합니다.

## 개발 메모

- 로컬 로그 파일 `live-server.log`, `live-server.err.log`는 커밋 대상이 아닙니다.
- 배포 후 캐시가 남아 있으면 `version.txt` 기준으로 새로고침이 유도됩니다.
- 사용자에게 보이는 문자열은 UTF-8 기준으로 유지해야 합니다.

## 라이선스

© 2026 Yurika Online. All rights reserved.
