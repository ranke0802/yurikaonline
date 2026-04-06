# 필드 참여 기반 안전 동기화 최적화 설계서

작성일: 2026-04-06  
상태: Draft / 설계 전용  
범위: Realtime Database 사용량 절감, 같은 필드 멀티플레이 유지, 기능 회귀 방지  
전제: 멀티플레이 기능은 유지하며, 전투 규칙과 호스트 권위(authoritative host) 구조는 깨지지 않아야 한다.

---

## 1. 목표

현재 구조는 로그인 후 `zones/zone_1`에 연결되면 사실상 모든 주요 실시간 경로를 넓게 구독하고, 호스트는 `monsters`를 전역 fan-out 방식으로 지속 갱신한다.

관련 코드:

- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L7)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L78)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L82)
- [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js#L298)
- [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js#L636)

이번 설계의 목표는 아래와 같다.

1. 같은 필드에 다른 유저가 없을 때는 RTDB hot path를 최소화한다.
2. 같은 필드에 다른 유저가 들어오면 즉시 실시간 멀티 모드로 전환한다.
3. 같은 필드 안에서도 가까운 몬스터만 받도록 하여 다운로드 fan-out을 줄인다.
4. 위 과정에서 전투 판정, 보상, 사망/부활, 저장/복구, 파티, 퀘스트 기능에 회귀가 없어야 한다.

---

## 2. 절대 지켜야 할 안전 원칙

### 2.1 멀티플레이는 유지한다

이 설계는 싱글화가 아니다.  
핵심 게임은 계속 멀티플레이이며, 단지 **실시간 동기화 범위와 빈도**를 줄이는 것이다.

### 2.2 호스트 권위 구조는 유지한다

아래는 그대로 유지한다.

- 몬스터 AI
- 몬스터 공격 판정
- 보상 지급
- 몬스터 사망 처리
- 보스 상태 전환

즉, “표현은 더 적게 동기화하되, 진실의 원천은 계속 호스트”라는 원칙을 유지한다.

### 2.3 완전 무통신으로 가지 않는다

필드에 혼자 있을 때도 RTDB를 완전히 끄지 않는다.  
그 대신 **presence-lite**만 유지한다.

이유:

- 다른 유저가 같은 필드에 들어왔는지 감지해야 한다.
- 호스트 선출/전환과 세션 복구가 깨지면 안 된다.
- 나중에 frame/field 구조 분리로 확장할 때도 같은 기초 경로를 재사용할 수 있어야 한다.

### 2.4 저장과 실시간을 분리한다

현재는 프로필 저장과 실시간 표현이 같은 네트워크 경로 감각으로 섞여 있다.  
앞으로는 아래처럼 나눈다.

- 영속 저장: 레벨업, 스탯업, 스킬업, 장비 강화, 장착, 사망/부활, 퀘스트 완료
- 실시간 표현: 위치, 공격, 채널링, HP, 이모트, 같은 필드 플레이어 존재

---

## 3. 현재 구조 진단

### 3.1 전역 room 구독

현재 room은 사실상 고정이다.

- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L7)

연결 시 즉시 아래를 폭넓게 구독한다.

- `users`
- `monsters`
- `monster_attack`
- `monster_damage`
- `player_damage`
- `drops`
- `chat`
- `system_messages`

관련 코드:

- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L78)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L82)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L108)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L238)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L259)

### 3.2 몬스터 fan-out 구조

호스트는 몬스터를 일정 주기로 `monsters/{id}`에 넣고,
모든 클라이언트가 그 변화를 받는다.

- flush 주기: [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L42)
- monster batch update: [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1675)
- sync cadence 결정: [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js#L298)

즉, write 양보다 더 큰 문제는 “같은 업데이트가 누가 받느냐”다.

### 3.3 플레이어 hot path 상시 write

아래는 현재 계속 RTDB로 나간다.

- 위치
- 공격
- 채널링
- HP
- heartbeat

관련 코드:

- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1778)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1811)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1833)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1843)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1907)

