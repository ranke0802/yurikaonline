# Yurika Project entry preview

Actual local browser rendering, with fictional nickname 달숲모험가. No live account or Firebase service is used.

Watch desktop-entry-flow.mp4 or portrait-entry-flow.mp4. Animated WebP versions play once. Numbered stills show title, real loading, ready START, lobby nickname modal, lobby, required character selection, and confirmed choice. All five viewport layouts are included.

The title is a short, centered system-font title on black. Resources load concurrently. START appears only after loading completes. START uses original 5×7 pixel glyphs. Other entry/lobby text uses system monospace and square UI borders; no external font was downloaded.

The existing travel painting contains all four heroes in one raster layer. This preview uses slow whole-image camera movement and a separate CSS light gradient. It is not an articulated Live2D model.

START enters CampScene. The actual camp background, table, four character layers, header and navigation are already behind the centered nickname modal. There is no intervening character-creation scene. Existing accounts keep their nickname and progress. Character confirmation is required on departure preparation.

The recording deliberately pauses for review using local auth fixtures, so it is not a measurement of live login/network speed. Desktop/mobile mean Chromium viewport emulation, not physical-device certification. New flow and failure tests passed; baseline commit 9a5d432 passed all 56 existing Actions validation groups locally. The portrait-only revision has separate framing and entry checks. Immutable assets: 279 unchanged; warm/update image downloads: zero bytes.

Only rendered game art/UI and fictitious fixture data are present. Source code, credentials, raw profiles and console logs are excluded.

Portrait framing revision: peripheral scenery is cropped, retaining all four travelers with uniform scale and no blur. On a 393×852 screen the scene occupies about 413px vertically. START/loading controls sit below the scene. The original wide arrangement limits a tall-phone scene to roughly half the viewport height if every traveler must remain visible. Runtime JS, profiles, in-game UI and original art are unchanged. No new character animation assets were made.
