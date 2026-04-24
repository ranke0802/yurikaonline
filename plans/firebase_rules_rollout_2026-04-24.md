# Firebase RTDB Rules Rollout Plan

작성일: 2026-04-24  
담당: Agent B, Firebase security/rules  
상태: 호환성 우선 초안 작성 완료, 이번 라운드에서는 배포하지 않음

## 목적

`database.rules.json`은 현재 클라이언트 권한 구조를 즉시 서버 권한 구조로 바꾸지 않는 전제의 배포 가능한 초안이다. 라이브 기능 보존을 최우선 게이트로 두고, 완전 공개 RTDB보다 한 단계 안전하게 인증 사용자만 읽기/쓰기를 허용한다.

이 초안은 보안 완성안이 아니다. 현재 앱은 클라이언트가 월드 상태, 보상, 선물, 강화 결과, 프로필 저장을 직접 기록하므로, 경로별 제한을 섣불리 넣으면 기존 기능이 깨질 수 있다. 따라서 이번 파일은 production 배포 전 반드시 에뮬레이터와 스테이징 데이터로 검증해야 한다.

## 이번 초안의 기본 정책

- 루트에서 `auth != null` 사용자에게 읽기/쓰기를 허용한다.
- 비로그인 공개 접근은 막는다.
- 경로별 소유권 제한은 이번 초안에 넣지 않는다.
- `users/*/profileBackups`에는 현재 `orderByChild('ts')` 조회를 위한 `ts` 인덱스만 추가한다.
- 더 강한 path-level rules는 Cloud Functions 이관 또는 에뮬레이터 검증 후 단계적으로 추가한다.

## 이번 라운드에서 배포하지 않는 이유

현재 앱은 보상, 선물, 강화, 드랍, 몬스터 호스트, 파티/함께하기 일부 흐름이 클라이언트 권한으로 동작한다. rules 초안은 비인증 공개 접근만 막는 방향이며, 실제 배포 전에 에뮬레이터와 최소 스테이징 데이터로 아래 경로의 쓰기/삭제 패턴을 확인해야 한다.

## 고위험 경로

- `zones/*`: 몬스터, 드랍, 채팅, 데미지, 보상, 파티, 적대 이벤트가 모두 클라이언트에서 기록된다.
- `zones/*/rewards/*`: 클라이언트가 보상 지급 이벤트를 생성한다.
- `zones/*/drops/*`, `zones/*/drop_collection/*`: 드랍 생성과 획득 요청이 클라이언트 권한이다.
- `zones/*/monster_damage*`, `zones/*/player_damage*`, `zones/*/damage_events/*`: 전투 결과 검증이 서버에 없다.
- `friend_threads/*/messages/*/gift`: 선물 상태 변경은 트랜잭션을 쓰지만 지급/차감 검증은 클라이언트에 있다.
- `users/*/profile`: 재화, 인벤토리, 장비, 강화 레벨, 퀘스트 진행이 클라이언트 저장값이다.
- `users/*/profileBackups`, `recovery_profiles/*`: `##UID` 복구 흐름 때문에 인증 사용자 읽기를 허용한다.
- `users/*/friends/*`, `users/*/friend_thread_meta/*`: 상대방 영역을 갱신하는 멀티 로케이션 업데이트가 있다.
- `names/*`: 이름 선점은 아직 rules로 제한하지 않으며 서버 트랜잭션도 아니다.
- `recovery_profiles/*`: 익명/구글 계정 전환과 복구 UID 흐름은 실제 계정 전환 케이스 확인이 필요하다.
- `together_requests/*`, `together_responses/*`: 상대방 inbox에 쓰는 구조라 rules 배포 전 양방향 테스트가 필요하다.

## 의도적으로 제한하지 않은 항목

- `zones/*` 소유권: 몬스터 호스트, 드랍, 보상, 파티, 전투 이벤트 작성자가 상황에 따라 바뀐다.
- `users/*/profile` 소유권: 현재 친구 검색, 복구 코드, 구글 연동/익명 계정 복구 흐름이 여러 프로필과 백업을 읽는다.
- `users/*/friends/*`: 친구 추가/삭제가 상대방 사용자 노드를 함께 갱신한다.
- `friend_threads/*`: 새 스레드 생성 시 participants와 첫 메시지가 같은 multi-location update로 작성된다.
- `friend_messages/*`, `together_requests/*`, `together_responses/*`: 발신자가 수신자 inbox에 쓰고 수신자가 읽은 뒤 삭제한다.
- `names/*`: 중복 확인과 이름 변경은 현재 클라이언트 직접 쓰기다.
- `recovery_profiles/*`: `##UID` 복구와 익명/구글 계정 전환이 현재 클라이언트 직접 읽기/쓰기다.

