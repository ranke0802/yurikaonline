# MMORPG 네트워크/Firebase 패치 제안서

작성일: 2026-02-13  
범위: 제안 패치 문서화(코드 미적용)

## 1) 목적

본 문서는 기존 제안 내용을 한국어로 정리한 패치 제안서입니다.
주요 목표는 다음과 같습니다.

- 프로젝트 안정성 및 유지보수성 개선
- 기능 변경 없이 Firebase Realtime Database 사용량 절감
- 게임 서버를 추가하지 않는 조건에서 보안 수준 개선

## 2) 핵심 진단 결과

### A. 렌더링/성능 중복

- `src/js/world/scenes/WorldScene.js`에서 플레이어 렌더링이 중복 수행됩니다.
  - `renderList.forEach(...)`로 1회 렌더
  - 이후 `this.remotePlayers.forEach(...rp.render...)`, `this.player.render(...)`로 재렌더
- `src/js/entities/Player.js`에서 HUD/방향 화살표를 같은 프레임에 2회 호출합니다.
- `src/js/world/scenes/WorldScene.js`의 `render()` 내부 동적 `import()`는 불필요한 오버헤드를 유발할 수 있습니다.

### B. 네트워크 로직 일관성 문제

- `src/js/core/NetworkManager.js`에 중복 메서드 정의가 있습니다.
  - `sendPlayerDamage`가 2회 정의되어 앞선 정의가 뒤 정의에 의해 덮어써집니다.
- 파티 초대 경로가 불일치합니다.
  - 초대 저장: `party_invites/...`
  - 응답 처리 시 삭제: `users/${uid}/invites/...`

### C. 리스너/타이머 해제 누락

- `connect()`에서 다수 Firebase `.on(...)` 리스너를 등록하지만, `disconnect()`에서 대응되는 `off()` 정리가 부족합니다.
- `visibilitychange` 이벤트 리스너가 재연결 시 중복 등록될 수 있습니다.
- 일부 interval 정리가 누락되어 세션 누적 시 부하가 증가할 수 있습니다.

### D. 보안 경계(구조적 한계)

- 현재 구조는 클라이언트 권한 비중이 높아, 서버 권위 모델 없이 완전한 치트 방지는 어렵습니다.
- 따라서 Rules/App Check/클라이언트 검증 강화가 필수 최소선입니다.

## 3) 제안 패치 Diff

### 3.1 중복 렌더 제거 및 렌더 루프 내 동적 import 제거

```diff
*** a/src/js/world/scenes/WorldScene.js
--- b/src/js/world/scenes/WorldScene.js
@@
-        if (this.player && this.player.currentTarget && !this.player.currentTarget.isDead) {
+        if (this.player && this.player.currentTarget && !this.player.currentTarget.isDead) {
             const t = this.player.currentTarget;
             const tx = t.x + t.width / 2;
             const ty = t.y + t.height;
-            import('../../skills/renderers/SkillRenderer.js').then(m => {
-                m.default.drawTargetMarker(ctx, tx, ty, t.width || 48, t.height || 48);
-            });
+            SkillRenderer.drawTargetMarker(ctx, tx, ty, t.width || 48, t.height || 48);
         }
@@
-        // v0.00.22: Off-screen culling for RemotePlayers render
-        this.remotePlayers.forEach(rp => {
-            if (this.isOnScreen(rp)) {
-                rp.render(ctx, this.camera);
-            }
-        });
-
         if (this.monsterManager) this.monsterManager.render(ctx, this.camera);
@@
-        if (this.player) {
-            this.player.render(ctx, this.camera);
-
+        if (this.player) {
             // spark / floating text / minimap only
             ...
         }
```

### 3.2 로컬 플레이어 HUD 중복 호출 제거

```diff
*** a/src/js/entities/Player.js
--- b/src/js/entities/Player.js
@@
-        // v0.00.03: Local HUD Rendering (HP/MP/Name above head)
-        this.drawHUD(ctx, centerX, y);
-        this.drawDirectionArrow(ctx, centerX, y + this.height - 30);
-
         // 9. v0.00.26: Status Effect Icons (Burn/Electrocuted)
         this._drawStatusIcons(ctx, centerX, y + this.height);
```

### 3.3 리스너 정리, visibilitychange 중복 방지, HP 동기화 쓰기 억제

