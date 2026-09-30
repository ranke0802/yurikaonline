# Camp integration — implementation and resume

Branch: `codex/party-rpg-cloud-setup-20260930`. Base: `c0ae8a8`.

## First playable slice

Use the approved raster camp and mage artwork around the existing single-player
field engine. An account currently owns one wizard profile: do not invent a
four-character roster, currency conversion, party AI, or online shop/clan.
Camp -> select owned wizard -> original field/tutorial/combat -> original rewards
and progression -> save/flush -> camp. Returning to camp grants no extra reward.
The existing online authentication/profile recovery path remains in place.

## Local development

Run `python3 -m http.server 8100 --bind 127.0.0.1` from repository root.
Open `http://127.0.0.1:8100/?local=1` for the isolated local integrated game.
Local mode must not load Firebase SDK/config, CDN scripts or remote fonts.
It uses a separate versioned storage namespace and cannot import prototype gold,
levels, or live account credentials. Local saves belong to this browser/origin;
they are not cloud account backups. New profiles require explicit creation.
Do not open the ordinary online URL for QA against production Firebase.
The original visual-only prototype remains at `/party-rpg-concept/index.html`.

## Work plan / checks

1. Add local auth/network adapters with original profile shape and durable rewards.
2. Add camp scene and connect existing creation, field and save/exit paths.
3. Check loading/empty/read-error/save-error, refresh/re-entry/back, double rewards,
   desktop + Galaxy S23 + iPhone landscape. Block all external browser requests.
4. Run existing validation plus focused integration tests. Keep QA images/logs in
   `/tmp/yurika-integration-qa`, never commit large temporary screenshot output.
5. Commit/push this development branch; verify remote SHA. No deployment or merge.

## Release gates (not yet certified)

- Production account/session/recovery tests using an isolated staging project.
- Server-authoritative rewards, progression and shop/clan security rules.
- Asset provenance/licensing and final art approvals, accessibility, privacy and
  account deletion/data retention review, device performance and offline updates.
- Four-character combat/AI requires a separate design decision.

## Resume

Fetch/check out this branch explicitly: saved environment default ref is still
`master`. Mac is not required. Restart the local server after environment stop.
Read this file, git status, and the final QA notes before continuing. Never reset
user changes, push original branches, or modify live Firebase while testing.

## First-slice implementation (0.02.118)

- CampScene displays the original account/local profile, its one owned wizard,
  original EXP/manastone, and approved raster artwork. No prototype data import.
- Online account management (including logout/reset) is reachable from camp;
  existing authenticated handoff/recovery remains in CharacterSelectionScene.
- `?local=1` creates LocalAuthManager/LocalNetworkManager and omits remote scripts,
  Firebase configuration, remote fonts and service-worker registration.
- Local adapter preserves the original Player/MonsterManager combat and reward
  consumers. Balances and receipt acknowledgement share one storage write.
  A separate permanent receipt ledger prevents replay beyond the 128 recent IDs.
- Return uses original full-profile save/flush before leaving the world. Failure
  leaves the player in the field with retry available. Incomplete field entry
  cleans up without saving an old player instance.
- The local world respawns per entry/reload; profiles and reward receipts persist.
  This is device-local solo play, not authenticated multiplayer or anti-cheat.
  Use one tab. On stale-writer conflict, reload the entire page; profile refresh
  deliberately does not remove the write fence. Storage clearing deletes saves.
- No new game art was necessary for this slice: existing approved raster assets,
  original character sprites and skill/VFX assets are reused without substitutes.

## Verification evidence

`npm run validate:local-profile`: 14 checks, including actual original Player
reward consumers, >128-receipt replay, quota/crash recovery, stale tabs, denied
storage, drop claims, no remote social transport, and real MonsterManager host
handoff unblocking.

Existing quest/world/UI/hygiene/runtime/projectile validation passed; combat
14/14, resource cache 5/5, improvement/PWA 25/25, three zone5 atlas audits and
transparent VFX/item checks passed. Atlas outputs redirected to `/tmp`.

`npm run validate:camp-browser` uses Chromium with every non-local request
blocked. Desktop 1560×720, Galaxy S23 780×360 and iPhone 852×393 landscape
emulation cover explicit creation, empty/loading/read failure, character/camp
back, fresh tutorial return, field back confirmation, field entry/re-entry,
save failure/retry, refresh, and failed zone load recovery without profile writes.
Actual keyboard attacks kill the original slime; an EXP=99 fixture crosses the
level threshold. Replaying its receipt leaves growth unchanged; camp and reload
show persisted growth. Fixtures do not alter shipped game starting balances.

Screenshots + JSON report: `/tmp/yurika-integration-qa/`.
Regression logs: `/tmp/yurika-integration-regression/`.
These are ephemeral internal QA artifacts, not required game files. A camp
screenshot was additionally saved to ChatGPT Library for user delivery.

Not yet verified: real Android/iOS hardware, Safari, production online login/
recovery, remote account concurrency, long-session performance or release
readiness. No live Firebase requests, deployment, or original-branch merge.
