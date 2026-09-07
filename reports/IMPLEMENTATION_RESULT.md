# 구현 결과 및 재개 지점 — 2026-09-07

mmorpg_online / 시작 HEAD 74b14f6. 기존 사용자 변경은 첨부 지시서 1개였으며 보존했다. CODEX_TASK.md는 검색 결과 없어 첨부 지시서를 명세로 적용했다. 커밋·배포·운영 데이터 변경은 하지 않았다.

## 완료한 핵심 수정

키보드 해제·포커스 초기화, UID 레이아웃 분리, 저장 상태·재시도, 고정 조이스틱, 카메라 미리보기, 공통 viewport, 오프라인 버전 검사·캐시 범위, 터치 cleanup/cancel, 안전지대 최종 검사·ID 생성, 개발 암호·DB 초기화 경로 차단을 수정했다. 미래 시각 덮어쓰기 방지, draft 초기화, 방향 잠금 롤백, 대형 터치 분류, resize 병합, 스타일 소유권, 히트스톱 렌더 예산도 수정했다.

체감 변화: Shift+S는 어느 순서로 떼어도 해제된다. 다른 계정 레이아웃이 자동 업로드되지 않는다. 편집을 닫아도 고정 조이스틱 위치가 유지된다. 저장 실패를 확인하고 재시도할 수 있다. 카메라 슬라이더로 캔버스가 반복 초기화되지 않는다. 오프라인 버전 오류가 캐시 초기화로 이어지지 않는다.

## 검증 결과

| 명령 | 결과 |
|---|---|
| npm run validate (수정 전) | 성공, 기존 실패 없음 |
| 최초 신규 재현 테스트 | 9개 중 8개 실패/1개 통과 |
| npm run validate (최종) | 기존 전체 검증과 신규 25개 통과 |
| npm run validate:browser | Windows Edge headless 2개 통과 |
| npm run validate:security | demo Emulator에서 기존 취약 쓰기 2건 확인, 후보 거부 7/허용 1 통과 |
| npm audit | 기존 image-size high 1개, fixAvailable:false, 미해결 |
| build/lint | 해당 스크립트 없음. 정적 HTML/ES module 프로젝트 |

브라우저: 실제 앱 LoginScene 진입, 슬라이더 input 30회에서 resize 0/backing setter 0/persist 1, 실제 DOM/CSS의 A/B·고정 조이스틱·회전 왕복·reload·offline/retry 검증. pageerror 0. DOM 통합 테스트는 운영 bootstrap을 제거한 fixture이며 실제 계정·월드 플레이 E2E와 구별한다. 실제 로그인 화면 부트스트랩은 별도 테스트했다. Android/iOS/Safari/Firefox와 설치형 PWA는 미실시.

[동작 테스트](C:/dev/yurika_online/scripts/validate-improvement.mjs:1), [브라우저 테스트](C:/dev/yurika_online/scripts/browser-tests/improvement.spec.cjs:1), [Emulator 테스트](C:/dev/yurika_online/scripts/validate-security-emulator.mjs:1). reports/improvement-*.log에 RED/GREEN/회귀 결과를 보존했다. 브라우저 스크린샷은 reports/browser-login-1280x720.png와 browser-layout-390x844.png이다. 제공 Browser 도구는 Node 22.16이 요구 버전 22.22보다 낮아 실행되지 않아 독립 Playwright/Edge 검증을 추가했다.

## 미완료·보류와 재개 순서

1. **운영 P0 보안은 미완료다.** [서버 권한 계획](C:/dev/yurika_online/reports/SECURITY_AND_SERVER_AUTHORITY_PLAN.md:1)의 API/원장부터 staging에서 구현해야 한다. 강화 Rules를 운영에 바로 적용하면 기존 프로필·전투 쓰기가 차단된다.
2. 레이아웃 독립 revision CAS, 충돌 양쪽 선택·복구 UI는 후속이다. 현재 서버 우선·pending base 비교로 자동 덮어쓰기를 막는다. :conflict에 이전 로컬 변경을 보관한다.
3. Desktop/Touch 사용자 강제 선택, 대형 태블릿 CSS 전체 QA, 노치·소프트키보드, 실제 설치형 PWA 두 릴리스 전환은 검증이 남는다. UI-03/08/09/10은 코드·fixture 범위 밖의 실기기 완성 판정을 보류한다.
4. 초기화 추가 확인 모달/Undo는 미구현이며 현재 draft와 명시적 저장/취소가 보호 경계다.
5. image-size 경고는 악성 파일 직접 재현/대체 라이브러리 검토가 필요하다. 취약성 경고를 숨기거나 강제 업데이트하지 않았다.

