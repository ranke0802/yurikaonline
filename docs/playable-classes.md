# Playable classes — initial balance

One character is controlled at a time. Camp switches save the current class before loading the selected one. The Mage's legacy root progression is retained; new class progress/equipment lives in `classProfiles`. Inventory, currency, quest flags and reward claims remain shared. No account migration is required. Summons and temporary combat state are session-only. No starting equipment is minted for a new class.

## Input

Tap/release the basic attack for its immediate single attack. Holding at least 0.5 simulation seconds then releasing uses the aimed variant; Archer's empowered next shot needs 0.2 seconds. A short tap has no delayed extra ticks. Drag an action button to aim; keyboard actions aim toward the nearest valid target or current facing. Movement remains available while aiming. Pointer cancellation, blur and scene exit cancel the pending action. Aim guides are drawn beneath actors.

## Witch

- Life Drain tap: one immediate circle hit within 95px, 200% of normal Life Drain's base attack damage. No tap healing.
- Aimed orb: 210px/s, 560px range. First enemy contact staggers for 0.35s and begins three ticks at 1, 2 and 3 seconds. The integer attack damage budget is divided across these ticks (rounding remainder on the last tick); no tap-style extra hit. After the third tick the orb returns at 300px/s. On arrival heal 50% of actual HP removed, including overkill limits; distribute excess to living allied summons/party members. Rejected damage earns no healing.
- Poison Cloud: 140px radius, five pulses at 1–5 seconds. Every pulse deals attack + 5% target **maximum** HP, including bosses. One slow stack per accepted pulse; each stack adds 20% slow. Stacks share a refreshed 5s expiry. Fifth stack consumes the stack set and stuns 3s; no new slow stacks during this stun. Damage can still occur. Base cooldown 9s. This deterministic refresh model prevents per-frame stacking.
- Summon Monster: 80% maximum HP, no deduction/cooldown/summon on insufficient HP or unavailable definition. Exactly sufficient HP is a successful cast followed by normal caster death. Maximum three; a successful fourth dismisses the oldest. A summon disappears on its death, owner death, field exit/reentry or oldest replacement. Base cooldown 1s. Levels: Slime, 꼬북이, 에몽가, 고오스, 대왕슬라임, 마자용, 뇌제 피카츄, 님피아. Existing monster visuals; boss visuals 60%. Summon HP 55% caster max HP, attack 60% caster attack, base attack interval 1.2s, move speed 125px/s.
- Berserk Potion: all living allies in the current party/field and summons, excluding caster. 10s; move ×1.25, attack speed ×1.7, attack ×1.2. Base cooldown 16s. Refresh duration; never multiply base stats in place.

## Warrior

- Basic combo: 1/1/1.5× attack, third successful strike grants 18 rage; combo resets after 1.6s. Rage cap 100. Aimed smash costs 25, deals 3× attack and ignores armor.
- Challenge: nearby 230px enemies taunted, 4s guard reduces incoming damage by 40%. Received damage generates rage, capped at 15 per incoming hit. Cooldown 10s.
- Punishing Charge: sweep up to 240px with wall checks, 1.6× attack once per enemy; push normal enemies 80px. A blocked push stuns 1.5s. Hitting a taunted enemy refunds 25 rage once per cast, not once per enemy. Cooldown 7s. Bosses cannot be pushed.
- Blood Pact: 8s, 20% actual-damage lifesteal and 20% damage reduction (guard takes precedence). At expiry, consumes all remaining rage for a 170px strike dealing `(1 + rage × .04) × attack`. Cooldown 20s. Spending rage on smash reduces the finale.

## Archer

- Moving Shot: 0.85× attack projectile, 540px/s, 600px range. Hit adds one mark; maximum five, refreshed 8s duration.
- Aimed piercing shot: 650px range, 50% armor penetration, `(1.8 + marks × .5) × attack`, consuming marks on each accepted hit. Empowered shot uses `.85` per mark instead and is consumed once.
- Hunter's Trap: one trap for 10s, contact roots 2s and grants three marks. Snipe within the 4s trap follow-up window explodes for 1× attack and two marks to nearby enemies within 130px. Cooldown 7s.
- Shadow Leap: up to 160px with collision checks, .35s evasion, 2s decoy, next snipe empowered. Cooldown 8s.
- Tracking Rain: 165px area, five pulses over 3s, .55× attack plus .45× against marked targets. A marked kill transfers its bounded marks once to the nearest living enemy within 180px; transfer itself deals no damage, preventing recursive kill loops. Cooldown 12s.

## Growth and authority

New classes use cooldowns and their specified health/rage/mark resources, without Mage MP costs. New basic attacks stay level 1. Actives cap at level 8. Each active level reduces its cooldown by 3% (maximum 21%). Warrior charge/finale and Archer rain gain 8% damage per level. Witch's specified damage/healing/cost/buff values do not scale away from the request. Skill upgrade prices use the existing 300×2^(level−1) manastone curve.

