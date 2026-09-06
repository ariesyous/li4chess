# M1-03 setup, core legality, en-passant, and castling fixtures

Implemented 2026-09-06 from the accepted D/O inventory in
[the migration contract](ruleset-versioning.md). The dated coordinate and
behavior evidence remains in [the compatibility audit](rules-compatibility.md).
These are synthetic executable positions, not new Chess.com replay observations.
The inventory defined ID ranges; the individual scenario assignments below make
those ranges concrete without changing their accepted semantics.

All geometry-sensitive core, en-passant, and castling scenarios rotate through Red, Blue,
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

## Castling fixture inputs and expected results

Written before castling behavior changes on 2026-09-06. Source:
[FFA castling](../packages/engine/test/ffa-castling.test.ts). All 16 scenarios
run for each seat (64 tests), with both sides and each other owner's active or
passive status expanded where relevant. These are accepted-contract synthetic
fixtures, not additional live-product observations.

The default input has an unmoved own King at Red-frame `(7,0)`, unmoved own
Rooks at `(3,0)` / `(10,0)`, both rights true, three other home kings, empty
remaining squares, no EP rights, and no prior repetition counts. Inputs rotate
using the shared transform; CASTLE-01/02 use independent absolute outputs:

| Seat | King from | Kingside: rook from, king to, rook to | Queenside: rook from, king to, rook to |
| --- | --- | --- | --- |
| Red | `(7,0)` | `(10,0)`, `(9,0)`, `(8,0)` | `(3,0)`, `(5,0)`, `(6,0)` |
| Blue | `(0,6)` | `(0,3)`, `(0,4)`, `(0,5)` | `(0,10)`, `(0,8)`, `(0,7)` |
| Yellow | `(6,13)` | `(3,13)`, `(4,13)`, `(5,13)` | `(10,13)`, `(8,13)`, `(7,13)` |
| Green | `(13,7)` | `(13,10)`, `(13,9)`, `(13,8)` | `(13,3)`, `(13,5)`, `(13,6)` |

| Fixture | Explicit input / expected result |
| --- | --- |
| FFA-CASTLE-01 | Clear kingside: exact full resulting board above; King/Rook moved flags true, both rights false, next seat, unchanged players/scores and immutable input. |
| FFA-CASTLE-02 | Same assertions for queenside. |
| FFA-CASTLE-03 | Home King missing, moved, replaced by Bishop, or off-home: neither castle exists. |
| FFA-CASTLE-04 | Each home Rook missing, moved, or replaced by Bishop: only that side is unavailable. |
| FFA-CASTLE-05 | Each opponent's unmoved King/Rook on the actor's home square, active or inactive: no foreign-piece castle candidate/legal request. Own King elsewhere prevents missing-king safety from masking ownership. A quiet move cannot grant rights from a foreign dead Rook. |
| FFA-CASTLE-06 | King `(7,0)→(7,1)`, three intervening turns, return: both rights stay false. |
| FFA-CASTLE-07 | Each Rook advances one rank, three intervening turns, return: its right stays false; the other remains true. |
| FFA-CASTLE-08 | Each opponent's Knight captures either home Rook from `(4,2)` or `(9,2)`: only the captured Rook's right is lost. |
| FFA-CASTLE-09 | Explicit saved input with one/both revoked rights and unmoved replacement home pieces; quiet move and JSON round-trip: revoked bits stay false, moves agree, repetition identity differs from both-rights input. |
| FFA-CASTLE-10 | Own/each opponent's Knight on every intervening square: reject that castle, including queenside `(4,0)`. |
| FFA-CASTLE-11 | Each active opponent's Rook at `(7,4)` checks the home King: reject both castles. |
| FFA-CASTLE-12 | Active Rook on rank 4 attacks only transit file 8/6: reject that side, with clear-board positive control. |
| FFA-CASTLE-13 | Active Rook on rank 4 attacks destination file 9/5: reject that side, with clear-board positive control. |
| FFA-CASTLE-14 | Attack only the home Rook file or queenside rook-only path file 4: castle remains legal and applies. |
| FFA-CASTLE-15 | Each inactive owner's Knight on every path square blocks. An off-path dead Bishop on rank 2 screens an active Rook on rank 4 from origin/transit/destination: allow; remove screen: reject. |
| FFA-CASTLE-16 | Rook attacks on origin/transit/destination reject when active, allow when inactive and leave that dead Rook unchanged. Inactive castle owners generate no castles and lose both stored rights on advancement. A pending mate with unmoved home pieces loses both rights in the same transition that eliminates the owner. |

Passive cases explicitly supply `checkmated`, `stalemated`, or `resigned`
snapshots. Only the existing deferred-mate action is used to check immediate
rights cleanup; this does not implement retained mate armies, new death
actions, or walking kings. Illegal castle requests are also checked through
`applyMoveRequest`; legal sequences assert input immutability.

## Implementation boundaries

- Castling fixtures first exposed 12 failures and 52 passes. The fixes require
  own King/Rook ownership, preserve revoked rights across moves, and clear
  inactive/eliminated owners' rights. Existing geometry and active-attack/path
  filtering passed the fixtures and were left unchanged. A pending-mate
  rights-cleanup assertion was added before implementation; all 64 final
  castling tests pass. No other rules behavior changed in the castling slice.
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

Write `FFA-DEAD-01..08` first: explicit post-mate/stalemate boards, retained
passive armies, zero-point captures, no attacks/moves/special rights, path
blocking, and dead-pawn en passant. Then implement only required passive
dead-army transitions/interactions, reusing EP/CASTLE regressions. This is the
next proposed implementation slice, not work started here. Awards and walking
kings remain separate SCORE/WALK work. Continue to reserve standard-v1 and
preserve historical sources. PROMO, SCORE, WALK, END, DRAW, ABORT, and
replay-v2/state-v2 follow as focused M1-03 slices; M2/M3 remain outside this work.
