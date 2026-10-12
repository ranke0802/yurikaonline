# Yurika entry preview

These are actual rendered screens and recorded browser transitions from local implementation commit `4b137166ac9dc56724f7721229e9624fa19733ce`, based on `mmorpg_online/e34456219cbeaa2679625f7e109b10d1377b2706`.

Start with:

- `entry-overview.webp`: logo → loading → login → camp overview.
- `desktop-entry-flow.webp` / `portrait-entry-flow.webp`: animated WebP captures.
- `desktop-entry-flow.mp4` / `portrait-entry-flow.mp4`: approximately 11-second H.264 versions.
- Other WebP files: full-size desktop, portrait and landscape screenshots.

Authentication and profile responses are local mocks. Capture-only pauses keep each state visible; the game has no mandatory logo delay or fabricated progress. No real Google account or Firebase service was used. Native installed-PWA splash and physical-device behavior were not tested.

`manifest.json` lists every media file's exact byte count and SHA-256. Original game artwork was reused unchanged. The implementation, production branch and previous offline test branch are not included or modified by this delivery.

This branch only verifies and uploads preview files to a GitHub Actions artifact with a 2-day retention. It contains no Firebase configuration, deployment workflow, PR trigger, game server or application code.
