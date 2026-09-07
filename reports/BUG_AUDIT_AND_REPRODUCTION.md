# 개선 감사 (2026-09-07)

기준: mmorpg_online, 74b14f6. 기존 변경은 plans/CODEX_GPT6_YURIKA_ONLINE_IMPROVEMENT_DIRECTIVE.md 미추적 파일 하나. CODEX_TASK.md는 저장소 검색 결과 없음. 첨부 지시서를 전체 명세로 적용한다.

기준선: npm run validate 종료 코드 0 (reports/improvement-baseline.log). package-lock.json 기준 npm 사용. build/lint 스크립트 없음; 정적 HTML/ES module 프로젝트. npm start는 127.0.0.1:8081이며 LOCAL_DEV.md의 8080 설명은 오래됨. 브라우저/Emulator 검증은 아직 미실행.

API 잔여량: 현재 제공된 도구에 계정 quota 조회 기능 없음. 3% 임계값을 확인했다고 주장하지 않는다. 각 단계의 결과와 재개 절차를 IMPLEMENTATION_RESULT.md에 기록한다.

## 초기 코드 근거 (수정 전)

| ID | 심각도 | 상태 | 근거/다음 검증 |
|---|---|---|---|
| SEC-01 | P0 | 코드상 확정 | database.rules.json:3 루트 read/write true. Emulator 권한 테스트 필요 |
| SEC-02 | P0 | 코드상 확정 | UIManager.tryUnlockDeveloperAccess 클라이언트 문자열 비교 |
| NET-01 | P0 | 코드상 확정 | Player.saveProfilePatch → NetworkManager.savePlayerDataPatch, 클라이언트 경제 결과 저장 |
| UI-04 | P0 | 코드상 확정 | UIManager.loadStoredUiLayout:1111 전역 키, loadPlayerUiLayout:1671 시각 비교 후 업로드 |
| INPUT-01 | P1 | 코드상 확정 | KeyboardHandler._onKeyUp 현재 shift 상태로 액션 재해석 |
| UI-05 | P1 | 조사 중 | persistUiLayoutDraft:1547 저장 Promise 미추적. 실제 성공 문구 여부와 분리하여 검증 |
| PWA-01 | P1 | 코드상 확정 | sw.js:201 error/200, index.html:370 response.ok 미검사 |
| UI-01 | P1 | 코드상 확정 | applyActiveUiLayout:1346 편집 종료 시 fixed layout null |
| UI-02 | P1 | 코드상 확정 | rangeSettings input/change 모두 updateSetting(refreshGame:true) |
| UI-03 | P1 | 조사 중 | UI/렌더/입력 viewport 경로 추적 필요 |
| WORLD-01 | P2 | 코드상 확정 | _spawnMonster:3549 1ms당 1000개 ID 후보 |
| WORLD-02 | P2 | 코드상 확정 | _spawnMonster:3558 안전지대 12회 실패 후 생성 진행 |

다음: 실제 메서드를 호출하는 실패 테스트 작성 → 입력 → 저장소 → 조이스틱 → viewport → PWA → 터치 → 스폰 → 보안 순서로 작은 변경 및 검증.

# 최종 항목별 검증

위 표는 수정 전 기준선이다. 실제 수행 환경은 Windows Edge headless, Node, Firebase Emulator다. 모바일/Safari 실기기 수동 검증은 수행하지 않았다.

## SEC-01

- 상태: 운영 미해결, 후보 검증
- 심각도: P0
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [database.rules.json](C:/dev/yurika_online/database.rules.json:3)
- 원인: root 전면 개방
- 재현 절차: 비인증·타 UID PUT
- 기대 결과: 후보 Rules 별도 작성
- 실제 결과: 기존 2건 허용, 후보 거부7/허용1
- 수정 내용: 후보 Rules 별도 작성
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 서버 API 이전 전 배포 금지

## SEC-02

- 상태: 클라이언트 경로 차단
- 심각도: P0
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js:10130)
- 원인: 암호·로컬 플래그·직접 DB 초기화
- 재현 절차: flag=true와 직접 초기화 호출
- 기대 결과: 암호 제거·권한 false·초기화 reject
- 실제 결과: 허용에서 거부로 변경
- 수정 내용: 암호 제거·권한 false·초기화 reject
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 열린 운영 Rules의 SDK 직접 쓰기 위험

## NET-01

