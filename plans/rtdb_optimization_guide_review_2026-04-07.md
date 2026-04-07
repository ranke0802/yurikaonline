# RTDB Optimization Guide Review

Created: 2026-04-07
Status: review only
Scope: evaluate external RTDB optimization guidance against the current Yurika Online implementation

---

## Summary

The shared guide is directionally good, but it assumes a cleaner event-driven architecture than the current project actually has.

For this codebase:

- several recommendations are already implemented in some form
- some are good next-step candidates
- a few would be actively risky if applied literally right now

The main rule for this project remains:

`host authority must stay global, while delivery optimization may be local/AOI`

---

## Already Implemented Or Largely In Place

- Guest-side monster AOI delivery
  - `monster_cells/{cellId}` 3x3 subscription is now in place
- Host-only monster HP mutation
  - clients send damage intents/events, host remains authoritative on monster state
- Multi-path updates
  - movement and monster sync already use batched `update()` paths in important hot paths
- Batching for combat events
  - monster/player damage already has batch nodes
- Local projectile rendering for remote players
  - remote fireball/missile visuals are reconstructed client-side from attack packets rather than fully syncing projectile state
- Persistent data separation
  - inventory / quest / progression live under user profile persistence, not combat hot paths
- Basic measurement hooks
  - estimated RTDB writes and bytes per minute are already instrumented in the dev HUD

---

## Good Candidates For Next Work

### 1. AOI for player realtime delivery

Current monster delivery is AOI-based, but player hot-path listeners are still attached per remote user under `zones/{room}/users/{uid}`.

Potential improvement:

- introduce field/cell-aware remote player delivery so guests stop listening to distant players outside nearby cells

Risk:

- moderate
- PvP targeting, party visibility, and social UX may need exceptions

### 2. Stronger event-bus split for monster combat

Current monster system still publishes authoritative position/HP snapshots, even after recent AOI work.

Potential improvement:

- push more short-lived combat outcomes as compact events
- keep monster state snapshots only for keyframes / correction / spawn / despawn / death

Risk:

- moderate to high
- current client interpolation and recovery logic still depends on periodic state snapshots

### 3. Better transform quantization

Current move sync already uses delta thresholds and compact hot-path fields, but coordinates are still sent as rounded pixel integers and velocities as floats.

Potential improvement:

- quantize velocity more aggressively
- optionally quantize position to a coarser fixed-point step if it does not hurt feel

Risk:

- low to moderate
- should be A/B tested on mobile movement feel first

### 4. Per-mode bandwidth reporting

The guide recommends idle / move / combat measurement separately.

Potential improvement:

- add categorized telemetry buckets for idle, movement-heavy, and combat-heavy windows
- compare before/after MB/hr estimates with 2+ clients

Risk:

- low
- good candidate for observability work before another round of deep network refactors

---

## Not Recommended To Apply Literally Right Now

### 1. "DB is not a state sync loop, only an event bus"

This is a good long-term principle, but applying it literally today would break the project.

Why:

- the current game still depends on authoritative state snapshots for player movement, monster correction, late join stabilization, and host takeover recovery
- removing state replication too early would increase visible desync, especially for guests joining mid-combat

Recommendation:

- treat this as a direction, not an immediate rewrite rule

### 2. "Transform <= 5Hz" as a blanket rule

For this project, a flat 200ms send interval is probably too blunt for player movement.

Why:

- the game currently supports direct movement and PvP interactions that feel noticeably worse with too-low transform cadence
- current adaptive intervals are already tighter for active movement and looser for idle/walk

Recommendation:

- keep adaptive thresholds
- optimize by context instead of forcing one global interval

### 3. Removing projectile-related attack packets entirely

The guide says to send only cast/result style events. That works best when the entire combat pipeline is designed around cast ids and deterministic resolution.

Why risky here:

- remote visuals currently piggyback on `playerAttack` packets and reconstruct fireball/missile visuals from those payloads
- replacing this with pure `cast_request` / `skill_result` requires reworking RemotePlayer visual playback, hit timing, chain logic, and weapon-effect metadata

Recommendation:

- keep current action packet approach for now
- consider gradual migration per skill, not a big-bang rewrite

### 4. Aggressive payload conversion to very short arrays everywhere

The guide's compact-array advice is valid in principle, but applying it broadly right now would reduce debuggability and increase migration risk.

Why:

- the project is in active iteration and content balancing
- several systems still benefit from readable object payloads for debugging and hotfix work

Recommendation:

- only compress the hottest paths after telemetry proves they matter

---

## Project-Specific Constraints The Guide Does Not Know

- Host takeover is mandatory.
  - Any optimization must preserve recovery when host ownership changes.
- Late join stability matters more than raw byte savings.
  - Guests entering an already-active field must see believable monster HP and movement quickly.
- The project mixes PvE, PvP, party, tutorial gating, and field participation toggles.
  - Simple MMO advice often ignores these overlapping rules.
- Solo and shared-field modes behave differently.
  - Some hot writes are intentionally suppressed in solo-like states already.

---

## Recommended Priority Order

1. Validate the new monster AOI + host snapshot rollout in real multiplayer sessions.
2. Add better telemetry for idle / move / combat byte estimates.
3. Optimize player delivery scope before attempting a full event-bus rewrite.
4. Only then evaluate per-skill cast/result migration for the heaviest abilities.

## Bottom Line

The guide is useful as a direction check, not as a copy-paste implementation plan for this project.

Best fits right now:

- keep AOI
- keep host authority
- improve measurement
- narrow delivery scope further

Worst fits right now:

- removing state snapshots too aggressively
- forcing universal low-frequency transform sync
- rewriting all combat networking around pure cast/result packets in one step
