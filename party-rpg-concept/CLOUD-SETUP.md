# Cloud handoff — party RPG prototype

This folder preserves the latest v5 UI prototype alongside the existing game on the mmorpg_online base. No game integration or visual redesign is included.

## Preview

From repository root, with Python 3 available:

```sh
python3 -m http.server 8100 --bind 0.0.0.0
```

Open the environment's forwarded port 8100 at `/party-rpg-concept/index.html`. The prototype uses plain HTML/CSS/JavaScript and requires no npm install, API key, or environment variable. A cloud worker must clone this branch and have its own runtime/port forwarding; GitHub storage alone does not run the app. No dependency on the Mac remains for these copied assets.

## Preserved scope

Opening/loading, camp lobby, party formation, character progression, shop, clan and expedition preparation; source code, current assets, approved character artwork, generation prompts and Unity handoff data. Local browser storage is a prototype save, separate from Firebase game accounts. Four-character combat, real purchases and online clans are not connected.

## Exclusions and provenance

QA screenshots/results/scripts, archive-v1/v2/v3, macOS launcher, caches, logs, node_modules, .git and credentials were not copied. Source assets are kept intact. Mac-specific paths in text/JSON were normalized; `historical-generated-image/` and `../character-layout-study/` references are provenance records, not runtime requirements. Approved character artwork needed by the preview is present in assets. README references to excluded QA directories describe previous verification, not checks bundled here.

Existing game runtime/auth requirements remain separate and unchanged. Next work should connect authoritative game data and scene transitions, then decide how four-character parties participate in combat. Do not treat prototype gold, levels or prices as production values.
