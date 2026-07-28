# `monster_asset` 기반 지역 확장 계획

- 작성일: 2026-07-28
- 상태: 제안 — 승인 전에는 게임 코드·밸런스·에셋을 변경하지 않는다.
- 목표: `C:\dev\monster_asset`의 5개 v2 스프라이트 시트를 이용해, 현재 `zone_4` 이후의 메인 진행을 두 개 지역으로 확장한다.

## 1. 전제와 원칙

현재 메인 진행은 `zone_1 → zone_4`와 `quest_epilogue_current_end`에서 끝난다. 신규 콘텐츠는 기존 퀘스트 JSON, 맵 이동 모달, 보스 보상 영수증, 전용 무기/강화 체계를 그대로 활용한다.

다음은 고정 원칙이다.

1. 맵·몬스터·드롭·퀘스트·권장 레벨은 JSON에서 선언한다. 신규 맵 ID별 조건문을 `UIManager`, `Player`, `NetworkManager`에 추가하지 않는다.
2. 보스 무기 지급은 기존 durable reward 경로가 담당한다. 퀘스트는 보상 안내와 다음 맵 추천만 한다.
3. 맵 이동은 기존 정책처럼 레벨만 하드락으로 유지하고, 이전 챕터 미완료는 퀘스트 추천/안내로 유도한다.
4. 전투 판정·보스 범위·피해·멀티 이벤트 형식은 바꾸지 않는다. 새 몬스터도 기존 `Monster`/`MonsterManager` 데이터 계약을 사용한다.
5. 새 배경·무기·효과 이미지는 배경 없는 투명 WebP 또는 맵용 WebP만 사용한다. 벡터 배경/장비 이미지는 만들지 않는다.

## 2. 확보 에셋 감사

| 원본 폴더 | 제안 게임 ID | 역할 | 원본 | 규격 | 배포 전 조치 |
| --- | --- | --- | --- | --- | --- |
| `agumonv3` | `ember_drake` | zone_5 일반 근접 몬스터 | WebP | 1536×2288, 8×11 | 원본 복사, 알파/셀 경계 감사 |
| `pachirisu-berry` | `spark_squirrel` | zone_5 일반 기동 몬스터 | PNG | 1536×2288, 8×11 | 원본 보관 후 투명 WebP 변환 |
| `ultrasevenv2` | `rift_sentinel` | zone_5 보스 | WebP | 1536×2288, 8×11 | 원본 복사, 보스 contentBounds 감사 |
| `devimonv2` | `fallen_wing` | zone_6 일반 엘리트 몬스터 | WebP | 1536×2288, 8×11 | 원본 복사, 축소 렌더 검수 |
| `angemonv2` | `sanctuary_judicator` | zone_6 보스 | WebP | 1536×2288, 8×11 | 원본 복사, 큰 날개 셀 경계 감사 |

### 2.1 시트 적용 안전 계약

- 원본 5개 시트는 현재 몬스터 런타임의 v2 계약과 정확히 일치한다: `columns: 8`, `rows: 11`, `frameWidth: 192`, `frameHeight: 208`.
- 시트는 자르거나 재배치하지 않는다. 각 시트의 `idle`, `moveRight`, `moveLeft` 행만 먼저 감사·활성화하고, 나머지 행은 실제 동작 의미를 확인하기 전에는 사용하지 않는다.
- 몬스터마다 `contentBounds`, `alignContentToGround`, SHA-256을 JSON에 명시한다. 이는 발 위치 정렬과 잘림 방지의 필수 데이터다.
- 셀별 투명도 검사에서 내용이 셀 밖으로 닿거나, 검은/체커보드 배경이 알파 0이 아닌 상태이면 적용을 중단한다.
- 각 시트는 기존 몬스터처럼 `assets/resource/monsters/<game-id>/spritesheet.webp`로 복사한다. `C:\dev\monster_asset` 원본은 수정하지 않는다.

## 3. 확장 콘텐츠 제안

### Chapter 5 — 태초의 균열지 (`zone_5`)

| 항목 | 설계 |
| --- | --- |
| 권장 레벨 | 20–24, 입장 제한 Lv.20 |
| 콘셉트 | 별그늘 유적의 성좌 에너지가 지면을 갈라 이계 생물이 흘러든 붉은 균열 고원. 불·번개 속성이 섞인 위험 지대다. |
| 일반 몬스터 | `ember_drake`: 짧은 예고 후 불꽃 돌진. `spark_squirrel`: 빠른 번개 돌진과 짧은 고정형 전기 지대. |
| 보스 | `rift_sentinel`: 균열을 봉인하는 적색 감시자. 직선 광선, 넓은 도넛 장판, 고정 위치 낙하 공격만 사용한다. 유도탄은 없다. |
| 전용 무기 | `riftcore_staff` — 매직 미사일 계열의 고정 직선 관통/폭발 변형. 피해 지점은 발사 시점에 확정하며 추적탄은 만들지 않는다. |
| 맵 연출 | 갈라진 흑적 암반, 붉은 결정, 약한 전기 균열. 배경은 별도 픽셀 아트 WebP로 제작한다. |

