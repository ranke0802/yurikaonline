# v175 monster display fixture correction

The v175 deployment [run 37580942696](https://github.com/ranke0802/yurikaonline/actions/runs/37580942696)
stopped in `validate-monster-foot-v166-browser.cjs`, which includes the v164 damage-number regression.
Hosting deployment was skipped. The failing commit was `be1f0ed9bb6450708fd38f2c059f80fab314498b`.

## Reproduction and cause

The unmodified combat input reproduced the exact CI failure for portrait Archer:

- Actual event SHA-256: `81ea776f459ebf1a58a1dab1becfeaefc44446ee4bfc9218fffa0be8d41a903a`.
- Original v163 event SHA-256: `0f529de7237ab9a75319bd4de68c10ad32061a1b3b6245c40b24ec8efe6804a0`.
- Player HP/MP remained `9622 / 10000` in both runs.

An isolated browser control served only `Player.js` from v174 commit
`0716ea71a06f34ec5f83c774f1cc29bdc45594c7`; all monster, skill, world and rendering code remained v175.
All six class/orientation cases then matched the original hashes.
Comparing the actual event records with the original v175 reproduction showed:

| Class | v174 ATK → v175 ATK | Events | Damage differences |
| --- | --- | --- | --- |
| Witch | 11 → 11 | 35 | None: all hits remain 71 |
| Archer | 12 → 9 | 35 | 30 hits: 9 → 6; five hits: 3 → 1 |
| Warrior | 14 → 11 | 221 | Individual barrage allocations change with total attack; seven zero-damage control events remain zero |

Event times, target IDs, flags, metadata, return values, event counts, monster statuses,
random-call counts and final player HP/MP were identical. Differences were the intended
player damage amounts, resulting monster HP and displayed damage values.
This reproduces the requested player stat change, not a monster behavior regression.

## Fixture contract

The monster display test already fixes player HP/MP, monster HP, skill levels, seed and time.
It now also fixes player attack to the verified v163 inputs: Witch 11, Archer 12, Warrior 14.
Those inputs are explicit metadata in `monster-numbers-v164-baseline.json`.
All existing baseline hashes, event checks, damage aggregation checks, HUD checks and lifecycle
assertions remain unchanged. The test verifies that its attack input stays fixed throughout the simulation.
It saves per-case proof JSON before checking hashes, including runtime and fixture attack values.

Actual v175 attack calculation remains covered separately by `validate-class-attack-stats.mjs`
and `validate-class-attack-stats-browser.cjs`. Those tests do not override player attack.
No gameplay code, release version or production data changes are needed for this fixture correction.

## Validation

- `node scripts/validate-monster-foot-v166-browser.cjs`: six class/orientation cases plus the included
  damage aggregation, HUD and foot placement/lifecycle edge checks pass.
- All 30 exact event/emission/RNG/monster HP/player comparisons also match the independent v174 Player control.
- `node --test scripts/validate-class-attack-stats.mjs scripts/validate-monster-numbers-v164.mjs scripts/validate-monster-hud-v165.mjs scripts/validate-monster-foot-v166.mjs`: 49 pass.
- `npm run validate:class-attack-stats-browser`: eight desktop/mobile class cases pass, including
  actual stat buttons, refunds, confirmation, reload and field entry.
- Negative control: increasing only the warning monster's `chargeDamage` by one still fails
  the original emission hash check, with player HP changing from 9624 to 9620. This confirms
  that the fixed player attack input does not suppress monster damage regressions.

Browser checks use an isolated `?local=1` server on `127.0.0.1:8100` and synthetic local profiles.
