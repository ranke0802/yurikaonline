YURIKA ONLINE — NATIVE PWA ICON DELIVERY

New generated raster spellbook crest for the installed app's home-screen icon and operating-system launch splash. This is additive art delivery and does not change the game's loading screen or application code.

ART DIRECTION
A violet spellbook, luminous cyan diamond, gold crescent, silver sword and gold bow reflect the approved game art and its magic, warrior and archer classes. No text is baked into the icon.

INCLUDED RUNTIME FILES
runtime/icon-192.png and runtime/icon-512.png: manifest purpose "any"
runtime/icon-maskable-192.png and runtime/icon-maskable-512.png: purpose "maskable"
runtime/apple-touch-icon.png: 180px Apple touch icon
runtime/favicon-32.png and runtime/favicon-48.png: favicon options
All PNGs are opaque RGB and retain PNG compatibility for native/PWA use.

INCLUDED PREVIEWS AND METADATA
YurikaOnline-PWA-icon-preview.webp: standard rendition
YurikaOnline-PWA-maskable-preview.webp: maskable rendition
qa/YurikaOnline-PWA-icon-QA.webp: actual-size 48/96/192px samples and circular-mask preview
manifest.json: image dimensions, SHA-256 hashes, manifest icon entries, suggested colors, and safe-zone check
SHA256SUMS.txt: hashes for every included artifact

INTEGRATION NOTES
The two "any" and two "maskable" entries in manifest.json are intended to be copied into the actual PWA manifest after adjusting paths to the deployed asset location. manifest.json is an art-delivery manifest, not a replacement application manifest.
Suggested native splash background and theme color: #110f28
Preserve the app name as operating-system metadata, separate from the artwork.

QA
Regular and maskable variants derive from the identical final generated artwork. Regular icons use a centered crop; maskable variants retain safe margins. The meaningful emblem lies within the centered 80%-diameter safe circle. A conservative bright-motif check found zero pixels outside that circle, with maximum radius 407.044px on a 1024px canvas, inside the 409.6px safe radius. The circular and 48/96/192px preview checks passed.
