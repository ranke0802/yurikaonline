# v141: three-class basic attack upgrades

Witch `lifeDrain`, Warrior `cleave`, and Archer `shot` now use the existing skill upgrade buttons, costs and per-class `skillLevels` save path. Their cap is 8, matching other new-class skills. Mage behavior, existing items, attack recovery, poison stacks and Archer marks remain unchanged. No artwork is replaced; the separate corrected character art and generated class-weapon/effect art are not integrated.

## Exact progression

For level L, n = clamp(floor(L), 1, 8) - 1. Damage multiplier relative to level 1 is 1 + 0.08n. This affects both tap and charged basic attacks, including Warrior combo finishers and Archer marked/empowered snipe. Projectiles retain their launch damage/size even if the skill level changes in flight.

| Level | Damage vs Lv.1 | Archer hold / empowered hold | Warrior tap reach / full width / knockback | Warrior heavy reach / full width / knockback | Witch circle radius / orb collision radius |
|---|---|---|---|---|---|
| 1 | 100% | 0.50s / 0.20s | 100 / 104 / 0px | 150 / 96 / 0px | 95 / 14px |
| 2 | 108% | 0.47s / 0.188s | 105 / 109.2 / 4px | 157.5 / 100.8 / 6px | 99.75 / 14.7px |
| 3 | 116% | 0.44s / 0.176s | 110 / 114.4 / 8px | 165 / 105.6 / 12px | 104.5 / 15.4px |
| 4 | 124% | 0.41s / 0.164s | 115 / 119.6 / 12px | 172.5 / 110.4 / 18px | 109.25 / 16.1px |
| 5 | 132% | 0.38s / 0.152s | 120 / 124.8 / 16px | 180 / 115.2 / 24px | 114 / 16.8px |
| 6 | 140% | 0.35s / 0.14s | 125 / 130 / 20px | 187.5 / 120 / 30px | 118.75 / 17.5px |
| 7 | 148% | 0.32s / 0.128s | 130 / 135.2 / 24px | 195 / 124.8 / 36px | 123.5 / 18.2px |
| 8 | 156% | 0.30s / 0.12s | 135 / 140.4 / 28px | 202.5 / 129.6 / 42px | 128.25 / 18.9px |

Archer charge uses max(0.30, 0.50 - 0.03n), rounded to milliseconds for stable boundary input. Empowered charge is 40% of that, with a 0.12s floor. Charge readiness is independent of recovery: the existing 0.20s recovery floor still bounds accepted attacks to five per second. Warrior/Witch charge threshold remains 0.50s. Knockback uses the existing collision-checked move hook, only after accepted damage, excluding bosses and defeated targets.

Witch tap damage is 200% ATK at Lv.1 → 312% at Lv.8. The charged orb remains a single-target three-tick drain, 100% ATK total → 156%, returning 50% of actual damage as healing. Its larger collision footprint is **not** a new splash explosion. Poison stacking is pending clarification and was not changed. Radius growth is +5% of baseline per level; +35% radius at cap is +82.25% circular area. Warrior's rectangular reach/width follow the same linear scale.

Costs for the seven upgrades are 300, 600, 1,200, 2,400, 4,800, 9,600 and 19,200 manastone (38,100 total). Existing saved levels need no migration. The skill detail view shows current and next values; MAX applies only at level 8.

## Verification

- `scripts/validate-basic-progression.mjs`: low/mid/max damage, hit boundaries, launch snapshots, charge boundaries, cap handling, effect geometry, remote visual geometry, boss/blocked knockback and high-speed input flooding. Existing class/cadence tests also pass.
- `scripts/validate-basic-progression-browser.cjs`: nine cases (three classes × levels 1/4/8), real camp upgrade buttons and currency deductions, save/reload and field/camp reentry, automatic nearest-target selection, manual drag aim, charged release, duplicate input rejection and unchanged root Mage skills. No live account writes.
- Rendered evidence: `reports/basic-progression-v141/`. Circle/slash frames use the existing raster art at the same dimensions as the level-scaled effect parameters. Character anatomy and moving-attack leg limitations are unchanged.
- Existing AUTO toggle remains Mage-only. The automatic targeting coverage here means nearest-target aim selection, not enabling continuous auto-fire for the new classes.

Class weapon source numbers are recorded separately in `class-weapon-source-spec.json`. That is an implementation/art brief, not a claim that class loot or generated weapon art is shipped in v141.