### Chapter 6 — 붕괴한 성역 (`zone_6`)

| 항목 | 설계 |
| --- | --- |
| 권장 레벨 | 25–30, 입장 제한 Lv.25 |
| 콘셉트 | 균열 반대편의 부서진 공중 성역. 빛의 수호자와 타락한 날개 병력이 충돌한 최종 전선이다. |
| 일반 몬스터 | `fallen_wing`: 무거운 근접 돌진 후 짧은 암흑 원형 장판. 일반 몬스터지만 보스보다 작은 렌더 크기와 낮은 스탯으로 구분한다. |
| 보스 | `sanctuary_judicator`: 성역을 정화하려는 심판자. 성광 직선 레인, 안전지대가 있는 동심 원, 고정 지점 낙하 마법진 패턴을 사용한다. |
| 전용 무기 | `sanctum_staff` — 체인 라이트닝 계열의 성광 릴레이 변형. 기존 체인 대상 선택 규칙을 유지하고, 적중 지점에만 작은 고정 충격을 추가한다. |
| 맵 연출 | 구름 아래 부서진 석조 성당, 금빛 룬, 청백색 균열. 배경은 별도 픽셀 아트 WebP로 제작한다. |

`zone_6` 이후에는 현재 최종 콘텐츠를 새 에필로그로 갱신한다. `rift_sentinel`/`sanctuary_judicator` 반복 토벌, 전용 무기 옵션 변경, 강화, 소환 주문서 루프는 기존 정책을 그대로 사용한다.

## 4. 밸런스 설계 방식

정확한 HP/ATK/EXP 숫자를 선입력하지 않고, 기존 레벨 곡선에 맞춘 밴드 계산으로 JSON을 작성한다.

```json
{
  "progression": {
    "recommendedLevel": { "min": 20, "max": 24 },
    "targetNormalKillsPerLevel": { "min": 45, "max": 65 },
    "bossExpInNormalKillEquivalent": 10,
    "overlevelExpReduction": "inherit"
  }
}
```

계산 기준:

1. 각 지역 시작 레벨의 `maxExp`를 기준으로 일반 몬스터 45–65마리당 한 레벨이 오르도록 EXP를 결정한다.
2. 보스 EXP는 일반 몬스터 8–12마리 수준으로 시작하고, 퀘스트 EXP를 포함한 실제 플레이 테스트 후 조정한다.
3. 신규 일반 몬스터 방어력은 기존 보스 정책과 충돌하지 않도록 별도 JSON 값으로 둔다. 보스 방어력 0, 보스 넉백 1/10 규칙은 유지한다.
4. 상위 지역의 일반/보스 보상은 기존 드롭 정책을 상속한다. 신규 보스만 새 전용 무기와 소환 주문서를 추가한다.
5. 일반 몬스터의 전용 무기/축복 무기/강화석/옵션 변경석 확률은 `equipment_drop_rules.json`에서 선언하고, 코드에서 지역별 확률을 분기하지 않는다.

## 5. 데이터와 파일 구조

### 신규 데이터

```text
assets/data/zones/zone_5.json
assets/data/zones/zone_6.json
assets/data/monsters/ember_drake.json
assets/data/monsters/spark_squirrel.json
assets/data/monsters/rift_sentinel.json
assets/data/monsters/fallen_wing.json
assets/data/monsters/sanctuary_judicator.json
assets/data/items/riftcore_staff.json
assets/data/items/sanctum_staff.json
assets/data/items/*_affixes.json
assets/data/items/boss_summon_scroll_rift_sentinel.json
assets/data/items/boss_summon_scroll_sanctuary_judicator.json
assets/data/quests/quest_rift_*.json
assets/data/quests/quest_sanctuary_*.json
```

### 갱신 데이터

```text
assets/data/zones/zone_catalog.json
assets/data/items/item_catalog.json
assets/data/items/equipment_drop_rules.json
assets/data/quests/quest_catalog.json
```

### 런타임 변경 원칙

기존 JSON 계약으로 표현 가능한 내용은 코드 변경 없이 추가한다. 아래 공통 개선만 한 번 구현한다.

| 영역 | 변경 | 이유 |
| --- | --- | --- |
| 아틀라스 감사 | `scripts/audit-v2-monster-atlas.mjs` | 각 셀 알파/경계/contentBounds/SHA-256을 자동 검사 |
| 월드 검증 | `scripts/validate-world-content.js` 확장 | zone/monster/drop/item/quest 상호 참조와 v2 시트 규격 확인 |
| 밸런스 시뮬레이션 | `scripts/validate-progression-band.mjs` | 요구 레벨·EXP·보스 보상으로 목표 처치 수 밴드 확인 |
| 리소스 로드 | 현재 로더 감사 후 zone 진입 시 lazy load | 5개 신규 시트를 첫 부팅에 모두 내려받지 않기 위함 |

