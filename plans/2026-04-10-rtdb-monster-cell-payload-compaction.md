# 2026-04-10 RTDB Monster Cell Payload Compaction

## Scope
- Branch: `mmorpg_online`
- Phase: multiplayer runtime stabilization
- Goal: reduce Firebase RTDB download volume without degrading perceived combat/movement UX

## Decision
- Do not reduce monster sync frequency first.
- Keep current host authority and guest smoothing behavior.
- Compact only the live `monster_cells/*` payload shape.
- Keep `monster_host_snapshot/*` in the existing rich shape for hydration and recovery paths.

## Why
- User-visible complaints are about movement feel, charge smoothness, and state correctness.
- Lowering sync frequency first risks making chase/charge feel worse.
- The live `monster_cells` path is the highest-frequency read path during auto-hunt.
- Many monster fields are repeated on every RTDB update even when they rarely change.

## Implementation
- Encode live monster cell payloads with shorter keys and compact state/type values.
- Decode back to the existing rich runtime shape on the client immediately after receipt.
- No runtime consumer API changes outside the `NetworkManager` cell payload boundary.

## Files Impacted
- `src/js/core/NetworkManager.js`

## Tradeoffs
- Slightly more encode/decode logic in `NetworkManager`.
- Better bandwidth efficiency without changing gameplay cadence.
- `monster_host_snapshot` remains richer/heavier by design because hydration correctness is more important than size there.
