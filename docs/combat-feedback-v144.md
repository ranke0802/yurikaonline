# Archer rain and Warrior feedback — v0.02.144

Archer tracking rain previously looped the right-facing fourth atlas row on the ground. The same approved WebP now renders nine distributed arrow bundles per wave, rotated downward and falling 220px with acceleration. Ground contact and a short compressed raster fade align with the five existing damage deadlines: 0.6, 1.2, 1.8, 2.4 and 3.0 seconds. Damage, radius, cooldown, mark transfer and poison behavior are unchanged. Local and remote rendering share the timeline; remote rendering never applies damage. No new art or vector substitute is used.

## Warrior geometry

| Attack | Lv.1 distance / full width before → after | Lv.8 distance / full width before → after |
| --- | --- | --- |
| Tap | 100 / 104 → 140 / 140 px | 135 / 140.4 → 189 / 189 px |
| Rage smash | 150 / 96 → 180 / 128 px | 202.5 / 129.6 → 243 / 172.8 px |

The existing 5% per-level area growth, damage growth, knockback, rage costs and 0.20-second minimum attack interval remain. Collision now tests the enemy's circle against the attack rectangle, including end contact; it no longer requires the target center to be inside the end boundary. Aim guide, effect sizes and remote limits follow the same geometry.

Warrior press input previously created a held body pose even during cooldown or with insufficient rage, although release would reject the attack. Cooldown presses no longer start an aim; uncharged/insufficient-rage preparation does not display an attack pose. Accepted attacks still create the attack motion. A rejected charged attack explains the required 25 rage. Automatic aim refreshes a moving target on release; a manually dragged direction stays fixed. No queued attack or rate-limit bypass is introduced.

The requested lifesteal buff is Blood Pact (피의 맹세). Its feedback measures actual HP gain after each accepted damage result, merges gains over 120ms and emits one green +number. Full health and rejected damage emit nothing; the 20% lifesteal and HP clamp are unchanged. Disposal clears pending feedback.

## Evidence

`reports/combat-feedback-v144/report.json` records actual local Chromium keyboard, mouse, touch, spam, insufficient-rage and charged attacks against synthetic targets. Two-target lifesteal with HP 97 reaches 100 and emits only +3; another hit at max HP emits no new number. Eight captured renderer images show downward raster rain and impacts. Controller tests verify all five damage times, Lv.1/4/8 geometry, target-radius boundaries, automatic/manual aim and feedback clamping. Existing class combat, class weapons, approved pixels, growth and gait checks remain regression gates.

Witch attack behavior and healing values are unchanged pending separate approval. Existing files and the unrelated uncommitted audio report are preserved.
