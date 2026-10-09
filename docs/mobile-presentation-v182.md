# v0.02.182 모바일 UI 정리

야영지 → 캐릭터 정비 → 원정 준비 → 필드 → 메뉴의 공통 표현을 정리한다. 기본 색은 짙은 숲색, 아이보리, 절제된 금색이며, 기존 래스터 캐릭터·배경·WebP 전투 효과를 그대로 사용한다.

## 변경 범위

- 능력치 내용은 스크롤되고 상단/하단 닫기는 고정된다. +/-와 주요 메뉴 동작은 실제 44 CSSpx 이상의 터치 영역을 갖는다. 작은 가로 화면의 캐릭터 선택도 내용 영역 안에서 스크롤된다.
- 가방 탭에 장비/도구 이름을 표시한다. 스킬 비용은 실제 재화인 마석으로 통일하고, 최대 레벨에는 비용을 숨긴다. 옵션 변경 결과에는 내부 키 대신 한국어 이름과 퍼센트포인트 차이를 표시한다.
- 저장한 메뉴 배치가 없는 화면 모드에서만 기본 메뉴 버튼을 확대한다. 기존 저장된 위치·배율·클라이언트 설정, 프로필 및 저널을 재설정하지 않는다. 새 기본 메뉴를 사용자가 배치 편집기에서 저장하면 해당 메뉴 항목의 선택적 `touchSize: true` 표시만 함께 보존하여 저장 후 작아지지 않게 한다. 표시가 없는 기존 메뉴는 기존 크기를 사용한다. HUD 측정 대상의 크기 전환 애니메이션을 제거해 회전 중간 프레임을 기준으로 측정하지 않도록 한다. 왼쪽 HUD의 너비/글자 크기 규칙은 그대로 유지한다.
- 설치 안내는 선택 사항이며 standalone 실행에서는 표시하지 않는다. 브라우저 메뉴 이름은 버전에 따라 다름을 안내한다. Android 전체화면 결과는 설정 안에서만 보인다.
- 로그인 실패를 화면에 전달해 재시도를 가능하게 한다. 월드 준비 중 HUD를 숨기고 실제 플레이어 수치를 먼저 반영한다.
- README 이력 접근 실패 시 현재 버전·좁은 오류 설명·다시 불러오기 버튼을 보여준다. 기존 불러오기 경로를 사용하며 README를 다른 공개 파일에 복제하지 않는다.

전투 규칙, 밸런스, 재화 지급, 저장·인증 라우팅, Firebase 규칙 및 배포 워크플로는 변경하지 않는다. 익명 로그인 실패의 예외 전달은 기존 로그인 UI가 오류/재시도를 처리할 수 있게 하는 수정이다.

## 검증

```sh
source /workspace/yurika-cloud/env.sh
npm run validate
npm run validate:mobile-presentation-browser
npm run validate:camp-integration
npm run validate:startup-recovery
npm run validate:field-clarity-browser
npm run validate:character-crispness-browser
npm run validate:display-quality-browser
node scripts/validate-hud-input-v174-browser.cjs
node scripts/validate-inventory-interactions.cjs
```

브라우저 검증은 `http://127.0.0.1:8100/?local=1`에서 실행한다. 외부 요청을 차단하고 격리된 로컬 프로필 또는 명시적인 지연/실패 fixture를 사용한다. 실제 계정, 운영 데이터, 온라인 대전 또는 물리 기기 결과로 해석하지 않는다.

새 검증은 360×640, 640×360, 393×852, 852×393, 1280×800 CSSpx / DPR1에서 가장자리 hit-test, 실제 터치/클릭, 취소, 키보드, 설정 내 안내, 준비 중 HUD, 회전 3회, 사용자 저장 배치와 재진입을 확인한다. 설치 상태·인증 오류는 fixture로 검증하며 실제 iOS/Android 설치 동작과 OS 키보드는 별도 실기기 확인 대상이다.

