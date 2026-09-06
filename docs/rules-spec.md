# li4chess rules specification — partial M1 migration

> **Implemented behavior as of 2026-09-06, not full standard FFA.** The first
> M1-03 slice implements the accepted setup, core-legality, and en-passant
> fixtures. The remaining house behavior is identified below. The complete
> target is the accepted [migration contract](ruleset-versioning.md), supported
> by [the audit](rules-compatibility.md). `li4chess-ffa-standard-v1` stays reserved.

The pre-migration specification is preserved in
[rules-spec-house-ffa-v1.md](rules-spec-house-ffa-v1.md), from commit
`bb6677439c159a9b53ce3a5029982f667c4a99d4`. Historical records must use their
producing revision or an explicit compatibility reader, never this reducer.
See [the executable fixture map](m1-03-fixtures.md) for coverage and boundaries.

## Board and setup

- A 14×14 array uses `(file, rank)` in `0..13`, with flat index `rank * 14 + file`.
- The four 3×3 corners are cut out: `(file < 3 || file > 10) && (rank < 3 || rank > 10)`. There are 160 playable squares.
- Each seat has eight pawns in front of `R N B Q K B N R`, in its outward baseline frame. The Queen is left of the King. All 64 starting squares have independent coordinate assertions.

| Seat | Back rank, queenside to kingside (zero-based) | Pawn line | Queen / King |
| --- | --- | --- | --- |
| Red | `(3,0)` through `(10,0)` | rank 1, files 3–10 | `(6,0)` / `(7,0)` |
| Blue | `(0,10)` through `(0,3)` | file 1, ranks 3–10 | `(0,7)` / `(0,6)` |
| Yellow | `(10,13)` through `(3,13)` | rank 12, files 3–10 | `(7,13)` / `(6,13)` |
| Green | `(13,3)` through `(13,10)` | file 12, ranks 3–10 | `(13,6)` / `(13,7)` |

Shared `localToBoard`, `boardToLocal`, and `localSquare` transforms express
player-relative geometry. Pawns advance toward increasing rank (Red), increasing
file (Blue), decreasing rank (Yellow), or decreasing file (Green).

## Turn order and ordinary legality

Red always starts. Rotation is Red → Blue → Yellow → Green → Red, skipping
inactive seats. Inactive players generate no moves. The current game ends when
only one player remains active; the target's point-based endings remain later work.

Moves obey ordinary piece geometry and occupancy. A pawn's two-square push
requires `hasMoved: false`, its designated starting line, and two empty squares.
A legal move must leave the mover's own king safe from every active opponent.
Absolute pins and both orthogonal and diagonal king adjacency are enforced.
An active king cannot be captured, even if removing it would appear to leave the
mover safe. Inactive pieces occupy and block squares but do not constrain legal
moves through attacks; they remain capturable for zero points.

`legalMoves` and `hasLegalMove` share the legality filter. Low-level `applyMove`
assumes its move is legal. External intentions use `applyMoveRequest`, which
matches source, destination, and promotion against the current turn's legal
moves, then applies the engine-generated move. Supplied piece/capture/special-
move metadata is not trusted. Finished games reject requests. The local app uses
this boundary; arena engine replies/replay moves also match generated legal moves.
This is not network seat authorization or a complete network protocol.

`Move.isCheck` reports **all** active opponents left in check after a move,
including continuing checks. It does not mean newly delivered checks and must
not be used directly as a future multi-check award ledger.

## Deferred checkmate and stalemate

An opponent with no legal moves is resolved only when rotation reaches that
opponent, using the board at that time. For example, Blue can check Red, then
Yellow and Green move before Red is assessed. An intervening move can capture
the checker or create an escape. Tests cover both mate and stalemate rescue.
The mover only has to protect its own king; another player's pending check does
not force an immediate response from an intervening player.

**Remaining house transition:** on its scheduled turn, a player with no legal
moves while checked becomes `checkmated`; its king and all pieces are removed
without a capture award. A player with no legal moves while not checked becomes
`stalemated`; its pieces remain passive and capturable. Both are skipped.
Standard FFA's retained dead mate armies and mate/stalemate awards are not yet
implemented. `resigned` is a representable inactive status, but there is still
no resignation, timeout, or walking-king action.

