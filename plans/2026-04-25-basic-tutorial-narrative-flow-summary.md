# Basic Tutorial Narrative Flow Summary

Date: 2026-04-25
Owner: Tutorial/Narrative Flow Worker

## Goal

Shorten `basic_training` from a long systems tutorial into a brief opening play beat that feels like the father protecting Yurika at the cabin door.

## New Flow

1. `move_check` - Walk quietly to the cabin door.
2. `attack_dummy` - Use basic attack to cut off the blue trace at the threshold.
3. `open_skill` - Open the skill window after finding a fallen manastone.
4. `upgrade_missile` - Spend the fallen manastone to strengthen Magic Missile.
5. `use_missile` - Fire Magic Missile at a distant threat beyond the fence.
6. `open_inventory` - Open the bag and learn where manastones and quest rewards gather.

## Compatibility Notes

- Kept existing tutorial triggers: `move`, `kill`, `popup_open`, `skill_upgrade`, `skill_use`.
- Kept existing targets: `training_dummy`, `skill-popup`, `missile`, `inventory-popup`.
- Kept existing action types only: `close_popups`, `clear_tutorial_monsters`, `spawn_monster`, `grant_manastone`.
- Did not modify `src/js/core/TutorialManager.js`.
- Korean, Japanese, and English text is supplied through the existing nested `i18n` pattern.

## Verification

- `jq empty assets/data/tutorials/basic_training.json`
- `jq '.steps | length' assets/data/tutorials/basic_training.json`
