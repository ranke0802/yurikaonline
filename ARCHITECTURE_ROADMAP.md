# 🏗️ Yurika Online 차세대 아키텍처 심층 계획서

## 1. 아키텍처 비전 (Vision)
**"Serverless Hybrid MMORPG"**
완전한 권한 서버(Dedicated Server)를 구축하는 것은 비용과 유지보수 측면에서 1인/소규모 개발팀에 과도한 부담이 됩니다. 따라서, 현재의 **Firebase 기반 Serverless 구조의 생산성**을 유지하면서, **Cloud Functions를 통해 핵심 로직의 보안성**을 확보하는 **하이브리드 아키텍처**를 제안합니다.

---

## 2. 단계별 진화 전략 (Evolution Strategy)

### Phase 1: 개발 생산성 및 안정성 확보 (DX & Stability)
가장 시급한 것은 코드의 복잡도를 제어하고 배포의 불확실성을 없애는 것입니다.

*   **모듈 번들링 시스템 도입 (Vite)**
    *   **현황:** 브라우저 네이티브 ESM 사용 중. 파일이 늘어날수록 네트워크 요청 급증.
    *   **제안:** Vite 기반 빌드 파이프라인 구축.
    *   **효과:** HMR(Hot Module Replacement)로 개발 속도 3배 향상, 프로덕션 최적화(Minify/Uglify) 자동화.
*   **정적 타입 시스템 도입 (JSDoc + TS Check)**
    *   **현황:** `player.hp`가 숫자인지 문자열인지 런타임에만 알 수 있음.
    *   **제안:** TypeScript로 전면 전환보다는, JSDoc 주석(`@param`, `@type`)을 달고 `ts-check`를 활성화하여 코드 수정 없이 타입 안전성 확보.
*   **설정 데이터의 자산화 (Data-Driven)**
    *   **현황:** 스킬 데미지 공식이 `Player.js` 안에 하드코딩.
    *   **제안:** `assets/data/skills.json`, `assets/data/monsters.json` 등으로 분리 및 로더 구현. 기획 변경 시 코드 수정 없이 배포 가능.

### Phase 2: 보안 아키텍처 - 하이브리드 검증 (Security)
클라이언트가 모든 권한을 가진 현재 구조(Client Authoritative)를 타파합니다.

*   **핵심 경제 로직의 서버 이관 (Serverless Authority)**
    *   **전략:** 모든 이동/전투를 서버로 옮기면 느려집니다. **"돈과 관련된 것"**만 옮깁니다.
    *   **구현:**
        *   `buyItem(itemId)` 요청 -> 클라이언트가 처리 X -> **Cloud Functions** 호출
        *   Cloud Function: DB에서 유저 골드 확인 -> 차감 -> 인벤토리 추가 -> DB 갱신
        *   클라이언트: DB 변경 리스너를 통해 UI 업데이트
*   **전투 검증 시스템 (Async Verification)**
    *   **전략:** 즉각적인 반응성을 위해 데미지 표시는 클라이언트에서 선행 처리(Prediction)하되, 실제 HP 차감은 서버 검증을 거칩니다.
    *   **구현:**
        *   Cloud Functions에 `processHit` 함수 배포.
        *   공격 시 서버로 타임스탬프와 좌표 전송. 서버가 "사거리 내인지", "쿨타임인지" 검증 후 유효할 때만 데미지 적용.

### Phase 3: 확장성 및 네트워크 최적화 (Scalability)
동시 접속자가 50명을 넘어갈 때를 대비한 설계입니다.

*   **관심 영역 관리 (AOI: Area of Interest)**
    *   **문제:** 맵 구석에 있는 유저의 움직임까지 내 브라우저가 수신 중.
    *   **해결:** 맵을 그리드(Grid)로 나누고(예: `zone_1_0_0`, `zone_1_0_1`), 내 주변 그리드의 데이터만 구독(Subscribe)하는 로직 구현.
*   **상태 압축 (State Compression)**
    *   **제안:** 현재 JSON 객체(`{x:100, y:200}`)를 전송하는 대신, 프로토콜 버퍼(Protobuf) 혹은 단순 배열(`[100, 200]`) 기반의 바이너리 패킷 구조로 최적화하여 데이터 전송량 70% 절감.

---

## 3. 추천 기술 스택 (Tech Stack Recommendation)

| 분류 | 현재 기술 | **제안 기술** | 선정 이유 |
| :--- | :--- | :--- | :--- |
| **Language** | Vanilla JS | **JS + JSDoc** | 러닝커브 없이 타입 안전성 확보 |
| **Frontend** | HTML/CSS | **Vite** | 압도적인 빌드 속도 및 에셋 관리 편의성 |
| **Backend** | Firebase RTDB | **RTDB + Cloud Functions** | 실시간성은 유지하되 보안 로직 추가 |
| **State** | Class Properties | **Pub/Sub Pattern** | 컴포넌트 간 결합도 감소 (Spaghetti 코드 방지) |
| **Deploy** | Manual | **GitHub Actions** | `git push` 시 자동 빌드 및 배포 |

---

## 4. 아키텍트의 한마디 (Conclusion)

현재 Yurika Online은 **"재미"를 검증하는 단계**를 성공적으로 통과했습니다. 이제는 **"서비스"를 지탱할 뼈대**를 보강할 때입니다.

가장 먼저 추천드리는 것은 **Phase 1의 '데이터 분리'와 'Vite 도입'**입니다. 이 두 가지만 적용해도 개발 쾌적함이 달라지며, 이후의 복잡한 보안 로직을 쌓아올릴 수 있는 단단한 기반이 될 것입니다.
