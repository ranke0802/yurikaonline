# Yurika Online (유리카 온라인)
> **Service Link:** [https://yurika-online.web.app/](https://yurika-online.web.app/)

<!-- AUTO_VERSION_BLOCK_START -->
## Build Metadata
- 배포 버전: **0.01.06**
- 마지막 버전 갱신: 2026-03-30
<!-- AUTO_VERSION_BLOCK_END -->

Yurika Online은 HTML5 Canvas와 Firebase를 기반으로 만든 실시간 웹 MMORPG입니다. 로그인, 캐릭터 성장, 튜토리얼, 멀티플레이어 동기화, 전투 UI를 한 프로젝트 안에서 다루고 있습니다.

현재 버전: **0.01.06**

## 핵심 기능

- 실시간 멀티플레이어: Firebase Realtime Database 기반 위치, 상태, 전투 동기화
- 전투 시스템: 체인 라이트닝, 매직 미사일, 파이어볼, 앱솔루트 베리어
- 성장 시스템: 레벨, 스탯, 스킬 강화, 인벤토리, 퀘스트 보상
- 온보딩: 프롤로그와 단계형 기본 튜토리얼
- 반응형 UI: PC, 모바일 세로, 모바일 가로 레이아웃 분기
- 배포 안정화: 서비스 워커와 버전 기반 캐시 무효화

## 최근 업데이트

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

1. 저장소를 클론합니다.
2. 루트 디렉터리에서 정적 서버를 실행합니다.
3. 브라우저에서 로컬 주소로 접속합니다.

예시:

```powershell
npx live-server --port=8080
```

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
