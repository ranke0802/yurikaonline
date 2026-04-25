# Generated Runtime Assets

Imagegen-produced raster assets for Yurika Online. Runtime art should reference WebP files here rather than SVG or canvas-drawn placeholder props.

## Usage Notes

- Prefer the WebP files for Firebase-hosted runtime references.
- Object WebP files include alpha and can be layered over canvas/world scenes.
- Suggested import/reference path format: `assets/generated/<category>/<file>`.
- Keep source game code/data wiring in `src/**`, `index.html`, or `assets/data/**` to a separate integration pass.

## Asset Index

| File | Purpose | Recommended size | File size | Reference path |
| --- | --- | --- | --- | --- |
| `backgrounds/opening_guardian_oath.webp` | Opening key art: father guarding Yurika outside the cottage | 1600x900 | 156 KB | `assets/generated/backgrounds/opening_guardian_oath.webp` |
| `backgrounds/prologue_guardian_oath.webp` | Prologue key art: father and Yurika at the forest cottage | 1280x720 | 120 KB | `assets/generated/backgrounds/prologue_guardian_oath.webp` |
| `backgrounds/opening_moonwell_ruins.webp` | Legacy opening still fallback | 1280x720 | 36 KB | `assets/generated/backgrounds/opening_moonwell_ruins.webp` |
| `backgrounds/prologue_lantern_forest_path.webp` | Prologue forest path story still | 1280x720 | 43.8 KB | `assets/generated/backgrounds/prologue_lantern_forest_path.webp` |
| `concepts/zone_1_windhill.webp` | AI-generated wide concept/story art: Wind Hill cottage field | 1536x864 | ~100 KB | `assets/generated/concepts/zone_1_windhill.webp` |
| `concepts/town_moonwell.webp` | AI-generated wide concept/story art: Moonwell town | 1536x864 | ~156 KB | `assets/generated/concepts/town_moonwell.webp` |
| `concepts/field_dark_forest.webp` | AI-generated wide concept/story art: Dark Forest approach | 1536x864 | ~104 KB | `assets/generated/concepts/field_dark_forest.webp` |
| `concepts/dungeon_lantern_woods.webp` | AI-generated wide concept/story art: Lantern Woods dungeon mood | 1536x864 | ~96 KB | `assets/generated/concepts/dungeon_lantern_woods.webp` |
| `characters/yurika_spritesheet.webp` | Imagegen Yurika runtime sprite sheet, 8 frames x 5 rows | 2048x1280 | ~172 KB | `assets/generated/characters/yurika_spritesheet.webp` |
| `characters/yurika_portrait_smile.webp` | Imagegen Yurika dialogue portrait: smile | 512x512 | ~12 KB | `assets/generated/characters/yurika_portrait_smile.webp` |
| `characters/yurika_portrait_anxious.webp` | Imagegen Yurika dialogue portrait: anxious | 512x512 | ~12 KB | `assets/generated/characters/yurika_portrait_anxious.webp` |
| `characters/yurika_portrait_frightened.webp` | Imagegen Yurika dialogue portrait: frightened | 512x512 | ~12 KB | `assets/generated/characters/yurika_portrait_frightened.webp` |
| `loading/loading_moonwell_town_gate.webp` | Map travel loading art: town arrival | 960x540 | 16.5 KB | `assets/generated/loading/loading_moonwell_town_gate.webp` |
| `loading/loading_lantern_woods.webp` | Map travel loading art: lantern woods | 960x540 | 13.0 KB | `assets/generated/loading/loading_lantern_woods.webp` |
| `loading/loading_ash_rune_cavern.webp` | Map travel loading art: ash rune cavern | 960x540 | 15.9 KB | `assets/generated/loading/loading_ash_rune_cavern.webp` |
| `loading/loading_guardian_oath.webp` | Map/cutscene loading art: cottage guardian scene | 960x540 | 75 KB | `assets/generated/loading/loading_guardian_oath.webp` |
| `objects/tree_moon_birch.webp` | Transparent world prop: moon birch tree | 384x512 | 6.3 KB | `assets/generated/objects/tree_moon_birch.webp` |
| `objects/tree_twisted_lantern.webp` | Transparent world prop: lantern tree | 384x512 | 6.5 KB | `assets/generated/objects/tree_twisted_lantern.webp` |
| `objects/rock_moss_cluster.webp` | Transparent world prop: moss rock cluster | 384x256 | 3.3 KB | `assets/generated/objects/rock_moss_cluster.webp` |
| `objects/rock_rune_obelisk.webp` | Transparent world prop: rune obelisk | 320x448 | 7.1 KB | `assets/generated/objects/rock_rune_obelisk.webp` |
| `objects/sign_moonwell_crossroads.webp` | Transparent generated world prop: moonwell crossroads sign | 320x256 | 8.3 KB | `assets/generated/objects/sign_moonwell_crossroads.webp` |
| `objects/barricade_broken_wood.webp` | Transparent generated world prop: broken barricade | 448x256 | 16 KB | `assets/generated/objects/barricade_broken_wood.webp` |
| `objects/rock_rune_marker.webp` | Transparent generated world prop: small rune marker | 256x320 | 15 KB | `assets/generated/objects/rock_rune_marker.webp` |
| `objects/building_witch_cottage.webp` | Transparent world prop: witch cottage | 640x480 | 10.4 KB | `assets/generated/objects/building_witch_cottage.webp` |
| `objects/building_moonwell_shop.webp` | Transparent world prop: moonwell shop | 640x480 | 10.3 KB | `assets/generated/objects/building_moonwell_shop.webp` |
| `objects/building_rune_gate.webp` | Transparent world prop: rune gate | 512x512 | 11.9 KB | `assets/generated/objects/building_rune_gate.webp` |
| `objects/shrub_glow_mushroom.webp` | Transparent world prop: glow mushroom shrub | 256x256 | 5.2 KB | `assets/generated/objects/shrub_glow_mushroom.webp` |
| `objects/lamp_crystal_post.webp` | Transparent world prop: crystal lamp post | 256x384 | 6.4 KB | `assets/generated/objects/lamp_crystal_post.webp` |
| `ui/ui_panel_moon_etched.webp` | UI panel with transparent rounded body | 512x256 | 4.0 KB | `assets/generated/ui/ui_panel_moon_etched.webp` |
| `ui/ui_texture_parchment_mist.webp` | Repeatable-ish UI mist/parchment texture | 512x512 | 22.7 KB | `assets/generated/ui/ui_texture_parchment_mist.webp` |

