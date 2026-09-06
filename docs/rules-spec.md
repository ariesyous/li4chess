# li4chess rules specification — partial M1 migration

> **Implemented behavior as of 2026-09-06, not full standard FFA.** The completed
> M1-03 slices implement the accepted setup, core-legality, en-passant,
> castling, passive dead-army, and promotion fixtures. Remaining house behavior is identified below. The complete
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
passive seats. Resigned/timed-out seats with live walking Kings still receive
scheduled automatic King moves. The current game ends when
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

On its scheduled turn, a player with no legal moves becomes `checkmated` while
checked, or `stalemated` otherwise. In both cases its king and whole remaining
army stay on their exact squares as passive obstacles. They cannot move or
attack, lose castling and EP-capturer rights, and can be captured for zero points.
They still block movement and active attack rays; removing a screen can expose
the capturing player's king and make a capture illegal. The owner is skipped
permanently even if an escape later opens. Piece owner/type/moved flags remain
unchanged; player status determines passive interactions in this local shape.

The UI greys these armies and excludes them from check indicators. Bot material,
center, and pawn-advancement evaluation excludes passive pieces while retaining
their occupancy for movement and attack geometry. Low-level board-only attack
helpers describe geometry; rules consumers filter to active opponents.

At scheduled mate resolution, active checking owners split +20 equally; an
intervening nonchecking escape-blocker gets zero. The engine tracks the actor
of the last transition from at least one legal move to zero. A self-caused
stalemate gives the victim +20; an opponent-caused stalemate gives each remaining
active player +10. A rescue clears causation, and a later re-block sets it anew.
See [SCORE acceptance](m1-score-acceptance.md) for exact rotated fixtures.

Resignation and explicit zero-clock timeout are local deterministic actions.
If any seat has completed fewer than three moves, either action aborts with
the actor, classification, exact count vector, liable seat, and timeout clock
fact; no normal placements or awards are generated. Otherwise the army becomes
passive, except its live King. Its original forfeit reason remains after its
King later mates/stalemates. Only legal King moves are selected automatically
on its regular turn by the versioned seeded random algorithm; manual requests
reject. Walking owners earn no ordinary capture/multi-check points. A walking
King's stalemate gives each remaining active player +10; mate uses the active
checking-owner split. Walking Kings constrain king safety and cannot be captured.
See [WALK/ABORT acceptance](m1-walk-abort-acceptance.md) for random provenance.

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
EP fixture supplies an explicit post-death state; DEAD-08 additionally resolves
mate/stalemate from a synthetic pending-right snapshot before the capture.
Resignation/timeout likewise preserve victim rights but remove capturer rights. The old opposite-seat-only
claim and next-global-move expiry were implementation errors, now replaced.

## Castling

Both castles use shared local-frame geometry. The king moves two files toward
the rook; the rook moves to the intervening square. The implementation requires
unmoved home King and Rook belonging to the active castling player, clear
intervening squares, and a king that is neither in check nor crossing/landing
on an active opponent's attack. Occupying inactive
pieces block every required-clear square but do not attack. They can also
screen an active attack from outside the castle path. Attacks on the Rook or
the queenside square traversed only by the Rook do not forbid castling.

Rights are retained from the previous state, never recreated from occupancy.
Moving the King loses both rights; moving or capturing a home Rook loses that
side only. Returning or replacing a piece cannot restore a revoked right.
Wrong-owner home pieces cannot confer rights or generate a castle. Inactive
owners cannot castle; advancement clears their stored rights, including in the
same transition that resolves mate/stalemate. `FFA-CASTLE-01..16` cover both
sides and all four seats, with independent absolute destination assertions.

## Promotion

A pawn arriving at local rank 7 (its eighth rank) automatically becomes a Queen,
including ordinary and en-passant captures. Red promotes on absolute rank 7,
Blue on file 7, Yellow on rank 6, Green on file 6 (zero-based). Other ranks do
not promote. There is no underpromotion or spare king. An omitted external
promotion choice selects the canonical Queen; explicit non-Queen choices reject.

The resulting piece has `type: Queen` and `promotedFrom: Pawn`. That provenance
survives later movement, captured metadata, JSON, repetition identity, and bot
hashes. Its active capture value is one; a native Queen remains nine and a dead
Queen zero. Movement and checking classification remain Queen. Own-army
Queen-tier multi-check awards now have executable ledgers, including an actual
promotion that checks two kings. Bot material heuristics
still value Queen movement strength; the points objective follows in SCORE/END.

## Scores and remaining placement migration

Active captures score Pawn/pawn-Queen 1, Knight 3, Bishop 5, Rook 5, native Queen 9.
The King rule value is 20, while active kings remain non-capturable. All captures
of inactive material, including en passant, score zero.

Two/three kings newly checked by the mover's army award +1/+5 if any newly
checking piece is a Queen, otherwise +5/+20. Own-army discovered checks count.
Kings already in check before the action and passive kings do not count;
continuing Queen checks do not downgrade new non-Queen checks. Captures and
multi-checks stack with deferred mate awards. Other owners' pieces do not count
or select the Queen tier, including shared checks on the same king. Deferred
mate/stalemate attribution is specified above. Survivor and named-draw awards
remain END/DRAW work.

Every nonzero award appends an immutable `awardLedger` entry:
`sequence`, `causeSequence`, `rule`, `recipient`, `delta`, and resulting `total`.
The action advances `eventSequence` once, then each award advances it once;
capture precedes multi-check. This order is a li4chess recording convention.
JSON and bot search identity preserve the ledger/sequence. The UI displays it.
This remains partial state, not the accepted complete replay-v2 implementation.

The last active player wins. Other players rank by later elimination turn,
then score, then Red/Blue/Yellow/Green seat order. Standard FFA's point-based
placements/shared ties and Claim Win remain unimplemented.

## Repetition — current behavior

The third occurrence ends the game immediately: all active players tie for
first, with inactive players ordered below them by the existing placement rule.
There is no point award. `GameResult.reason` distinguishes `elimination` and
`repetition`. Insufficient-material and 50-move endings are not implemented.

The repetition key includes board type/owner/promotion provenance, pawn first-move flags, current
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
migration. This format fence checks the migration marker, presence of rights,
nonnegative integer event sequence, award array, per-seat completed moves and
seed/cursor/random action fields;
it does not validate arbitrary network state. The protocol remains JSON helpers.
The existing arena v1 harness is regression infrastructure, not a completed v2
writer or a source of new versioned research evidence. Do not run or publish new
bot comparisons before the replay/provenance migration supports them.
