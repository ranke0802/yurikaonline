# Class weapon candidate — historical staging record

This record describes the earlier disabled candidate. The approved, enabled integration supersedes it; see [v0.02.142 integration](approved-art-v142.md).

Base: `mmorpg_online`, `e7c7b7a5e40b0099f8370ef878f838555c0941ba`, v0.02.141.

`CLASS_WEAPONS_ENABLED` in `src/js/core/ClassWeapons.js` is **false**. This patch is staged but uncommitted; no version bump, push, Firebase deploy, asset replacement, network change or denied transfer retry was performed. There is no independent visible subfix to release from this patch. Tests opt in through an isolated ItemDataManager constructor, never localStorage or URL parameters.

## Implemented candidate

- Five map themes × three classes × normal/blessed = 30 weapons. Witch uses **magic tomes**, Warrior swords, Archer bows. The 15 shared tier icons use the approved paths. Names, descriptions, weapon type and tooltips identify tomes, never wands.
- Definitions clone the actual same-map Mage source. Base attack, crit, mana regen, enhancement rules, affix ranges, percent growth, caps, heal thresholds and normal/blessed stone behavior use the existing implementation. No second balance table.
- Roll the original Mage source before substituting a class item. Drop probability, amount, prefix choice, numeric rolls and deterministic instance ID stay identical for the same monster/recipient/roll slot.
- Normal drops use the reward recipient. Boss guaranteed and blessed bonus drops use each participant's class, not the host. The class is frozen when reward authoring starts and retained on retries. Missing presence defers the complete item receipt, preventing deduplication from consuming a partial reward.
- Class restrictions resolve the canonical item ID rather than trusting save-supplied allowedClasses. Existing Mage items and the historical Witch ability to equip an old staff are retained. Old inventory IDs are never rewritten.
- Append-only v3 durable policy permits **one** class counterpart per guaranteed boss slot. v1/v2 values remain identical. v3 requires item snapshots and includes zone 5. A receipt stays its originally earned item after class/map/host changes; archive materialization survives live catalog removal.

## Explicit skill mapping

| Mage effect key/family | Witch | Warrior | Archer |
| --- | --- | --- | --- |
| Basic damage and flat hit healing (crimson) | Life Drain circle/orb | Cleave/rage smash | Arrow/snipe |
| Skill damage (starlight) | Poison, slot 1 | Charge, slot 2 | Arrow Rain, slot 3 |
| Mana-cost reduction percentage (starlight) | Poison cooldown reduction | Charge cooldown reduction | Arrow Rain cooldown reduction |
| Chain chance/damage ratio (blue flame) | Poison damage echo | Charge damage echo | Arrow Rain damage echo |

These classes' mapped skills have no mana cost, so the exact reduction coefficient applies to cooldown instead. This is a semantic mapping, not a claim that cooldown and mana have identical gameplay value. All coefficients, +1% enhancement growth and existing caps match Mage. Attack speed follows the existing derived-stat path and recovery floor.

Chains begin from the first accepted hit once per cast, at that hit position, repeat at 0.3 seconds with the canonical chance and damage ratio, and stop after at most 12 echoes. Echoes apply damage only: no poison pulse/stacks, marks, taunts, stun or recursive proc. Normal poison still has five scheduled pulses and its existing stack rules. Basic projectile bonuses snapshot on launch; orb flat healing occurs once on an accepted channel hit in addition to its existing 50% drain return. Rejected damage never grants healing. Utility skills are unchanged.

## Corrected Witch preparation

`AuthoredCharacterFrames.js` provides an **unwired** validated row adapter: 120×120 cells, fixed scale 1, foot pivot (60,112), four frames, 140ms per frame. It does not inspect alpha bounds, stretch side silhouettes to 102px, register an asset or infer the new package's row order. The adapter accepts a verified four-column atlas row; if the delivered package uses individual frames it must first be assembled losslessly using its actual manifest. Real pixels and row manifest are still required before wiring it into Player/action rendering.

## Validation

Run `npm run validate:class-weapons` for 50 tests, including 462 affix/class/map/tier/enhancement comparisons (+0 through +10), actual normal/blessed enhancement outcomes, rerolls, real reward grant routes, equip restrictions, serialization, delayed durable receipts, damage/cooldown/proc behavior, rejected hits, disposal/pause and fixed renderer geometry. The old archive SHA-256 fingerprints are pinned from the baseline.

Also passed: 196 existing class tests plus 192 action-art cells; runtime integration (reward, generation, host migration, hydration and listeners); 41 save/local-profile/inventory tests; UI layout validation and 11 UI audit tests. Browser validation covers all four classes in portrait and landscape, actual touch combat/camp skill UI and preservation of Mage gear/progression, with no page errors. `reports/class-weapons-candidate/browser-gate-off.json` records 14 cases across the eight class/viewport combinations. Browser pixel validation uses **existing released art**, not the inaccessible new art. Enabled weapon mechanics have simulation/integration coverage; enabled weapon inventory visuals remain a release blocker.

## Exact release dependency

Obtain the authorized real files through a supported transfer only; known proxy CONNECT 403 ingress has not been retried:

- `assets/resource/classes/weapons/{magic,tidal,storm,astral,riftcore}_{witch,warrior,archer}.webp`: all 15 approved 512×512 alpha images, with the five Witch images being the replacement spellbooks.
- Replace `assets/resource/classes/{witch,warrior,archer}-effects.webp` with the three approved 768×768 atlases, 192px cells; `life-circle.webp` with 768×192; `poison-potion.webp` with 512×128. Existing files at these five paths are the old released art.
- Corrected Witch animation package plus its actual row/state/direction manifest before renderer integration. No guessed asset path or row order.

After ingress: inspect hashes/dimensions/alpha and actual pixels; wire verified Witch rows; enable the gate; build immutable assets; run enabled inventory/equipment/skill and combat browser screenshots, the candidate suite and ordinary regressions; then bump/commit/push/deploy. Do not enable the gate while the weapon files are absent. No placeholder or old Mage art is assigned to a new weapon.
