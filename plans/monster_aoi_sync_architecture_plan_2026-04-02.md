# 몬스터 AOI / Region 동기화 아키텍처 설계서

작성일: 2026-04-02  
상태: Draft / 설계 완료, 미구현  
범위: Realtime Database 다운로드 사용량 절감, 몬스터 동기화 구조 재설계  
전제: 기능 삭제 금지, 전투 판정/호스트 권위 유지, 플레이어와 리모트 플레이어가 "같은 몬스터를 본다"는 체감 유지

---

## 1. 문제 정의

현재 코드베이스에서 Realtime Database 다운로드 사용량이 과도하게 높은 가장 큰 원인은 몬스터 상태 fan-out 구조다.

현재 구조는 다음과 같다.

- 모든 클라이언트가 `zones/{room}/monsters` 전체를 구독한다.
  - `src/js/core/NetworkManager.js`
  - `connect()` 내부 `child_added / child_changed / child_removed`
- 호스트는 존 전체 몬스터를 authoritative 하게 업데이트하고, 주기적으로 각 몬스터 상태를 `zones/{room}/monsters/{id}`에 쓴다.
  - `src/js/world/MonsterManager.js`
  - `_getMonsterSyncProfile()`
  - `_updateHostLogic()`
  - `src/js/core/NetworkManager.js`
  - `sendMonsterUpdate()`
  - `flushMonsterUpdates()`

이 구조의 문제는 "호스트가 쓴 1회 몬스터 update"가 "연결 중인 모든 클라이언트의 download"로 증폭된다는 점이다.

즉, 병목은 다음 공식으로 이해할 수 있다.

`실제 write 수 × 몬스터 payload 크기 × 해당 방 연결 수 = download 사용량`

따라서 최적화의 핵심은:

1. 호스트 authoritative 시뮬레이션은 유지  
2. 클라이언트가 받아야 하는 몬스터 데이터 범위만 줄이기  
3. 중요한 상태는 즉시, 일반 이동은 보간 전제로 저주기 전송  

---

## 2. 현재 구조 요약

### 2.1 호스트 authoritative 시뮬레이션

- 호스트만 몬스터 AI, 충돌, 상태 전환, 보상/드랍, 보스 스폰을 계산한다.
- 이 성질은 반드시 유지해야 한다.

관련 코드:

- `src/js/world/MonsterManager.js`
  - `_updateHostLogic()`
  - `_handleMonsterDeath()`
  - `_buildMonsterSyncPayload()`

### 2.2 클라이언트 수신 구조

- 현재는 모든 클라이언트가 `zones/{room}/monsters` 전체를 듣는다.
- 멀리 있는 몬스터도 동일하게 다운로드한다.

관련 코드:

- `src/js/core/NetworkManager.js`
  - `connect()`
  - `this.dbRef.child('monsters').on('child_added'...)`
  - `this.dbRef.child('monsters').on('child_changed'...)`
  - `this.dbRef.child('monsters').on('child_removed'...)`

### 2.3 이미 들어간 부분 최적화

- 몬스터 sync cadence는 이미 `engaged / nearby / far`에 따라 차등 적용된다.
- 하지만 이건 "write 빈도"만 줄일 뿐, "누가 다운로드 받는가"는 줄이지 못한다.

관련 코드:

- `src/js/world/MonsterManager.js`
  - `_getMonsterSyncProfile()`

---

## 3. 설계 목표

### 3.1 기능 목표

- 플레이어와 리모트 플레이어는 동일한 몬스터 상태를 본다.
- PvE 전투 판정은 계속 호스트 authoritative 이다.
- 멀리 떨어진 게스트도 자기 주변 몬스터를 정상적으로 사냥할 수 있다.
- 보스, 돌진, 넉백, 죽음, 스폰/디스폰은 현재와 동일하거나 더 안정적으로 보인다.

### 3.2 성능 목표

