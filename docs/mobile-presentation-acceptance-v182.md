# v0.02.182 독립 검토 근거

검토일: 2026-10-09 UTC. 기준 v181 `7478f965dd3dd61f5518b6e7f7d46f0353c24bd4`, 1차 로컬 커밋 `d53dd6398a38a08b8f922a5c1d74e5f2c6738241`. 추가 수정도 동일 UX 브랜치의 로컬 커밋으로 보존한다. 원격 푸시·PR 생성·워크플로 실행·Firebase 배포 없음.

## 집계 기준 정정

이미지 572개는 PNG 212 + WebP 352 + 기존 SVG 8이었다. `reports/class-actions`, `reports/class-motion`, `reports/class-vfx`의 GIF 14개를 누락했다. 이전 `/workspace/yurika-v181/check-images.py`와 동일한 확장자·전체 저장소 기준은 **586개**다. v180 `52a3317c7ca718353d418404b9018d4fbd77f7a0`, v181, v182 및 작업 트리의 파일별 SHA-256을 비교하여 변경 0, 삭제 0, 추가 0을 확인했다. 원본 캐릭터, 생명의 구슬 등 기존 효과, 불변 배포 에셋, 보고서 이미지를 모두 포함한다. 신규 벡터 스킬 효과는 없다.

| 검사 묶음 | 이전 v181 | 이번 v182 | 의미 |
|---|---:|---:|---|
| 배포 전 `Validate public assets and local runtime` | 873 | 876 | 기존 명령 그대로 재실행. 새 mobile-presentation 단위 검사 3개 추가 |
| 배포 전 `Validate class growth and immediate combat HUD` | 18 | 18 | `npm run validate:field-clarity && npm run validate:return-berserk` |
| 위 두 묶음 합 | 891 | **894 통과** | 동일 기준 비교. 실패 0 |
| `npm run validate` | 이번 비교의 이전 집계 대상 아님 | **346 통과** | 다른 기본 검사 묶음. 894와 중복되므로 합산하지 않음 |

`npm run validate`의 TAP 합계는 UI audit 3 + Android display 8 + 새 presentation 3 + combat-direction 14 + resource/class-loading 10 + improvement 25 + camp-preparation 8 + adventure-summary 10 + camp-online-save 12 + startup-deadlines 7 + classes 246 = 346이다. 별도의 퀘스트·월드·아트·런타임·투사체 검사, 화염구 기하 24,600개와 온라인 권한 fixture 40개는 TAP 수에 합산하지 않았다.

894 쪽에만 있는 추가 검사 묶음은 immutable-assets 4, local-profile 21, monster-authority 4, inventory-compaction 9, class-weapons 62, approved-art 18, 추가 정적 회귀 451, field-clarity 8, return-berserk 10이다. 346 쪽에만 있는 TAP 묶음은 combat-direction 14, improvement 25다. 새 presentation 3개는 현재 두 명령 모두에 포함된다.

정확한 긴 명령 문자열은 `/workspace/yurika-v181/commands.json`의 첫 두 항목을 수정 없이 실행했으며 `/workspace/yurika-ux-v182/acceptance/static-equivalent.json`에 명령·종료 코드·TAP 수·로그 경로를 함께 기록했다. 추가 정적 451개는 해당 명령의 25개 `.mjs` 파일을 `node --test`로 실행한 묶음이다.

이전의 배포 전 **56개 명령 전체를 이번 v182에서 재실행한 것은 아니다**. 현재 실행/미실행 명령별 표는 `acceptance/workflow-scope.json`에 있다. 특히 음악/효과음 합성·청취, 실제 Firebase SDK loopback 수명주기, CBT03 전체, 렌더 프레임 행렬/negative controls, 실계정·운영 데이터·보안 emulator는 이번 수용 범위 밖이다. 과거 통과를 현재 실행으로 표기하지 않는다.

## 화면별 적용과 검증

