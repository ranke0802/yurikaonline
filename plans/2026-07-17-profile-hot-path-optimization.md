# 프로필 핫패스 최적화 계획

작성일: 2026-07-17

## 문제

맵/몬스터/드랍 확장 이후 고레벨 캐릭터는 인벤토리, 장비 옵션, 퀘스트 상태, 보상 영수증 등 영구 프로필 크기가 커졌다. 기존 일부 저장 경로는 HP, EXP, 퀘스트 진행 같은 작은 변경에도 `/users/{uid}/profile` 전체 transaction 및 recovery profile 동기화를 수행해 모바일 프레임 끊김과 재접속 지연을 유발할 수 있었다.

## 원칙

- 실시간 필드 동기화에는 위치, HP, 이름, 레벨, 최소 장비 표시 정보만 보낸다.
- HP/EXP/마석/퀘스트/위치/설정 같은 핫패스 저장은 child update로 처리해 전체 프로필 다운로드를 피한다.
- 인벤토리, 장비, 스킬, 기본 스탯처럼 회귀 검사가 필요한 데이터는 guarded transaction 경로를 유지한다.
- recovery profile 동기화는 의미 있는 진행 변경에만 주기 제한을 두고 수행한다.

## 적용 범위

- `src/js/core/NetworkManager.js`
  - 실시간 장비/적대 정보 compact snapshot 추가
  - fast profile patch 경로 추가
  - patch 이후 recovery sync 주기 제한
- `src/js/entities/Player.js`
  - 보상 인벤토리 변경 저장을 전체 saveState에서 profile patch로 변경
- `scripts/validate-runtime-integration.mjs`
  - fast patch/guarded patch 분리 검증
  - 실시간 장비 snapshot compact 검증