## En passant

Any active opponent whose pawn attacks the skipped square immediately after a
double push becomes eligible. Each eligible owner has one opportunity on its
next scheduled turn; making any other move consumes only that owner's right.
Other players' moves do not globally expire it. Eligibility is geometric at the
push, so a pinned pawn can confer eligibility but its eventual capture must
still pass own-king safety. A later-arriving pawn cannot retroactively confer
eligibility on an owner who was not eligible at the push.

`GameState.enPassantRights` is an immutable array of pending double pushes. Each
record contains `target`, `pawnSquare`, `pawnOwner`, and `eligiblePlayers`.
Multiple pushes may coexist. Capture uses the stored victim square, not the
capturer's forward axis: adjacent as well as opposite seats can capture.
The destination must be empty. The simulation removes both the source pawn and
the victim before checking the capturer's king, rejecting pins and discovered
rook attacks. An en-passant or ordinary capture of the victim removes all its
pending rights; moving the victim also invalidates them. Inactive eligible
owners lose their rights and cannot exercise them.

If an eligible opponent's target pawn remains on the board after its owner
becomes inactive, it can still be captured en passant for **zero points**. The
fixture supplies that explicit post-death state. It does not implement the later
resignation/timeout or retained-mate-army transitions. The old opposite-seat-only
claim and next-global-move expiry were implementation errors, now replaced.

## Castling — existing implementation, dedicated migration next

Both castles use shared local-frame geometry. The king moves two files toward
the rook; the rook moves to the intervening square. The implementation requires
unmoved home pieces, clear intervening squares, and a king that is neither in
check nor crossing/landing on an active opponent's attack. Occupying inactive
pieces block the path. Rights are currently recomputed from home-piece state.
The known ownership/rights edge cases still require `FFA-CASTLE-01..16`; this
slice does not claim complete standard castling coverage.

## Promotion — remaining house behavior

A pawn promotes at local rank 13 (the far edge), with Queen, Rook, Bishop, or
Knight choices in the engine. The app automatically selects Queen. Standard
FFA's automatic eighth-rank one-point Queen and provenance are not implemented.

## Scores and placements — remaining house behavior

Active captures score Pawn 1, Knight 3, Bishop 3, Rook 5, Queen 9, King 0.
All captures of inactive material, including en passant, score zero. There are
no mate, stalemate, multi-check, survivor, or named-draw awards yet.

The last active player wins. Other players rank by later elimination turn,
then score, then Red/Blue/Yellow/Green seat order. Standard FFA's point-based
placements/shared ties and Claim Win remain unimplemented.

## Repetition — current behavior

The third occurrence ends the game immediately: all active players tie for
first, with inactive players ordered below them by the existing placement rule.
There is no point award. `GameResult.reason` distinguishes `elimination` and
`repetition`. Insufficient-material and 50-move endings are not implemented.

The repetition key includes board type/owner, pawn first-move flags, current
turn, castling rights, every pending en-passant target/victim/eligible owner,
and player statuses. Pending-right/eligibility array order does not change this
identity. The bot's search hash/signature also includes the new rights. These
keys are not the accepted future canonical state-v2 replay hash.

## Partial state and historical inputs

Current local states explicitly carry `rulesetId: null`: this is a development
migration shape with no certified ruleset ID, not a new semantic ruleset.
`li4chess-house-ffa-v1` retains its original meaning; standard-v1 is reserved
until the full contract is implemented and validated. No current state is
labelled `li4chess-state-v2` or wrapped as `li4chess-replay-v2`.

The reducer, protocol serialization, and arena input/replay/aggregation entry
points reject old or labelled snapshots instead of treating them as this partial
migration. This format fence checks the migration marker and presence of rights;
it does not validate arbitrary network state. The protocol remains JSON helpers.
The existing arena v1 harness is regression infrastructure, not a completed v2
writer or a source of new versioned research evidence. Do not run or publish new
bot comparisons before the replay/provenance migration supports them.
