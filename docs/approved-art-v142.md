# Approved class art and weapons — v0.02.142

The three playable classes now use approved full-body walk, stationary attack and moving attack frames, approved skill atlases, and five weapon themes in normal/blessed tiers. Witch weapons are spellbooks. Mage equipment and progression remain on their existing path.

## Source and pixel preservation

Authorized artifact commit: `cb46f34edf77122e8ed8db827eaa40603e330a8b` on `codex/approved-game-art-20261003`. The assembled 18,585,144-byte ZIP has SHA256 `4a57cd980d35ecb267a1bb3b974b3ec04c4dec857983fde418bb9884beee6651`; all 245 source checksums passed. The artifact branch was read without merging it. Original files remain outside the game tree at `/workspace/approved-art-20261003`; existing game assets are retained.

`scripts/integrate-approved-class-art.mjs` packs 144 frames by copying RGBA rows, with no rescale, alpha-bound fitting, mirroring or regenerated pixels. Lossless atlases preserve every visible source pixel. Transparent RGB is normalized only for the verification hash. `reports/approved-art-v142/provenance.json` records source frame hashes and all 26 runtime asset hashes, dimensions and sizes. Fifteen weapon images and five skill atlases are copied byte-for-byte.

Witch uses 120×120 frames, pivot (60,112), 140ms; Warrior uses padded 180×144, pivot (90,132), 150ms as explicitly requested; Archer uses padded 192×144, pivot (96,132), 140ms. Moving attacks share the current walk phase. Rapid accepted attacks preserve the active four-phase body cycle. Local and remote characters use the same authored renderer. Portraits use a fixed pivot-relative 120×120 crop, not alpha fitting. Old sprites remain available as fallbacks.

## Weapons and persistence

Thirty definitions clone same-map Mage normal/blessed weapons. Numeric ranges, enhancement growth, crit/heal thresholds and deterministic roll inputs use the existing Mage source. Canonical item IDs enforce class eligibility. New class equipment is saved in its class profile; existing Mage root equipment, level and XP are preserved.

Crimson bonuses affect class basic attacks. Starlight damage affects Witch poison, Warrior charge and Archer rain; its existing mana-reduction coefficient maps to cooldown reduction for these skills because they do not consume MP. Blue-flame bonuses produce a bounded damage-only echo, with no extra poison stacks, marks or control. Existing accepted-hit and poison-stack rules remain in force.

Drops select each recipient's class, frozen when reward authoring begins. Boss receipts preserve item snapshots across later class/map/host changes. Append-only policy v3 accepts one class counterpart per guaranteed reward slot, including the fifth zone. Historical v1/v2 archives remain unchanged. See the historical [candidate record](class-weapons-candidate.md) for mapping details.

## Verification

Automated checks cover 144 exact frame comparisons, native dimensions and pivots, all directions and phases, rapid attack continuity, immutable asset hashes, 50 class weapon cases including 462 numeric parity checks, and the existing combat/profile/save/resource/UI/audio suites.

Actual local Chromium evidence is in `reports/approved-art-v142/browser` and `gait`: real inventory clicks equip weapons; details and image decoding are checked; saved class equipment survives reload while Mage data remains intact; the game renderer captures all 144 poses. Moving-attack checks exercise each class in motion. Synthetic local accounts are used, not live player accounts. This browser evidence is distinct from automated Node tests and CI's public Hosting hash verification.

The deployment workflow runs weapon/art tests and actual browser checks before publishing. Its public release check compares this commit's HTML/code and all 26 new immutable assets against Hosting. Art-delivery archives/parts are excluded from Hosting. No network policy, security rule or database rule changes are included.
