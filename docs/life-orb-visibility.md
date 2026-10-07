# Life Orb visibility and impact feedback

The 256px atlas cells contain transparent margins. A 52px draw size left the
blue orb only 34–36 world pixels wide (alpha > 8), about 27–29 CSS pixels at
the default desktop zoom and 24–25 CSS pixels on mobile.

| Phase | Previous draw size | New draw size |
| --- | ---: | ---: |
| Ordinary flight, including misses | 52 | 104 |
| Return | 58 | 112 |
| Arrival healing | 76 | 120 |
| Accepted-hit peak | 52 | 122.72 |

Flight is always twice as large, including reduced-effects mode. The visible
blue body is now 68–72 world pixels, about 55–58 desktop CSS pixels or 48–51
mobile CSS pixels. Camera view-range preferences still apply normally.

Each accepted hit gives the existing raster a 160ms ease-out size pulse, a
60ms hold of its animation frame, and one faint extra draw of the same approved
frame for glow. Only the artwork reacts: simulation, movement, collision and
input never pause. Reduced effects disables the pulse, frame hold and extra
draw, while keeping the larger base size. Source WebP/JSON bytes, frame pivots,
and character artwork remain unchanged.

Accepted hits use the existing Witch `life_circle` impact sound. All local
orbs and targets share a 180ms minimum interval. SoundManager still applies
mute, SFX/master volume, background and duplicate-event guards. Remote visual
packets carry only impact age; they never replay owner audio or combat.
Delayed snapshots expire the pulse and cannot select a negative frame.

Damage, healing caps, target/hit limits, collision radii (14–18.9px), slots,
travel speed and return rules are unchanged.

## Verification

- `npm run validate:classes`: 246 tests and 192 original action-art cells pass.
- `node scripts/validate-life-orb-visual-browser.cjs`: 336 local/remote raster
  comparisons across desktop, portrait and landscape, including impact and
  reduced-effects states; pixels match and no clipping occurs.
- `node scripts/validate-life-orb-impact-browser.cjs`: 15 browser scenarios
  (three layouts × normal/reduced/muted/zero-SFX/close-crowd). Twenty attempted
  casts per simulation frame never exceed four active orbs. Per-orb damage,
  repeated-hit intervals and healing caps hold, no global hitstop occurs, and
  mute/zero-SFX suppress actual playback.
- The close-crowd case reaches at most 12 atlas draws including four lingering
  arrival effects; there are at most four additional glow draws per frame.
  Local headless Chromium full-world rendering measured 95th-percentile times
  of 2.7–6.8ms. This is a local render measurement, not a physical-device FPS
  measurement.
- Actual keyboard/mouse/touch ranged controls and all 18 HUD/input cases pass.

Before/after full-game captures and short combat recordings are held with the
cloud review evidence in `/workspace/yurika-life-orb-impact/qa/`.
