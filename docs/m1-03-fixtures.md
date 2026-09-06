# M1-03 setup, core, en-passant, castling, and passive dead-army fixtures

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
rights cleanup; the DEAD slice below adds retained mate armies. New death
actions and walking kings remain future work. Illegal castle requests are also checked through
`applyMoveRequest`; legal sequences assert input immutability.

## Passive dead-army fixture inputs and expected results

Written before behavior changes on 2026-09-06. Source:
[FFA dead armies](../packages/engine/test/ffa-dead.test.ts). Eight scenarios run
in each of the four orientations. Coordinates below are absolute Red-frame
inputs rotated by the shared transform. These are synthetic accepted-contract
fixtures, not new reference-product observations.

DEAD-01/02 reuse CORE's king trap: own King `(3,0)`, Blue Knights `(5,0)`,
`(6,1)`, `(6,2)`, and other Kings `(0,6)`, `(8,10)`, `(13,7)`. An immobile own
army occupies the nine squares at files 3–5, ranks 11–13: Pawns at `(3,11)`,
`(4,11)`, `(5,11)`, `(5,12)`, `(5,13)`, Queen `(3,12)`, Bishop `(4,12)`,
Knight `(3,13)`, Rook `(4,13)`. Every piece is moved; rights/counts start empty.
Mate adds a Blue Rook `(3,3)`; stalemate omits it. Every move is matched against
legal moves and checked for input immutability.

| Fixture | Explicit input / expected result |
| --- | --- |
| FFA-DEAD-01 | Mate trap, Blue to move; Kings `(0,6)→(0,7)`, `(8,10)→(9,10)`, `(13,7)→(12,7)`. Red remains active until its scheduled turn, then becomes checkmated. Exact board retains all ten Red pieces unchanged; turn skips to Blue. Later rotations never reactivate Red. |
| FFA-DEAD-02 | Same sequence without the checking Rook: stalemated, same retained board and skipped turns, including after a trapping Knight moves away. |
| FFA-DEAD-03 | Each dead status, opponent owner, and piece type P/N/B/R/Q/K at `(5,8)`; own Rook `(5,5)` captures it. Zero score delta, captured metadata retained, no new elimination. Also capture Pawn `(3,11)` from `(3,9)` after each actual deferred transition. |
| FFA-DEAD-04 | Dead pawn on a Rook/Queen ray or Bishop diagonal blocks beyond itself but is capturable. Dead pawn at `(6,2)` or `(6,3)` prevents a starting pawn's double push; only the latter permits a single push. Knight `(5,1)→(7,2)` can jump. CASTLE-15 retains exhaustive castle-path coverage. |
| FFA-DEAD-05 | Dead pawn `(7,2)` screens own King `(7,0)` from active Rook `(7,5)`. Removing it exposes check; a Knight capture that replaces the screen is safe. EP from `(7,2)` to `(8,3)` removing dead pawn `(7,3)` exposes that file and is illegal. |
| FFA-DEAD-06 | Each piece geometry attacks own King `(6,5)` while active, then ceases to constrain its moves when passive. No pseudo/legal moves or castles; even an explicitly inactive-turn external request rejects. |
| FFA-DEAD-07 | Pre-resolution trap with saved castling bits and pending EP against Yellow Pawn `(9,8)`, eligible Red/Blue. Green's quiet move resolves Red's death, clears both castle bits and Red's eligibility, preserves Blue's opportunity. CASTLE-16 additionally covers unmoved home pieces in the mate transition. |
| FFA-DEAD-08 | Pre-resolution trap with trapping Knight moved from `(6,2)` to `(6,0)` to leave the target empty; own pushed Pawn `(6,3)` pinned by Blue Bishop `(9,6)`; Blue/Yellow Pawns `(5,3)`/`(7,3)` have an explicit pending right to `(6,2)`. After Green moves and Red dies, retain the pawn/right. Blue captures EP for zero; remove victim and all remaining eligibility. JSON round-trip gives the same result. |

DEAD-07/08 deliberately supply pending-right snapshots, without claiming a
reachable opening history or introducing resignation/timeout actions. EP-01..12
remain the evidence for eligibility creation/expiry from actual legal double
pushes. Awards and walking kings are outside this slice.

## Implementation boundaries

- DEAD retains the board during deferred checkmate resolution. Existing passive
  move/attack filtering, zero-point captures, castling cleanup, and EP cleanup
  satisfy the interaction fixtures without additional rule changes. The suite
  has 32 passing cases. The baseline exposed 12 removal-related failures and
  20 passes after correcting the fixture turn counter; a later EP fixture
  correction freed its accidentally occupied target square.
- Direct consumers now show grey dead armies and accurate elimination text,
  compute check indicators from active players on the resolved board, and omit
  dead material/center/pawn-advancement values in production evaluation. Bot
  evaluation has a focused regression; two browser fixtures exercise actual
  deferred transitions, selection, grey/check rendering, and zero-point capture.
  Search capture ordering remains a heuristic; no search algorithms, weights,
  objectives, or frozen classic sources changed.
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
  changed mate-army transition; DEAD now covers the latter and WALK remains later.
- CORE mate/stalemate fixtures assert timing, status, rescue, and rotation.
  DEAD now covers passive army transitions. Standard awards and placements
  remain separate SCORE/END work.
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

Proposed next: write `FFA-PROMO-01..08` inputs and expected results first,
covering eighth-rank coordinates for every seat, automatic Queen promotion,
one-point capture provenance/value, Queen classification, and no spare king.
Then implement only the promotion slice and necessary consumers. This is not
work started here. Awards and walking kings remain separate SCORE/WALK work.
Continue to reserve standard-v1 and preserve historical sources. SCORE, WALK,
END, DRAW, ABORT, and replay-v2/state-v2 remain later M1-03 work; M2/M3 remain
outside this work.
