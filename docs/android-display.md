# Android landscape and fullscreen entry (v0.02.135)

Installed launches already declare `display: fullscreen` with a standalone fallback and `orientation: landscape-primary` in `manifest.json`. Supporting Android browsers may apply these automatically when launching the installed app. A normal web link does not acquire those privileges just by opening.

On Android, the first trusted guest/start/create/depart button click requests standard `document.documentElement.requestFullscreen({navigationUI:'hide'})` synchronously, before asynchronous authentication/profile work. After success, `screen.orientation.lock('landscape')` is attempted. Existing `autoFullscreen: false` is respected for automatic entry. Google popup login is deliberately excluded so fullscreen does not consume its activation; subsequent game entry performs the request.

A refusal, unsupported orientation, or a four-second transition deadline displays a dismissible, non-modal rotation/retry notice. The user can continue playing. Ordinary clicks, rotation, pageshow and visibility restoration do not repeatedly request fullscreen. Exiting fullscreen unlocks orientation and offers an explicit retry without reentering. Backgrounding invalidates pending completion. No persistent permission, OS rotation setting, or browser-policy bypass is used. Desktop/iOS retain their existing paths.

The existing viewport resize/input reset and CSS safe-area layout are reused. The notice uses safe-area insets and lets pointer events pass through its text; only its buttons receive input.

References checked 2026-10-01:
- https://fullscreen.spec.whatwg.org/ — transient activation and user exit.
- https://www.w3.org/TR/screen-orientation/ — fullscreen preconditions and unlock on exit.
- https://www.w3.org/TR/appmanifest/#orientation-member — supported installed-app orientation.

Validation: actual desktop Chromium Fullscreen API with an Android user agent/touch viewport, plus separately labeled mocks for orientation success/refusal/installed mode. This is not an Android physical-device or installed-PWA certification. Mobile Chrome, Samsung Internet and embedded browsers may impose additional policy limits. The runtime does not promise fullscreen on link opening in ordinary browser tabs.