설치 문구는 [Apple Safari 안내](https://support.apple.com/ko-kr/guide/iphone/iphea86e5236/ios), [Chrome Android 안내](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ko), [Samsung Internet 안내](https://samsunginternet.github.io/docs/homescreen)를 참고한다.

### 이번 로컬 결과

- Node 22.23.3 / npm 10.9.4 / Chromium 151.0.7922.173, `?local=1` 및 외부 요청 차단 조건.
- 전체 `validate`: TAP 346개 통과, 실패 0. 화염구 기하 24,600개 및 권한 스냅샷 fixture 40개도 통과.
- 5개 화면 크기에서 주요 조작 대상 235회(47회 × 5, 화면당 고유 대상 46개)의 44 CSSpx 크기·가림·가장자리 hit-test 통과. 실제 터치/클릭은 해당 화면의 조작 흐름으로 별도 검증했다. 회전, 기본 메뉴 저장, 기존 사용자 배치 저장/재접속도 통과.
- 동일한 기존 배치·클라이언트 설정을 v181/v182에 주입해 5개 화면 크기에서 직렬화 값, 불투명도, 상단 HUD/메뉴 실측 크기·위치 보존 확인.
- 4직업 × 3화면의 성장 미리보기/취소/저장/재진입 12개, HUD 입력 18개, 렌더링 9,216개 샘플, 표시 품질 16개 통과. 인벤토리·야영지 통합·시작 복구 검사도 통과.
- 최초 집계 572개에 보고서 GIF 14개를 포함한 전체 추적 이미지 586개의 SHA-256을 동일 기준으로 재확인했다. 변경·삭제 없음. 비교 화면은 같은 로컬 마법사 프로필로 v181/v182 각각 40장, DPR1에서 기록.

2026-10-09 독립 검토 보완: 이전 정적 검사와 같은 명령으로 894개(기존 891 + 새 UX 단위 검사 3) 통과. 필드 모달의 브라우저 뒤로가기 취소 경로를 보완하고, 실제 InputManager 이벤트 관측 및 양성 대조, 게스트 실패 75회, 전체화면 거절 8회, 입력창 축소 뷰포트와 사망/부활을 추가 확인했다. 상세 수용 범위와 예외는 [독립 검토 근거](mobile-presentation-acceptance-v182.md)에 기록했다.

기본 버튼 크기 개선은 신규 기본 배치에 적용한다. 사용자가 작게 저장한 기존 배치까지 강제로 확대했다는 의미는 아니다. 렌더링 샘플 수는 물리 기기의 성능/FPS 측정이 아니다.

### 클라우드에서 이어서 작업

작업 브랜치는 `ux/mobile-consistency-v182`이며 기준은 `mmorpg_online`의 `7478f965dd3dd61f5518b6e7f7d46f0353c24bd4`이다. 같은 작업공간에서는 변경사항을 확인한 다음 해당 브랜치를 명시적으로 선택한다.

```sh
cd /workspace/yurikaonline
git status --short --branch
git switch ux/mobile-consistency-v182
source /workspace/yurika-cloud/env.sh
```

저장된 환경 설정의 기본 ref `master`는 수정하지 않았다. 새로운 원격 기준 작업은 `/workspace/yurika-cloud/prepare.sh`가 `mmorpg_online`을 명시적으로 fetch/switch하고 fast-forward만 허용한다. 이 스크립트는 현재 UX 브랜치를 이어가는 명령이 아니다. 작업공간 재생성 시 로컬 브랜치·자료 보존은 보장되지 않으므로 제공한 patch를 별도 보존해야 한다. 미리보기 서버는 `/workspace/yurika-cloud/serve-local.py`로 실행하며 24시간 실행이나 외부 공유 주소를 보장하지 않는다.

이 브랜치의 코드는 로컬 검토용이다. `mmorpg_online`에 푸시하면 운영 Firebase Hosting 자동 배포가 시작되므로 환경 준비·검증 명령에 push/deploy를 포함하지 않는다.
