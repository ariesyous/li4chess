# User replay: four-king shuffling with blocked pawns

Inspected 2026-09-08 using Node 24.18.0 on Windows and repository code at
9a49a8083d1b2d968d187e46299d2b50a1be9e01, with documentation-only working edits.
Input: user-provided li4chess-replay-v2.json, 102,738 bytes, from Downloads.
Canonical replay hash:
sha256:aea47bafac8c4c55c981b117f7474fa6bac9cd2b1457cacac17d188175b1efd7.
The producer records the same code revision and a clean build.

## Validation and position

The protocol reader accepted checkpoint identity, state and hashes. This export
has zero envelope events but includes 240 historical moves in its checkpoint.
Independently reconstructed those moves from standard setup, matching every
request against legal moves before applying it. Final board, move history, turn,
turn number, award ledger, repetition counts, reversible counter and result
matched the supplied checkpoint. This is stronger than accepting the checkpoint
alone; it does not recover historical CPU timing or search diagnostics.

At turn 241, Red is the human; Blue, Yellow and Green are level-3 CPUs.
All four remain active, with no terminal result.

| Seat | Score | Remaining pieces |
| --- | --- | --- |
| Red | 52 | King e8 |
| Blue | 55 | King c8, pawns d10 and c11 |
| Yellow | 30 | King g8, pawns e10 and d11 |
| Green | 38 | King i6 |

Coordinates use the engine's absolute files a-n and ranks 1-14.
Blue advances toward increasing files: its two pawns are blocked by Yellow.
Yellow's d11 pawn is blocked by Blue's d10 pawn; e10-e9 is legal in the
examined Yellow-turn position. No claim is made that this push forces a win.

The last capture was Yellow's king taking Green's pawn-promoted queen at ply 163.
All subsequent 77 moves were quiet king moves. Insufficient material does not
apply with these pawns. The maximum stored repetition count is two, short of
three. The no-progress counter is 77 of 200: 123 more individual turns without a
pawn move/capture would reach that draw threshold unless another ending occurs.

## Diagnostic search

Re-scored every legal move at the positions preceding plies 237-240, using the
current full evaluator and exact depth 3 with no time/node cutoff. This isolates
the evaluation/search preference; it is not a replay of the original browser's
bounded search or a playing-strength benchmark.

At Yellow's ply 239, g7-g8 scores -249.78 while e10-e9 scores
-249.89333333333335. The played king shuffle is therefore preferred even in a
completed depth-3 diagnostic search. Blue has only king moves at its sampled
turn, with four equally best-scoring choices. Green also has tied king choices.

The static evaluation has a small linear pawn-advancement term, but no explicit
blocked-pawn release, king escort or promotion-race feature. Depth 3 cannot see
Yellow's next own turn while four players remain active. Together these give a
specific tuning target; this single example does not establish a winning pawn
plan or prove that every quiet move is a blunder. Blue's points lead also makes
a draw potentially desirable for Blue under the accepted FFA rules.

Recommended follow-up: preserve this position in a focused endgame corpus,
investigate safe pawn progress and king support at equal browser budgets, and
compare placements and avoidable shuffling on separate positions. Do not shorten
draw rules or reward losing pawn pushes just to force faster finishes.

Diagnostic script and full output are local ignored artifacts under
arena-results/replay-review-20260908. No engine/bot code was changed and no full
test suite or tournament was run for this read-only game analysis.
