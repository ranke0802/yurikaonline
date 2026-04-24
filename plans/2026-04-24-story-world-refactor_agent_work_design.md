# 스토리/월드 확장 리팩터링 작업 설계서

작성일: 2026-04-24  
현재 기준 버전: 0.02.031  
기준 브랜치: `mmorpg_online`  
기준 원격 푸시: `git push origin mmorpg_online` 완료, 결과 `Everything up-to-date`

## 1. 목표

프롤로그 씬, 스토리 씬, 마을, 필드 이동, 던전, 추가 필드를 안전하게 붙일 수 있도록 현재의 단일 필드 중심 구조를 점진적으로 확장한다.

이번 리팩터링은 대형 콘텐츠를 바로 만드는 작업이 아니라, 이후 콘텐츠 추가 시 같은 파일을 계속 찢어 고치지 않도록 기반을 정리하는 작업이다.

## 1.1 최상위 대전제

현재 라이브 기능 보존이 모든 리팩터링보다 우선한다. 아래 흐름 중 하나라도 깨질 가능성이 있으면 구현하지 않고 문서/스캐폴딩으로 낮춘다.

- 기존 `zone_1/default` 필드 진입
- 저장 좌표 복원
- 프롤로그 이후 기본 튜토리얼 진입
- 슬라임/대왕 슬라임 전투와 보상
- 인벤토리/장비/강화/분해
- 친구, 채팅, 선물, 함께하기
- 모바일 세로/가로 HUD와 입력
- 서비스 워커 기반 캐시/버전 갱신

## 2. 현재 병목

1. `WorldScene`이 `zone_1`을 직접 로드한다.
2. `NetworkManager.roomId`가 `zone_1` 기본값으로 고정되어 있다.
3. 존 데이터는 개별 JSON은 있지만, 전체 월드/존 목록/진입 규칙/포탈 규칙을 설명하는 manifest가 없다.
4. 프롤로그/스토리 연출은 `StoryManager`에 기본 기능이 있으나, 월드 전환/스토리 전용 씬/스토리 완료 후 이동 규칙이 아직 명확하지 않다.
5. `UIManager`, `NetworkManager`, `Player`에 기능이 집중되어 있어 작은 콘텐츠 작업도 회귀 위험이 크다.
6. Firebase 보안 규칙 파일과 자동 검증 스크립트가 없어 구조 변경 후 실수 탐지가 어렵다.

## 3. 이번 라운드 산출물

### 필수 산출물

- 최신 상태 기준 개발 체크리스트 정리
- 로컬 개발 가이드 포트 불일치 수정
- 프로젝트 검증 스크립트와 CI 검증 단계 추가
- Firebase RTDB rules 초안과 `firebase.json` 연결
- 월드/존 manifest 기반 로딩 준비
- 포탈/필드 이동 스키마 문서화
- UI HTML 삽입 경로를 안전 helper로 모으는 1차 정리

### 이번 라운드에서 하지 않는 것

- 실제 대형 신규 마을/던전 콘텐츠 제작
- 멀티플레이 구조 전면 교체
- Cloud Functions 전체 구현
- 기존 전투 밸런스 변경
- Firebase rules 실배포

## 4. 에이전트 배정

### Agent A: DX/검증 담당

목적: 리팩터링 후 실수 탐지 기반을 만든다.

소유 파일:

- `scripts/verify-project.js`
- `package.json`
- `.github/workflows/firebase-hosting-merge.yml`
- `.github/workflows/firebase-hosting-pull-request.yml`
- `LOCAL_DEV.md`

작업:

1. JSON 파싱 검증
2. 관리 버전 파일 일치 검증
3. 주요 JS 파일 `node --check` 검증
4. GitHub Actions에 `npm install` 및 `npm run verify` 추가
5. `LOCAL_DEV.md`의 포트를 `package.json`과 맞춘다.

### Agent B: Firebase 보안/데이터 규칙 담당

목적: 현재 클라이언트 권한 구조를 당장 바꾸지는 않되, 최소 권한 rules 초안을 추적 파일로 만든다.

소유 파일:

- `database.rules.json`
- `firebase.json`
- `plans/firebase_rules_rollout_2026-04-24.md`

작업:

1. 현재 경로를 기준으로 RTDB rules 초안 작성
2. rules 배포 전 수동 검증 절차 문서화
3. `firebase.json`에 database rules 경로 추가
4. 이번 라운드에서 rules 실배포는 하지 않는다.

### Agent C: 월드/필드 라우팅 담당

목적: `zone_1` 직접 의존을 줄이고, 이후 마을/던전/추가 필드가 manifest에 등록되는 구조를 만든다.

