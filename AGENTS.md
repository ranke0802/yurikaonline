# Yurika Online 개발·검증·배포 지침

이 저장소의 기본 작업 브랜치는 `mmorpg_online`이다. 저장된 클라우드 환경의
기본 ref `master`를 그대로 사용하지 않는다. 작업 전에 `git status`와 브랜치,
HEAD를 확인하고 사용자 변경을 보존한다. 클린 상태에서만 명시적으로
`git fetch origin refs/heads/mmorpg_online:refs/remotes/origin/mmorpg_online`,
`git switch mmorpg_online` (없으면 `--create --track origin/mmorpg_online`),
`git merge --ff-only origin/mmorpg_online`을 수행한다. 설정을 실제로 바꾸지
않았으면 환경 기본 브랜치를 변경했다고 보고하지 않는다.

## 운영 트래픽과 권한

- `mmorpg_online` 푸시는 GitHub Actions의 **운영 Firebase Hosting 배포**를
  유발한다. 개발·환경 준비·로컬 수정 요청은 운영 푸시/배포 승인이 아니다.
- 브라우저/성능/회귀/스크린샷/자산 전수 검증은 **localhost 또는 에뮬레이터**에서만
  실행한다. 운영 URL에 `?local=1`을 붙여도 정적 파일 다운로드는 운영 과금이다.
- QA 네트워크 진입 스크립트는 다른 작업보다 먼저 `scripts/lib/qa-preflight.cjs`를
  import/require한다. 원격 QA URL을 허용하거나 가드를 끄지 않는다. 새 실행기에도
  동일한 가드를 적용하고 `npm run validate:qa-policy`에 검출되도록 한다.
- Playwright `route()`는 HTTP 캐시를 끈다. 새 context, SW 차단, no-store, reload,
  재시도는 다운로드를 배가시킨다. 이런 회귀 검사는 로컬에서만 실행한다.
- 캐시 계측은 route interception 없이 실제 HTTP 캐시/SW를 사용한다. 브라우저
  외부 연결은 localhost 거부 프록시로 차단한다. 계정/DB/SDK는 로컬 fixture만 사용한다.
- 운영 확인이 꼭 필요하면 **실행 전 사용자 승인, 대상, 요청 수, 응답 본문 바이트 예산**을
  확정한다. 유일한 허용 실행기는 `scripts/verify-hosting-release.mjs`이다.
  기본값은 localhost. 원격 실행에는 정확한 운영 origin, 승인 플래그와 두 예산이
  모두 필요하다. 플래그만 설정하는 행위는 사용자 승인을 대신하지 않는다.
- 검토된 CI 계획은 **7개 작은 파일 GET + 이미지 HEAD 1개**, 최대 **8요청 /
  200,000 응답 본문 바이트**다. 이미지 GET, 게임 실행, 전체 자산 다운로드,
  리다이렉트, 자동 재시도는 금지한다. 첫 실패 즉시 중단하고 로컬에서 조사한다.
  병렬 probe도 같은 실행 내에서 직렬화하여 누적 합산한다. 별도 CI 실행의 비용은
  각각 더해지며 월간 전역 차단 장치는 아니다. 거짓 헤더/네트워크 선행 수신과
  HTTP/TLS 오버헤드까지 포함한 과금 wire bytes 상한으로 보고하지 않는다.
  HTTP/TLS 헤더는 위 본문 바이트와 별도다. 더 큰 예산은 새 승인이 필요하다.
- 푸시 승인 전에 그 푸시가 실행할 CI와 운영 요청/바이트 예산을 보고한다.
  실패한 Actions 전체 재실행도 재배포를 유발할 수 있으므로 자동으로 재실행하지 않는다.
- 요금제 변경, 결제, 할당량 증액, Firebase 운영 데이터/규칙 변경은 별도 명시적
  승인이 필요하다. 비밀값을 로그·문서·메시지에 출력하지 않는다. 승인 검토 거절을
  다른 도구/계정/경로로 우회하지 않는다.

## 이미지·캐시·기존 기능 보존

- 게임 래스터는 실제 **WebP 바이트**여야 한다. 확장자만 바꾸지 않는다.
  승인된 원본 아트, 크기, 알파/프레임 정보, 게임 UI·전투·저장 의미를 유지한다.
- 현재 예외는 PWA/파비콘 PNG **7개**와 기존 감정 SVG **4개**다.
  PNG는 `assets/resource/pwa-emblem/`, SVG는 `assets/ui/emotes/`의 지정 항목만
  허용한다. 호환성 예외를 숨기거나 “모든 파일이 WebP”라고 보고하지 않는다.
  새 예외는 이유와 승인을 기록하고 형식 검사 allowlist를 함께 검토한다.
- 소스/QA 이미지는 Hosting ignore를 유지한다. 배포 대상은 content-hash 자산이다.
  immutable URL은 실제 바이트 해시이며 변경하지 않은 자산의 URL을 배포마다 바꾸지 않는다.
- `npm run validate:assets`와 `npm run release:manifest`가 로컬에서 모든 immutable
  해시/원본 일치를 확인한다. 운영에서 이를 재다운로드하여 확인하지 않는다.
- `npm run validate:asset-browser`는 중복 요청 병합, 변경 해시 1회, API 비캐시를
  확인한다. `npm run validate:cache-lifecycle`은 네 직업 cold/warm/update를
  계측하고 unchanged 이미지 재다운로드 0바이트를 검사한다.
- cold/warm 경계는 화면 전환 전 이미지 decode와 CacheStorage 저장 완료로
  정한다. networkidle 또는 고정 지연만으로 첫 화면 로딩 완료를 가정하지 않는다.
  warm의 신규/지연 이미지도 0바이트 집계에서 제외하지 않는다. 지연 로딩 대조는
  통과하고 실제 캐시 삭제 대조는 재다운로드를 검출해야 한다. 실패 시 공개 자산
  경로·요청/완료 시각·캐시 키만 JSON artifact로 보존하며 헤더·쿠키·본문은 담지 않는다.
- 캐시 변경은 오래된 코드, 오프라인 복구, 버전 갱신, 사용자 데이터 보존을
  검증한 뒤 적용한다. 서비스 워커/HTTP 캐시는 사용자가 지우거나 브라우저가
  회수할 수 있으므로 “한 번 받으면 영구히 다운로드 없음”을 보장하지 않는다.

## 로컬 작업과 완료 조건

1. Node 22 / `npm ci`, Chromium 준비 후 `npm start` →
   `http://127.0.0.1:8100/?local=1`. 서버는 외부 연결과 Firebase config를 차단한다.
2. `npm run validate:qa-policy`, `npm run validate:qa-network-browser`,
   기존 Actions의 모든 로컬 검증, 위 두 캐시 검증을 통과한다. 테스트를 운영으로
   옮기거나 기존 기능 검증을 삭제해서 시간을 줄이지 않는다.
3. 생성된 오디오/스크린샷/로그는 `/tmp` 또는 별도 작업 폴더에 보관하고,
   실행 전 존재하던 사용자 결과를 덮어쓰지 않는다. 검증 산출물을 게임 변경과 섞지 않는다.
4. 변경, 실행한 검사, 실제/추정 트래픽, 남은 제한을 구분해 보고한다.
   과거 문서의 운영 QA 명령은 재실행 지시가 아니다. 현재 지침과
   `docs/HOSTING-TRAFFIC.md`를 따른다. 운영 접근 없이 완료할 수 있는 작업은 계속한다.
