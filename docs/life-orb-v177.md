# Life Orb — v0.02.177

Witch's basic attack is now **생명의 구슬**. The saved skill ID remains
`lifeDrain`, so existing upgrades persist. Summon stats, summon book options,
other classes' combat rules, and original character images are unchanged.

## Combat and controls

Tap selects the nearest living enemy within 560px; a hold of at least 0.5s keeps
the aimed direction. Orbs travel at 180px/s, slow to 90px/s on contact, continue
72px, then return at 540px/s. Each orb can hit at most three targets, at most
three times per target, with a 0.25s interval. Accepted hits charge the raster
from pale blue through red. Missed orbs stay blue and grant no HP.

| Skill level | Available capacity | ATK per hit | ATK healing cap per orb |
| --- | ---: | ---: | ---: |
| 1 | 1 | 70% | 12% |
| 2 | 1 | 75% | 14% |
| 3 | 2 | 80% | 16% |
| 4 | 2 | 85% | 18% |
| 5 | 3 | 90% | 20% |
| 6 | 3 | 95% | 22% |
| 7 | 4 | 100% | 24% |
| 8 | 4 | 105% | 26% |

An orb reserves its slot immediately, including through the return flight.
There is no separate basic-attack cooldown. The button displays only the
available/capacity count, for example `1/1`, `0/2`, or `2/2`.

ATK, skill level, and applicable weapon bonuses are captured at launch. On
arrival, one owner-only recovery budget is applied:

```
min(ceil(launch ATK × healing cap),
    floor(accepted direct orb damage × 0.20 + applicable weapon recovery))
```

No accepted damage means no recovery, including weapon recovery. Repeated
hits, crowds, chain damage, and repeated arrival callbacks cannot increase
that orb's cap. Excess recovery is not distributed to allies or summons.
Existing weapon chains can trigger once per orb and do not fund its healing.

Walls/range recall an orb; return travel does not damage enemies. Death,
disposal, world changes, or extreme displacement cancel outstanding orbs.
Reservations are transient and are not saved. Remote packets render only;
they do not simulate damage, recovery, or usable local slots.

## Approved generated artwork

- Original lossless RGBA WebP: `assets/resource/effects/life-orb-v177.webp`
- SHA-256: `3874743e40a74fedda87bccb729bae2ec20fefc4d67f958e8c138ccad660472c`
- Exact size: 1,654,148 bytes; 1024×1536; 4 columns × 6 rows.
- Metadata: `assets/resource/effects/life-orb-v177.json`, with all 24 original
  `sourceRect` and `pivotPx` values. Its schema is v1; the approved Library
  document revision was v3.
- Rows: blue flight, low/medium/full charge, fast return, arrival/heal dissolve.
- No recoloring, procedural effect substitute, source resizing, or character
  image modification. Bright-core pivots anchor flight and rotated return.

Witch preparation requires both decoded pixels and valid frame metadata.
Missing or invalid assets prevent a playable Witch bundle from being cached.
Delivery through this cloud chat uses ZIP to preserve the generated WebP's
exact bytes; extraction is followed by the approved SHA/size check.

## Verification

`npm run validate:classes` includes slot/damage/recovery, disposal, network
acceptance, replay/world isolation, 4–144Hz input flooding, frame pivots, and
the approved asset SHA/alpha/cell-bound checks. `validate:resources` verifies
that the Witch bundle cannot complete without both new assets.

`validate-witch-ranged-browser.cjs` checks real keyboard/mouse/touch input,
slot labels, wall/miss behavior, and arrival healing. Its default mode requires
the approved atlas. `QA_LOGIC_ONLY=1` is only for diagnosing asset-unavailable
workspaces, never the release gate.

`validate-life-orb-visual-browser.cjs` compares all 24 frames in both directions
through the local and remote renderers across desktop, portrait, and landscape
contexts: 144 matching, nonempty, unclipped raster cases. Broader release
checks cover other classes, saving/reentry, input cancellation, audio, original
art, and complete render frames. Browser accounts and SDK fixtures are local;
these checks do not write production player data.

The v0.02.177 local release run passed 870 static tests, all 44 existing
workflow browser commands (including corrected natural slot-return waits),
306 CBT03 combat cases, audio synthesis, and the real SDK loopback fixtures.
The new 144-case raster comparison and deployed-control entry path also pass.
The deployment workflow additionally checks the new immutable image/metadata
and both new runtime modules against this commit, then reruns the raster and
control checks in isolated local-mode profiles against Hosting.