소유 파일:

- `src/js/world/ZoneManager.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/core/NetworkManager.js`
- `assets/data/world/zone_manifest.json`
- `assets/data/zones/template.json`
- `assets/data/zones/zone_1.json`

작업:

1. `ZoneManager`에 zone manifest 로드/조회 API 추가
2. `WorldScene.enter(params)`가 `params.zoneId`, `params.spawnId`를 우선 사용하도록 변경
3. 기본값은 반드시 기존 `zone_1/default` 유지
4. `NetworkManager`의 base field id가 현재 zone id를 안전하게 따라가도록 보강
5. 존 JSON에 포탈/전환 스키마 필드를 추가하되, 실제 이동 동작은 최소 범위로 유지

### Agent D: UI HTML 안전화 담당

목적: 스토리/퀘스트/친구 메시지/보상 텍스트가 늘어날수록 XSS와 깨진 HTML 위험이 커지므로 HTML 삽입 경로를 명시적으로 만든다.

소유 파일:

- `src/js/ui/htmlSafety.js`
- `src/js/ui/UIManager.js`

작업:

1. `escapeHtml`, `setText`, `setTrustedHtml` helper 추가
2. `showConfirm`, `showRewardModal`, `showGenericModal`의 직접 `innerHTML` 삽입을 helper 경유로 정리
3. HTML이 필요한 기존 호출은 `allowHtml` 또는 trusted helper로만 남긴다.
4. 대규모 UI 리팩터링은 하지 않는다.

### Parent Integrator: 통합/문서 담당

목적: 에이전트 결과를 검토하고 충돌 없이 통합한다.

소유 파일:

- `plans/2026-04-24-story-world-refactor_agent_work_design.md`
- `DEVELOPMENT_MASTER_CHECKLIST.md`
- 최종 통합 시 필요한 소규모 조정

작업:

1. 설계서 작성
2. 현재 버전 푸시
3. 각 에이전트 작업 생성
4. 결과 검토 및 충돌 해결
5. 실행 가능한 검증만 수행
6. 변경 요약과 잔여 리스크 정리

## 5. 공통 안전 규칙

0. 현재 동작 보존은 절대 게이트다. 기존 플레이가 깨질 수 있는 변경은 이번 라운드에서 제외한다.
1. 모든 에이전트는 같은 코드베이스에서 동시에 작업 중이라는 전제로 움직인다.
2. 자신의 소유 파일 밖 변경이 필요하면 먼저 최종 응답에 명시하고, 임의로 확장하지 않는다.
3. 다른 에이전트나 사용자의 변경을 되돌리지 않는다.
4. 런타임 동작 변경은 기본값 보존을 우선한다.
5. `zone_1/default` 진입, 기존 튜토리얼, 기존 함께하기 흐름은 깨지면 안 된다.
6. Firebase rules는 파일만 추가하고 실배포하지 않는다.
7. 버전 bump는 통합자가 마지막에만 판단한다.
8. 대형 파일 분리는 이번 라운드에서 행동 단위 helper 추출까지만 한다.
9. 자동 검증이 실패할 때는 실패 원인과 미검증 범위를 반드시 남긴다.
10. 신규 데이터 스키마는 기존 JSON과 호환되어야 하며 필수 필드 누락 시 안전 기본값을 사용한다.

## 6. 작업 순서

1. 현재 원격 기준점 확인 및 푸시
2. 설계서 작성
3. Agent A/B/C/D 병렬 작업
4. 통합자가 결과 검토
5. 충돌/중복 제거
6. 가능한 검증 수행
7. 최종 변경 요약 작성

## 7. 수용 기준

- 기존 `zone_1` 플레이 진입 경로가 유지된다.
- 새 zone manifest가 없어도 기존 방식으로 fallback 된다.
- `npm run verify`가 CI에서 실행 가능한 형태로 추가된다.
- Firebase rules 초안은 현재 데이터 경로를 설명하고, 배포 전 검증 절차가 있다.
- UI HTML 삽입 경로가 helper로 명시되어 새 스토리/보상 텍스트 추가 시 사용 기준이 생긴다.
- 문서의 현재 버전/포트/우선순위가 실제 프로젝트와 맞는다.

## 8. 다음 라운드 후보

1. `StoryScene` 추가 및 프롤로그 전용 카메라/대화 연출 분리
2. 포탈 충돌 감지와 확인 모달 기반 필드 이동
3. `town_1`, `dungeon_slime_cave_1` 샘플 데이터 추가
4. Cloud Functions 기반 보상/강화/선물 검증
5. `UIManager`, `NetworkManager`, `Player` 기능별 모듈 분리
