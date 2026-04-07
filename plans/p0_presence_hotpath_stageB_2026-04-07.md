# P0 Presence Hot Path 2차 정리

## 범위

- 1차 이후 확인된 플레이어 소실 문제를 기준으로, 가시성 안정성과 hot path 중복 제거를 함께 다듬는다.
- 현재 authoritative 구조와 멀티플레이 동작은 유지하고, RTDB 다운로드 경로는 가볍게 유지하되 stale 판정은 더 안정적으로 만든다.

## 반영 내용

1. room-level `presence/{uid}/ts` heartbeat 보강
   - `presence_ts/{uid}`를 유지하되, 실제 same-field 가시성 판정은 기존 `presence/{uid}` 경로의 `ts`도 함께 갱신하도록 보강한다.
   - 이로써 `fieldPeerPresenceChanged`, `sharedFieldActive`, remote player 제거 로직이 같은 기준으로 움직이도록 맞춘다.

2. `users/{uid}/presence/ts`, `users/{uid}/lastSeen` 중복 write 제거
   - host election 및 활동 시각 판정은 로컬 `userLastSeen`과 room-level heartbeat 기준으로 유지한다.
   - per-user root 경로 heartbeat는 제거해도 visibility가 유지되도록 구조를 정리한다.

3. per-user hot listener에서 `presence` 감시 제거
   - `users/{uid}` 하위 감시 목록에서 `presence`를 제거했다.
   - remote player 활동 시각은 `p.ts`, room-level `presence`, `presence_ts`로 복구 가능하도록 정리한다.

4. remote player stale 제거 보강
   - local ghost cleanup은 `remotePlayers.ts`만 보지 않고 `userLastSeen`까지 함께 참고한다.
   - `presence_ts` heartbeat만 들어와도 이미 알고 있는 remote player는 다시 버퍼링되도록 보강한다.

## 기대 효과

- shared realtime 상태에서 플레이어 1인당 중복 heartbeat write 감소
- per-user hot path listener 다운로드 감소
- idle 상태에서 서로 보였다 사라지는 현상 완화
- `presence` 계층과 `users` 계층의 역할 분리가 더 명확해짐

## 주의점

- `presence_ts` 경로가 rules 또는 콘솔 설정 문제로 불안정할 가능성도 있어, `presence/{uid}/ts` fallback을 병행한다.
- 새로 입장한 게스트의 remote player 가시성, 재접속 직후 host election, 장시간 idle visibility를 중점 확인해야 한다.

## 다음 후보 작업

1. 플레이어 전달 경로를 AOI 기준으로 더 줄일 수 있는지 검토
2. same-field 전체가 아니라 nearby peer만 hot listener를 붙이는 방식 검토
3. 실측 기준으로 1차/2차 적용 전후 RTDB 다운로드 차이와 player visibility 안정성 비교
