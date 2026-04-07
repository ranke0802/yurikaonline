# Multiplayer Sync, Input, Tutorial Recovery

## Scope

- Stabilize shared-field multiplayer presence and host selection without regressing the recent RTDB AOI work.
- Restore consistent monster authority for 2-player combat.
- Bring PC fireball input closer to the mobile aim-and-release flow.
- Reduce tutorial guide overlap with key mobile HUD targets.

## Phase

- Recovery / hardening pass after AOI phase 2 rollout.
- Keep the current host-authoritative monster model and `monster_cells` delivery.
- Avoid schema changes that would require Firebase rule or migration work.

## Files Impacted

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`
- `src/js/core/input/TouchHandler.js`
- `src/js/ui/UIManager.js`
- `assets/data/tutorials/basic_training.json`

## Decisions

1. Presence writes are treated as valid liveness for host election.
   - `connectedUsers` and `userLastSeen` are refreshed from `/presence`.
   - Shared-field / host election no longer waits on `/users/{uid}` hot-path updates alone.

2. Idle presence timing is tightened before stale cleanup.
   - Idle/background heartbeat windows stay below stale removal thresholds.
   - This reduces `sharedFieldActive` flapping and accidental ghost cleanup.

3. Monster authoritative flow stays host-driven.
   - Fix spawn payload completeness (`rev`) rather than relaxing host authority.

4. PC fireball input reuses the mobile aim pipeline.
   - Mouse-hold on the fireball HUD button aims.
   - Mouse release fires.
   - Keyboard `U` remains immediate cast in facing direction.

5. Tutorial placement is corrected in two layers.
   - Problematic skill-open steps use safer mobile layouts in data.
   - The layout engine now treats HUD focus areas as higher-risk on mobile.

## Tradeoffs

- Presence writes happen a bit more often when idle, but they are much smaller than a full shared-field desync recovery.
- Remote player disappearance and monster authority drift are prioritized over the smallest possible idle RTDB footprint.

## Follow-up

1. Run a 2-client verification pass for:
   - idle remote visibility
   - host/guest monster spawn consistency
   - host/guest damage consistency
   - host takeover after disconnect
2. If drift remains, inspect monster attack / damage event ordering against `rev` and `ts`.
