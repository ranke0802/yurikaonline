# 보안 및 서버 권한 이전 계획

**운영 보안은 미완료다.** 현재 운영 규칙 파일의 root read/write는 true이며 변경하지 않았다. 클라이언트가 경제와 실시간 호스트 쓰기에 의존하므로 강화 후보를 운영에 적용하면 게임이 중단된다. 배포·운영 데이터 마이그레이션은 실행하지 않았다.

| 경로 | 현재 작성자 | 이전 정책 |
|---|---|---|
| users/UID/profile | 본인 클라이언트, 열린 Rules로 타인도 가능 | 본인 비민감 name만 제한 허용, 경제 결과 서버 |
| users/UID/activeSession | 클라이언트 writer session | 서버 발급·epoch/token 검증 |
| users/UID/profileBackups, recovery_profiles/UID | 클라이언트 복구/백업 | 서버 전용, 본인 복구 검증 API |
| names/name | 클라이언트 transaction | 서버 rename/createCharacter 유일성 검증 |
| zones/room/players, monsters, monster_cells, host snapshot | 플레이어·선택된 클라이언트 호스트 | intent만 사용자 작성, 결과는 신뢰 서버 |
| zones/room/*damage*, drops, drop_collection | 공격자·호스트·수집자 | validateAttack/settleDeath/collectDrop |
| friend_threads/*/messages, gift | 참여자 클라이언트 | 참여자 읽기, 메시지 검증, 선물 서버 원장 |
| users/UID/friends, friend_thread_meta, friend_messages | 본인·친구 클라이언트 | 관계 검증, 길이·빈도 제한 |
| together_requests, together_responses, 파티/PvP | 요청자·참여자 | 초대·참여 검증, 결투 결과 서버 계산 |

실제 경로는 [NetworkManager](C:/dev/yurika_online/src/js/core/NetworkManager.js:1)의 `_getProfileRef`, `_getProfileRevision`, 친구 메시지·선물·together 메서드에서 확인했다. 전투·치명타·경험치·재화·인벤토리는 [Player](C:/dev/yurika_online/src/js/entities/Player.js:1)의 계산과 `saveProfilePatch`로 연결된다. 퀘스트는 [QuestManager](C:/dev/yurika_online/src/js/core/QuestManager.js:1), 사망·드롭은 [MonsterManager](C:/dev/yurika_online/src/js/world/MonsterManager.js:1)로 이어진다.

기존 결정적 보상 ID/outbox/writer epoch/profile revision/중복 정산 방지는 안정성 장치다. 공격자가 소유한 클라이언트를 신뢰 서버로 만들지는 않는다. 관련 기존 runtime integration 테스트는 통과했으며 치팅 차단을 증명한 것은 아니다.

즉시 조치: 클라이언트 암호 제거, hasDeveloperAccess false, resetAllUserData 직접 호출 거부. SDK로 직접 DB를 조작할 위험은 열린 운영 Rules 때문에 남는다.

Emulator는 demo-yurika-audit 프로젝트와 loopback auth 9099/database 9000만 사용했다. 기존 규칙으로 무인증·타인 쓰기 2건이 허용되는 것을 확인한 뒤 후보 규칙으로 교체했다. 후보는 거부 7건/본인 name 수정 허용 1건을 통과했다. [후보 설정](C:/dev/yurika_online/firebase.emulator.json:1), [후보 규칙](C:/dev/yurika_online/database.emulator.rules.json:1), [테스트](C:/dev/yurika_online/scripts/validate-security-emulator.mjs:1).

서버 API 계약:

1. validateAttack(actorUid, fieldId, inputSeq, skillId, targetId): 토큰·위치·사거리·쿨다운·소유 스킬을 서버 상태로 검증한다. damage/crit 최종값을 입력으로 받지 않는다.
2. settleDeath(fieldId, monsterInstanceId, deathRevision): 서버가 사망을 확정하고 `fieldId:instanceId:deathRevision:uid` 원장 키를 선점한다. 원장과 프로필 지급을 원자적으로 처리하고 재요청에는 기존 결과를 반환한다.
3. collectDrop(dropId, claimId): 필드·거리·수량·미수령을 검증하고 인벤토리/원장을 함께 반영한다. 파티 분배도 같은 경계를 사용한다.
4. claimQuestReward(questId, claimId): 서버가 목적 진행과 자격을 검증한다. 선물은 보내는 사람 차감/받는 사람 지급/상태 변경을 원자적으로 수행한다.
5. adminCommand: 검증된 Custom Claims, 기본 거부, requestId·명령·대상·이전/이후 digest·시각 감사 로그. UI 표시와 명령 권한은 따로 검증한다.

이전 순서: 운영 백업 → 서버 API/shadow 검증 → staging 클라이언트 → 구 버전 쓰기 호환 차단 안내 → 실제 경로별 Rules와 Emulator 정상/거부 테스트 확장 → 제한 사용자 canary → 원장 검증 → 운영 Rules 전환. 마이그레이션은 UID 매핑과 복구 프로필 dry-run 후 멱등 수행한다. API/클라이언트를 함께 롤백하며 열린 Rules를 자동 복구책으로 사용하지 않는다. App Check는 abuse 보조 방어이며 사용자 권한/서버 전투 검증의 대체물이 아니다.
