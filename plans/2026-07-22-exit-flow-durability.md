# 게임 종료 안정화

- 종료는 튜토리얼 상태와 관계없이 설정 진입·게임 종료·확인 버튼을 항상 허용한다. 튜토리얼은 종료 직전에 정리한다.
- 종료 저장은 먼저 동기 로컬 durable checkpoint를 남기고, RTDB 저장/flush는 각각 짧게 제한한다. timeout일 때는 방금 저장된 checkpoint가 있을 때만 캐릭터 선택으로 전환한다.
- 종료의 full save는 이미 큐 패치를 흡수하므로, 이어지는 flush에서 local patch journal의 별도 재생 transaction은 생략한다. 저널은 다음 접속 복구용으로 유지한다.
- 캐릭터 선택의 프로필 읽기는 timeout 뒤 재시도 화면을 보여 빈 화면이나 무한 대기를 피한다.
