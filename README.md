# 🎮 Yurika Online (유리카 온라인) - v0.02 (Online Refactor)

[**🎮 기존 라이브 데모 (v1.86 Legacy)**](https://yurika-online.web.app/)

**유리카 온라인: 리팩토링 프로젝트**는 기존의 단일 파일 구조였던 웹 게임을 **현대적인 모듈형 아키텍처**와 **실시간 멀티플레이어** 환경으로 재구축하는 대규모 개편 작업입니다.

---

## 🚀 v0.02 - 그래픽 시스템 복구 및 카메라 안정화 (2026-01-23)
리팩토링 과정에서 소실되었던 핵심 그래픽 요소들을 복구하고, 렌더링 파이프라인을 최적화했습니다.

- **캐릭터 애니메이션 복구 (Sprite Restoration)**
    - 기존의 단일 이미지 방식에서 **멀티 프레임 애니메이션(Walking/Attack)** 시스템으로 전환했습니다.
    - **크로마키(Chroma Key) 자동화**: `ResourceManager`에서 이미지 로딩 시 배경색(녹색)을 자동으로 감지하여 투명하게 처리합니다.
    - **동적 오토 크롭(Auto-Crop)**: 캐릭터의 실제 픽셀 영역만 계산하여 렌더링 효율을 높이고, 스프라이트 크기를 자동으로 최적화합니다.
- **카메라 시스템 재구축 (Camera System)**
    - `Camera.js` 모듈을 새로 구현하여 캐릭터 추적(Follow) 및 맵 경계 클램핑(Clamping) 기능을 적용했습니다.
    - 화면 크기 변경 시(Resize) 뷰포트가 자동으로 조정되도록 하여 모바일/PC 반응성을 확보했습니다.
- **배경 렌더링 개선 (Zone Rendering)**
    - 검은 배경 대신 타일형 **잔디 맵(Background Tiling)**을 적용하여 시각적 완성도를 높였습니다.
    - 월드 좌표계(World Space)와 화면 좌표계(Screen Space)의 변환 로직을 수정하여 배경이 정상적으로 스크롤되도록 고쳤습니다.

---

## 🏗️ v0.01 - 아키텍처 리팩토링 및 멀티플레이어 구현 (Phase 1~3)
기존 `main.js`의 거대했던 코드를 객체 지향적이고 유지보수 가능한 형태로 완전히 재설계했습니다.

### 1. 모듈형 아키텍처 (Architecture Refactoring)
- **Core 분리**: `GameLoop`, `InputManager`, `ResourceManager`, `EventEmitter` 등 핵심 엔진 로직을 독립 모듈로 분리했습니다.
- **Entity Component System**: `Entity` -> `Actor` -> `Player/Monster`로 이어지는 상속 구조를 설계하여 코드 재사용성을 높였습니다.
- **상태 관리**: 전역 변수 의존성을 제거하고, 각 매니저 클래스가 상태를 관리하도록 변경했습니다.

### 2. Firebase 기반 멀티플레이어 (Network & Backend)
- **Firebase Auth**: 구글 로그인 및 익명 로그인(Anonymous Auth)을 연동하여 사용자 계정 시스템을 구축했습니다.
- **Realtime Database (RTDB)**:
    - **실시간 좌표 동기화**: `NetworkManager`를 통해 플레이어의 이동(x, y, vx, vy)을 서버에 전송하고, 다른 플레이어들의 정보를 수신합니다.
    - **Dead Reckoning**: 네트워크 지연을 보정하기 위해 선형 보간(Linear Interpolation)과 추측 항법을 적용하여 끊김 없는 움직임을 구현했습니다.

### 3. PWA (Progressive Web App) 도입
- **Service Worker**: 오프라인 지원 및 캐싱 전략(Cache-first)을 적용하여 로딩 속도를 획기적으로 개선했습니다.
- **Web App Manifest**: 모바일 홈 화면에 앱처럼 설치할 수 있는 기능을 추가했습니다.

---

## 🔮 향후 로드맵 (Roadmap)

### Phase 4: 전투 및 콘텐츠 복구
- [ ] **공격 동기화**: 다른 플레이어의 공격 모션 및 효과 동기화
- [ ] **몬스터 AI 복구**: 서버(혹은 호스트) 기반의 몬스터 스폰 및 동기화
- [ ] **채팅 시스템**: 실시간 대화 기능 구현

### Phase 5: 데이터 시스템
- [ ] **인벤토리 및 아이템**: DB 연동을 통한 영구적 아이템 저장
- [ ] **성장 시스템**: 경험치 및 레벨업 데이터 저장

---

*Developed by ranke0802 & Antigravity (Google Deepmind)*

