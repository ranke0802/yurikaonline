YURIKA ONLINE — GENERATED RASTER INTRO LOGO
Created 2026-10-03 with the built-in image_gen tool

ART DIRECTION
Replaces the boxed reference mark while retaining the recognizable winking
chibi witch, cyan hat, pink-and-blue hair, crescent wand, and exact title.
Generated painted fantasy raster artwork with cyan/pink/purple and gold accents.
No SVG/vector artwork. The original two generated PNG files are preserved.

RUNTIME ASSETS
final/yurika-online-intro-logo-768.webp — primary, transparent 768 x 768
final/yurika-online-intro-logo-512.webp — lighter source, transparent 512 x 512
final/yurika-online-intro-glint-128.webp — optional glint, transparent 128 x 128

Use responsive selection so the browser downloads just one main logo size.
512 fits small or low-DPR layouts; 768 provides sharper 300–400 CSS px branding.
Use versioned or content-hashed public names and long-lived immutable caching.
Do not ship source PNGs, previews, or the ZIP in the critical loading path.

ANIMATION GUIDANCE
This is a pre-loading intro, not the game's load-progress indicator.
Show the main logo centered on the existing dark fantasy loading surface.
Fade opacity 0 to 1 while scale settles from 0.94 to 1 over about 500 ms.
Optionally move the supplied glint once, slowly, over the main word at y=70%
of the square logo box, from x=18% to x=82%, over about 650–850 ms.
Glint CSS size: 32–48 px; opacity rises smoothly to at most 0.7 then returns to 0.
Do not loop the glint, flash the logo, or use a repetitive brightness pulse.
The character's baked-in wink is part of the raster art, not an animated eyelid.
Use transforms/opacity rather than raster-frame loops to keep download compact.
In prefers-reduced-motion mode, render the same still logo immediately without
the scale or moving glint. Loading must remain functional if the glint fails.
Suggested total presentation is about 1.5–2 seconds, subject to the application's
existing loading state; never hold up completed navigation solely for this art.

VISUAL QA
True RGBA transparency validated in source and decoded WebP files.
Exact YURIKA ONLINE spelling checked visually.
Dark #0f1024 and light #f3edff composites checked at 640, 320, and 200 px.
The two mobile QA preview files are examples, not runtime backgrounds.
See manifest.json for byte counts, SHA256 hashes, dimensions, and alpha bounds.

GENERATION
The exact generation prompts are preserved in source/prompts.txt.
Screenshot and approved equipment art were used only as identity/style references.
