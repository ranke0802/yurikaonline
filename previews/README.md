# Yurika text wordmark preview

Actual browser renders and recordings from local implementation `37bc6d8dca100c0e2046e6839878f0581ec2829f`, based on `mmorpg_online/e34456219cbeaa2679625f7e109b10d1377b2706`.

The entry wordmark now uses system-font YURIKA / ONLINE lettering. Its position, size and opacity stay fixed from boot through login and character creation. Only the panels fade briefly. Camp uses a smaller text header. Existing art is unchanged; no new image or font download was introduced.

- `entry-overview.webp`: loading, login, character creation and camp.
- `desktop-entry-flow.mp4` / `portrait-entry-flow.mp4`: PC and mobile transition videos.
- `desktop-entry-flow.webp` / `portrait-entry-flow.webp`: animated previews that play once, then hold the camp screen.
- Other WebP files: full-size desktop, portrait and landscape screenshots.

The five responsive entry cases passed, including first creation, returning accounts, failure recovery and reduced motion. Wordmark geometry changed by 0 px; all 125 desktop and 126 portrait recorded entry frames retained the same main-letter pixel bounds. Local cache checks passed with 0 unchanged-image response bytes during warm/update transitions. The separate full regression suite was still running when these preview files were packaged.

Authentication/profile responses are local mocks; the visible character name is fictional. Capture-only pauses make each state reviewable. No real Google account or Firebase service was used. Installed-PWA splash and physical-device behavior were not tested.

`manifest.json` lists exact media bytes and SHA-256 values. This delivery contains only preview files and an artifact workflow, with 2-day retention. No game implementation, Firebase configuration, production deployment or pull-request workflow is included.
