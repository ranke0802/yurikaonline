# Camp integration — implementation and resume

Branch: `codex/party-rpg-cloud-setup-20260930`. Base: `c0ae8a8`.

Current delivery target: `mmorpg_online`, explicitly authorized by the user on
2026-09-30 for the existing Firebase Hosting live channel. The development branch
preserves the integration history. Sites deployment copies are separate and must
never overwrite the production online entry or Firebase configuration.

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

## WebP and content-addressed assets (0.02.120)

26 source PNGs were converted to lossless WebP: 50,356,689 -> 35,140,858 bytes
(30.2% reduction). The four PNGs used by the integrated game total 7,345,794 ->
4,988,116 bytes (32.1%). Dimensions/frame counts and all alpha/visible RGB pixels
were checked; RGB values hidden beneath fully transparent pixels may be normalized
by the encoder. No source has animation; original animated VFX remain unchanged
multi-frame raster atlases. Conversion details: `docs/webp-conversion.json`.
Original PNGs remain in Git for source/reference preservation, excluded from hosting.

`scripts/build-immutable-assets.mjs` publishes 177 images and static content files
under SHA-256-derived names in `assets/immutable/` and writes `AssetManifest.js`.
ResourceManager resolves logical paths to those identities before its existing
in-flight Promise and decoded-image caches. Camp, CSS skills, favicon and manifest
share the hashed files. Unchanged images/data survive release-version changes;
changed bytes produce new URLs. Keep old immutable files for older active clients.
To update PNG art run `node scripts/convert-png-to-webp.mjs`, then
`npm run assets:build`; run `npm run validate:assets` before committing output.
Do not mutate bytes at an existing immutable URL.

Immutable assets have one-year HTTP caching and a release-independent, bounded
service-worker cache (512 entries). HTML, code and manifest revalidate; version.txt
uses no-store. Client version refresh preserves content-addressed assets. Unknown
API/auth/account URLs bypass SW CacheStorage; non-public ResourceManager document
requests use no-store and no memory cache. Cache clearing, eviction/quota limits,
private browsing and a new browser/device can still cause downloads; this is not
a promise of permanent storage or a cross-device save backup.

Chromium CDP image wire measurement, 780x360, fresh local profile and a complete
camp -> character -> field -> camp journey: 10,644,656 -> 7,340,371 bytes (31.0%).
Cold network image transfers: 64 -> 59. Reentry and ordinary reload were already
zero bytes before this change and remain zero afterwards. Request events that
hit browser/SW memory/disk caches are not downloads. See `asset-transfer-results.json`.
The integrated pre-optimization hosting candidate (including prototype reference
files) was approximately 416 files / 68,392,798 bytes; filtered final candidate is
238 files / 17,815,842 bytes. This is a local ignore-pattern estimate, not a claim
about the previous live site's package size or CDN compressed transfer size.

Hosting excludes prototype pages/source art, development plans/docs/reports/tests,
DB rules, generated prompts and old modules. Runtime images/data are served from
immutable output. Default online auth and optional ?local=1 are preserved; no Sites
forced-local entry was imported. Both Hosting workflows run asset, resource, UI and
local-profile checks first; deployment remains action-hosting-deploy / hosting only.

Validation: all existing quest/world/UI/hygiene/runtime/projectile checks; combat
14, resources 5, improvement 25, local-profile 20, adventure-summary 3, asset checks
4; three atlas audits and VFX/item checks. Three-viewport camp regression passes on
a filtered runtime-only local server. Actual mobile combat, growth, equipment and
tutorial tests pass. New `npm run validate:asset-browser` verifies portrait first
entry -> landscape, reload reuse, new SW release reuse, changed-asset download and
API exclusion without any external requests. Logs are in `/tmp/yurika-asset-qa/`.
No live account login or production database writes were used for QA.

## Audio recovery (0.02.121)

Two reproducible gaps were found after the sound report: CampScene did not request
the original selection theme, and SoundManager removed its unlock handlers after
the first gesture. A later suspended context therefore stayed silent through
subsequent field touches (which can also stop event propagation). Existing BGM
scores, synthesized SFX and saved volume defaults were unchanged; audio score
paths are present in the immutable manifest. A fresh uninterrupted local field
already produced sound state in 0.02.120, so this is not a claim that every device
had the same interruption or that the user's exact phone state was observed.

Camp now requests the existing bgm_intro, including after field return, and plays
the existing UI click cue. SoundManager retains lightweight capture-phase gesture
handlers, resumes suspended/interrupted contexts and defers pre-initialization BGM
requests until a gesture permits playback. Field BGM selection remains unchanged.
Mute/volume settings are not overridden, and no new music or economic/gameplay
content is introduced.

`npm run validate:game-audio` exercises real 780x360 Chromium touch with gesture-
required autoplay: camp/field BGM, two field/return cycles, explicit context
suspension followed by the real attack button and nonzero SFX waveform, then saved
17% volume + mute surviving resume and reload. Master RMS was about 0.012–0.013;
post-resume attack SFX RMS about 0.019–0.020, while muted output was exactly zero.
`npm run validate:audio` renders all 9 original scores with finite nonzero samples
and no clipping, and checks effects, mute, score races and loop timing. Related
runtime/resource/improvement, three-viewport camp and tutorial checks also pass.

