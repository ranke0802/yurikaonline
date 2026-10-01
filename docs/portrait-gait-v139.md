# v139: single-cell portraits and independent walking phase

This is a separate follow-up to the deployed v138 save fix (`e1948a6bf3ac6cd7c3ba096423be8125afe6c8e9`). The user supplied an Android screenshot with a Warrior portrait containing neighboring atlas fragments, and reported odd legs while moving and attacking. No character artwork is changed.

## Portrait

`UIManager.updatePlayerPortraits` always extracted `(0,256,256,256)`. Mage uses 256px cells, while Witch/Warrior/Archer use 192px cells in an 8×5 runtime sheet. The old crop crossed both the neighboring column and row. `Player._loadSpriteSheet` now passes its actual Sprite grid; UIManager derives the cell dimensions and crops front row 1, column 0 exactly.

The actual browser-generated portrait data URL is compared pixel-for-pixel to a crop of the loaded runtime sheet. Before: Mage matches, all three new classes fail. After: all four match. Warrior HUD screenshots are in `reports/portrait-gait/warrior-portrait-{before,after}.png`.

## Walking while attacking

`releaseClassAction` reset `animTimer` on every accepted attack, and `_updateAnimation` advanced walking frames by `dt*10` while `isAttacking`, instead of travelled distance. This caused phase jumps and a different leg-cycle speed whenever attacks overlapped walking. Remote animation had the same time-based attack override.

Accepted class actions no longer reset the walking phase. Local and remote walking frames continue by ground distance; stationary attacks do not cycle walking feet. `ClassActionMotion` and full-body authored attack rendering are unchanged: contact, follow-through and recovery frames still run on the independent combat clock, with their authored direction. No attacks are frozen or suppressed.

**Scope limit:** full-body action poses still contain the original authored legs. This change fixes the runtime gait reset/clock discontinuity; it does not split torso/legs or redesign awkward anatomy inside the action atlas. Such image changes belong to the separate art work. The browser contact sheets preserve this distinction.

## Evidence

- 17 unit cases: four portrait cell geometries, three classes × four directions of local/remote distance-based gait, and accepted attack phase preservation. They also check that action frames 1→2→3 remain active.
- Actual local game loop, mobile/touch Chromium viewport, keyboard movement plus accepted attacks in UP/RIGHT/LEFT/DOWN. All 12 combinations continue moving while action poses render.
- Before: attack resets gait phase in 12/12 combinations. After: 0/12.
- `reports/portrait-gait/v138-before.json` and `v139-after.json` contain per-frame positions, walk phases and attack age/direction, plus portrait pixel comparisons.
- Three moving-attack contact sheets capture real Player.render output across all four directions. They are evidence of runtime behavior, not new art deliverables.

Reproduce with `node --test scripts/validate-class-portrait-gait.mjs` and `npm run validate:portrait-gait-browser`, with the standard 8100 loopback server. `QA_BASELINE_ROOT=/path/to/v138/worktree` overrides only the three relevant runtime modules for the before capture. No live-account writes or physical Android validation were performed.

The v139 SDK browser regression also records separate save confirmation, profile read, synchronous UI build, UI-ready and camp-image decode-wait durations in `reports/portrait-gait/v139-save-regression.json`. The acknowledgement is deliberately held by the fixture; these are phase diagnostics, not production latency claims.

The existing deployment CI runs the unit cases through `validate:classes` and the browser regression before Hosting deployment. Exact commit/remote SHA/live verification is reported after deployment.
