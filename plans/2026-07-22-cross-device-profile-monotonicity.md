# Cross-device profile monotonicity

## Problem

An account could show a lower, healthy-looking root profile on a second device even after the first device crossed a level threshold.  The login path only checked `recovery_profiles/{stableUid}` when the root looked missing or corrupt, and ordinary progression explicitly disabled recovery synchronization.  A level 24 profile could therefore be hidden behind a valid level 23 root.

## Decision

Keep `users/{uid}/profile` as the authoritative mutable profile and retain its guarded RTDB transaction writes.  At character selection, always compare that root with the one bounded recovery mirror.  Do not load `profileBackups` unless existing reset/corruption signals require it.  The existing candidate comparator chooses the greatest cumulative experience before timestamp, so a level 24 profile cannot be displaced by a newer level 23 snapshot.

## Durability boundary

When experience crosses a level threshold, publish the already-committed profile to `recovery_profiles/{stableUid}` immediately.  Normal EXP remains a compact journalled patch and does not create a recovery write per monster kill.  This adds one small bounded recovery synchronization per level-up, preserving runtime/RTDB behavior while making a newly reached level available to another device.  The recovery lookup resolves the profile's stable recovery UID, so a pre-link guest mirror also survives Google-account migration.

## Live-device handoff

Replacing a live session formerly blocked the old device before its compact local journal could be committed, while the new device immediately read the old root profile.  The replacement session now waits for a bounded acknowledgement (900 ms maximum) that the previous session flushed queued profile writes and its local durable journal.  The old client is then blocked as before.  If it is already offline, the new client proceeds after the timeout; it never waits indefinitely or downloads backups.

## Safety and validation

- Both writes use the existing same-account profile transaction and recovery monotonic EXP guard; no new database path or broader Firebase rule is introduced.
- A lower-EXP writer remains unable to replace higher committed progression.
- Runtime integration validation covers forced recovery comparison at character selection and immediate recovery synchronization for both level-up paths.
- `profileBackups` stays an exceptional recovery path, not a normal login payload.
