## Scope

- Shared-field minimap consistency between host and guests
- Safe RTDB scaling behavior for 3 to 10+ simultaneous players
- Preserve visible gameplay UX while reducing unnecessary field-wide chatter

## Phase

- Multiplayer stabilization on `mmorpg_online`
- Keep current browser-hosted authoritative model intact

## Changes

- Added a minimap-only monster snapshot path so guests no longer depend on combat-sync coverage for minimap dots.
- Host publishes compact monster minimap payloads at most every 0.5s and only when the content changes.
- Guests read minimap snapshot data only for the current field and only when the snapshot matches the active host.
- New hosts immediately republish minimap state on promotion so guests do not wait for the next regular interval after a visible-host handoff.
- Coalesced peer-driven monster keyframe sync around cells so multiple players entering or crossing the same area do not fan out into duplicate force-sync bursts.
- Tightened far-peer hot-path tiering for larger same-field peer counts so distant users move to `minimal` sooner once peer count reaches 6+, and even sooner once fields reach 10+ peers.
- Reduced peer-triggered monster keyframe neighborhoods to exact-cell sync once shared-field peer count reaches 6+, relying on existing cell subscriptions for adjacent-cell hydration.

## Files

- `src/js/core/NetworkManager.js`
- `src/js/world/MonsterManager.js`
- `src/js/world/scenes/WorldScene.js`

## Tradeoffs

- Guest minimap monster dots are now slightly quantized, which is acceptable for minimap readability and much cheaper than widening full monster subscriptions.
- Peer hot-path tiering stays conservative for nearby players to avoid visible combat regressions.
- This does not solve all 10+ player scaling concerns, but it removes two high-yield shared-field multipliers without changing core combat authority.
- Host handoff remains browser-driven client authority, so hidden-tab throttling risk is reduced but not eliminated if every participant backgrounds the game.
