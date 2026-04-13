# 2026-04-13 Single-First Friends Multiplayer Shift

## Scope

- 기본 진입 체감을 `즉시 호스트/게스트`에서 `항상 싱글 시작`으로 전환한다.
- 필드 공유는 친구 기반 `함께하기` 수락 이후에만 열린다.
- 승인한 대상이 호스트가 되며 호스트 1명 + 게스트 최대 3명까지 허용한다.

## Architecture Decision

1. `party` 상태를 단순 UI 표시가 아니라 `필드 공유 허용 목록`으로 승격한다.
2. RTDB presence 연결은 유지하되, 파티 밖 유저는 원격 플레이어/공유 필드 peer 계산에서 제외한다.
3. 필드 공유 전에는 solo quiet mode를 유지하고, 필드 공유 후에만 shared field를 활성화한다.
4. 친구 목록은 `users/{uid}/friends`에 저장하고, 메시지/함께하기 요청은 별도 inbox 경로를 둔다.
5. 첫 대왕 슬라임 30마리 누적은 더 이상 전역 `world_state`를 공유하지 않고 현재 세션 로컬 진행으로 둔다.

## Data Paths

- `users/{uid}/friends/{friendUid}`
  - 친구 목록 메타데이터
- `friend_messages/{targetUid}/{messageId}`
  - 친구 메시지 inbox
- `together_requests/{targetUid}/{requestId}`
  - 함께하기 승인 요청 inbox
- `together_responses/{targetUid}/{responseId}`
  - 함께하기 수락/거절 응답 inbox
- `zones/{roomId}/users/{uid}/party_inbox`
  - 함께하기 수락 후 파티 상태 동기화

## UX Notes

- 친구 창에서 친구 선택 시 현재 스테이터스와 장착 무기 상세를 본다.
- `함께하기`는 상대가 승인해야만 성립한다.
- 승인 응답을 받은 쪽은 호스트 좌표 근처로 이동해 즉시 합류 체감을 준다.
- 친구 메시지는 별도 친구 inbox를 사용하고, 수신 시 시스템 로그로도 남긴다.

## Tradeoffs

- RTDB 연결 자체는 유지하므로 친구 온라인 상태와 이름 조회를 재활용할 수 있다.
- 대신 현재 레포에는 `database.rules.json`이 아직 추적되지 않아, 새 social 경로에 대한 최소권한 rules 배포는 후속 작업이 필요하다.
- 이번 단계는 선물 기능까지 완전 구현하지 않고, 버튼/흐름만 노출하고 후속 범위로 남긴다.

## Impacted Files

- `src/js/core/NetworkManager.js`
- `src/js/entities/Player.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/world/MonsterManager.js`
- `src/js/ui/UIManager.js`
- `src/css/style.css`
- `index.html`
