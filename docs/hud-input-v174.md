# Mobile HUD and Witch attack preview — v0.02.174

The mobile field and tutorial HUD previously compensated small saved UI scales
by enlarging text while tutorial HP/MP bars retained their smaller geometry.
Local Chromium reproduction at scale 0.65 showed numeral glyphs outside the bars.
At scale 1.8 the field quest header and padding could consume the visible panel.

The compact HUD uses an 11px rendered text target and sizes rows, portrait,
padding and quest width together. Resource width is capped at 224px with the
existing minimap clearance. Long quest text remains scrollable; on narrow screens
the scroll viewport also ends before horizontally overlapping action buttons.
Saved layout values and gameplay data are unchanged. Desktop styling is retained.

Basic attack status overlays and transient “조준 중” overlays no longer cover the
action controls. Button accessible names retain the full availability reason;
skill-specific resource errors, numeric cooldowns, input gates and existing
failure messages remain unchanged.

Witch `getClassAimGuide()` returns no guide below the existing 0.5-second basic
charge threshold. Release still follows the original tap/aimed branch: short taps
launch the 360px/s homing drain orb; held attacks use the 210px/s aimed orb.
Witch skills, other class guides, damage, healing and charge timing are unchanged.

## Reproduction and checks

- `scripts/validate-class-player.mjs`: exact 0/.05/.499/.5/.501/1-second guide and
  release boundaries at levels 1/4/8; fresh input after release/cancel; other
  classes and skills still preview immediately.
- `scripts/validate-hud-input-v174-browser.cjs`: actual Chromium mobile touch
  start/move/end/cancel with deterministic hold times at 393×852 and 780×360.
  Checks preview visibility, real projectile type/speed, cancellation, fresh
  follow-up touches and five rapid taps retaining the existing cooldown.
- Field HUD browser regression covers 320×568, 390×844, 780×360, 844×390 and
  1280×800, including 0.65/1/1.8 saved scales, long text/nine-digit resources,
  rotation, safe areas, glyph bounds, reward taps and camp reentry.
- Tutorial browser regression adds saved-scale and HP/MP glyph containment
  checks to its portrait/landscape/desktop input and guide-placement coverage.
- Existing ranged Witch, class, skill-explanation and combat-guidance checks
  remain required. Updated assertions deliberately expect no visual basic-attack
  reason while retaining its accessible description.

All profiles and input fixtures are isolated `?local=1` sessions with external
browser requests blocked. They do not exercise production accounts or physical
phone accessibility settings. The user's original attachment could not be
downloaded in this environment; diagnosis and before/after captures use the
locally reproduced issue, not a claimed inspection of that attachment.

Browser scripts accept `CHROMIUM_PATH`; output is controlled by `QA_OUTPUT`.
The new touch regression is included in the existing Hosting workflow before
deployment. Generated screenshots and large diagnostic logs are not committed.