Evidence: `/tmp/yurika-audio-qa/`. These are synthesized PCM/analyser output and
browser playback-state checks, not human listening through the user's Android
speaker. Production verification additionally checks live audio runtime bytes,
intro/field score JSON and sound event JSON via the Hosting-only CI. No live
account login, database/security/Functions change or Sites entry patch is used.


## 0.02.122 — monster visibility repair (2026-09-30)

The reported disappearance was investigated separately from damage feedback. The current Monster renderer does not blink or hide its body on hit; hitTimer does not control sprite opacity. All 12 enabled monster definitions had nonempty runtime animation cells. Unused atlas cells remain excluded. However, the legacy slime background-removal algorithm deleted every pixel within RGB distance 100 of the upper-left background colour, including the pale green enclosed body. Browser-generated sheets reproduced large transparent holes varying between all five poses. This predates the audio fix; WebP conversion did not alter these existing slime WebP files.

The minimal fix restricts chroma removal to matching background pixels connected to the image edges. The original raster colours, five poses, cache, damage numbers, HP, sounds, and combat rules are preserved. Existing alpha-authored assets bypass this processing as before. No new flashing hit effect was added. Before processing fix the five cells had 11493/8920/14038/13817/13802 visible pixels; after: 31630/20419/30593/33730/33195. Contact sheets visually confirm intact bodies. This establishes a concrete rendering defect, not a claim of reproducing every possible network/device-specific disappearance.

`npm run validate:monster-visibility` runs isolated Chromium local-mode QA at 780x360, 852x393, and 1440x900. It checks all 12 monster definitions, an enclosed foreground/background same-colour regression, three simultaneous monsters, physical touch laser/fireball/missile controls, repeated/critical/periodic hits, and death/new-spawn visibility. Observed 2325 live draws and 391 damage calls, no hidden live sprite or opacity toggle; no page errors/external requests. Existing damage feedback remains non-blinking. Screenshots and report: `/tmp/yurika-monster-qa/{galaxy,iphone,desktop}-combat.png`, `galaxy-slime-frames.png`, `visibility-report.json`. Full existing validation, mobile combat/growth/inventory regression, audio gesture/output regression, local profile and immutable asset checks are rerun for this release. No live DB writes, real phone hardware, or live multiplayer session was used; browser touch/device emulation is not an actual Galaxy/iPhone test.

Hosting verification now checks exact deployed Monster.js bytes plus all five immutable slime WebPs, in addition to existing version/HTML/audio/assets checks. Online entry stays unchanged; deployment remains Hosting-only.


## 0.02.123 — online monster visibility (2026-09-30)

User retest confirmed 0.02.122 did not resolve the shared multi-species disappearance. Its slime chroma-key repair was a separate defect. This release reproduces the original production NetworkManager cell callbacks and MonsterManager guest update methods against a controlled transport fixture, without connecting Firebase or creating an account. Source removal followed by destination add with 350ms listener delivery skew produces 11/10/11 body-empty sampled frames for slime/squirtle/emolga in the pinned 0.02.122 baseline. The entity is deleted after 160ms and recreated on add. Independently, guest optimistic lethal damage starts a local death fade; a newer living HP snapshot (70) fails to clear isDead, and full snapshot restoration fails to restore alpha. All three species then produce zero body pixels even with positive authoritative HP.

Minimal repairs: guest damage prediction bottoms out at 1 HP until host-confirmed death; accepted positive authoritative states clear stale deathTimer/isDead/alpha; live cell removals have a bounded 1500ms migration grace, while confirmed-dead cleanup stays 160ms. Destination adds/changes cancel the pending removal. Actual despawn outside that grace and field-exit cleanup still remove entities. This tolerates short mobile cross-listener delays, not arbitrary outages; true live despawns can remain visible up to 1.5 seconds. Host damage/death and existing revision ordering remain authoritative. No new hide/show, white flash, tint, or UI feature was added.

`validate:online-monster-visibility` captures ~16ms body draw samples and actual Canvas2D sprite pixels using the original renderer (including its alpha), plus six-phase contact sheets. Baseline is served from pinned git 29293fa via browser request routing. After the fix: zero empty living samples, same entity across migration, positive visible body pixels after living updates and snapshot recovery for all three species. Confirmed death, stale-death rejection, bounded despawn and field-exit timer cancellation pass. `validate:monster-authority` adds three Node regressions and runs in existing Hosting CI. Existing full validation, 12-species/3-viewport local visibility, mobile touch combat/growth, and audio regression remain part of verification.

Evidence: `/tmp/yurika-online-monster-qa/baseline.json`, `fixed.json`, `baseline-contact.png`, `fixed-contact.png`. Pixel sampling isolates the body drawn by Monster.render; it is not a real user's session recording. Browser mobile emulation and replay of production synchronization code do not establish that every user-device/real-network cause is resolved. No live account, multiplayer session, DB writes, Functions/security/auth changes. Postdeploy checks compare Monster.js, MonsterManager.js and NetworkManager.js bytes on the live origin, alongside version, audio and immutable assets. User device retest is still needed before claiming the observed incident is fully resolved.
