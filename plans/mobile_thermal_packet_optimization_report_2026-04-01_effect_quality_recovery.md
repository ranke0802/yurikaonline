# 모바일 최적화 후 스킬 연출 품질 복구 메모

작성일: 2026-04-01

## 배경

- 모바일 최적화 과정에서 `lowPowerPwaMode`와 `useReducedEffects`가 함께 묶이면서
  HUD/네트워크 최적화뿐 아니라 전투 이펙트 품질 저하 경로도 동시에 활성화되고 있었음
- 결과적으로 모바일에서는 스킬 모션, 체인 라이트닝, 투사체, 마법진, 보호막 연출이 의도보다 많이 단순화됨

## 이번 조정

- 모바일 최적화 프로필에서 전투 이펙트 저하 플래그를 분리
- `useAggressiveHudOptimization`과 `lowPowerPwaMode`는 유지
- `useReducedEffects`는 기본적으로 비활성화해, 스킬 이펙트 품질은 보존하고
  HUD/미니맵/네트워크 최적화만 계속 적용되도록 정리

## 영향 파일

- `src/js/main.js`

## 기대 효과

- 모바일에서도 스킬 이펙트가 기존 품질에 가깝게 복구
- 최근 적용한 HUD blur 제거, 미니맵 dirty redraw, 네트워크 cadence 최적화는 계속 유지
- 체감 전투 퀄리티와 발열/패킷 절감의 균형을 더 안전하게 맞춤

## 추후 후보

- 추후에는 `useReducedEffects`를 완전 제거하지 않고, 실제 성능 telemetry 기반으로만
  동적으로 켜는 적응형 fallback으로 옮기는 것이 이상적
