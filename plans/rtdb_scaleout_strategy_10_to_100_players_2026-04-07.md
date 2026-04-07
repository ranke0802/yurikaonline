# RTDB 10명~100명 확장 전략

## 범위

- 멀티플레이 기능 정상성을 유지하면서 RTDB 대역폭을 가장 효과적으로 줄이는 방향을 정의한다.
- RTDB 위에서 계속 확장 가능한 영역과, 100명 목표에서는 RTDB 밖으로 분리해야 하는 영역을 구분한다.
- 단기적으로는 현재의 호스트 authoritative 전투 모델을 기준선으로 유지한다.

## 단계 구분

- 단기: 소규모 파티, 낮은 두 자릿수 동접까지 현재 RTDB 구조를 더 단단하고 가볍게 만든다.
- 중기: 전역 room 경로 중심의 실시간 전달을 AOI 기반 플레이어/몬스터 채널로 옮긴다.
- 장기: 대규모 필드 기준 전투 상태 스트리밍을 RTDB 밖으로 분리한다.

## 현재 제약

- 현재 코드는 플레이어 hot path 일부가 아직 중복된다.
  - `presence/{uid}`: 생존 판정 및 셀 식별
  - `users/{uid}/p`: 실시간 이동
  - `sendMovePacket()` 안에서 `_publishPresenceLite({ x, y })`도 함께 호출
- 몬스터 전달은 이미 `monster_cells`로 옮겼지만, 플레이어 전달은 사실상 유저 루트 hot path 구조에 가깝다.
- 호스트 authoritative 처리, 보상 흐름, host takeover 복구는 흔들리면 안 된다.

## 가장 효과적인 방향

### 1. RTDB는 우선 control plane, 그다음 data plane으로 본다

RTDB에 남길 것:

- 계정, 프로필, 인벤토리, 퀘스트 저장
- 우편함 성격의 전투 결과 및 보상 이벤트
- 경량 presence 및 방 참여 정보
- 입장/bootstrap 스냅샷
- 채팅, 파티, 소셜 상태

RTDB가 주 운반 수단으로 남지 말아야 할 것:

- 시야 내 모든 플레이어의 고빈도 위치 스트림
- 대규모 몬스터 무리의 지속적인 AI 상태 갱신
- 투사체 생명주기 전체 상태

### 2. 10명 목표: hot path를 AOI 단위로 완전히 묶으면 RTDB도 아직 가능하다

같은 전장에 대략 10명 정도가 함께 있는 수준이라면 가장 좋은 방향은 다음과 같다.

- presence heartbeat와 rich presence payload를 분리한다.
- 이동을 `presence`와 `users/{uid}/p` 양쪽으로 동시에 보내지 않는다.
- 플레이어 실시간 전달을 `field_users/{fieldId}/cells/{cellId}/{uid}` 구조로 옮긴다.
- 주변 플레이어 셀과 주변 몬스터 셀만 구독한다.
- 호스트 authoritative 시뮬레이션은 유지하되, join keyframe과 주변 delta만 발행한다.
- 스킬/투사체 동기화는 장수 엔티티 대신 action/result 번들로 묶는다.

### 3. 100명 목표: RTDB만으로 실시간 전투를 끝까지 가져가는 것은 맞지 않다

100명 규모, 특히 같은 필드에 많은 인원이 모이는 상황에서는 가장 효과적인 해법이 다르다.

- 이동과 전투 전용의 별도 realtime transport를 둔다.
  - WebSocket 또는 WebRTC relay
  - 이상적으로는 Cloud Run zone worker나 상시 Node 서비스 기반 authoritative 처리
- RTDB는 저장과 경량 조정 계층으로 남긴다.

권장 역할 분리:

- RTDB
  - 로그인, 프로필, 저장
  - 인벤토리 및 퀘스트 진행
  - 룸 탐색 / 샤드 배정
  - presence-lite
  - 복구용 snapshot
  - 트래픽이 과하지 않다면 채팅
- Realtime 서버
  - 플레이어 위치
  - 몬스터 authoritative 처리 및 복제
  - 전투 이벤트
  - 스킬 시전 및 결과
  - zone interest management

## 구체 로드맵

### Stage A: 현재 RTDB 설계 내부의 중복부터 제거

1. heartbeat payload 분리
   - `presence/{uid}` rich payload는 접속, 필드 변경, 셀 변경, 외형 변경 시에만 갱신
   - `presence_ts/{uid}` 또는 `presence/{uid}/ts`는 경량 heartbeat 전용으로 사용

2. 이동 이중 발행 중지
   - shared realtime 활성화 중에는 `sendMovePacket()`이 매 이동마다 rich presence를 다시 쓰지 않도록 수정
   - presence는 셀 변경 시에만 갱신

3. join keyframe 과다 발행 축소
   - 같은 필드 peer 합류 시 keyframe은 유지
   - 다만 작은 셀 이동마다 몬스터 full sync를 반복하지 않도록 거리 기준을 둔다

4. 플레이어 AOI 전달 추가
   - 유저별 루트 hot listener를 셀 단위 플레이어 snapshot 구독으로 교체

### Stage B: RTDB로 10명 수준을 버틸 수 있게 만들기

1. `field_users/{fieldId}/cells/{cellId}/{uid}`
   - 압축된 이동 snapshot
   - 공격 상태, 채널, HP는 짧은 배열 또는 번들 상태로 표현

2. 플레이어와 몬스터 모두 3x3 AOI 구독
   - 양쪽 모두 동일한 AOI 모델을 사용

3. 액션 이벤트 번들링
   - 반복 projectile/tick 이벤트 대신 cast request 또는 skill result 단위로 묶음

4. snapshot + interpolation
   - write 횟수 감소
   - 클라이언트는 로컬에서 부드럽게 보간

### Stage C: 30명~100명 준비

1. 필드 / 존 인스턴스 단위 샤딩
   - 하나의 RTDB room이 전체 월드를 대표하지 않도록 한다
   - 플레이어를 필드 인스턴스 단위로 명시적으로 배정한다

2. host authority를 service authority로 승격
   - Cloud Run zone worker 또는 소형 Node relay가 authoritative 역할을 담당
   - 혼잡한 필드에서 host election 의존성을 제거

3. RTDB는 복구 계층으로 유지
   - 주기적인 소형 snapshot만 남김
   - 이동/전투의 주 스트림은 맡기지 않음

## 트레이드오프

- RTDB만 유지하는 방식은 아주 작은 규모에서는 운영이 단순하고 저렴하지만, 동접이 늘수록 다운로드 fan-out 비용과 정합성 복잡도가 빠르게 커진다.
- 하이브리드 구조는 인프라 복잡도가 올라가지만, 비용 통제와 플레이 정확성 측면에서 훨씬 높은 상한선을 제공한다.

## 결론

- 실제 목표가 한 필드 기준 10명 수준이라면: 플레이어와 몬스터 모두 RTDB AOI를 완성하고, presence/move 중복 write를 제거한 뒤, 호스트 authoritative 구조를 유지하는 것이 맞다.
- 실제 목표가 100명 수준이라면: RTDB hot path만으로 해결하려 하지 말고, RTDB는 저장/조정 용도로 남기고 이동/전투는 별도 zone transport로 분리하는 것이 맞다.