| 화면 | 구현 파일 | 이번 적용 | 실행 근거 / 미검증 |
|---|---|---|---|
| 로그인·설치 | `LoginScene.js`, `AuthManager.js`, `PlatformGuide.js`, `mobile-ui.css` | 실패 전달·재시도, 선택적 설치 안내, standalone에서 숨김 | 실제 AuthManager→실패 transport fixture 3종 × 5회 × 5화면 = 75회. Google 취소/중복 진입 검사는 별도 main-browser. 실제 Google/Firebase 로그인과 OS 설치는 미실시 |
| 로딩·월드 진입 | `WorldScene.js` | 월드 준비 전 HUD 숨김, 실제 수치 반영 후 표시 | zone load 지연 fixture에서 숨김 확인. 네트워크 연결 지연·실패·watchdog은 startup-recovery 검사. 로더 자체 아트/진행 방식은 재설계하지 않음 |
| 야영지·캐릭터·준비 | `CampPresentation.js`, `CampScene.js`, CSS | 공통 표면·버튼, 직업 선택 스크롤, 준비 CTA 유지, 기존 래스터 초상 재사용 | 5화면 캡처/입력, camp-integration 3화면, field-clarity 4직업×3화면 저장·재진입. 상점/클랜 준비 중 항목은 구현하지 않음 |
| 필드 HUD | `UIManager.js`, `index.html`, CSS | 기본 메뉴 터치 크기/이름, 채팅 명암, 회전 측정 안정화 | 준비 전 숨김, 타겟 없음의 정상 HP, 사망 HP0/정상 maxHP 및 실제 부활 5화면. 상단 HUD·퀘스트 글자/폭 확대나 캐릭터 렌더 변경 없음 |
| 능력치·스킬 | `UIManager.js`, `index.html`, CSS | 스크롤 영역/고정 닫기, 44px +/−, 최대 비용 숨김, 마석 표기 | 미리보기 취소, 저장 확인, 재진입 12조합. 목록/상세/확인창의 입력 차단·Back 취소 추가 확인 |
| 가방·장비 | `UIManager.js`, `ItemPresentation.js`, CSS | 탭 이름, 상세/버튼 공통 스타일, 옵션 내부 키 대신 한국어·%p | 장비 상세 6종, 긴 설명 300회 반복, 취소/중복 사용/드래그 중단/순서 저장·재진입 5뷰포트. 확률 파괴/300칸 포화 경제 전수 검사는 아님 |
| 설정·이력 | `AndroidDisplayController.js`, `UIManager.js`, CSS | 전체화면 피드백을 설정 안에 표시, README 실패·재시도, 모달 Back | API NotAllowedError fixture 4모바일화면×2거절=8, 재시도·닫기 통과. 실제 OS 권한창 거절은 미실시. README 기존 경로 실패→재시도→성공, 사본 공개 없음 |
| 친구 | CSS 및 기존 UI 이벤트 | 공통 색/버튼, 짧은 가로 검색창 본문 스크롤 | 빈 목록·검색 초기 상태, 검색 입력/닫기/Back, 키보드 입력 차단. 실제 다계정 검색/메시지/선물·친구 프로필 네트워크 상태는 미실시 |

`mobile-ui.css`는 표시 계층이며 원본 아트·Canvas 좌표·전투 수치·재화 지급·저장 라우팅을 바꾸지 않는다. `main.js`, `sw.js`, `version.txt`는 버전 표식, `sync-version.js`는 CSS 캐시 버전 동기화, package scripts는 새 검증 연결이다.

## 235회 측정과 기존 배치 예외

5개 CSS 뷰포트(360×640, 640×360, 393×852, 852×393, 1280×800), DPR1에서 **47회 × 5 = 235회 측정**했다. ‘지능 올리기’를 한 번 더 측정하므로 화면당 고유 대상은 46개다. 각 대상의 실제 DOMRect가 44×44 CSSpx 이상이고, 중심과 네 가장자리 안쪽 2px 지점의 `elementFromPoint` 총 1,175점이 대상에 속하며 화면 안에 있음을 확인했다. 비활성 버튼 측정도 포함한다. 모든 대상의 모든 동작을 235번 실행했다는 뜻은 아니며 실제 터치/클릭 흐름은 별도 assertion으로 검사했다.

이 측정은 신규 기본 메뉴와 공통 팝업을 대상으로 한다. **기존 커스텀 HUD 메뉴를 44px로 강제 확대하지 않았다.** 동일한 legacy 저장 배치에서 메뉴 패널 높이 41.4px(세로), 30.4px(가로)가 유지된다. 상단 HUD·메뉴 위치/크기, 배치 직렬화, 채팅55%/퀘스트72%/메뉴66% 불투명도, PC 단축키 숨김 설정을 v181/v182 직접 비교했고 3회 회전·재접속에서도 보존했다. 다른 모든 숨김 설정의 조합 전수 검사는 아니다.

최소 안전 보정의 적용 범위는 독립 팝업의 44px 제어와 저장 배치가 없는 모드의 기본 메뉴다. 기존 HUD에 투명 hit 영역만 넓혀도 인접 조작을 가릴 수 있으므로 그런 자동 패딩·배율 변경·초기화는 하지 않는다. 해당 커스텀 배치는 44px 예외로 남기며, 향후 확대가 필요하면 메뉴만 대상으로 여유 공간과 화면 경계를 함께 확인해야 한다.

## 추가로 발견해 보완한 항목

첫 코드에서 능력치 확인창의 브라우저 Back이 기존 취소 callback을 종료 확인창으로 바꿨다. `handleBrowserBackPopState`를 보완하여 generic/확인/이력/스킬 상세/아이템 상세/친구 검색/일반 팝업의 상위 창을 먼저 닫거나 취소한다. 일반 팝업이 모두 닫힌 필드에서만 기존 종료 확인을 연다. 중복 종료 확인 방지, 저장 대기와 실패 재시도 동작은 유지한다.