`NetworkManager`, 보상 영수증 형식, 몬스터 공격 이벤트, 호스트 인계 알고리즘은 변경하지 않는다.

## 6. 제작 및 적용 순서

### Phase A — 에셋 격리·검수

1. 원본 SHA-256, 규격, 셀별 투명도, 내용 경계를 기록한다.
2. PNG 파치리스만 원본을 보존한 채 투명 WebP로 변환한다. 캔버스 크기와 8×11 셀 배치는 유지한다.
3. 각 시트를 새 경로로 복사하고, `contentBounds`·SHA-256이 담긴 몬스터 초안 JSON을 만든다.
4. idle/좌·우 이동 3행을 1×, 1.5×, 보스 크기에서 캡처 검수한다.

완료 조건: 한 셀에 이웃 프레임이 보이거나 발/날개가 잘리지 않으며, 검은 사각형 배경이 없다.

### Phase B — zone_5 세로 슬라이스

1. `zone_5` 배경 WebP와 `ember_drake`, `spark_squirrel`, `rift_sentinel` JSON을 추가한다.
2. 기존 텔레그래프/VFX 계약만 이용해 돌진·직선·원형 패턴을 설정한다.
3. `riftcore_staff`, 접두사 풀, 드롭·소환 주문서·퀘스트 체인을 추가한다.
4. Lv.20 신규/기존 계정, 솔로, 2인 필드, 보스 소환 주문서를 검증한다.

완료 조건: zone_4 보스 후 미니맵에 추천 표시가 나오고, quest JSON만으로 zone_5 진행이 연결된다.

### Phase C — zone_6 세로 슬라이스

1. `zone_6` 배경 WebP와 `fallen_wing`, `sanctuary_judicator`를 추가한다.
2. `sanctum_staff`, 드롭·소환 주문서·퀘스트 체인을 추가한다.
3. zone_5 완료 후 Lv.25 이동 추천과 새 에필로그를 연결한다.

완료 조건: zone_6 진입/사망/부활/호스트 교체/보스 반복 토벌에서 보상과 퀘스트가 중복되지 않는다.

### Phase D — 성능·배포 검수

1. 신규 시트는 현재 맵과 다음 추천 맵만 prefetch하고, 나머지는 필요 시 로드한다.
2. 모바일 저사양 모드에서는 시트 해상도를 바꾸지 않고 VFX 프레임/파티클만 줄인다.
3. 10분 자동사냥, 최대 일반 몬스터 수, 보스 패턴, 2인 shared field에서 frame gap·메모리·RTDB listener/write 수를 기존 zone_4와 비교한다.
4. 서비스 워커 신규 에셋 캐시와 버전 갱신 뒤 첫 진입/재접속을 확인한다.

## 7. 필수 검증 체크리스트

- [ ] 5개 원본/배포 시트가 1536×2288, 8×11, 192×208과 SHA-256 계약을 만족한다.
- [ ] cell alpha/contentBounds 검증과 실제 PC·모바일 캡처에서 잘림·인접 셀 노출이 없다.
- [ ] 신규 몬스터/보스가 기존 공격 대상 적대, 사망/부활, 넉백, 자동사냥 경로를 그대로 사용한다.
- [ ] 신규 보스의 모든 공격은 색상 있는 예고 범위가 먼저 표시되고, 유도탄이 없다.
- [ ] 보스 무기 지급은 durable reward 한 경로만 사용하며, 퀘스트가 동일 무기를 중복 지급하지 않는다.
- [ ] 일반 무기 1%, 축복 무기 0.1%, 보스 축복 무기 10% 등 현재 드롭 정책이 신규 지역에도 검증된다.
- [ ] 기존 zone_1–zone_4 저장 데이터, 퀘스트, 보스 소환 주문서가 변하지 않는다.
- [ ] solo에는 신규 RTDB 지속 listener/write가 추가되지 않고, 2인 shared field에서만 기존 이벤트 계약으로 동작한다.
- [ ] `npm.cmd run validate`와 신규 아틀라스/진행 밴드 검증을 통과한다.

## 8. 범위 밖

- 기존 보스 스탯·무기 성능·드롭률의 재조정
- 플레이어 스킬 조작 방식 변경
- 신규 PvP 규칙 또는 유도탄 추가
- 계정/저장/중복 접속 메커니즘 변경
- 원본 `C:\dev\monster_asset` 파일 수정

## 9. 승인 후 첫 작업 단위

가장 안전한 첫 PR/커밋 단위는 **Phase A + zone_5 데이터만**이다. zone_6은 zone_5의 실제 렌더 크기·레벨 곡선·다운로드 예산을 확인한 뒤 별도 커밋으로 진행한다. 이 순서는 대규모 맵 확장 중 기존 저장/멀티/성능에 영향을 주는 범위를 작게 유지한다.