```diff
*** a/src/js/core/NetworkManager.js
--- b/src/js/core/NetworkManager.js
@@
 constructor() {
@@
+    this._boundVisibilityChange = this._handleVisibilityChange.bind(this);
+    this._lastHpSync = { hp: null, maxHp: null, ts: 0 };
 }
@@
- document.addEventListener('visibilitychange', () => this._handleVisibilityChange());
+ document.removeEventListener('visibilitychange', this._boundVisibilityChange);
+ document.addEventListener('visibilitychange', this._boundVisibilityChange);
@@
 disconnect() {
     if (this._hbInterval) clearInterval(this._hbInterval);
+    if (this._localCleanupTimer) clearInterval(this._localCleanupTimer);
+    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
     this.stopBatchProcessor();
+    document.removeEventListener('visibilitychange', this._boundVisibilityChange);
+    if (this.dbRef) {
+        this.dbRef.child('users').off();
+        this.dbRef.child('monsters').off();
+        this.dbRef.child('monster_attack').off();
+        this.dbRef.child('monster_damage').off();
+        this.dbRef.child('monster_damage_batch').off();
+        this.dbRef.child('player_damage').off();
+        this.dbRef.child('player_damage_batch').off();
+        this.dbRef.child('drops').off();
+        this.dbRef.child('drop_collection').off();
+        this.dbRef.child('chat').off();
+        this.dbRef.child('system_messages').off();
+        this.dbRef.child(`rewards/${this.playerId}`).off();
+        this.dbRef.child(`party_invites/${this.playerId}`).off();
+        this.dbRef.child(`party_responses/${this.playerId}`).off();
+        this.dbRef.child(`damage_events/${this.playerId}`).off();
+        this.dbRef.child(`users/${this.playerId}/hostility_inbox`).off();
+        this.dbRef.child('emotes').off();
+    }
     this.connected = false;
@@
 sendPlayerHp(hp, maxHp) {
     if (!this.connected || !this.playerId) return;
-    this.dbRef.child(`users/${this.playerId}/h`).set([Math.round(hp), Math.round(maxHp), Date.now()]);
+    const now = Date.now();
+    const h = Math.round(hp);
+    const m = Math.round(maxHp);
+    if (this._lastHpSync.hp === h && this._lastHpSync.maxHp === m && (now - this._lastHpSync.ts) < 500) return;
+    if ((now - this._lastHpSync.ts) < 120) return;
+    this._lastHpSync = { hp: h, maxHp: m, ts: now };
+    this.dbRef.child(`users/${this.playerId}/h`).set([h, m, now]);
 }
@@
 async respondToInvite(inviteId, fromUid, accept) {
@@
-    await this.dbRef.child(`users/${this.playerId}/invites/${inviteId}`).remove();
+    await this.dbRef.child(`party_invites/${this.playerId}/${inviteId}`).remove();
 }
@@
- this.dbRef.child('chat').on('child_added', (snapshot) => {
+ this.dbRef.child('chat').limitToLast(80).on('child_added', (snapshot) => {
@@
-   if (this.isHost) {
-      const now = Date.now();
-      if (now - data.ts > 60000) snapshot.ref.remove();
-   }
 });
@@
- this.dbRef.child('emotes').on('child_added', (snapshot) => {
+ this.dbRef.child('emotes').limitToLast(120).on('child_added', (snapshot) => {
@@
-   if (this.isHost) {
-      snapshot.ref.remove();
-   }
 });
```

### 3.4 Firebase Rules 연동(서버리스 보안 최소선)

```diff
*** a/firebase.json
--- b/firebase.json
@@
 {
+  "database": {
+    "rules": "database.rules.json"
+  },
   "hosting": {
```

```diff
*** /dev/null
--- b/database.rules.json
+{
+  "rules": {
+    ".read": "auth != null",
+    "users": {
+      "$uid": {
+        ".read": "auth != null",
+        ".write": "auth != null && auth.uid === $uid"
+      }
+    },
+    "names": {
+      ".read": true,
+      "$name": {
+        ".write": "auth != null && (!data.exists() || data.val() === auth.uid)"
+      }
+    },
+    "zones": {
+      "$zoneId": {
+        ".read": "auth != null",
+        "users": {
+          "$uid": {
+            ".write": "auth != null && auth.uid === $uid"
+          }
+        },
+        "party_invites": {
+          "$targetUid": {
+            "$inviteId": {
+              ".write": "auth != null && newData.child('from').val() === auth.uid"
+            }
+          }
+        },
+        "damage_events": {
+          "$targetUid": {
+            "$eventId": {
+              ".write": "auth != null && newData.child('attackerId').val() === auth.uid"
+            }
+          }
+        },
+        "chat": { ".write": "auth != null" },
+        "emotes": { ".write": "auth != null" },
+        "monsters": { ".write": "auth != null" },
+        "drops": { ".write": "auth != null" },
+        "rewards": { ".write": "auth != null" },
+        "system_messages": { ".write": "auth != null" }
+      }
+    }
+  }
+}
```

## 4) 기대 효과

- 중복 렌더 제거로 클라이언트 CPU/GPU 부담 감소
- 불필요 write/read 억제로 RTDB 사용량 절감
  - HP 동기화 과다 쓰기 억제
  - 고빈도 이벤트 즉시 삭제 패턴 완화
  - 재연결 시 리스너 누적 방지
- 경로 불일치/중복 메서드로 인한 추적 어려운 버그 감소

## 5) 서버 없는 환경 보안 참고

- 전용 authoritative 서버가 없는 구조에서는 완전한 치트 방지는 불가능합니다.
- 현실적 최소 기준:
  - RTDB Rules 강화(인증/소유권/형식 검증)
  - Firebase App Check 강제
  - 클라이언트 측 sanity check 및 rate limit 유지

## 6) 권장 적용 순서

1. 렌더링/성능 패치(`WorldScene`, `Player`) 적용
2. `NetworkManager` 정리(중복/경로/해제) 적용
3. `database.rules.json` 추가 및 Rules 배포, App Check 활성화
4. 멀티플레이 회귀 테스트
   - 로그인/로그아웃/재접속
   - 파티 초대/수락
   - PvP 피해 동기화
   - 채팅/이모트 전파
   - Host 변경 시나리오

## 7) 문서 언어 원칙

- 요청하신 기준에 따라, 이후 작성하는 프로젝트 문서는 기본적으로 한글로 작성합니다.
- 코드, API 이름, 경로, diff 블록은 원문 식별성을 위해 영어 표기를 유지합니다.
