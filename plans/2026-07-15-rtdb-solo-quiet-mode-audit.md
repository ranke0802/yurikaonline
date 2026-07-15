# 2026-07-15 RTDB 솔로 quiet mode 점검

## 문제

솔로 플레이 중에도 RTDB 다운로드가 크게 증가했다. 원인은 솔로 쓰기 제한은 대부분 유지됐지만, 접속 시 전역 `child_added` 리스너가 여러 루트에 붙어 초기 데이터를 다운로드할 수 있었기 때문이다.

특히 위험한 루트:

- `users`
- `monster_attack`
- `monster_damage`, `monster_damage_batch`
- `player_damage`, `player_damage_batch`
- `drop_collection`
- `boss_spawn_requests`
- `chat`, `system_messages`, `emotes`

## 수정 방향

- `users` 전체 리스너 제거.
- 상대 플레이어 데이터는 presence로 같은 필드에 감지된 유저만 hot-path 하위 필드 리스너를 붙인다.
- 전투/채팅/이모트/시스템 이벤트는 현재 `fieldId`로 쿼리한 scoped listener만 사용한다.
- 솔로 quiet mode에서 몬스터가 로컬 플레이어에게 주는 피해는 RTDB `damage_events`에 쓰지 않고 즉시 로컬 적용한다.

## 회귀 방지

`scripts/validate-runtime-integration.mjs`에 전역 RTDB 리스너 금지 정적 검증을 추가했다.

## 추가 운영 권장

실서비스 RTDB rules에 다음 루트의 `fieldId` 인덱스가 필요하다.

- `monster_attack`
- `monster_damage`
- `monster_damage_batch`
- `player_damage`
- `player_damage_batch`
- `drop_collection`
- `boss_spawn_requests`
- `chat`
- `system_messages`
- `emotes`

현재 저장소에는 RTDB rules 파일이 없어 코드 변경만 반영했다.