- `zones/{room}/monsters` 전체 fan-out 제거
- 일반 클라이언트는 자기 AOI(Area of Interest) 안의 몬스터만 구독
- 동일 세션 기준 RTDB download 50% 이상 감소를 1차 목표로 둔다.

### 3.3 비목표

- Cloud Functions 기반 authoritative server 도입
- 몬스터 AI 자체를 분산 계산
- 전투 룰 변경

---

## 4. 핵심 원칙

### 4.1 AOI는 "전송 최적화"에만 사용한다

AOI는 절대 호스트 시뮬레이션 범위를 자르는 도구가 아니다.

허용:

- 클라이언트가 어떤 몬스터 경로를 subscribe 할지 결정
- host가 어떤 몬스터를 더 자주 sync 할지 결정

금지:

- 호스트가 자기 화면 주변 몬스터만 계산
- 멀리 있는 게스트 주변 몬스터를 멈춤 처리

### 4.2 기준 상태는 하나, 중간 프레임은 보간

모든 클라이언트는 동일한 기준 상태를 받는다.

- 기준 상태:
  - 위치 keyframe
  - 속도 벡터 또는 이동 방향
  - 상태값(idle, aggro, charge, dead)
  - HP
  - 이벤트 시각
  - revision

- 클라이언트가 로컬에서 계산:
  - 중간 프레임 이동
  - 짧은 위치 보간
  - 스무딩

### 4.3 중요한 상태는 즉시

다음은 cadence 무시하고 즉시 전송한다.

- 스폰
- 디스폰
- charge 시작/종료
- 피격/넉백 직후 상태 전이
- death
- 보스 상태 전환
- region 이동

---

## 5. 제안 아키텍처

## 5.1 데이터 경로 재구성

현재:

- `zones/{room}/monsters/{monsterId}`

제안:

- `zones/{room}/monster_cells/{cellId}/{monsterId}`
  - 일반 클라이언트가 구독하는 경로
  - lightweight delivery snapshot
- `zones/{room}/monster_host_snapshot/{monsterId}`
  - 호스트 takeover용 canonical snapshot
  - 평시 일반 클라이언트는 구독하지 않음
- `zones/{room}/users/{uid}/presence/cell`
  - 현재 플레이어 region/cell

### 5.1.1 cell 크기

초기값 제안:

- `cellSize = 960`

이유:

- 현재 맵 스케일과 몬스터 이동 반경을 고려하면 너무 작지 않고
- 인접 cell 3x3 구독 시 화면과 그 주변을 충분히 덮을 수 있음

튜닝 가능 값:

- 모바일/좁은 맵: `768`
- 기본: `960`
- 큰 맵/저주기 sync: `1024`

---

## 5.2 delivery snapshot 스키마

클라이언트용 cell payload는 다음처럼 설계한다.

```json
{
  "x": 1420,
  "y": 980,
  "vx": 0,
  "vy": 0,
  "hp": 72,
  "maxHp": 100,
  "type": "slime",
  "state": "aggro",
  "chargeOnly": false,
  "isBoss": false,
  "rev": 184,
  "ts": 1775123456789,
  "fullSync": false
}
```

설명:

- `rev`
  - host가 증가시키는 단조 증가 revision
  - 클라이언트는 stale update 무시
- `ts`
  - 클라이언트 보간 anchor
- `state`
  - `idle / aggro / charge / dead` 등 최소 상태만
- `w / h`
  - full sync일 때만 포함
- `chargeOnly / isBoss`
  - 현재 렌더/행동 분기 유지용

### 5.2.1 full sync와 delta sync

- 일반 tick:
  - `x, y, hp, state, rev, ts`
- full sync:
  - 위 + `w, h, type, isBoss, chargeOnly`

---

## 5.3 host snapshot 스키마

`monster_host_snapshot`은 takeover 시점에 새 host가 읽을 canonical 데이터다.

