# 모바일 발열·패킷 최적화 설계서

작성일: 2026-04-01  
범위: 설계 문서화만 진행, 코드 미적용  
대상: Android Chrome/PWA, iPhone PWA, 모바일 브라우저 전반

## 1. 목적

본 문서는 현재 Yurika Online의 모바일 환경에서 발생하는 과도한 발열, 배터리 소모, Firebase Realtime Database 패킷 사용량 문제를 줄이기 위한 구현 설계서다.

이번 설계의 절대 조건은 다음과 같다.

- 기존 기능을 삭제하지 않는다.
- 기존 플레이 흐름, 조작 체감, 전투 시스템, 저장/복구 동작을 의도적으로 바꾸지 않는다.
- 그래픽 요소와 멀티플레이 기능은 유지하되, 내부 동작 주기와 동기화 구조를 최적화한다.
- 이번 단계에서는 문서만 작성하고 실제 코드 변경은 하지 않는다.

## 2. 현재 관찰 요약

현재 발열과 패킷 사용량은 한 가지 원인보다 여러 고빈도 경로가 겹친 결과로 판단한다.

### 2-1. 발열/배터리 측면 핵심 진단

- 모바일에서도 게임 시뮬레이션 업데이트가 사실상 60Hz 고정으로 유지된다.
- 렌더 FPS 제한이 있어도 업데이트 루프는 계속 60Hz로 돌기 때문에 CPU 사용량이 높다.
- 모바일 저전력 프로필이 사실상 Apple 모바일 standalone PWA에만 강하게 적용되어, Android Chrome/PWA는 상대적으로 무거운 경로를 탄다.
- HUD와 미니맵은 모바일에서도 비교적 잦은 갱신을 유지하고, 여러 UI 레이어에 blur 계열 스타일이 남아 있다.
- 원격 플레이어와 일부 이펙트는 화면 밖에서도 충분히 비싼 경로를 탈 가능성이 높다.

### 2-2. 패킷/데이터 사용량 측면 핵심 진단

- 이동 동기화가 이동 중 약 16Hz 수준으로 전송된다.
- 이동 중 heartbeat가 별도로 1초마다 전송된다.
- 플레이어 공격, 채널링, HP, 보상, 드롭, 이모트가 모두 별도 경로로 송신된다.
- 몬스터 상태는 호스트가 다수 개체를 상대로 10Hz 수준으로 지속 동기화한다.
- 프로필 저장은 전체 스냅샷 기반이고, 일부 경로에서는 zone 하위 노드에도 다시 복제된다.
- 저장 호출 지점이 많아 작은 상태 변화가 잦은 전체 저장으로 이어질 수 있다.

## 3. 이번 설계의 불변 원칙

### 3-1. 기능 유지 원칙

- 스킬, 오라, 이펙트, HUD, 미니맵, 멀티플레이, 파티, PvP, 퀘스트, 저장/복구 기능은 유지한다.
- “보이는 기능”을 제거하지 않는다.
- “내부 빈도와 전달 방식”만 바꾼다.

### 3-2. 체감 유지 원칙

- 이동이 끊겨 보이거나 전투 판정이 달라졌다고 느껴지면 실패로 간주한다.
- 이펙트는 남기되, 샘플링 빈도/합성 비용/갱신 주기만 조정한다.
- 네트워크 패킷은 줄이되, 보간과 로컬 예측으로 기존 체감과 최대한 같게 만든다.

### 3-3. 롤아웃 원칙

- 모든 구조 변경은 구버전 데이터를 읽을 수 있는 호환 구간을 둔다.
- hot path와 cold path를 분리하되, 단계별 롤아웃이 가능해야 한다.
- 각 단계는 측정 수치로 전후 비교가 가능해야 한다.

## 4. 현재 영향 범위

이번 최적화 설계에서 직접 영향받는 핵심 파일은 다음과 같다.

- `src/js/main.js`
- `src/js/core/GameLoop.js`
- `src/js/core/NetworkManager.js`
- `src/js/world/scenes/WorldScene.js`
- `src/js/world/MonsterManager.js`
- `src/js/entities/Player.js`
- `src/js/ui/UIManager.js`
- `src/css/style.css`
- `sw.js`

## 5. 최적화 전략 개요

이번 작업은 아래 4축으로 나눈다.

1. 계측 강화  
현재 병목을 수치로 측정하고, 최적화 후 개선 여부를 명확히 검증한다.

2. 패킷/RTDB 쓰기 최적화  
이동, heartbeat, 몬스터, profile 저장 경로의 고빈도 write를 줄인다.

3. 발열/배터리 최적화  
모바일 공통 thermal profile, 루프 cadence, HUD 갱신 주기, blur 비용을 줄인다.

