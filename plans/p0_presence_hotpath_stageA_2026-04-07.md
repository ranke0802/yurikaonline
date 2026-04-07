# P0 Presence Hot Path 1차 정리

## 범위

- 현재 브랜치 안정화 계획의 `P0 서비스 신뢰성`과 `RTDB 비용 통제`를 우선 반영한다.
- 이번 단계는 구조를 갈아엎지 않고, 현재 멀티플레이 기능을 유지한 채 hot path 중복을 줄이는 데 집중한다.

## 현재 단계

- 현재 브랜치: 실사용자 안정화 브랜치
- 이번 작업: RTDB Stage A 중 `heartbeat payload 분리`와 `이동 중 rich presence 중복 write 제거`

## 반영 내용

1. `presence_ts` 경량 heartbeat 경로 추가
   - `presence/{uid}`는 필드/셀/모드/이름/레벨/외형 같은 rich presence 용도로 유지
   - heartbeat는 `presence_ts/{uid}`로 분리
   - `presence_ts` listener로 생존 판정과 host election에 필요한 최신 활동 시각을 반영

2. 이동 중 rich presence 중복 write 제거
   - `sendMovePacket()`에서 매 이동마다 `presence/{uid}`를 다시 쓰지 않음
   - 셀 또는 필드가 바뀔 때만 rich presence를 다시 발행
   - 몬스터 셀 구독 갱신은 이동 중에도 계속 유지

3. join/cell-change 몬스터 keyframe 보수화
   - host가 peer의 작은 셀 이동마다 3x3 full sync를 반복하지 않도록 제한
   - 인접 셀 이동은 짧은 시간 동안 keyframe을 생략하고, join 또는 큰 이동일 때만 강하게 보정

## 영향 파일

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`

## 기대 효과

- idle/이동 중 `presence` object 전체 다운로드 빈도 감소
- shared realtime 활성 상태에서도 `presence`와 `users/{uid}/p`의 중복 write 완화
- peer cell 이동 시 발생하던 몬스터 full sync 스파이크 완화

## 트레이드오프

- `presence_ts` 경로가 추가되어 구조가 약간 복잡해진다.
- 하지만 기존 authoritative 모델을 유지하면서 비용을 줄이기에는 가장 안전한 1차 단계다.

## 다음 후보 작업

1. 플레이어 AOI 전달 경로 도입 여부 검토
2. `presence` rich payload를 더 작게 줄일 수 있는지 점검
3. 2클라이언트 기준 실측으로 RTDB 사용량, 몬스터 sync 정확도, idle visibility 확인