Warrior/Archer boss crowd control is capped at .6s; Witch's requested poison stun remains 3s. Each controller runs only for the locally owned player; peers render presence/effects without replaying owner skill damage. Existing monster-damage events carry status metadata; status-only events have zero damage and cannot create reward hits. Host monster attacks target summon snapshots and return damage to the owning client. Party support verifies sender membership. No Firebase rules, Functions or credentials change.

## Art

Generated raster sprite sheets use the actual `party-rpg-concept` Witch/Guardian/Archer key illustrations and `assets/resource/magicion_front/1.webp` as image references. The approved initial 4×4 character sheets retain the attack cycles. Separate regenerated 4×4 walk sheets contain front/back/right/left poses, including independently authored left-facing equipment. Runtime 8×5 sheets arrange these as back/front/left/right/attack without mirroring. Only four authored frames per runtime row are selected; unused storage cells are never sampled. Walk cycles advance by actual distance traveled (24px per pose), so collision stops the feet and speed changes do not disconnect travel from the cycle. Frame alignment preserves aspect ratio and centers the head over a consistent foot baseline.

Three 4×4 effect sheets contain four frames per skill row; separate Life Drain circle is 4×1. Eight status badges are 4×2. All runtime images are WebP with transparent gutters and immutable content-hash URLs. Frame checks reject empty cells. Sustained effects use a ping-pong sequence; one-shots hold the final frame instead of flashing to an empty cell. Original generated PNGs remain in the generation workspace. Exact approved PNG IDs and row/phase mappings are recorded in `docs/class-walk-art-provenance.json`. Cell extraction removes only detached neighboring-cell fragments before alignment; it does not mirror equipment or repaint limbs.

| Runtime art | Layout / purpose |
| --- | --- |
| `assets/resource/classes/{witch,warrior,archer}-runtime.webp` | 1536×960; four walk directions plus attack, four sampled frames per row |
| `{witch,warrior,archer}-walk.webp` | 768×768; four independently authored directions |
| `{witch,warrior,archer}-effects.webp` | Four skill rows × four animation frames |
| `life-circle.webp` | Four frames for immediate Witch tap circle |
| `status.webp` | Poison, berserk, rage, mark, root, taunt, blood pact, empowered |

The original approved character sheets remain as `{class}.webp`; their attack row is reused. The Witch carries the potion satchel while walking; the spellbook appears in the attack art. Generated walk source IDs: Witch front/back `exec-98374b76-dfd5-47fd-96e3-63847a2d8b30`, sides `exec-5b989420-b472-4c16-b20f-b5ebcb90709c`; Warrior front/back `exec-1b01a56e-9408-4476-ade1-e0b403e5f253`, sides `exec-3424cf9a-7ad4-4738-8228-6691bb873cae`; Archer front/back `exec-6497b6f3-32dc-429e-ab44-a344a73fedae`, side phases 1/2 `exec-2597526d-fb3e-443b-9805-d526c9c90338`, phases 3/4 `exec-da84782b-0a3f-4db6-8bd4-47de1baf6cd3`.

These are initial balance settings, verified in automated fixtures and browser emulation. They are not a claim of physical-phone or production readiness.

## Validation evidence (v0.02.131)

- `npm run validate`: existing content/runtime/camp/save regressions plus 49 class-specific fixtures pass. The class fixtures cover tap/aim, actual-damage healing, poison timer/lockout, insufficient summon HP, oldest replacement, expiry/death disposal, berserk restoration, linked rage/mark interactions, boss CC and online ownership routing.
- `scripts/validate-class-browser.cjs`: isolated touch fixtures at 390×844 and 852×393; 14 cases cover selection, actual attacks/skills, upgrade/save/reload and unchanged Mage progression/item identity. Generated effects and status cells are checked for nonempty pixels.
- `scripts/validate-class-motion.cjs`: four directions and reversals, 144 temporal samples per class, hash-checked runtime assets, collision-stopped feet and frame boundary/center checks. Manual review distinguishes anatomical legs and equipment hands; see `reports/class-motion`.
- Existing inventory interaction, ground-guide ordering, high-level fireball touch hit, and online monster visibility browser regressions pass.
- Real Firebase SDK 10.7.1 against a local mock wire server retains the v130 cache/listener fix: old listener lifecycle reproduces failure, current lifecycle passes. No live user database is touched.

The walking art uses four authored poses per direction. Witch arms follow a low back/down/front/down walking cycle, with the far arm occluded naturally behind the robe; Warrior weapons are carried in a stable guard; Archer's free arm swings. These are compact 2D sprite cycles, not skeletal or eight-direction animation. Physical-phone input/display and real multi-user latency have not been verified.