- 상태: 조사 완료, 서버 이전 필요
- 심각도: P0
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/entities/Player.js](C:/dev/yurika_online/src/js/entities/Player.js:1451)
- 원인: 클라이언트 결과 저장
- 재현 절차: 보상→profile patch 추적
- 기대 결과: 서버 API·원장 설계 문서화
- 실제 결과: 클라이언트가 최종 결과 기록
- 수정 내용: 서버 API·원장 설계 문서화
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 기존 멱등 테스트는 치팅 차단 증명이 아님

## UI-04

- 상태: 검증 완료
- 심각도: P0
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1081)
- 원인: 전역 레이아웃 키
- 재현 절차: A저장→B로그인→A복귀
- 기대 결과: UID 저장과 세션 reset
- 실제 결과: A가 B로 업로드되던 문제 해결
- 수정 내용: UID 저장과 세션 reset
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 구 키 소유자 불명, 첫 인증 사용자에게 1회 귀속

## INPUT-01

- 상태: 검증 완료
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/core/input/KeyboardHandler.js](C:/dev/yurika_online/src/js/core/input/KeyboardHandler.js:121)
- 원인: modifier 재해석
- 재현 절차: Shift+S 후 Shift 먼저 해제
- 기대 결과: 물리키 map·blur/hidden reset
- 실제 결과: OPEN_SKILL 잔존 해결
- 수정 내용: 물리키 map·blur/hidden reset
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 다중 입력 소스의 같은 액션 공유는 기존 Set 설계

## UI-05

- 상태: 검증 완료
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1123)
- 원인: 저장 Promise 미추적
- 재현 절차: ok:false/reject/offline 주입
- 기대 결과: 상태·직렬화·generation·재시도
- 실제 결과: 실패 상태 없던 문제 해결
- 수정 내용: 상태·직렬화·generation·재시도
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 기존 성공 문구 오표시 자체는 미확인; 공간 부족 조합 잔여

## UI-01

- 상태: 검증 완료
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1364)
- 원인: 편집 종료 fixed null
- 재현 절차: 저장·회전 왕복·reload
- 기대 결과: joystickMode와 방향별 위치
- 실제 결과: 위치 무시에서 고정 유지로 변경
- 수정 내용: joystickMode와 방향별 위치
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 실계정 로그인·설치형 PWA 미검증

## UI-02

- 상태: 검증 완료
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:650)
- 원인: input마다 저장/resize
- 재현 절차: 슬라이더 30단계 input
- 기대 결과: rAF preview/change 저장
- 실제 결과: resize0/backing0/save1 확인
- 수정 내용: rAF preview/change 저장
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: DPR 실기기 검증 잔여

## UI-03

- 상태: 핵심 수정, 실기기 잔여
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/core/ViewportMetrics.js](C:/dev/yurika_online/src/js/core/ViewportMetrics.js:2)
- 원인: container와 window 좌표 불일치
- 재현 절차: 800×600 offset100,50에 정규화.5,.5
- 기대 결과: 공통 metrics와 capture/drag/apply
- 실제 결과: 오배치에서 500,350으로 수정
- 수정 내용: 공통 metrics와 capture/drag/apply
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 튜토리얼·팝업 전체 이전 및 노치/키보드 미검증

## PWA-01

- 상태: 로컬 검증 완료
- 심각도: P1
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [index.html](C:/dev/yurika_online/index.html:348)
- 원인: error/200과 타 앱 캐시 삭제
- 재현 절차: offline/500/error/HTML/빈값/새 버전
- 기대 결과: 503·ok/형식·설치 업데이트·앱 캐시 범위
- 실제 결과: 오류 refresh0, 정상 update1
- 수정 내용: 503·ok/형식·설치 업데이트·앱 캐시 범위
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 설치 PWA 두 릴리스 실전환 잔여, legacy 복구 유지

## UI-06

- 상태: 임시 안전 정책 구현
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1688)
- 원인: 기기 미래시각 우선
- 재현 절차: 미래 updatedAt와 서버 비교
- 기대 결과: pending base 비교/conflict 보존
- 실제 결과: 서버 덮어쓰기 제거
- 수정 내용: pending base 비교/conflict 보존
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 독립 revision CAS·충돌 선택 UI 후속

## UI-07

- 상태: 검증 완료
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1682)
- 원인: 즉시 영구 초기화
- 재현 절차: 초기화 후 취소
- 기대 결과: 편집 진입 후 draft reset
- 실제 결과: 원본 변경 없이 draft만 변경
- 수정 내용: 편집 진입 후 draft reset
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 추가 확인 모달/Undo 미구현