`validate-settings-exit-v168-browser.cjs`의 ‘두 번째 Back에 바로 종료’ 기대를 ‘설정을 먼저 닫고 필드에서 다음 Back에 종료’로 수정하고, 불필요한 저장/씬 전환이 없는지 검사를 유지했다. 종료 18시나리오, 단위 검사 11개, 새 모달 검사와 기존 main-browser를 통과했다.

기존 main-browser는 InputManager가 방출하지 않는 `actionDown`을 관측했다. 실제 이벤트인 `keydown`으로 정정했다. 새 acceptance 검사는 팝업이 없을 때 실제 공격 입력이 관측되는 양성 대조 후, 11종 UI 표면×5화면에서 실제 탭/클릭·J 키가 전투/조이스틱 입력으로 전달되지 않는지 검사한다. 모든 모달의 가능한 화면 좌표·동시 터치·IME 조합 전수 검사는 아니다.

모달 닫기 범위: 일반 팝업 5종은 Escape와 Back, 능력치 확인은 Back 취소 및 기존 취소 버튼, 스킬/아이템 상세·설치 안내·이력·친구 검색은 Back, 로그인 설치 안내는 Escape와 확인 버튼을 검사했다. 친구 채팅/선물/프로필, 보상/지도 등 나머지 모달의 모든 Back 조합과 로그인 화면 자체의 브라우저 Back은 미실시다.

키보드는 입력창에 실제 focus와 텍스트를 넣고 CSS 뷰포트를 360×384, 640×220, 393×511, 852×235, 1280×480으로 축소하여 입력창 가림/입력 관통을 확인했다. **Android/iOS 소프트 키보드를 연 시험이 아니다.**

## 선명도와 직접 시각 검수

Chromium 151.0.7922.173 / Node22.23.3 / npm10.9.4. 기본 전후 비교는 같은 Lv6/마석2206/포인트5의 자연 진행 로컬 마법사 프로필, DPR1, v181/v182 각40장이다. 별도 렌더 검사 9,216샘플은 실제 local/remote 렌더 경로를 통과하고 smoothing=false 및 상태 복원, `image-rendering:pixelated`를 확인했다. 실제 온라인 상대는 아니다.

선명도 조건은 PC1280×720/deviceDPR1/renderDPR1, Retina1280×720/deviceDPR2/renderDPR2, 세로393×852·가로852×393/deviceDPR3/renderDPR1.85였다. 모바일 내부 DPR 제한과 회전 후 backing-store 크기는 JSON에 기록되어 있다. 기기 DPR3을 내부 렌더 DPR3으로 잘못 해석하면 안 된다. 이 수치는 물리 기기 FPS 측정이 아니다.

PNG는 직접 `view_image`로 열어 검수했다. 대표 사례:

- 360×640 능력치: 일부 행은 스크롤로 접근하며 상/하단 닫기와 +/− 크기를 유지.
- 640×360 캐릭터: 기존 래스터 배경·캐릭터 유지, 직업 선택은 내용 스크롤 안에 있고 준비 CTA는 고정. 로그인 CTA와 선택 설치 안내도 화면 안에 표시.
- 393×852 스킬 전후: `600G`/`-G` 대신 마석과 최대 상태, 여분 빈 공간 축소, 상단 닫기와 행 간격 통일.
- 852×393 필드: 왼쪽 HP/MP·퀘스트와 중앙 캐릭터 선명도 유지, 메뉴 이름/기본 터치 크기 개선.
- 1280×800 친구 검색: 중앙 검색창·빈 결과 안내·44px 닫기/검색 버튼 확인.
- DPR2 마법사 및 deviceDPR3 위치 상태 시트: local/remote의 정지·이동·공격 원본 실루엣과 픽셀 경계 확인.

80장 전체를 수작업으로 모두 시각 검수했다는 뜻은 아니다. 자동 캡처/DOM 검증과 위 대표 이미지 직접 검수를 구분한다.

## 미리보기/전달 제한과 환경

차단된 경로는 비교 문서 `file:///workspace/yurika-ux-v182/review.html`에 대한 Playwright `page.goto`이며 오류는 `net::ERR_BLOCKED_BY_ADMINISTRATOR`였다. 다른 프로토콜/호스트로 우회하지 않았다. 실제 게임은 별개로 `http://127.0.0.1:8100/?local=1`에서 실행·캡처했으며 PNG 열기는 성공했다.

Library의 지원되는 prepared-upload 배치 1회는 `library upload failed: hosted apps tools/list request failed: network`로 실패했다. 재업로드나 대체 경로를 시도하지 않았다.

00:11 UTC 연결 끊김 알림 후, 00:13:24 UTC에 터미널 명령 성공, loopback HTTP200+CSP, 추가 브라우저 5케이스/JS오류0/외부요청0과 증거 파일 보존을 확인했다. 이 환경에서는 작업이 막히지 않아 재시작/재인증은 필요하지 않았다. 저장된 환경 기본 ref는 여전히 master이며 UX 재개 브랜치는 `ux/mobile-consistency-v182`다. 모든 결과는 로컬 수용 근거이며 운영 배포 성공이나 상용 출시 승인을 의미하지 않는다.
