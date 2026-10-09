# Yurika Online 로컬·클라우드 개발

기본 작업 브랜치는 `mmorpg_online`입니다. 이 브랜치 푸시는 운영 Firebase Hosting
자동 배포를 유발하므로 로컬 개발 요청만으로 푸시하지 않습니다.
먼저 [개발 지침](AGENTS.md)과 [운영 트래픽 제한](docs/HOSTING-TRAFFIC.md)을 확인합니다.

## 실행

Node 22, Python 3, Chromium을 사용합니다. 저장소 루트에서:

```bash
npm ci
npm start
```

`http://127.0.0.1:8100/?local=1`에서 독립 로컬 모험을 엽니다.
서버는 loopback에만 바인딩하며 기본 페이지를 로컬 모드로 보내고,
Firebase 설정·숨김 파일·node_modules·디렉터리 목록과 브라우저 외부 연결을 차단합니다.
운영 계정, 운영 저장 데이터, 멀티플레이를 검증하는 서버가 아닙니다.
`yurika-online` Firebase 프로젝트는 **운영** 프로젝트입니다.

로컬 저장은 해당 브라우저/origin의 데이터이며 서버 백업이 아닙니다.
한 탭에서 사용하고, 다른 탭과 저장 충돌이 나면 새로고침합니다.
브라우저 데이터 삭제 시 로컬 저장도 사라집니다.

## 클라우드 재개

저장된 환경 기본 ref는 여전히 `master`일 수 있습니다. 체크아웃을 확인합니다.
기존 변경이 있으면 보존하고 검토한 뒤 진행합니다. 클린 상태에서:

```bash
test -z "$(git status --porcelain)" || exit 1
git fetch --no-tags origin refs/heads/mmorpg_online:refs/remotes/origin/mmorpg_online
if git show-ref --verify --quiet refs/heads/mmorpg_online; then
  git switch mmorpg_online
else
  git switch --create mmorpg_online --track origin/mmorpg_online
fi
git merge --ff-only origin/mmorpg_online
git status --short --branch
git log -1 --format='%H %s'
```

현재 저장된 환경에서는 `source /workspace/yurika-cloud/env.sh`로 준비된 Node22와
Chromium을 사용합니다. `/workspace/yurika-cloud/prepare.sh`는 클린 체크아웃 준비와
의존성 설치만 하며 푸시/배포하지 않습니다. 환경 설정의 기본 ref를 바꾸는 명령은 아닙니다.
환경 정지 후 서버를 다시 실행해야 합니다. PC가 켜져 있을 필요는 없지만,
클라우드 작업 세션과 실행 서버를 영구 상시 가동 서비스로 간주하지 않습니다.

## 검증

- `npm run validate:qa-policy`: 원격 URL 거절, CI 예산, 자산 실제 형식, 제한 클라이언트.
- `npm run validate:qa-network-browser`: 외부 요청/리다이렉트 차단과 HTTP 캐시 유지.
- `npm run validate:assets`: 원본과 immutable 해시/바이트 일치.
- `npm run validate:asset-browser`: SW 갱신·중복 다운로드·API 비캐시.
- `npm run validate:cache-lifecycle`: 자체 서버에서 네 직업 cold/warm/update 본문 바이트 계측.
- 기능 회귀: `.github/workflows/firebase-hosting-merge.yml`의 배포 **이전** 로컬 명령.
  Chromium 경로는 `CHROMIUM_PATH`, 결과 폴더는 `QA_OUTPUT`으로 지정합니다.

실제 Firebase SDK 검사는 `YURIKA_FIREBASE_FIXTURE_ROOT` 아래 Firebase10.7.1/ws8을
사용하는 loopback fixture입니다. 운영 인증값은 필요하지 않습니다.
캐시 계측은 자체 HTTP 서버를 사용하므로 개발 서버의 no-store 헤더와 분리됩니다.
운영 URL을 QA 환경 변수에 넣으면 실행 전에 실패합니다.
