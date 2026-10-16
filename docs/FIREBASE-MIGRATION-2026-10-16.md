# Firebase 이전 — 2026-10-16

사용자가 기존 프로젝트 접근 권한을 제공하고 데이터 이전·CI/CD 변경·포트폴리오 연결을 승인했다.

| 항목 | 현재 설정 |
| --- | --- |
| 소스 경로 / 브랜치 | `C:\dev\yurikaonline` / `mmorpg_online` |
| Firebase 프로젝트 | `project-e2f0a` |
| Hosting 사이트 / 배포 대상 | `ranke0802-yurika` / `yurika` |
| 게임 주소 | https://ranke0802-yurika.web.app/ |
| 포트폴리오 | https://ranke0802.web.app/#work |
| Auth | Google, 익명, 이메일/비밀번호 활성화 |
| Realtime Database | `project-e2f0a-default-rtdb`, `asia-southeast1` |
| GitHub Actions Secret | `FIREBASE_SERVICE_ACCOUNT_PROJECT_E2F0A` |

## 이전 내용

- 원본 `yurika-online`에서 2026-10-16 02:43:41 UTC(한국 11:43:41)에 백업했다.
- Authentication 680개 계정을 같은 UID로 가져왔다. Google 연결 계정 7개의 provider ID도 대조했다. 비밀번호 해시를 가진 계정은 0개였다.
- DB 전체 스냅샷(직렬화 기준 67,575,034바이트)과 기존 규칙을 가져온 뒤 원본 백업과 구조·값 전체가 일치하는지 확인했다.
- 백업에는 계정·개인 데이터가 포함되므로 저장소와 Hosting에 포함하지 않았다. 로컬 `C:\dev\yurika-integration-20261016\.secrets`에 보관했다.
- 원본 프로젝트·데이터·Hosting은 삭제하거나 변경하지 않았다. 이전 시점 이후 원본에서 생기는 변경은 자동 복제되지 않는다.
- 기존 인증 세션은 새 Firebase 프로젝트/도메인으로 이전되지 않는다. Google 사용자는 다시 로그인한다. 익명 계정의 UID와 데이터는 보존했지만, 기존 브라우저의 게스트 세션을 자동으로 복원한다고 보장하지 않는다. 게임에는 캐릭터 선택 화면에서 기존 이름 또는 `##UID`로 저장 기록을 찾아 복구하는 기존 경로가 있다. 실제 개인 계정으로 이 경로를 실행한 것은 아니므로 복구 성공을 보장하지 않는다.
- 기존 DB 규칙의 루트 `.read: true`, `.write: true`를 그대로 옮겼다. 이는 공개 읽기/쓰기 허용 상태다. 인증별 접근 제한과 서버 검증은 별도 보안 개선 과제이며 이번 이전에서 게임 데이터 접근 의미를 변경하지 않았다.

## CI/CD와 배포

`mmorpg_online` push 시 기존 전체 로컬 검증을 거쳐 새 프로젝트의 `yurika` Hosting 대상만 배포한다. PR 미리보기도 같은 대상을 사용한다. 포트폴리오의 `portfolio` 대상과 구분된다. 서비스 계정 JSON은 GitHub Secret에만 전달하고 소스에 넣지 않는다.

수동 배포가 필요한 경우에도 명시적 대상만 사용한다.

```sh
firebase deploy --only hosting:yurika --project project-e2f0a
```

자동 배포는 DB 규칙이나 계정 데이터를 변경하지 않는다. 기존 Secret `FIREBASE_SERVICE_ACCOUNT_YURIKA_ONLINE`은 새 workflow가 참조하지 않는다.

Authentication은 Firebase CLI의 [provider 설정 배포](https://firebase.google.com/docs/auth/configure-providers-cli)를 이용해 구성했다. 일회성 설정 JSON은 로컬 이전 작업 폴더의 `firebase-auth-setup.json`에 보관했다. 결제 연결이나 요금제 변경은 수행하지 않았다.

게임 브라우저 QA와 캐시/자산 회귀 검사는 localhost에서만 실행한다. 배포 후에는 기존 검증기의 허용 origin을 새 주소로 바꾸었으며 최대 **8요청 / 200,000 응답 본문 바이트**만 사용한다. 이미지 GET·재시도·운영 게임 실행은 하지 않는다. 계정·DB 이전용 관리 API 트래픽은 Hosting 검사 예산과 별개다. 세부 정책은 [AGENTS.md](../AGENTS.md)와 [Hosting 트래픽 지침](HOSTING-TRAFFIC.md)을 따른다.

Windows 체크아웃은 `git config core.autocrlf false`를 사용한다. immutable 자산의 `.gitattributes` 규칙을 유지하고 원본 JSON의 바이트를 변경하지 않는다. 이번 로컬 전체 회귀 검증은 Node 22와 Chromium 153을 설치한 WSL 복사본에서 수행한다.