4. PWA/백그라운드 정리  
숨김 상태, 재진입, 서비스 워커, 정적 자산 처리로 불필요한 네트워크와 CPU 사용을 줄인다.

## 6. 단계별 구현 설계

## Phase 0. 계측 계층 추가

### 목표

최적화 이전/이후를 비교할 수 있도록 렌더, 업데이트, RTDB write, 추정 바이트량, 엔티티 수, HUD 갱신 빈도를 측정한다.

### 구현 방향

- `GameLoop`에 평균 update 시간, 평균 render 시간, frame skip 비율, long frame 카운터를 추가한다.
- `NetworkManager`에 write 호출 래퍼를 추가해 타입별 write 수를 집계한다.
- 개발 모드에서만 보이는 lightweight telemetry 패널을 추가한다.
- 1분 단위 rolling window를 사용해 순간 피크와 평균을 함께 기록한다.

### 수집 지표

- `avgUpdateMs`
- `avgRenderMs`
- `maxFrameGapMs`
- `rtdbWritesPerMin`
- `estimatedBytesPerMin`
- `movePacketsPerMin`
- `monsterWritesPerMin`
- `profileSavesPerMin`
- `hudUpdatesPerMin`
- `minimapUpdatesPerMin`

### 기대 효과

- 추측이 아니라 실제 병목 우선순위로 작업 순서를 정할 수 있다.
- Android Chrome, Android PWA, iPhone PWA를 동일 기준으로 비교할 수 있다.

## Phase 1. 플레이어 네트워크 hot path 분리

### 목표

플레이어 상태 중 자주 바뀌는 데이터와 드물게 바뀌는 데이터를 분리해, 작은 상태 변화가 큰 payload로 이어지지 않게 한다.

### 현재 문제

- `users/{uid}` 하위에 `profile`, `p`, `a`, `ch`, `h`, `lastSeen`이 혼재한다.
- `child_changed`가 플레이어 루트 기준으로 반응하면서, hot path 업데이트에도 큰 사용자 노드 단위 처리가 붙는다.

### 구현 방향

- 플레이어 루트 구조를 hot/cold 기준으로 명시적으로 분리한다.

예시 구조:

```text
users/{uid}/profile
users/{uid}/presence
users/{uid}/position
users/{uid}/combat/attack
users/{uid}/combat/channel
users/{uid}/combat/hp
users/{uid}/social/party
users/{uid}/social/hostility
```

- 수신부는 일정 기간 구구조와 신구조를 모두 읽을 수 있게 호환 레이어를 둔다.
- `profile`은 cold data로 취급하고, 월드 렌더와 즉시 연관된 값은 별도 lightweight zone snapshot으로 분리한다.

### 기대 효과

- 플레이어 위치/전투 갱신 시 전체 노드 파싱 비용 감소
- listener 처리량 감소
- write payload 평균 크기 감소

### 주의점

- 저장/복구/구글 연동과 충돌하지 않도록 profile 경로는 유지한다.
- 호환 구간 종료 전까지는 read path를 이중 지원해야 한다.

## Phase 2. 이동·heartbeat cadence 재설계

### 목표

움직임 체감은 유지하면서 이동 패킷과 생존 신호 전송량을 줄인다.

### 현재 문제

- 이동 중 약 16Hz 고정에 가까운 패킷 전송
- 이동 중 1초 heartbeat 별도 전송
- 이동/heartbeat가 생존 확인을 중복 수행

### 구현 방향

- 이동 패킷 전송 주기를 단순 고정값이 아니라 상태 기반 적응형으로 변경한다.

권장 정책:

- 정지: `400~500ms`
- 저속 직선 이동: `120~150ms`
- 방향 급변/고속 이동: `80~100ms`
- 마지막 이동 정지 전환 시 즉시 1회 flush

- heartbeat는 아래 조건으로 재정의한다.
  - 최근 N초 안에 이동/전투/채널링 write가 있으면 별도 heartbeat 생략
  - 완전 idle 상태일 때만 저빈도 presence 유지
  - foreground 복귀 시 즉시 1회 송신

### 체감 유지 장치

- 원격 플레이어는 보간 버퍼를 조금 넉넉하게 잡아 전송 빈도 감소를 감춘다.
- 방향 전환, 멈춤 시점, 스킬 시전 시작은 즉시 flush 대상으로 유지한다.

### 기대 효과

- 플레이어당 패킷 수의 가장 큰 축을 바로 줄일 수 있다.
- 멀티플레이 인원이 많아질수록 효과가 커진다.

## Phase 3. 프로필 저장 구조 최적화

### 목표

작은 상태 변화가 전체 profile 저장으로 직결되지 않게 하고, zone 복제 payload를 줄인다.

### 현재 문제

- `saveState()`가 전체 스냅샷을 저장한다.
- 장비/퀘스트/인벤토리/스탯/위치 등 여러 값이 한 덩어리로 저장된다.
- `syncToWorld=true`이면 zone 하위에도 full profile 복제가 발생한다.

