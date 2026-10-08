# 캐릭터 도트 선명도 복원 — 로컬 검토

2026-10-08. 기준은 `mmorpg_online`의 `29036987bdecfdfce855ebdbdd0cd65c14492835`
(v0.02.179). 이 문서는 배포 승인 전 로컬 검토 기록이다. 최종 통합 범위와 재현 방법은
[v0.02.180 검증 문서](field-clarity-v180.md)를 참고한다.

사용자는 캐릭터 원본의 선명한 도트 경계를 원했다. v176
(`e92b9695d988c293c519692f64f162f3883b297f`)에서 추가한 축소 보간은 그 의도와
달랐다. 이 문서는 당시 `display-quality-v176.md`의 화질 판단을 정정하는 후속 검토다.

## 수정 범위

- `CharacterFrameRenderer`: 모든 캐릭터 본체를 nearest 방식으로 그린 후 호출자의
  `imageSmoothingEnabled`를 복원한다. 소스 프레임, 좌표, 크기, 발 위치는 유지한다.
- `ResourceManager`: 마법사 원본 프레임을 기존 런타임 시트에 합성할 때도 보간을 끈다.
  합성 크기·크롭·배치·기존 배경 처리 로직은 바꾸지 않았다.
- `main.js` 생성/리사이즈와 `#gameCanvas` CSS: `image-rendering: pixelated`를 복원한다.
  이 최종 설정은 배경·이펙트·이름표를 포함한 전체 캔버스에 적용된다.

원본 아트, HUD DOM 글자/배치, 전투, 입력, 애니메이션 시간, 카메라, DPR 상한은 그대로다.
원격/로컬 캐릭터는 이미 공유하던 본체 렌더러를 계속 사용한다. v176 전체를 되돌리지 않았다.

## 배율과 검증

| 환경 | CSS 캔버스 | 내부 캔버스 | 내부 DPR | 월드 배율 |
| --- | --- | --- | --- | --- |
| PC 1280×800, DPR 1 | 1280×720 | 1280×720 | 1 | 0.8 |
| PC 1440×900, DPR 2 | 1280×720 | 2560×1440 | 2 | 0.8 |
| 모바일 세로 393×852, DPR 3 | 393×852 | 727×1576 | 1.85 | 0.7 |
| 모바일 가로 852×393, DPR 3 | 852×393 | 1576×727 | 1.85 | 0.7 |

256px 본체 프레임은 PC에서 96 CSS px, 모바일에서 84 CSS px로 그려진다.
화면 크기와 내부 버퍼의 비율은 변경하지 않았다. 모바일 최종 확대 단계에서도
불필요한 보간이 추가되지 않도록 했다. 정수 배율 1/2와 실제 비정수 배율
0.8/1.6/1.295, 소수 좌표 오프셋을 모두 검사했다.

- `npm run validate:classes`: 246개 테스트 및 192개 액션 셀 검사 통과.
- `npm run validate:resources`: 10개 통과.
- `npm run validate:approved-art`: 18개 통과.
- `npm run validate:ui`: UI 구조 검사 및 11개 테스트 통과.
- `npm run validate:display-quality-browser`: 네 직업 × 네 화면 = 16개 실제 월드
  캡처. 본체 보간 해제, 캔버스 크기, 채팅 기준 HUD 글자 크기 및 긴 숫자 잘림 검사 통과.
- `npm run validate:character-crispness-browser`: 실제 `Player.render`와
  `RemotePlayer.render` 진입점으로 대기/이동/공격/이동 공격, 네 방향, 여섯 단계,
  세 배율을 검사했다. 총 9,216개 본체 샘플에서 로컬/원격의 픽셀이 일치하고 보간
  상태가 호출자에게 복원됐다. 뷰포트 변경 후에도 픽셀 설정이 유지됐다.
- 같은 테스트를 수정 전 HEAD와 v176 이전 `76943cfd23211a5c7f6b1af24fb1bc300d443474`
  렌더러에 실행했다. 수정 후 9,216개 본체 픽셀 해시가 v176 이전과 전부 일치했고,
  마법사 런타임 시트 RGBA 해시도 일치했다. 수정 전후 본체 좌표/프레임/변환 차이는 0개다.
- 추적 이미지 586개 SHA-256이 수정 전후 모두 같다. 신규 아트나 샤프닝은 없다.
- Chromium 페이지 오류 및 외부 요청은 0건이다. 모든 브라우저 검증은 서비스 워커를
  차단한 `127.0.0.1:8100/?local=1`에서 수행했다.

32개 본체를 그린 뒤 래스터를 읽는 합성 부하 검사에서 p50은 수정 전 2.3–13.7ms,
수정 후 1.8–7.3ms였다. 클라우드 Chromium의 참고 측정이며 실제 기기 FPS를 뜻하지 않는다.

## 재현과 자료

안전한 로컬 서버를 8100에 실행한 뒤 저장소 루트에서:

```sh
source /workspace/yurika-cloud/env.sh
npm run validate:classes
npm run validate:resources
npm run validate:approved-art
npm run validate:ui
QA_OUTPUT=/tmp/yurika-display npm run validate:display-quality-browser
QA_OUTPUT=/tmp/yurika-crispness npm run validate:character-crispness-browser
```

`QA_BASELINE_REF`를 위 두 커밋으로 지정하면 체크아웃을 변경하지 않고 해당 렌더러만
로컬 브라우저에 공급한다. `QA_VIEWPORT=desktop|retina|portrait|landscape`로 범위를 좁힐 수 있다.

현재 자료는 `/workspace/yurika-character-crispness/`에 보관했다:
`review.html`, `before/`, `after/`, `matrix-before/`, `matrix-after/`, `matrix-legacy/`,
`comparison.json`, `assets-before.json`, `assets-after.json`.
캡처 PNG는 리사이즈·보정하지 않았고, 비교 HTML은 원래 CSS 표시 크기를 명시한다.

## 범위와 남은 확인

실제 휴대폰, WebKit/Firefox, 운영 멀티플레이 검증은 포함하지 않는다. 원격 캐릭터는
실제 렌더러를 사용한 로컬 상태 지정 테스트다. nearest 축소는 모든 원본 픽셀을
보존하지 못하며 비정수 배율에서 선 굵기나 이동 경계가 달라질 수 있다. 이는 v176
이전과 동일하다. 캔버스 이름표·배경도 더 각지게 표시될 수 있으며 DOM HUD는 그대로다.

이후 승인된 심층 QA는 `/workspace/yurika-deep-qa-v179/final-report.json`에 보존했다.
마법사 자연 성장·저장·재진입, 위치 2구체·소환, 전사 주요 스킬, 궁수 주요 스킬,
별도 위치 Lv.7 프로필의 4구체 회복·빗나감·취소·소환 피격을 확인했다.
궁수 공격 튜토리얼은 현재 공격 사용을 요구하므로 빗나감 후 진행을 확정 버그로
분류하지 않는다. 해당 완료 조건은 v0.02.180에서도 변경하지 않는다.
발견된 HP/구슬 표시 지연, 직업 성장 안내 및 소환수 식별은 별도 승인 후 v0.02.180에 통합했다.
