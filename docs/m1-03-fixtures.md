# M1-03 setup, core legality, and en-passant fixtures

Implemented 2026-09-06 from the accepted D/O inventory in
[the migration contract](ruleset-versioning.md). The dated coordinate and
behavior evidence remains in [the compatibility audit](rules-compatibility.md).
These are synthetic executable positions, not new Chess.com replay observations.
The inventory defined ID ranges; the individual scenario assignments below make
those ranges concrete without changing their accepted semantics.

All geometry-sensitive core and en-passant scenarios rotate through Red, Blue,
Yellow, and Green using the shared board transform. Setup has an independent
absolute-coordinate oracle for all 64 initial pieces; it does not derive its
expected board from the setup implementation. Every move sequence matches a
current legal move and asserts that applying it leaves the input state unchanged.

## Executable coverage

| Fixture | Explicit input / expected result |
| --- | --- |
| FFA-SETUP-01 | Red's eight back-rank and eight pawn squares, 160-square board and Red-first opening. |
| FFA-SETUP-02 | Blue's absolute coordinates and outward orientation; clockwise opening. |
| FFA-SETUP-03 | Yellow's absolute coordinates and outward orientation; clockwise opening. |
| FFA-SETUP-04 | Green's absolute coordinates and outward orientation; clockwise opening. |
| FFA-CORE-01 | A bishop pinned to its king by each other seat's active rook cannot leave the line. |
| FFA-CORE-02 | A checked mover may block the attack but cannot play an unrelated move. |
| FFA-CORE-03 | Reject orthogonally adjacent active kings. |
| FFA-CORE-04 | Reject diagonally adjacent active kings. |
| FFA-CORE-05 | Rook, Bishop, and Queen cannot capture an active king. |
| FFA-CORE-06 | Pawn, Knight, and King cannot capture an active king. |
| FFA-CORE-07 | Double push requires an unmoved pawn on its starting line and two clear squares. |
| FFA-CORE-08 | A checked player with no move remains active during intervening turns; mate resolves at its scheduled turn. |
| FFA-CORE-09 | An intervening player captures the checker and rescues the pending mate. |
| FFA-CORE-10 | Stalemate likewise resolves only at the affected player's scheduled turn. |
| FFA-CORE-11 | An intervening player moves a knight, creates an escape, and rescues pending stalemate. |
| FFA-CORE-12 | Skip checkmated, stalemated, and resigned seats; their move sets are empty. |
| FFA-EP-01 | Each opponent's two diagonal approach squares can reach the skipped square; capture removes the recorded pushed pawn and scores +1 when active. |
| FFA-EP-02 | Three eligible owners retain their opportunity through intervening turns. |
| FFA-EP-03 | Declining consumes only that owner's opportunity permanently. |
| FFA-EP-04 | Two double pushes coexist as independent rights; each can subsequently be captured. |
| FFA-EP-05 | One en-passant capture consumes all rights against that victim. |
| FFA-EP-06 | An ordinary capture of the victim removes its pending right. |
| FFA-EP-07 | A pawn arriving after the push does not retroactively make its owner eligible. |
| FFA-EP-08 | A geometrically eligible pinned pawn cannot expose its king. |
| FFA-EP-09 | Removing both the moving and captured pawn can expose a rook line; reject that move, with an unattacked positive control. |
| FFA-EP-10 | An explicit post-death snapshot retains the victim; an eligible active pawn captures it en passant for zero points. |
| FFA-EP-11 | Inactive owners cannot acquire/use rights and are removed from pending eligibility. |
| FFA-EP-12 | JSON round-trip preserves moves/results; repetition identity distinguishes the full right and eligible owners. |

Source tests: [setup](../packages/engine/test/ffa-setup.test.ts),
[core](../packages/engine/test/ffa-core.test.ts),
[en passant](../packages/engine/test/ffa-en-passant.test.ts), and
[boundary regressions](../packages/engine/test/ffa-state-boundary.test.ts).
Additional [protocol](../packages/protocol/test/serialization.test.ts),
[bot hash](../packages/bot/test/hash.test.ts), and
[arena](../packages/arena/test/arena.test.ts) checks cover serialization,
pending-right identity, and historical-input rejection. No REPLAY fixture ID is
claimed: JSON move reproduction is not the accepted replay-v2 event/hash schema.

## Implementation boundaries

- The old single `enPassantTarget` could not represent overlapping pushes or
  per-owner expiry. `enPassantRights` now records target, victim square/owner,
  and eligible owners. Eligibility is geometric at the push; ordinary own-king
  safety is evaluated on the board at the eventual capture turn.
- Inactive `PlayerState.status` is sufficient for the explicit passive dead-pawn
  input in this slice. It is not sufficient for a dead army with a live walking
  king. FFA-EP-10 deliberately does not assert a resignation/timeout action or a
  changed mate-army transition; those remain FFA-DEAD/WALK work.
- CORE mate/stalemate fixtures assert timing, status, rescue, and rotation.
  Standard awards, dead-army transitions, and placements remain their separate
  DEAD/SCORE/END fixtures. The local engine still removes mate armies.
- `rulesetId: null` marks a local, partial migration state, not a sixth ruleset
  identifier. Standard-v1 remains reserved; state-v2 and replay-v2 remain future
  schemas. The current format fence rejects old/labelled snapshots; it is not
  full runtime validation. Historical records require their producing revision
  or a future explicit compatibility reader and provenance manifest.
- The arena's existing in-memory harness is used for regression tests only in
  this slice. No new research measurements were generated; its v1 output is not
  the accepted replay-v2 format and must not be published as new versioned
  research evidence before that migration is complete.

## Exact next slice

Write `FFA-CASTLE-01..16` first: both castle sides for all four seats, exact
king/rook destinations, moved/captured/wrong-owner pieces and lost rights,
check/transit/destination restrictions, and passive dead-path blocking/no
attack. Then implement only the required ownership/rights/path fixes. Continue
to reserve standard-v1, preserve historical sources, and run all four required
checks. DEAD, PROMO, SCORE, WALK, END, DRAW, ABORT, and replay-v2 follow as focused
M1-03 slices; M2/M3 remain outside this work.