## Integration Suggestions

- Opening/prologue backgrounds: prefer the wide `concepts/*.webp` stills for cinematic story panels so mobile landscape does not crop tall reference images.
- Character runtime: `characters/yurika_spritesheet.webp` is loaded before the legacy magician sprite sheet and preserves the existing 8-frame x 5-row canvas contract.
- Map loading: choose one of the three `loading/*.webp` files by destination zone id before scene transition.
- World props: use `objects/*.webp` as decorative overlays or tile-adjacent props in zone definitions after collision bounds are decided.
- UI: use `ui/ui_panel_moon_etched.webp` behind dialogue/system panels and `ui/ui_texture_parchment_mist.webp` for subtle panel fill or modal backplates.

## World Wiring Notes

- Zone object visuals should set `generatedImage` first and keep legacy `image` as a fallback reference.
- Use lightweight visual modifiers such as `mirrorX` and `opacity` in zone JSON to vary repeated props without adding more bitmap files.
- Keep portal arrival spawn points outside destination portal trigger rectangles; `WorldScene` also applies a short arrival cooldown and requires the player to exit the trigger before another prompt can open.
- Path and terrain patch objects should use `assets/generated/overlays/*.webp`.

## Source Scripts

- `scripts/import-imagegen-pixel-assets.py`: imports imagegen character, portrait, background, and monster atlases as WebP runtime assets.
- `scripts/import-imagegen-world-assets.py`: imports imagegen world props, terrain tiles, overlays, and emotes as WebP runtime assets.