```json
{
  "id": "m_123",
  "type": "slime",
  "x": 1420,
  "y": 980,
  "hp": 72,
  "maxHp": 100,
  "width": 80,
  "height": 80,
  "chargeState": "idle",
  "chargeOnly": false,
  "isBoss": false,
  "lastHitAt": 1775123450000,
  "lastNetworkEventAt": 1775123455000,
  "rev": 184,
  "cellId": "1_0",
  "ts": 1775123456789
}
```

원칙:

- 일반 클라이언트는 구독하지 않는다.
- host election 직후에만 새 host가 `once('value')`로 읽는다.
- 다운로드 절감의 본체는 delivery path 제한에서 가져간다.

---

## 6. host 시뮬레이션 파이프라인

## 6.1 현재 상태 유지

다음은 유지한다.

- 몬스터 AI 계산은 host만 수행
- 몬스터 생사 판정, 넉백, 보상, 드랍, 보스 스폰은 host authoritative

관련 파일:

- `src/js/world/MonsterManager.js`
- `src/js/entities/Monster.js`

## 6.2 region assignment 추가

각 몬스터는 매 update 시 owner cell을 계산한다.

```js
cellX = Math.floor(monster.x / cellSize)
cellY = Math.floor(monster.y / cellSize)
cellId = `${cellX}_${cellY}`
```

host는 메모리에 다음을 추가한다.

- `monsterRegionMap: Map<monsterId, cellId>`
- `monsterRevisionMap: Map<monsterId, rev>`

region이 바뀌면:

1. old cell remove
2. new cell upsert
3. `rev++`
4. immediate full sync

이때 multi-path `update()`로 한 번에 처리한다.

---

## 6.3 sync cadence

기존 `_getMonsterSyncProfile()` 철학은 유지하되, 의미를 바꾼다.

- 현재:
  - host가 "언제 monsters root에 write 할지"를 정함
- 변경 후:
  - host가 "언제 cell delivery snapshot을 갱신할지"를 정함

기본값 제안:

- engaged / boss / recentlyActive
  - `90~120ms`
- nearby
  - `140~180ms`
- far
  - `360~500ms`

하지만 이 cadence는 "해당 몬스터를 실제로 필요로 하는 플레이어가 있는 경우"에만 의미가 있다.

즉:

- 어떤 활성 플레이어의 subscribed AOI에도 포함되지 않는 몬스터는
  - far cadence 또는 더 느린 background cadence 사용

---

## 6.4 region join keyframe

빠르게 이동하는 플레이어가 저주기 monster를 만나는 케이스를 위해 다음 규칙을 추가한다.

플레이어 cell 변경 시:

1. host가 새 cell과 인접 cell(3x3)의 몬스터를 찾음
2. 그 몬스터들에 대해 immediate full sync enqueue
3. 클라이언트는 `child_added` 시 현재 기준점으로 즉시 렌더 anchor 확보

이 규칙이 없으면 "플레이어가 먼저 도착, monster는 옛 cadence 상태"가 되어 늦게 보이거나 튈 수 있다.

---

## 7. 클라이언트 구독 구조

## 7.1 local player cell manager

`NetworkManager` 또는 `WorldScene`에서 local player 위치 기준으로 현재 cell을 계산한다.

업데이트 주기:

- `100~150ms`

기록 상태:

- `currentCellId`
- `activeCells`
- `prefetchCells`

## 7.2 subscribe 범위

기본:

- 현재 cell + 1-ring
- 즉 `3 x 3 = 9 cells`

빠른 이동 시:

- 진행 방향 한쪽으로 prefetch stripe 추가 가능
- 단, 1차 구현은 `3x3`만으로 시작

이유:

- 단순성
- 구독 수 폭증 방지
- 빠른 이동 이슈는 `region join keyframe`으로 먼저 해결

## 7.3 listener 구조

현재 global monster listener:

- `zones/{room}/monsters`

변경 후:

- `zones/{room}/monster_cells/{cellId}`
  - `child_added`
  - `child_changed`
  - `child_removed`

클라이언트는 cell별 listener map을 가진다.

- `monsterCellListeners: Map<cellId, { ref, callbacks }>`

cell set이 바뀌면:

1. 새 cell 구독 attach
2. 빠진 cell 구독 detach
3. 제거 이벤트는 grace timer와 함께 처리

---

## 7.4 despawn grace

cell 경계 이동 시 RTDB 이벤트 순서상 `remove -> add`가 어색하게 보일 수 있다.

이를 위해 client는 `child_removed` 즉시 monster를 지우지 않는다.

제안:

- `despawnGraceMs = 250`

동작:

1. remove 수신
2. `pendingRemoval`에 기록
3. 250ms 안에 같은 monsterId가 다른 subscribed cell에서 add/update 되면 제거 취소
4. 아니면 실제 제거

이렇게 하면 경계 통과 시 깜빡임이 줄어든다.

---

## 8. 보간 규칙

## 8.1 목적

전송량을 줄이면서도 "같은 몬스터를 보고 있다"는 체감을 유지하기 위한 핵심 레이어다.

## 8.2 규칙

- 일반 이동:
  - linear interpolation
  - `targetX / targetY / targetTs`
- charge, knockback, death:
  - 보간보다 즉시 반영 우선
- revision 감소/동일:
  - 무시
- timestamp가 너무 오래된 데이터:
  - hard snap 또는 skip

## 8.3 중요한 제약

보간은 시각 표현일 뿐, 판정 원천은 host다.

즉:

- damage
- death
- loot
- quest progress

는 기존 host authoritative 흐름을 그대로 사용한다.

---

## 9. 두 가지 핵심 케이스 검토

## 9.1 케이스 1

플레이어가 빠르게 이동 중이다.  
이동 중 sync cadence가 큰 몬스터 영역으로 진입했다.

### 실패하는 설계

- host가 멀리 있는 몬스터를 느리게만 보내고
- 플레이어 AOI 진입 순간 강제 keyframe이 없음

결과:

- 몬스터가 늦게 뜸
- 순간이동처럼 보임
- 충돌/aggro가 어색함

### 정상 동작 조건

- client는 새 AOI cell을 즉시 subscribe
- host는 플레이어 cell 변화 감지 시 근처 몬스터 full sync 강제
- client는 그 full sync를 anchor로 보간 시작

### 결론

`region join keyframe`이 있으면 정상 동작 가능하다.

---

## 9.2 케이스 2

호스트와 다른 게스트 유저가 멀리 떨어져 있다.  
게스트 유저는 독립적으로 멀리 떨어진 곳에서 사냥한다.

### 실패하는 설계

- host 근처 몬스터만 업데이트
- host 카메라 밖 몬스터는 stop

결과:

- 게스트 지역 몬스터가 멈춤
- 원격 사냥이 불가능

### 정상 동작 조건

- host는 존 전체 몬스터를 계속 시뮬레이션
- 단지 게스트는 자기 AOI cell만 subscribe
- host는 게스트 주변 몬스터 delivery snapshot도 정상 publish

### 결론

AOI는 "시뮬레이션 제한"이 아니라 "전송 제한"이어야 하며, 이 전제가 지켜지면 정상 동작한다.

---

## 10. takeover / host 변경 설계

현재 게임은 host election이 있다.

관련 코드:

- `src/js/core/NetworkManager.js`
  - `_checkHostStatus()`
  - `_cleanupStaleUsers()`

AOI 구조에서도 host takeover는 유지되어야 한다.

### 제안

host 변경 시:

1. 새 host가 `monster_host_snapshot`을 1회 읽음
2. 메모리의 `MonsterManager`를 canonical snapshot으로 재구성
3. 각 monster의 `cellId`, `rev`, `lastSyncState` 복원
4. 즉시 현재 관심 cell들에 full sync publish