### 구현 방향

- `saveState()`는 외부 API를 유지하되 내부적으로 `dirty flag + debounce + immediate flush list` 구조로 바꾼다.

dirty group 예시:

- `economyDirty`
- `statsDirty`
- `skillsDirty`
- `inventoryDirty`
- `questDirty`
- `socialDirty`
- `positionDirty`

### flush 정책

- 즉시 flush:
  - 레벨업
  - 아이템 장착/해제
  - 강화/분해
  - 퀘스트 완료
  - 계정 연동
  - 종료/로그아웃 직전
- debounce flush:
  - 일반 상태창 수치 변동
  - 반복 보상
  - 잦은 UI 액션

### zone snapshot 재설계

- zone user 하위에는 월드 표시용 최소 필드만 둔다.

예시:

- `name`
- `level`
- `equipment`
- `party`
- `hostility`
- `defense`
- `isPaused`

### 기대 효과

- 저장 write 수 감소
- profile payload 크기 감소
- 월드 참여 중 불필요한 profile 복제 감소

## Phase 4. 몬스터 동기화 구조 재설계

### 목표

호스트가 다수 몬스터를 10Hz로 개별 `set()`하는 구조를 줄이되, 전투 체감은 유지한다.

### 현재 문제

- 몬스터마다 10Hz 수준의 full object write 가능
- AI/이동/HP/보스 상태가 동일 경로에 섞여 write됨
- host가 늘어날수록 모바일 패킷과 발열이 커짐

### 구현 방향

- 몬스터 동기화를 `위치 delta`, `상태 변화`, `이벤트` 세 종류로 분리한다.

권장 분리:

- 위치/보간용: 저비용 delta update
- HP/state: 변경 시만 update
- charge, roar, shield, spawn/death: 이벤트 전송 유지

- 개별 `set()` 대신 frame window 내 다수 몬스터 갱신을 multi-path `update()` 또는 batch node로 합친다.
- 멀리 있는 몬스터와 비전투 몬스터는 더 느린 cadence를 사용한다.
- 보스와 현재 전투 중인 몬스터는 높은 우선순위를 유지한다.

### 체감 유지 장치

- 클라이언트 측 보간 유지
- 보스 패턴과 피격, 죽음, 분열은 즉시 이벤트 유지

### 기대 효과

- zone 단위 write 폭 감소
- 호스트 기기의 CPU와 네트워크 부하 감소

## Phase 5. 모바일 thermal profile 통합

### 목표

Apple PWA 편중 저전력 경로를 모바일 전반으로 확장해, Android Chrome/PWA에서도 발열을 줄인다.

### 현재 문제

- 현재 저전력 프로필은 Apple 모바일 standalone에 가깝게 묶여 있다.
- Android 모바일은 상대적으로 높은 render/update 비용을 유지한다.

### 구현 방향

- 모바일 공통 thermal profile 계산기를 만든다.
- 플랫폼별 예외가 아니라 “모바일 + 발열 우선” 기준으로 렌더/업데이트 파라미터를 조정한다.

조정 대상:

- render FPS cap
- simulation tick cap
- DPR cap
- HUD update interval
- minimap update interval
- 원격 플레이어 offscreen update cadence

### 핵심 원칙

- 시각 요소를 제거하지 않는다.
- 품질을 끄는 대신, 갱신 빈도와 내부 해상도를 합리적으로 제한한다.

## Phase 6. GameLoop 구조 최적화

### 목표

렌더만 줄고 update는 60Hz인 현재 구조를 개선해 CPU 사용을 직접 낮춘다.

### 현재 문제

- render FPS를 낮춰도 update는 fixed 60Hz
- 결과적으로 CPU와 배터리 이득이 제한적

### 구현 방향

- `render cadence`와 `simulation cadence`를 분리한다.
- 모바일에서는 `45Hz simulation`을 1차 목표로 하고, thermal fallback으로 `30Hz`까지 고려한다.
- 입력/충돌/전투 판정 체감이 흐려지지 않도록 보간 및 state transition 처리만 보완한다.

### 기대 효과

- CPU 점유율 감소
- 발열과 배터리 소모 감소

### 주의점

- 공격 타이밍, 채널링 tick, 차지형 패턴이 달라지면 안 된다.
- 전투 관련 timer는 초 단위 기반으로 유지해 update Hz 변화의 영향을 최소화해야 한다.

## Phase 7. HUD·미니맵·UI 합성 비용 절감

### 목표

모바일에서 비싼 DOM/CSS 합성 비용과 HUD 갱신 빈도를 줄인다.

### 현재 문제

- blur/backdrop-filter가 모바일에서도 여러 계층에 남아 있다.
- 미니맵과 일부 HUD가 비교적 잦은 cadence로 다시 그려진다.

