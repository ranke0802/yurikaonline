# Class audio audit

The Mage's existing Web Audio oscillator, filtered-noise, envelopes and JSON music scores remain the audio implementation. New classes previously emitted visual events without any sound calls. The class bridge now sends only committed local gameplay events to `SoundManager.playClassEvent`; received network visual snapshots do not invoke audio or damage.

22 short synthesized cues cover life circle, drain orb/contact/return healing, poison throw/landing/tick, summon, berserk, slash, smash, challenge, charge, blood pact/finale, arrow, snipe, trap place/trigger/burst, leap and rain. These reuse the Mage synthesis primitives, with no external sound service or purchased samples. Sound starts at the gameplay effect event, not button-down/aim start. Rejected cooldown/resource attempts and cancellation produce no success sound. Existing monster hit sounds remain responsible for enemy impact; no duplicate generic impact cue was added. Poison tick is deliberately quiet and limited to one per 350 ms across targets; other identical cues are limited to 75 ms. Explicit event IDs prevent replay.

Music remains scene-based and independent of class. Intro/camp, field, boss, and return keep their existing scores. A menu pause keeps music playing as before while paused combat emits no actions. Hidden tabs silence the master output and skip new SFX; foreground restores the saved volume/mute. Browser-interrupted contexts resume through the existing capture-phase user gesture handler, without consuming input or requesting fullscreen. Muting does not reset the active score. An automatic resume without a user gesture is not attempted.

Verification artifacts:
- `reports/class-audio/synthesis-report.json`: every new cue rendered through Chromium OfflineAudioContext; finite, nonzero, unclipped PCM, duplicate/remote/mute/background/volume guards.
- `reports/class-audio/class-sfx-sampler.wav`: actual synthesized PCM, cues in JSON order at 1.25-second intervals, 24 kHz mono. This is a QA sample, not a runtime downloaded asset.
- Existing `scripts/audio-tests/validate-audio.cjs`: all existing music scores and Mage sound primitives.
- `reports/class-audio/mage-lifecycle-report.json`: real Chromium audio graph output in camp/field, touch after suspended context, return, and saved mute/volume after reload.
- `reports/class-audio/gameplay-report.json`: local browser class attacks/skills, accepted/rejected attempts and measured SFX-bus PCM.

PCM measurements establish scheduling and non-silence, not subjective listening quality or hardware-speaker output. Physical Android/iOS audio interruptions, hardware speakers, and production multiplayer remain unverified. Remote class casts are intentionally owner-audible only to avoid repeated snapshot audio; existing shared monster cues remain unchanged.