평시에는 일반 클라이언트가 `monster_host_snapshot`을 구독하지 않으므로 download 폭증을 막을 수 있다.

---

## 11. 구현 단계

## Phase M1 - Region Config / Helper

대상 파일:

- `src/js/world/MonsterManager.js`
- `src/js/core/NetworkManager.js`
- `src/js/world/scenes/WorldScene.js`

작업:

- `cellSize`
- `getCellId(x, y)`
- `getNeighborCellIds(cellId, radius)`
- player current cell 계산

산출물:

- 공통 region helper
- local player current cell state

## Phase M2 - Monster delivery path 추가

대상 파일:

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`

작업:

- `monster_cells/{cellId}/{monsterId}` write path 추가
- `monsterRegionMap`, `monsterRevisionMap` 도입
- region 이동 시 multi-path move

산출물:

- host delivery snapshot publishing

## Phase M3 - Client AOI subscribe

대상 파일:

- `src/js/core/NetworkManager.js`

작업:

- global `monsters` listener 제거
- cell listener attach/detach
- `child_removed` grace 처리
- revision 기반 stale packet drop

산출물:

- AOI delivery subscription layer

## Phase M4 - Join keyframe / Fast move 대응

대상 파일:

- `src/js/world/MonsterManager.js`
- `src/js/core/NetworkManager.js`

작업:

- player cell change 감지
- nearby monster immediate full sync

산출물:

- fast movement entry 안정화

## Phase M5 - Host snapshot / takeover

대상 파일:

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`

작업:

- `monster_host_snapshot` write/read
- host promotion 시 restore

산출물:

- host failover 대응

## Phase M6 - Telemetry / rollout

대상 파일:

- `src/js/main.js`
- `src/js/ui/UIManager.js`
- `README.md`

작업:

- monster cell writes/min
- subscribed cell count
- monster snapshot bytes estimate
- AOI enter keyframe count

산출물:

- 실제 효과 수치 검증

---

## 12. 파일 영향 범위

직접 영향:

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/entities/Monster.js`
- `src/js/main.js`
- `src/js/ui/UIManager.js`

간접 영향:

- `README.md`
- 필요 시 zone 설정 파일

---

## 13. trade-off

장점:

- 다운로드 사용량의 가장 큰 축인 monster fan-out을 직접 줄인다.
- host authoritative 구조를 유지한다.
- 멀리 떨어진 게스트 사냥도 깨지지 않는다.

단점:

- listener / region / revision / grace 관리 복잡도 증가
- host takeover 로직이 지금보다 어려워진다.
- 구현 초기에 경계 cell flicker, stale remove 같은 버그가 나기 쉽다.

---

## 14. 검증 기준

### 기능 검증

- host와 guest가 같은 몬스터 spawn/death를 본다.
- 게스트 단독 사냥 시 드랍/보상/quest가 정상 동작한다.
- 빠르게 이동해도 몬스터가 늦게 튀어나오지 않는다.
- 보스 charge / death가 모든 클라이언트에서 즉시 반영된다.

### 수치 검증

- `monsterUpdate` write/min 감소
- RTDB download/day 감소
- subscribed monster 수 감소
- 10분 플레이 기준 current branch 대비 download 추정치 감소

---

## 15. 최종 결론

이 코드베이스에서 다운로드를 줄이면서도 플레이어와 리모트 플레이어가 동일한 몬스터를 보게 하려면, 정답은 다음 한 줄로 요약된다.

`호스트는 전역 시뮬레이션을 유지하고, 클라이언트는 지역 AOI monster delivery만 구독한다.`

즉:

- AI와 판정은 전역 authoritative
- 전송은 지역화
- 중요한 상태는 즉시
- 일반 이동은 보간

이 구조가 현재 코드베이스와 가장 잘 맞고, 지금 겪고 있는 Realtime Database download 문제를 가장 직접적으로 줄일 수 있는 방향이다.