---

## 4. 제안 구조 개요

핵심은 “현재 필드에 혼자 있는지”와 “같은 필드에 다른 유저가 들어왔는지”를 기준으로 모드를 나누는 것이다.

### 4.1 모드 정의

#### A. Presence Lite Mode

조건:

- 현재 필드에 나 외 실시간 플레이어가 없음

행동:

- full realtime hot path 최소화
- presence-lite만 유지
- profile 저장은 이벤트 기반으로만 수행
- 호스트는 계속 로컬 전투/몬스터 시뮬레이션 수행
- 몬스터 RTDB broadcast는 quiet mode로 완화

#### B. Shared Field Realtime Mode

조건:

- 같은 필드에 다른 플레이어가 1명 이상 있음

행동:

- 위치/공격/채널링/HP 등 hot path 활성화
- 같은 필드 유저끼리만 실시간 교환
- 몬스터 동기화는 AOI/cell 기준으로 전송

### 4.2 필드 개념

현재는 room이 거의 곧 field다.  
이번 설계에서는 미래 frame 구조와 호환되게 `fieldId` 개념을 먼저 도입한다.

예:

- `field_slime_meadow`
- `field_town`
- `field_cabin`

초기 1차 구현에서는 실제 RTDB room 분리를 바로 하지 않아도 된다.  
대신 user presence에 `fieldId`를 추가해 같은 field끼리만 실시간 공유하게 한다.

---

## 5. 데이터 경로 설계

### 5.1 항상 유지되는 presence-lite

경로:

`zones/{roomId}/presence/{uid}`

payload 예시:

```json
{
  "fieldId": "field_slime_meadow",
  "cellId": "2_3",
  "mode": "presence_lite",
  "ts": 1775450000000,
  "name": "Yurika",
  "level": 4,
  "appearance": {
    "weaponType": "staff",
    "hat": "wizard_hat"
  }
}
```

용도:

- 같은 field 인원 수 계산
- 나중에 주변 유저/필드 참가자 찾기
- 완전 무통신 상태 방지

### 5.2 필드 실시간 hot path

경로:

`zones/{roomId}/field_users/{fieldId}/{uid}`

하위 키:

- `p`: 위치
- `a`: 공격
- `ch`: 채널링
- `h`: HP
- `rt`: 실시간 모드 메타

예시:

```json
{
  "p": [1400, 980, 1775450001234],
  "a": ["attack", 1775450001240],
  "ch": ["magic_missile", 1775450001300],
  "h": [42, 70, 1775450001310],
  "rt": {
    "fieldId": "field_slime_meadow",
    "cellId": "2_3",
    "mode": "shared_realtime"
  }
}
```

이 경로는 **같은 field에 다른 플레이어가 있을 때만** 유지한다.

### 5.3 영속 profile 저장

기존 경로 유지:

`users/{uid}/profile`

단, 저장 기준을 더 명확히 한다.

즉시 저장 이벤트:

- 레벨업
- 스탯업 저장
- 스킬업
- 장비 강화
- 장비 장착/해제
- 인벤토리 주요 변경
- 사망/부활
- 퀘스트 완료/보상
- 구글 연동/로그아웃

즉, “혼자일 때는 아무것도 안 저장”이 아니라  
“혼자일 때는 실시간 스트림을 줄이고, 영속 저장은 이벤트성으로만 한다”가 정확한 방향이다.

---

## 6. 동작 시나리오

### 6.1 내가 필드에 혼자 있음

1. 클라이언트는 `presence/{uid}`만 유지
2. `field_users/{fieldId}/{uid}`는 detach 또는 최소화
3. 이동/공격/채널링/HP는 로컬 플레이에만 사용
4. profile은 이벤트성으로만 저장
5. 몬스터는 호스트가 로컬 authoritative로 계속 시뮬레이션
6. 몬스터 RTDB 전송은 quiet mode

### 6.2 다른 유저가 같은 필드에 들어옴