## 수동 에뮬레이터 검증 절차

1. Firebase Console에서 현재 production RTDB rules를 별도 백업한다.
2. production rules는 변경하지 않는다.
3. 로컬에서 Firebase CLI 로그인 상태를 확인한다.
4. `firebase emulators:start --only database,hosting`으로 rules 초안을 에뮬레이터에 로드한다.
5. 브라우저 두 개 또는 일반/시크릿 창으로 서로 다른 인증 사용자를 준비한다.
6. 사용자 A로 캐릭터 생성, 이름 등록, 로그아웃/재접속, 프로필 저장, 백업 생성 여부를 확인한다.
7. 사용자 B도 같은 절차를 수행하고, A의 이름 중복 생성이 거부되는지 확인한다.
8. 두 사용자가 `zone_1`에 진입해 presence, 위치 동기화, 채팅, 이모트, 시스템 메시지가 동작하는지 확인한다.
9. 전투, 몬스터 스폰/제거, 드랍 생성, 드랍 획득, 보상 수령, 미니맵 몬스터 스냅샷을 확인한다.
10. A가 B를 친구 추가하고, 양쪽 친구 목록과 프로필 조회가 정상인지 확인한다.
11. 친구 채팅에서 텍스트 메시지, 마석 선물, 아이템 선물, 수령, 취소, 거절, 환불 알림 제거까지 확인한다.
12. 함께하기 요청, 수락, 거절, 응답 inbox 제거, 파티 상태 동기화를 확인한다.
13. 캐릭터 삭제 시 `users`, `names`, `zones/*/users`, `zones/*/presence`, `recovery_profiles` 정리가 실패하지 않는지 확인한다.
14. 위 흐름 중 permission-denied가 발생하면 해당 경로, 사용자 UID, 실행 액션, 콘솔 로그를 이 문서에 추가한 뒤 rules를 수정한다.

## 운영 배포 전 체크리스트

- 에뮬레이터에서 신규 가입, 기존 복귀 유저, 익명 계정, 구글 연동 계정을 각각 확인한다.
- 최소 2인 동시 접속으로 친구/함께하기/월드 동기화를 확인한다.
- production 데이터 백업과 현재 rules 백업을 완료한다.
- 배포 직후 rollback할 rules 파일을 준비한다.
- 배포는 트래픽이 낮은 시간대에 수동으로 진행한다.
- 배포 후 Firebase Console의 permission-denied 로그와 클라이언트 콘솔 오류를 집중 확인한다.

## Cloud Functions 이관 우선순위

1. 보상 지급: `zones/*/rewards/*`, 퀘스트 보상, 몬스터 처치 보상, 드랍 획득을 서버 검증으로 이관한다.
2. 선물 escrow: 발송 시 차감, 수령/취소/거절 시 지급 또는 환불을 단일 서버 트랜잭션으로 처리한다.
3. 장비 강화: 강화 재료 차감, 확률 판정, 성공/실패/파괴 결과를 서버 함수에서 확정한다.
4. 이름 선점: `names/*`를 Callable Function 또는 transaction 기반 API로 감싼다.
5. 인벤토리/재화 저장: 클라이언트 전체 profile 덮어쓰기 대신 서버 승인 patch로 축소한다.
6. 드랍과 전투 판정: 몬스터 사망, 기여도, 드랍 권한, 획득 권한을 서버에서 계산한다.
7. 월드 호스트 선출: `monster_host_snapshot`, `monster_cells`, `minimap_monsters`의 작성자를 서버 또는 검증된 host lease로 제한한다.

## 잔여 리스크

- `zones/*`는 호환성을 위해 인증 사용자 전체 쓰기를 허용한다. 공개 접근은 막지만 치트 방지는 되지 않는다.
- `users/*/profile`은 현재 호환성을 위해 인증 사용자 전체 쓰기를 허용한다. 클라이언트가 변조한 재화/인벤토리 값도 rules만으로 막을 수 없다.
- `users/*/profileBackups`와 `recovery_profiles/*`는 현재 복구 UX를 유지하기 위해 인증 사용자 전체 읽기를 허용한다.
- 친구 선물은 rules만으로 아이템 소유와 재화 잔액을 증명하지 못한다.
- `friend_threads/*`는 현재 호환성을 위해 인증 사용자 전체 쓰기를 허용한다. 서버 생성 스레드로 바꾸기 전까지는 신뢰 경계가 약하다.
- `recovery_profiles/*`의 특수 계정 전환 케이스는 실제 계정 시나리오 테스트가 필요하다.