### 구현 방향

- 모바일에서 blur 계층을 정적 반투명 배경 + gradient overlay 방식으로 치환한다.
- HUD는 “값이 변한 경우만” DOM 갱신하도록 통일한다.
- 미니맵은 이미 존재하는 simple mode를 모바일 공통 최적화 경로로 승격한다.
- 채팅, 퀘스트, 상태창 등의 갱신 주기를 목적별로 다시 나눈다.

### 기대 효과

- GPU 합성 비용 감소
- 스크롤/팝업/HUD 동시 노출 시 발열 완화

## Phase 8. 백그라운드·재진입·PWA 캐시 점검

### 목표

화면을 안 보는 동안 발생하는 불필요한 CPU/네트워크 사용을 줄이고, 정적 자산 재다운로드를 최소화한다.

### 현재 문제

- 숨김 상태에서 렌더 pause는 있으나, 일부 네트워크 타이머와 presence 경로는 더 공격적으로 줄일 여지가 있다.
- 서비스 워커는 기본적으로 local asset network-first 성향이 강하다.

### 구현 방향

- `visibilitychange`, `pagehide`, `freeze`, `resume`에 대한 lifecycle policy를 정교화한다.
- hidden 상태에서는 다음을 저빈도로 낮춘다.
  - heartbeat
  - local cleanup
  - HUD/minimap timer
- foreground 복귀 시 필요한 즉시 sync만 수행한다.
- 정적 자산은 version-aware cache-first로 바꾸고, `version.txt`만 network-only 유지한다.
- Firebase 요청은 계속 service worker 우회 대상으로 유지한다.

### 기대 효과

- 앱 전환, 화면 잠금, 재진입 상황에서 발열과 데이터 사용량 감소
- 재접속시 정적 자산 중복 다운로드 감소

## 7. 구현 우선순위

이번 설계의 권장 적용 순서는 다음과 같다.

1. Phase 0 계측 추가
2. Phase 2 이동/heartbeat cadence 재설계
3. Phase 3 프로필 저장 구조 최적화
4. Phase 4 몬스터 동기화 재설계
5. Phase 5 모바일 thermal profile 통합
6. Phase 6 GameLoop 구조 최적화
7. Phase 7 HUD/UI 합성 비용 절감
8. Phase 8 백그라운드/PWA 캐시 정리
9. Phase 1 플레이어 hot path 분리 마이그레이션 완료

주: 실제 코딩 순서는 일부 병행 가능하지만, 측정 없이 구조 변경부터 들어가면 효과 검증이 어려우므로 계측이 항상 선행되어야 한다.

## 8. 검증 기준

최적화 성공 여부는 아래 기준으로 판단한다.

### 8-1. 패킷 지표

- `rtdbWritesPerMin` 40% 이상 감소
- `movePacketsPerMin` 40% 이상 감소
- `monsterWritesPerMin` 30% 이상 감소
- `profileSavesPerMin` 50% 이상 감소

### 8-2. 발열/배터리 지표

- 동일 플레이 조건에서 모바일 CPU 사용시간 유의미 감소
- 30분 이상 플레이 시 체감 발열 단계 완화
- 장시간 플레이 중 프레임 드랍 빈도 감소

### 8-3. 체감/기능 지표

- 이동이 이전보다 끊겨 보이지 않을 것
- 스킬 시전 타이밍과 전투 판정 체감이 달라지지 않을 것
- 멀티플레이에서 다른 플레이어 위치/HP/스킬 연출이 유효하게 유지될 것
- 저장/복구/연동 동작이 기존과 동일하게 유지될 것

## 9. 명시적 비범위

이번 설계는 아래 항목을 다루지 않는다.

- 신규 기능 추가
- 스킬/이펙트 삭제
- 밸런스 조정
- 서버 권위 구조로의 전면 전환
- Firebase 외 다른 백엔드 도입
- UI 재디자인 자체를 목적으로 한 변경

## 10. 결론

현재 문제는 단순히 “렌더링이 무겁다”가 아니라, 모바일에서 다음 세 가지가 동시에 발생하는 구조적 문제에 가깝다.

- update 루프가 너무 자주 돈다.
- RTDB hot path write가 너무 많다.
- 모바일 전용 저전력 경로가 제한적으로만 적용된다.

따라서 이번 최적화는 기능을 줄이는 방식이 아니라, 다음 방향으로 가야 한다.

- 더 적게 보내되, 더 똑똑하게 보간한다.
- 더 적게 갱신하되, 보이는 결과는 유지한다.
- 모바일 전체에 통합된 thermal profile을 적용한다.

이 문서는 이후 실제 구현 시 `패킷 최적화`, `발열 최적화`, `검증/롤아웃` 작업의 기준 설계서로 사용한다.
