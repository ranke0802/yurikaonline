# Monster AOI Phase 2 Rollout Note

Created: 2026-04-07
Status: implemented locally, pending multiplayer runtime validation
Scope: guest-side AOI delivery, host snapshot takeover restore, safe host-local monster authority

---

## Implemented

- `src/js/core/NetworkManager.js`
  - guest monster delivery now subscribes to `monster_cells/{cellId}` using a 3x3 neighborhood
  - host publishes authoritative monster state to both `monster_cells/{cellId}/{monsterId}` and `monster_host_snapshot/{monsterId}`
  - cell migration removes the previous `monster_cells/{oldCellId}/{monsterId}` path in the same batch
  - world reset now clears `monster_cells` and `monster_host_snapshot` together
- `src/js/world/MonsterManager.js`
  - host now instantiates spawned monsters locally before publishing network state, so host logic no longer depends on receiving its own database echo
  - promoted hosts restore missing or stale monsters from `monster_host_snapshot`
  - restored monsters keep their revision baseline so post-takeover packets stay monotonic
- `src/js/world/scenes/WorldScene.js`
  - host promotion now reloads spawn rules and immediately triggers snapshot restoration

## Safety Choices

- Empty snapshot restore is conservative.
  - If `monster_host_snapshot` is empty, the promoted host does not aggressively delete its current local monster set.
  - This avoids accidental despawn during rollout while mixed old/new clients may still exist.
- Guest AOI pruning only removes monsters that leave the subscribed cell neighborhood.
  - Actual stale packet rejection still depends on `rev/ts` from phase 1.

## Tradeoff

- Upstream write count per monster update is somewhat higher because host snapshot writes are maintained alongside AOI delivery writes.
- Guest-side download fan-out should drop materially because clients no longer subscribe to the full global monster list.

## Next Validation Pass

1. Host present, guest joins late in the same field.
2. Confirm guest receives current monster HP, movement, and death state.
3. Confirm host takeover restores monsters outside the new host's current AOI.
4. Measure RTDB download delta before/after with two or more clients connected.
