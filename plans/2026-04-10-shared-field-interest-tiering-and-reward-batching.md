# 2026-04-10 Shared Field Interest Tiering and Reward Batching

## Context
- Shared-field multiplayer is currently billed by Firebase Realtime Database traffic.
- Two users farming far apart still generate high download volume because the runtime subscribes to the same field-level hot paths regardless of practical interaction distance.
- Reward delivery was also emitting many small per-event writes, which made normal auto-hunt sessions look like anti-cheat noise.

## Decision
We will reduce RTDB chatter without changing player-perceived responsiveness by applying three rules:

1. Remote user hot-path subscriptions are tiered by interaction distance, not viewport visibility.
   - Near: keep the full existing hot path.
   - Mid-distance same field: keep only coarse state needed for names, rough position, party, and hostility.
   - Far same field: keep the lightest stable state, while preserving party HP subscriptions.
   - Reduced and minimal tiers should listen to profile fragments instead of the full profile object, and they should clear remote equipment visuals until the target comes back near enough for a full hydration.

2. Regular rewards are batched into short windows before being written to RTDB.
   - Target window is sub-second so the player should not perceive delay.
   - Boss-critical rewards stay immediate.
   - Host self-rewards stay immediate and local to preserve HUD/log responsiveness.

3. Reward anti-cheat validation is evaluated on rolling totals per minute, with summary logging.
   - We care about abusive total throughput, not raw reward event count.
   - Logs should summarize the blocked window rather than spam per event.

## Files
- [src/js/core/NetworkManager.js](c:\dev\yurika_online\src\js\core\NetworkManager.js)
- [src/js/entities/Player.js](c:\dev\yurika_online\src\js\entities\Player.js)

## Runtime Expectations
- Nearby players still feel unchanged.
- Party members continue to see HP at distance.
- Host local loot/exp/gold feedback remains immediate.
- Guests may receive normal farming rewards in tiny batches, but the delay should stay below noticeable UX thresholds.
- King slime and other cycle-critical rewards remain immediate.

## Follow-up Validation
- 2-player auto-hunt for 30 to 60 minutes, both near and far apart.
- Check Firebase download total and rules evaluation trend.
- Check guest-side quest progression for aggregated slime kill rewards.
- Check that anti-cheat logs emit one summary per blocked window instead of repeating every event.