## UI-08

- 상태: 분류 검증, UX 잔여
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:771)
- 원인: 1024px 폭 제한
- 재현 절차: 1366×1024 coarse pointer
- 기대 결과: 폭 제한 제거
- 실제 결과: desktop 대신 mobileLandscape
- 수정 내용: 폭 제한 제거
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 강제 Desktop/Touch 선택·태블릿 CSS 전체 QA 잔여

## UI-09

- 상태: 부분 검증
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:4010)
- 원인: 실패 후 설정 유지
- 재현 절차: orientation API 미지원
- 기대 결과: 결과 반환·설정/체크박스 롤백
- 실제 결과: 설정 false로 롤백
- 수정 내용: 결과 반환·설정/체크박스 롤백
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 실제 lock 성공/reject 교차 요청 미검증

## UI-10

- 상태: 주요 병합 검증
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/main.js](C:/dev/yurika_online/src/js/main.js:246)
- 원인: 즉시+5개 timer
- 재현 절차: 같은 frame 이벤트3회
- 기대 결과: rAF·ResizeObserver·UI 지연 축소
- 실제 결과: resize1로 병합
- 수정 내용: rAF·ResizeObserver·UI 지연 축소
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: iOS 여러 프레임 안정화 호출 수 미측정

## UI-11

- 상태: 브라우저 검증 완료
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js:1205)
- 원인: 일반 스타일 포괄 삭제
- 재현 절차: 외부 display:grid 후 clear
- 기대 결과: 원본/적용값 기록 후 소유값만 복원
- 실제 결과: 외부 스타일 유지
- 수정 내용: 원본/적용값 기록 후 소유값만 복원
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 외부가 동일 값 재설정한 소유권 구별 불가

## INPUT-02/03

- 상태: 검증 완료
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/core/input/TouchHandler.js](C:/dev/yurika_online/src/js/core/input/TouchHandler.js:417)
- 원인: DOM 핸들러 누수·cancel=end
- 재현 절차: active aim에서 cleanup
- 기대 결과: disposer·cancel/blur/hidden reset
- 실제 결과: 등록수0/aimCancel1
- 수정 내용: disposer·cancel/blur/hidden reset
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 한 손가락 cancel 시 전체 터치 보수적 취소

## WORLD-01

- 상태: 검증 완료
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js:3537)
- 원인: 1ms 난수후보1000
- 재현 절차: 고정 시각/random 동시100 spawn
- 기대 결과: UUID와 fallback session counter
- 실제 결과: 유일 ID100개
- 수정 내용: UUID와 fallback session counter
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: crypto 미지원 다중 프로세스 전역 유일성 보장 아님

## WORLD-02

- 상태: 검증 완료
- 심각도: P2
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js:3574)
- 원인: 안전지대 재시도 소진 후 생성
- 재현 절차: 모든 좌표 안전지대
- 기대 결과: 최종 반올림 좌표 검사, training_dummy 제외
- 실제 결과: null 반환·몬스터0
- 수정 내용: 최종 반올림 좌표 검사, training_dummy 제외
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 실제 맵 경계 육안 검증 잔여

## PERF-01

- 상태: 검증 완료
- 심각도: P3
- 영향 환경: Desktop / Android / iOS / PWA / Tablet
- 관련 파일: [src/js/core/GameLoop.js](C:/dev/yurika_online/src/js/core/GameLoop.js:23)
- 원인: FPS 제한 우회
- 재현 절차: 100ms 10frame/30FPS
- 기대 결과: 일반 분기와 같은 렌더 예산
- 실제 결과: 렌더10에서 3이하
- 수정 내용: 일반 분기와 같은 렌더 예산
- 자동화 테스트: validate-improvement.mjs 해당 ID 및 browser-tests/improvement.spec.cjs; SEC-01은 validate-security-emulator.mjs
- 수동 테스트: 미실시; Windows Edge 자동화와 구별
- 남은 위험: 실기기 발열 미측정

## DEP-01 — P2 추가 발견

상태: npm audit 경고 확인, 악성 파일 직접 재현하지 않음. 기존 image-size 2.0.2 ICNS/JXL/HEIF 파서 무한 루프 high 1개, fixAvailable:false. 대체 또는 upstream 수정 후 검증 필요. [audit](C:/dev/yurika_online/reports/improvement-dependency-audit.json:1).