재개 명령: `git status --short --branch` → `npm run validate` → `npm run validate:browser` → `npm run validate:security`. 실제 계정·기기 검증은 위 로컬 검증과 별도로 수행해야 한다.

## 추가 발견 및 테스트 변경

서비스 워커가 다른 앱 캐시도 지우는 경로, 직접 호출 가능한 DB 전체 초기화, 안전지대 재시도 소진 후 생성, image-size 보안 경고를 기록했다. 기존 정적 검사가 전역 저장 키·즉시 초기화·5개 지연 타이머를 강제한 부분은 실제 동작 테스트를 먼저 추가한 뒤 변경했다.

## 데이터·배포·롤백

기존 layout version/좌표를 유지한다. 인증 후 전역 키를 UID 키로 1회 이관하고 누락 joystickMode는 dynamic으로 해석한다. 운영 DB 마이그레이션 없음. 배포 전 version:sync/version:bump 절차로 실제 출시 버전을 정하고 두 릴리스 오프라인 전환을 검증해야 한다. 이번 작업에서 임의 버전 bump를 하지 않았다.

롤백은 이번 변경만 선택적으로 되돌리며 사용자 지시서와 다른 변경을 reset하지 않는다. scoped 키와 pending/conflict 백업은 보존한다. 구 클라이언트는 scoped 키를 읽지 못하므로 역변환 전 계정 귀속 확인이 필요하다. 모든 캐시 삭제는 롤백 절차가 아니다. Rules/서버 API/클라이언트는 호환성 검증 후 함께 전환해야 한다.

API 잔여 사용량은 제공 도구로 조회할 수 없었다. 3% 도달을 확인하거나 추정하지 않았다. 이 문서는 quota 임계 도달 선언이 아니라 실제 검증 결과와 남은 항목의 재개 기록이다.

## 주요 변경 파일

- [UIManager](C:/dev/yurika_online/src/js/ui/UIManager.js:1): 저장·동기화·편집·기기 분류
- [ViewportMetrics](C:/dev/yurika_online/src/js/core/ViewportMetrics.js:1), [main](C:/dev/yurika_online/src/js/main.js:1): 좌표·카메라·resize
- [KeyboardHandler](C:/dev/yurika_online/src/js/core/input/KeyboardHandler.js:1), [TouchHandler](C:/dev/yurika_online/src/js/core/input/TouchHandler.js:1): 입력 해제·리스너 수명
- [GameLoop](C:/dev/yurika_online/src/js/core/GameLoop.js:1), [MonsterManager](C:/dev/yurika_online/src/js/world/MonsterManager.js:1): 렌더 예산·스폰
- [NetworkManager](C:/dev/yurika_online/src/js/core/NetworkManager.js:1): 관리자 DB 초기화 차단
- [index](C:/dev/yurika_online/index.html:1), [sw](C:/dev/yurika_online/sw.js:1), [CSS](C:/dev/yurika_online/src/css/style.css:1): 설정 UI·PWA·safe inset
- [package](C:/dev/yurika_online/package.json:1), [lockfile](C:/dev/yurika_online/package-lock.json:1), [Playwright 설정](C:/dev/yurika_online/playwright.config.cjs:1): 검증 명령·브라우저 의존성
- [후보 Rules](C:/dev/yurika_online/database.emulator.rules.json:1), [Emulator 설정](C:/dev/yurika_online/firebase.emulator.json:1): 운영과 분리된 권한 검증

상세 원인·검증·위험은 [버그 감사](C:/dev/yurika_online/reports/BUG_AUDIT_AND_REPRODUCTION.md:1), [UI 구조](C:/dev/yurika_online/reports/UI_SETTINGS_ARCHITECTURE.md:1), [디자인 평가](C:/dev/yurika_online/reports/GAME_DESIGN_CRITIQUE_AND_ROADMAP.md:1)를 참조한다.
