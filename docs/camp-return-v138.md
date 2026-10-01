# v138: save before returning to camp

Baseline: `be4ec1f0329da6c4d36dffdab0990f1fd55d07a3` on `mmorpg_online` (v137).

The reported issue is **Mage returns slowly; Witch/Warrior/Archer fail to return**, not merely different class selection speeds. v134 class selection timings are not used as camp-return evidence.

## Reproduced storage defects

`Player.saveState` builds the controlled player's snapshot, then `buildClassProfilePatch` moves non-Mage progression into `classProfiles`. It passed this partial account object to `NetworkManager.savePlayerData`, whose transaction treats it as a complete account replacement.

With the actual Firebase 10.7.1 SDK on an isolated loopback protocol fixture:

| Class | v137 cold SDK cache | v137 retained/warm cache | v138 cold and warm |
|---|---|---|---|
| Mage | `profile_conflict`, zero writes | EXP 2411→2418; omitted account metadata lost | EXP 2418; account metadata preserved |
| Witch | `profile_conflict`, zero writes | `ok:true`, `lowerExperienceGuarded`; EXP stays 31 instead of 38 | EXP 38; Mage root remains Lv19 |
| Warrior | same | same | same |
| Archer | same | same | same |

The cold failure occurs because the full-save path calls `transaction` after a one-shot listener has detached; the SDK initially supplies null and the tracked revision guard aborts. The v130 retained-listener protection existed on the patch path, not this full path. The warm non-Mage failure occurs because missing root EXP in the partial payload looks like Mage progression rollback, so the guard retains the old profile and acknowledges a transaction without the requested class progression.

The browser control experiment loads the v137 Player module into the same test harness. The first fresh-storage experiment reached camp while losing new-class EXP. Adding the missing returning-account condition—a previous complete Lv19 Mage/account checkpoint—reproduces the reported distinction: cold Mage falls back to its current checkpoint and enters camp; cold Witch/Warrior/Archer remain in WorldScene, with zero server writes and the exact reported toast: ‘저장하지 못했어요. 공간을 확인하고 다시 시도해 주세요. 다른 탭에서 플레이했다면 이 페이지를 새로고침해 주세요.’ The partial non-Mage snapshot has no root progression, so `_storeLocalProfileCheckpoint` rejects it as lower progression than the previous complete checkpoint. There is then no current exit checkpoint for UI fallback. No injected save failure is used in this baseline reproduction. New-class fixtures are Lv5 in zone_1, with EXP 13→20 requested. Warm v137 returns but retains EXP 13. The v138 browser regression uses the same prior-checkpoint condition and requires the correct class and EXP after acknowledged save, retry and reentry.

This reproduces the screenshot’s behavior through real SDK and UI code in isolation. It does not read the affected live account, and Chromium mobile emulation is not a physical Android device.

## Change

`Player.saveState` now sends all its existing snapshot fields through `savePlayerDataPatch`, with `syncToZone` preserved. This uses the existing durable journal, serialization, revision/regression guards and v130 listener lifetime, then merges into the current account before checking progression. It preserves inactive class records, active selection and unknown account fields. It does not skip saving or convert rejected writes into success. Failed/late writes retain the journal. The UI still awaits save/flush results before the normal transition.

No NetworkManager guard, security rule, Function, credential, character art or image asset changed. The existing local conflict recovery from v134 is unchanged. Full-account creation/recovery APIs remain available to their existing callers.

## Rendering measurement

`measure-camp-return.cjs` clicks the actual return button, starts timing in its capture handler, records save/flush, profile read, definition load, synchronous UI build, native image decode calls and Mage frame composition separately. The final visual proxy waits for camp images to decode and two animation frames. It is not a GPU presentation timestamp. Three trials rotate class order, with the same viewport, local account setup and field. No other browser test ran concurrently with these final measurements.

A fresh session must prepare field sprites before entering the field, so a natural first return is **not** a cold field-sprite cache. The additional `evicted` intervention clears the resource and definition caches just before return. It must not be presented as an ordinary first return. HTTP/renderer image caches are not guaranteed cold in that intervention.

Median visual-ready proxy, milliseconds (before → after):

| Class | First return, fresh context | Warm repeat | Explicit resource-cache eviction |
|---|---:|---:|---:|
| Mage | 110.0 → 111.5 | 28.4 → 28.5 | 87.5 → 43.9 |
| Witch | 111.2 → 126.6 | 28.5 → 29.1 | 43.3 → 42.8 |
| Warrior | 124.9 → 113.3 | 28.2 → 27.6 | 44.5 → 44.4 |
| Archer | 125.7 → 110.5 | 28.2 → 29.6 | 45.2 → 94.7 |

Natural first/warm results do **not** demonstrate a Mage-specific rendering regression or general latency improvement; renderer scheduling varies. Under explicit eviction, v137 starts 33 unnecessary Mage field-frame compositions from camp profile preparation (median total CPU 144.6ms, overlapping and sometimes continuing after initial paint). v138 starts zero. Camp does not display these field sprites. Warming moved to the preparation screen; departure still awaits successful decoding and reports failure. This is a bounded removal of unnecessary work, not an explanation for every reported online delay.

Raw phase timings and medians: `reports/camp-return/comparison.json`, `v137-render-timing.json`, `v138-render-timing.json`. Decode durations overlap and must not be added to wall time. Local storage timing is not RTDB confirmation latency.

## Validation and reproduction

- `npm run validate`, plus asset, local-profile and monster-authority checks.
- `node scripts/validate-camp-return-browser.cjs`: all four classes, rejected save, pending save with repeated clicks, committed EXP, no field asset load on cold camp return, and reentry.
- Install `firebase@10.7.1 ws@8` in an isolated directory and set `YURIKA_FIREBASE_FIXTURE_ROOT`.
- `node scripts/validate-class-exit-sdk.mjs`: actual Player and SDK, four classes × cold/warm, one committed write, exact EXP, inactive records and unknown metadata retained, one listener attach/detach, cleared acknowledged journal.
- `node scripts/validate-camp-sdk-cache.mjs`: unchanged v130 red/green SDK cache-lifetime regression.
- `node scripts/validate-camp-return-sdk-browser.cjs`: actual SDK, UI and scenes; server acknowledgement held until an assertion proves the field is still active; repeated clicks, rejection, retained journal, retry and reentry. Multiplayer world transport is an isolated fixture.
- Existing camp-stall/startup-recovery browser suites verify retryable dependency stalls and recovery. These and the local profile tests retain the v134 conflict-recovery coverage.

Browser scripts need `python3 -m http.server 8100 --bind 127.0.0.1`, Chromium (`CHROMIUM_PATH` supported), and repository dependencies. Loopback SDK tests may require clearing HTTP proxy variables. They do not read credentials or write live Firebase data.

To measure the original rendering path, extract `git show be4ec1f:src/js/world/scenes/CampScene.js` to a temporary file, set `QA_BASELINE_FILE` to it and run `measure-camp-return.cjs`. `QA_BASELINE_PLAYER` similarly enables the browser storage control using the original Player module. `QA_CAPTURE_BASELINE=1` disables new correctness assertions in the node SDK script for capturing a failing baseline; normal/CI runs always assert them.

The existing Firebase Hosting workflow now runs the new SDK and browser regressions before deployment. Deployment and exact remote SHA/CI/live verification are reported separately after the commit is created; this document does not pre-claim deployment success.
