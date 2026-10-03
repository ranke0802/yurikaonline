# Witch ranged tap — v0.02.145, tutorial completion fix v0.02.146

Tap now launches a visible homing green drain orb toward the nearest living enemy within 560px. It travels through the world before contact; there is no player-centered or immediate remote damage. On contact, the original 200% tap damage is applied in the original growing absorption radius, centered on the impact. The approved Witch effect WebP's first row supplies the orb/return art; the existing life-circle art appears only at impact. No raster files or other class balance values changed.

| Property | Before | After |
| --- | --- | --- |
| Tap delivery | Immediate player-centered circle | Homing projectile, 360px/s, 560px total travel |
| Tap damage | 200% × existing level multiplier | Unchanged; only on contact |
| Tap radius, Lv.1 → Lv.8 | 95 → 128.25px around caster | Same radius around impact |
| Projectile contact radius, Lv.1 → Lv.8 | Used by aimed orb: 14 → 18.9px | Same growth also used by tap orb |
| Tap recovery interval | .805 / effective speed, minimum .20s | Unchanged; return flight does not block later attacks |
| Aimed attack | 210px/s orb; 3 one-second ticks totaling 100% drain budget | Unchanged, no piercing added |
| Return | Actual damage × 50%, owner clamp then ally/summon overflow, 300px/s | Same contract for tap's actual accepted damage; aimed behavior unchanged |

Tap locks a selected target and follows its current position while it stays in range. Dead or despawned targets cancel that orb. A target leaving range is no longer tracked; total path length remains capped, and damage cannot reach target centers beyond the original 560px acquisition radius. With no target, a forward orb can travel and collide normally, then expires without healing if it misses. Contact is sampled in steps no longer than 12px, with scene collision checks before damage; splash also checks wall obstruction. A resolved orb is removed before damage, preventing duplicate resolution. Tap flight has a 3s safeguard and its return a 5s safeguard; death, scene changes and disposal clear work. Poison cadence and stacking are unchanged.

The skill list, detail, growth description, aim footprint and class tutorial now describe ranged homing impact and return healing. The existing green orb skill icon remains appropriate and is preserved.

## Verification

`reports/witch-ranged-v145/report.json` records actual local Chromium J, mouse and touch input. At a synthetic 320px target, all three produce no immediate hit, then one 200-damage hit at ~.74s; HP remains 500 at impact and becomes 600 after return. Tests also exercise spam rejection, another attack during return, deterministic wall collision with no damage/heal, and unchanged held aimed orb. Screenshots capture the real raster renderer and skill detail UI.

Fourteen dedicated controller cases cover Lv.1–8, movement homing, target death/despawn/escape, no target, walls/splash obstruction, no duplicate damage, actual-loss clipping, ally overflow, disposal, floor and aimed three-tick budget. Existing class, weapon, pixel-preservation, growth, tutorial and v144 Archer/Warrior browser checks remain regression gates. Tests use synthetic local profiles; they do not modify live user accounts.

The v0.02.146 follow-up advances Witch basic training only on accepted damage, not on button release. A fresh-profile browser test freezes simulation after firing for 350ms and confirms training stays at the dummy step; resuming physical projectile movement produces an actual hit and then advances. This prevents the 250ms tutorial completion timer from removing the target before the orb arrives.
