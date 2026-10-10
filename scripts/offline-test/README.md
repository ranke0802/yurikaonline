# Isolated offline test artifacts

This branch-only workflow builds the validated `e344562` solo test copy. It has
no Firebase SDK installation, service account, deployment step, secret reference,
or production probe. It runs only on a push to `test/offline-e344562`; no PR or
manual workflow event is configured. Existing deployment workflows are unchanged.
Do not open a deployment PR to deliver these artifacts.

Only `contents: read` is requested. `actions/upload-artifact` uses its scoped
Actions artifact service; no repository write or service account permission is
granted. Five artifacts expire after one day: four numbered parts and one small
manifest artifact. Each part is at most 24 MiB and uploaded separately with
compression level 0. The complete ZIP is not uploaded or committed to Git.

`build.py` derives a separate copy and checks its content manifest SHA-256 against
the previously played and validated bundle. Runtime modules and immutable asset
bytes stay unchanged; only bootstrap, local save namespace and app manifest are
adapted. The checked-in 2.9 MiB of open-license WOFF files preserve the exact
validated font bytes without a font CDN or system-font-version dependency.
Their copyright and SIL license are in `templates/fonts/LICENSE.txt`.

Browser checks exercise three viewport layouts and four real class selections,
movement, attacks, menus, saved reload and external-connection rejection on
loopback. Artifacts are created only after these checks succeed. No browser
profile or QA screenshots are included in the playable bundle.

Download and extract each GitHub artifact before concatenation:

```sh
cat yurika-offline-e344562.zip.part01 \
    yurika-offline-e344562.zip.part02 \
    yurika-offline-e344562.zip.part03 \
    yurika-offline-e344562.zip.part04 > yurika-offline-e344562.zip
sha256sum yurika-offline-e344562.zip
```

Compare the result with `archive.sha256` in `delivery-manifest.json`, then extract
the combined ZIP and run `python3 serve.py` from its `yurika-offline-e344562`
directory. Open `http://127.0.0.1:8183/` in a browser on the same computer.
ZIP compression bytes can differ between zlib versions; every inner file must
still match the original validated content manifest. The delivery manifest
records both the actual archive hash and whether it matches the original ZIP.

This is a browser-local solo test. Online accounts, friends, parties, multiplayer
and cross-device synchronization are unavailable. It creates no public URL or
tunnel and requires the loopback server to remain running.
