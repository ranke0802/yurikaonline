# 고레벨 접속·플레이 멈춤 최적화 결과 보고서

- 작업일: 2026-07-22
- 대상 브랜치: `mmorpg_online`
- 반영 커밋: `a14f5ee` (`고레벨 저장 및 접속 병목 최적화`)
- 배포 버전: `0.02.095`

## 목적

고레벨/장시간 플레이 계정에서 발생하던 재접속 지연과 플레이 중 수 초 프리즈를 줄이되, 기존 Firebase guarded transaction, 보상 ACK 순서, 멀티플레이 동기화, 캐릭터 복구 안전장치는 유지한다.

## 병목별 반영 결과

| 병목 | 기존 동작 | 반영 결과 |
| --- | --- | --- |
| 소형 profile patch | 전체 local checkpoint를 읽고 병합·직렬화 | UID별 field-token 기반 small patch journal만 기록. 성공한 guarded transaction의 동일 토큰만 제거 |
| 유휴 저장 | 이동 후 3초에 전체 `saveState()` 실행 | 남은 durable journal flush 후 위치/HP/맵 위치만 transient patch |
| 일반/보스 보상 | 보상 처리와 인벤토리 즉시 저장이 겹칠 수 있음 | 실제 변경 필드만 하나의 receipt patch에 포함하고, profile 저장 성공 전에는 receipt ACK 금지 |
| 퀘스트 자동 완료 보상 | receipt 처리 중 지급된 퀘스트 보상 필드가 저장 대상에서 빠질 가능성 | QuestManager가 변경 필드를 반환하고 Player가 receipt patch에 병합 |
| 로그인 복구 | 정상 root에도 큰 local checkpoint 복구 경로가 열릴 수 있음 | 작은 metadata를 먼저 확인하고, pending journal일 때만 root/recovery 위에 필요한 필드만 replay |
| 월드 진입 보상 backlog | historic receipt backlog가 월드 진입을 점유할 수 있음 | consumer 등록을 비차단으로 처리하고 receipt 단위로 프레임을 양보 |
| 인벤토리 갱신 | 팝업이 닫혀도 300칸 UI 갱신 가능 | 닫힌 상태에서는 DOM rebuild 생략, 연속 보상 갱신은 requestAnimationFrame 단위로 coalesce |
| 성능 계측 | 프레임 gap이 simulation cap(250ms)에 가려짐 | raw frame gap도 별도 보관·개발자 오버레이에 표시 |

## 데이터 보존 계약

1. 일반 profile 저장은 기존 guarded transaction을 계속 사용한다. 직접 `update()`로 우회하지 않는다.
2. durable patch는 Firebase 성공 전 local field-token journal에 남는다.
3. 늦게 끝난 이전 transaction은 자신이 기록한 토큰만 정리하므로, 이후 변경을 지우지 않는다.
4. journal 저장 자체가 실패하면 기존 full checkpoint fallback을 사용한다.
5. reward receipt는 profile 저장 성공 이후에만 ACK되어 재접속 시 유실 또는 중복 지급을 방지한다.
6. 캐릭터 삭제 시 UID 범위 local checkpoint 및 patch journal을 함께 제거한다.

## 검증 체크리스트

- [x] 변경 JavaScript 구문 검사
  - `src/js/core/NetworkManager.js`
  - `src/js/entities/Player.js`
  - `src/js/core/QuestManager.js`
  - `src/js/world/scenes/WorldScene.js`
  - `src/js/ui/UIManager.js`
  - `src/js/main.js`
  - `src/js/core/GameLoop.js`
  - `scripts/validate-runtime-integration.mjs`
- [x] `git diff --check` 통과
- [x] `npm run validate` 통과
  - `validate:quests`
  - `validate:world`
  - `validate:ui`
  - `validate:hygiene`
  - `validate:runtime`
  - `validate:projectiles`
- [x] runtime 계약 검증
  - pending patch journal이 최신 root의 transient progress를 보존하며 replay되는지
  - field token이 늦은 transaction으로 새 변경을 삭제하지 않는지
  - 유휴 저장이 inventory/questState 전체를 복제하지 않는지
  - normal/boss reward가 profile 저장 전 ACK되지 않는지
  - receipt 기반 퀘스트 자동 완료의 EXP/재화/아이템이 동일 저장에 포함되는지
- [x] 원격 브랜치 `origin/mmorpg_online` 푸시 확인

## 확인 권장 시나리오

1. 아이템/퀘스트가 많은 고레벨 계정으로 재접속한다.
2. 이동 후 3초 멈추고 조작이 끊기지 않는지 확인한다.
3. 일반 몬스터 보상, 보스 보상, 퀘스트 자동 완료 보상을 각각 받고 재접속한다.
4. 인벤토리를 닫은 상태에서 연속 드랍을 받고 프레임이 급격히 멈추지 않는지 확인한다.
5. 개발자 오버레이에서 Frame Gap이 실제 긴 멈춤 시간으로 표시되는지 확인한다.

## 기존 분석 리포트

- `reports/2026-07-22-high-level-login-and-runtime-stall-report.html`
- `reports/performance_stall_bottleneck_report_2026-07-22.html`
