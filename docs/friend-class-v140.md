# v140: friends show the selected character

The friends list and chat profile used one Mage portrait for every account. The profile panel read root Mage progression and equipment even when the account selected Witch, Warrior or Archer. Its HP/MP maxima also came from the viewer's character definition rather than the friend's saved character.

`FriendsUIController` now caches a front-facing portrait per class, using the existing runtime sheet and an exact single-cell crop. Both friends and chat profile panels project the selected class for progression and equipment, prefer its saved HP/MP maxima, and use its own class definition for legacy records without maxima. Canonical account objects remain unchanged. Explicit custom portraits still take precedence. Asset requests are shared per class; a failed load can be retried on the next explicit profile selection.

## Verification

- `node --test scripts/validate-friend-class-profiles.mjs`: seven cases covering four viewed classes against all four viewer classes, zero HP/MP, legacy/unknown IDs, absent class snapshots, nonmutation and portrait identity.
- `node scripts/validate-friend-class-browser.cjs`: actual local game UI at 1280×900 and 390×844; four classes each, eight exact avatar image comparisons, selected progression/equipment assertions, chat/panel agreement and no page errors. All external browser requests are blocked; the friend account is a synthetic fixture, with no live-account reads or writes.
- Browser screenshots and before/after measurements: `reports/friend-class-v140/`. Warrior changes from Mage/Lv.88/HP 101÷120/Mage staff to Warrior/Lv.7/HP 41÷85/no weapon. The fixture deliberately makes the two class records visibly different.
- Unit checks run through `validate:classes`; the browser check is included in existing pre-deploy Firebase CI.

The HUD portrait crop from v139, save/camp logic from v138, Mage artwork, audio, combat timing and all original image assets are unchanged.

## Moving-attack investigation: still unimplemented

The existing `validate-class-portrait-gait-browser.cjs` was rerun and its three rendered contact sheets inspected. `ClassActionMotion.drawActionBody` draws a complete authored attack cell; `Player`/`RemotePlayer` use the walk sheet only when the action-body draw does not handle the frame. Consequently, a continuing distance-based walk clock cannot animate feet while that full-body attack pose is visible. `unchanged-moving-attack.png` records this limitation, not a fix.

A safe next art/renderer contract would supply full-body moving-attack frames indexed by action row, authored facing, action phase and gait phase, with a shared foot anchor. It can preserve the independent combat clock and distance-based locomotion clock already present, and retain current full-body attacks while stationary. Separate upper/lower layers are another option only if authored together with compatible pelvis joins, occlusion masks, clothing overlap and weapon ownership. Cutting the existing complete images at a horizontal seam does not meet that contract.

No speculative renderer or placeholder artwork is shipped. New moving-attack art and the user's approved three-character appearance remain pending; this profile correction does not supersede them.
