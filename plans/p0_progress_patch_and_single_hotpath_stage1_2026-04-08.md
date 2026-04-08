# P0 진행 상태 저장 분리 및 싱글 hot path 1차

## 목표

- 싱글 기준에서 가장 자주 반복되는 전체 프로필 저장을 줄인다.
- 멀티 안정화를 해치지 않는 범위에서 싱글 heartbeat/presence 쓰기를 더 가볍게 만든다.
- 스킬 난사 시 로컬 성능 부담을 줄이는 저위험 1차 최적화를 넣는다.

## 적용 내용

### 1. 진행 상태 patch 저장 추가

- `NetworkManager`에 전체 프로필 저장과 별도로 `savePlayerDataPatch()` 경로를 추가했다.
- patch 저장은 `users/{uid}/profile` 하위 필드만 갱신한다.
- full save 큐와 patch 큐가 서로 경쟁하지 않도록, queued full save가 있으면 patch를 full save 데이터에 병합하고 별도 write를 만들지 않게 했다.
- 숨김 전환 / disconnect 시 patch 큐도 함께 flush 한다.

영향 파일:

- `src/js/core/NetworkManager.js`

### 2. Player 진행 상태 저장 분리

- `Player.saveProfilePatch()`와 필드 기반 patch 빌더를 추가했다.
- 다음 흐름은 전체 save 대신 patch 저장으로 전환했다.
  - HP 감소
  - HP 회복
  - 골드 증가
  - 경험치 증가
  - 보상 수령(아이템 없음)
  - 레벨업
- 아이템 보상이 실제로 들어오는 경우는 여전히 full save를 유지한다.

영향 파일:

- `src/js/entities/Player.js`

### 3. 싱글 heartbeat/presence 완화

- solo idle / active / background heartbeat 간격을 늘렸다.
- solo 상태에서는 `presence/{uid}/ts` fallback을 매 heartbeat마다 갱신하지 않고, shared field 또는 peer가 있는 경우에만 갱신하도록 줄였다.

영향 파일:

- `src/js/core/NetworkManager.js`

### 4. 스킬 로컬 성능 1차

- `Projectile`에 동적 이펙트 스케일을 추가했다.
- 화면 내 활성 투사체 수가 많아질수록 trail 길이, 미사일 파티클 수, 폭발 spark 수를 자동으로 낮춘다.
- reduced effects 옵션은 기존보다 더 강하게 반영한다.

영향 파일:

- `src/js/entities/Projectile.js`

## 기대 효과

- 싱글 자동사냥 / 난사 구간에서 전체 프로필 transaction 빈도 감소
- solo heartbeat의 잔잔한 rules evaluation 감소
- 매직미사일 / 파이어볼 난사 시 로컬 파티클 비용 감소

## 검증 포인트

1. 싱글 30~50분 사냥 시 RTDB 다운로드와 rules evaluation 기울기 비교
2. 골드 / 경험치 / 퀘스트 / HP가 재접속 후 정상 복원되는지 확인
3. 아이템 획득이 있는 보상은 여전히 정상 저장되는지 확인
4. 매직미사일 / 파이어볼 난사 시 체감 프레임 및 발열 비교

## 주의 사항

- 현재 워크트리에 사용자 측 수정 파일이 일부 섞여 있으므로, 커밋할 때 이번 변경 파일만 선택해서 반영해야 한다.
- patch 저장은 현재 진행 상태 중심이며, 인벤토리/장비/대형 상태는 계속 full save를 사용한다.