1. `presence`를 통해 같은 `fieldId` 참가자가 2인 이상이 됨
2. 양쪽 모두 `shared_realtime` 모드로 전환
3. 현재 내 상태를 즉시 publish
   - 위치
   - HP
   - 현재 공격/채널링 상태
   - field/cell
4. 호스트는 현재 활성 몬스터 full snapshot을 즉시 송신
5. 이후부터 일반 realtime cadence로 전환

### 6.3 다른 유저가 떠남

1. 같은 field 플레이어 수가 다시 1명이 되면 solo timer 시작
2. 3~5초 grace period 후 `presence_lite`로 다운시프트
3. 즉시 끄지 않는 이유는 순간 disconnect/reconnect나 경계 이동 떨림을 흡수하기 위해서다

---

## 7. 몬스터 동기화 설계

### 7.1 전제

사용자 요구사항상, 플레이어와 리모트 플레이어는 “같은 몬스터를 본다”는 체감이 유지되어야 한다.

따라서:

- AI는 계속 호스트 authoritative
- 클라이언트는 기준 상태 + 보간
- 중요한 이벤트는 즉시 sync

### 7.2 quiet mode

혼자일 때:

- 몬스터 상태를 매 주기 RTDB에 broadcast하지 않음
- 단, 호스트 내부 canonical snapshot은 유지
- 다른 유저가 field에 들어오면 즉시 full sync 수행

이렇게 하면 “혼자 있을 때도 멀티 엔진은 살아 있지만, 다운로드 폭탄은 줄이는” 방향이 된다.

### 7.3 shared mode

같은 field에 다른 유저가 있으면:

- AOI/cell 기반 전송 사용
- 같은 field 안에서도 인접 cell만 구독
- 상태 변화는 즉시
- 일반 이동은 cadence + 보간

초기 cell 구조는 기존 AOI 설계서와 맞춘다.

참고:

- [plans/monster_aoi_sync_architecture_plan_2026-04-02.md](C:/dev/yurika_online/plans/monster_aoi_sync_architecture_plan_2026-04-02.md#L1)

---

## 8. 기능 안정성을 위한 단계별 구현 순서

이번 작업은 절대 한 번에 갈아엎지 않는다.

### Phase S0. 계측 고정

먼저 유지:

- RTDB write/min
- estimated bytes/min
- move / monster / profile 분리 계측

참고:

- [src/js/main.js](C:/dev/yurika_online/src/js/main.js#L263)
- [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L5342)

### Phase S1. Presence Lite 도입

도입 내용:

- `presence/{uid}` 경로 추가
- `fieldId`, `cellId`, `mode`, `ts` 유지
- 아직 기존 realtime 경로는 유지

목적:

- 기능 변화 없이 “같은 field 인원 수”를 정확히 계산하는 기초 확보

### Phase S2. 필드 참가자 수 기반 모드 전환

도입 내용:

- 같은 field 인원 수가 1이면 `presence_lite`
- 2 이상이면 `shared_realtime`
- 모드 전환 시 현재 상태 즉시 publish

주의:

- 이 단계에서도 아직 기존 `users/{uid}` write는 fallback로 유지 가능
- flag 기반으로 끄고 켤 수 있게 구현

### Phase S3. 플레이어 hot write gating

도입 내용:

- solo 상태면 `move`, `attack`, `channel`, `hp` 상시 write 억제
- shared 상태면 기존 cadence 유지

안전장치:

- shared 진입 시 즉시 current snapshot push
- shared 종료 후 grace period 적용

### Phase S4. 몬스터 quiet mode

도입 내용:

- solo 상태의 호스트는 monster RTDB broadcast를 최소화
- canonical monster state는 로컬 유지
- peer join 시 `force full sync`

관련 기존 코드:

- [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js#L636)
- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1675)

### Phase S5. AOI/cell monster delivery

도입 내용:

- `monsters` 전역 대신 `monster_cells`
- 인접 cell 구독
- delivery snapshot + keyframe + delta

이 단계는 구조 변경이 가장 크므로 S1~S4 검증 후에만 진행한다.

---

## 9. 기능 회귀 방지 체크리스트

아래는 반드시 실제 시나리오로 검증해야 한다.

### 9.1 혼자 플레이

- 혼자 접속 후 이동/사냥/레벨업 정상
- 스탯업/스킬업/장비 강화 저장 정상
- 사망/부활 저장 정상
- 재접속 시 복구 정상

### 9.2 같은 필드 멀티

- 다른 유저가 같은 field에 들어오면 즉시 서로 보임
- 위치/공격/채널링/HP 실시간 반영 정상
- 한 명이 떠나면 다른 한 명이 끊기지 않음

### 9.3 멀리 떨어진 사냥

- 호스트와 게스트가 멀리 떨어져 각각 사냥 가능
- AOI 밖 몬스터는 안 받아도, AOI 안 몬스터는 정확히 보임
- 보스/차지/피격/죽음 상태 sync 유지

### 9.4 빠른 이동

- 빠르게 이동해 새로운 몬스터 구역에 진입해도 늦게 나타나지 않음
- AOI 진입 시 full sync + short interpolation 동작 확인

### 9.5 세션 경계

- 브라우저 refresh
- 모바일 백그라운드 복귀
- host 변경
- reconnect

이 모든 경우에 모드 전환이 꼬이지 않아야 한다.

---

## 10. Feature Flag 설계

기능 안전성을 위해 반드시 flag 기반으로 rollout 한다.

권장 flag:

- `usePresenceLiteMode`
- `useFieldRealtimeMode`
- `useSoloHotWriteGating`
- `useMonsterQuietMode`
- `useMonsterCellDelivery`

원칙:

- 각 단계는 독립적으로 켜고 끌 수 있어야 한다
- 문제가 생기면 이전 단계로 즉시 rollback 가능해야 한다

---

## 11. 현재 코드베이스 기준 영향 파일

1차~3차에 바로 영향:

- [src/js/core/NetworkManager.js](C:/dev/yurika_online/src/js/core/NetworkManager.js#L1)
- [src/js/world/MonsterManager.js](C:/dev/yurika_online/src/js/world/MonsterManager.js#L1)
- [src/js/world/scenes/WorldScene.js](C:/dev/yurika_online/src/js/world/scenes/WorldScene.js#L1)
- [src/js/entities/RemotePlayer.js](C:/dev/yurika_online/src/js/entities/RemotePlayer.js#L1)
- [src/js/main.js](C:/dev/yurika_online/src/js/main.js#L1)
- [src/js/ui/UIManager.js](C:/dev/yurika_online/src/js/ui/UIManager.js#L1)

중장기 구조 확장 시:

- [plans/frame_mode_directing_architecture_2026-04-06.md](C:/dev/yurika_online/plans/frame_mode_directing_architecture_2026-04-06.md#L1)

---

## 12. 결론

사용량을 감당 가능한 수준으로 낮추려면 “멀티를 싱글로 바꾸는 것”이 아니라, 아래 세 가지를 동시에 해야 한다.

1. 혼자 있을 때는 presence-lite만 유지하고 hot path는 얇게 만든다.
2. 같은 field에 다른 유저가 들어오면 즉시 shared realtime으로 승격한다.
3. 몬스터는 같은 field 안에서도 가까운 영역만 받게 만든다.

가장 중요한 점은, 이 설계는 기능을 줄이는 설계가 아니라 **실시간 범위와 빈도를 조절하는 설계**라는 것이다.

즉:

- 멀티 유지
- 같은 필드 멀티 유지
- 전투 규칙 유지
- 저장/복구 유지
- RTDB 사용량만 구조적으로 절감

이 문서 기준 구현은 반드시 `S1 -> S2 -> S3 -> S4 -> S5` 순서로 단계적으로 진행해야 하며, 각 단계는 feature flag와 실전 시나리오 검증 없이는 다음 단계로 넘어가지 않는다.
