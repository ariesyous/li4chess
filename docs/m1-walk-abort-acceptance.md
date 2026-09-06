# WALK / opening ABORT acceptance inputs

Written 2026-09-06 before implementation from the accepted
[migration contract](ruleset-versioning.md). ABORT accompanies WALK's action
boundary because no resignation or timeout may bypass the opening guard.
Geometry cases rotate through all four seats. All fixtures use deterministic
local inputs; M3 must own network clocks/randomness later.

| ID | Inputs and expected outcomes |
| --- | --- |
| FFA-WALK-01 | Completed move vector `[3,3,3,3]`; resign one active seat with King/Rook/Pawn. Army becomes passive, King remains live, scores unchanged, castles and EP-capturer eligibility lost. Capture of its non-King is zero; its old attack ceases but the live King still constrains adjacent kings. |
| FFA-WALK-02 | Same with timeout and explicit zero remaining-ms fact: same board/live-king transition, distinct timeout cause. Nonzero/invalid clock facts reject. |
| FFA-WALK-03 | Out-of-turn resignation leaves current scheduled seat unchanged. Intervening seats move, then the resigned seat receives only legal King candidates. Its own passive pieces remain blockers; no castling or manual/CPU choice for that seat. |
| FFA-WALK-04 | A walking king's regular turn chooses uniformly from its canonical legal list via recorded deterministic PRNG seed/cursor, candidate hash, chosen canonical move, cause and event sequence. Same inputs reproduce exactly. No timer or ambient randomness in engine. |
| FFA-WALK-05 | Candidate lists reject attacked destinations and any capture of live Kings, allow legal enemy captures, and retain dead blockers. Mover cannot be controlled through a normal external move request. |
| FFA-WALK-06 | Supplied trap has zero legal moves in check: scheduled resolution makes walking King passive, retains pieces and original forfeit facts, and advances rotation. Active checking owners split +20 under the clarified SCORE rule. |
| FFA-WALK-07 | Same trap without check: scheduled stalemate makes King passive and awards +10 separately to each remaining active player, in seat order. No recipient among already eliminated owners. |
| FFA-WALK-08 | JSON round-trip retains random selection provenance and produces the next identical action; altered actor/canonical move/selection must be rejected by the later replay reader. Live local actions are immutable and reject wrong turns/terminal repeats. |
| FFA-ABORT-01 | Resign for each actor with completed moves `[2,3,3,3]`: immediate early-resign abort, triggering actor and exact vector, no normal placements or ordinary awards. |
| FFA-ABORT-02 | Timeout with the same vector and zero clock fact: early-timeout abort with exact facts. |
| FFA-ABORT-03 | Resign at `[3,3,3,3]`: no abort; WALK transition. |
| FFA-ABORT-04 | Timeout at `[3,3,3,3]`: no abort; WALK transition. |
| FFA-ABORT-05 | Uneven `[7,3,1,5]` and vectors with one zero: each resign/timeout aborts regardless of actor's own count. No rating arithmetic; record liable seat only. |
| FFA-ABORT-06 | Initial legal moves increment only the mover's completed count. After eleven normal opening moves one seat remains at two; after twelve all are at three. Boundary actions classify accordingly; repeated terminal actions reject. |

Implementation choices: logical event sequences already introduced by SCORE;
PRNG/candidate encoding is explicitly versioned and documented with executable
vectors. Passive/live distinction is per piece via owner status plus walking
King state, without moving or deleting blockers. Resignation is allowed for an
active local seat out of turn; timeout requires an explicit zero clock fact.
The UI offers local actions and schedules walking moves. Production clocks,
network authority, disconnect timers, and Worker search remain out of scope.

The local random algorithm is `splitmix32-rejection-v1`: unsigned 32-bit
counter/seed mixing, rejecting the incomplete high bucket before modulo.
Candidates sort by numeric from/to square; their ASCII JSON arrays
`[from,to,promotion-or-null,castle-or-null,ep-square-or-null]` use FNV-1a64.
Seed 1 begins with words 1580013426, 350525680, 3524174333, 3011703609.
WALK-04 independently fixes each rotated candidate list, hash and selected
destination; forced rejection verifies cursor consumption. Search descendants
follow the same recorded action, including cursor advancement. Frozen classic
is historical and unchanged. Replay event tamper rejection remains REPLAY work.
