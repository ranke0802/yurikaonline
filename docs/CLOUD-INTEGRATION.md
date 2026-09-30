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

## Mobile combat polish (0.02.119)

- Field skill controls use frames from the existing lightning, missile, fireball
  and barrier raster atlases with Korean labels and stronger contrast. Existing
  character sprites and animated combat effects are preserved. Visual review did
  not justify new generated art for this slice; no image generation is claimed.
- Camp shows the saved expedition before/after level and EXP, net manastone
  change and occupied bag slots. This session journal is presentation only, never
  grants rewards, isolates local/account identities and hides stale results.
- Local failed profile patches are cloned and merged until a durable write
  succeeds, including when the next write only updates position. The field shows
  a persistent save warning and an actual retry button. Pending memory is not a
  durable backup: do not close/reload during storage failure. Stale-tab conflicts
  still require a full reload and do not bypass the write fence.
- Existing inventory/equipment/enhancement flows remain playable. Inspection
  found no implemented shop catalogue, price model or purchase API; no new shop
  economy or fake purchase flow was introduced. Clan and party AI remain deferred.

### Checks and artifacts

`validate:local-profile` passes 20 tests; `validate:adventure-summary` passes 3.
`validate:mobile-combat` passes real Chromium touch input at 780x360 and 852x393:
movement, barrier activation, fireball hold/aim/release, basic attack and original
slime kill, level threshold growth, receipt replay, repeated departure/return,
inventory equip and enhancement repeated taps, and saved reload. Fixture items
and EXP=99 are test-only. Missile activation was not separately demonstrated.
`validate:camp-browser` passes desktop 1560x720 and both mobile sizes, including
storage failure warning, retry-button recovery and all previous camp checks.
No browser JS errors or external requests occurred in these isolated checks.

All existing quest/world/UI/hygiene/runtime/projectile checks pass again, as do
combat 14, resources 5, improvement 25, three zone5 atlas audits and transparent
VFX/item checks. Logs: `/tmp/yurika-polish-regression/`. Touch report and captures:
`/tmp/yurika-polish-qa/mobile-combat-report.json`,
`galaxy-s23-touch-vfx.png`, `galaxy-s23-growth-return.png` (same directory).
Browser report: `/tmp/yurika-integration-qa/browser-report.json`.

Library batch upload of the two new screenshots failed during hosted-app tool
discovery with a network error; no new Library IDs were returned. Local PNGs are
preserved for delivery. These temporary paths are not phone-accessible links.

No authenticated port-forward URL is exposed by this environment. Sites owner
listing succeeded, so an owner-private static local-mode snapshot is an available
separate hosting option. No Site was created or deployed; await the user's reply
and coordinate the single deployment owner before doing so. Hardware Android/iOS,
Safari, long-session behavior and production account/security remain release
gates, not verified capabilities of this local initial version.

## Tutorial field-exit hotfix

The mobile first-run guide could cover the camp-return button during move_check
and attack_dummy. Tutorial placement now reserves that button's visible rectangle,
adds a below-button candidate and selects a non-overlapping candidate when one is
available. World entry refreshes the guide after mounting the return control.
No z-index, modal behavior, tutorial progress or reward logic was changed.

`node scripts/validate-tutorial-camp-return.cjs` checks fresh storage at 780x360,
real touch exit during move_check, reentry, joystick progression to attack_dummy,
confirmation-modal interception/cancel and actual touch return. Existing UI and
improvement checks and three-viewport camp browser regression pass. Sites rollout
belongs to the parent task; this checkout does not register or deploy a Site.
