# SCORE acceptance inputs (2026-09-06)

Derived before implementation from the accepted [contract](ruleset-versioning.md)
and [audit](rules-compatibility.md). Synthetic Red-frame positions rotate to all
four seats where geometry matters. Empty squares and moved pieces are the default;
each fixture supplies four safe kings unless explicitly testing checks.

| ID | Input and expected outcome |
| --- | --- |
| FFA-SCORE-01 | Red Rook `(5,5)` captures each Blue P/N/B/R/Q at `(5,8)`: +1/+3/+5/+5/+9 respectively, with one capture ledger entry. A pawn-Queen is +1. Live King remains non-capturable; its documented value is 20 for later king awards. |
| FFA-SCORE-02 | Same captures for each inactive status and piece including King: zero, no nonzero ledger entry. |
| FFA-SCORE-03 | Sole-owner deferred mate: +20 to the active checking owner at scheduled resolution; zero for a nonchecking intervening escape-blocker. |
| FFA-SCORE-04 | Split 20 equally among active checking owners at resolution; a checker that resigned beforehand receives zero. |
| FFA-SCORE-05 | Last transition from one or more legal moves to zero caused by victim: +20 to victim at deferred stalemate. |
| FFA-SCORE-06 | Opponent causes that transition: +10 each remaining active player, no dead-recipient award. Rescue clears prior cause; subsequent re-block records the new actor. |
| FFA-SCORE-07 | Red Queen `(4,4)→(6,6)`, Blue King `(3,6)`, Yellow King `(6,10)`, Green King `(12,8)`, Red King `(7,0)`: two newly checked kings, +1. |
| FFA-SCORE-08 | Same with Green King `(10,6)`: three newly checked kings, +5. |
| FFA-SCORE-09 | Red Knight `(6,3)→(5,5)`, Blue King `(3,4)`, Yellow King `(7,6)`, other Kings safe: two newly checked kings, +5. |
| FFA-SCORE-10 | Red Rook `(6,4)→(6,6)` with SCORE-08 Kings and Blue Knight blocking `(6,6)`: capture +3 followed by three newly checked kings +20. |
| FFA-SCORE-11 / PROMO-07 | Explicit saved pawn-Queen provenance in SCORE-07/08: still Queen tier +1/+5, despite capture value 1. Also exercise actual promotion that delivers multiple checks. |
| FFA-SCORE-12 | SCORE-07 plus an existing Red Rook check to Blue: Blue is already checked, only Yellow is new; no multi-check bonus. Other owners' continuing checks and inactive Kings likewise cannot inflate the count. |
| FFA-SCORE-13 | Red Rook `(6,4)` screened by own Knight `(6,6)→(8,7)`; Blue King `(6,10)` newly revealed, Yellow King `(10,6)` newly attacked by Knight: +5. |
| FFA-SCORE-14 | SCORE-13 with Queen replacing Rook: +1. Queen among newly delivered own-army checking pieces selects Queen tier; continuing or other-owner Queen checks do not select it. |
| FFA-SCORE-15 | SCORE-07 plus Blue Knight on `(6,6)`: capture +3 then double-check +1, totals 3 then 4. Separate scheduled-mate fixture below stacks capture +3, non-Queen double-check +5, mate +20. |
| FFA-SCORE-16 | Multiple legal actions preserve immutable input and ordered prior ledger; nonzero awards contain recipient, rule, delta, triggering event sequence and resulting total. JSON reproduction agrees and bot hashes distinguish differing ledger state. |

Deterministic ledger order is a li4chess implementation choice: initiating action,
capture award, current-move multi-check award, scheduled elimination awards in
rotation order, terminal awards/result. It is not claimed as observed client order.

## Accepted causation addendum — 2026-09-06

The maintainer clarified the pending details during implementation, based on
standard FFA behavior. This extends the accepted contract without changing any
settled amount:

- At scheduled mate resolution, split 20 equally among all owners actually
  checking that king. A nonchecking escape-blocker earns zero. Two checking
  owners receive 10 each; three receive 20/3 each. No chronological tie-break.
- Record the actor of the last move changing a player from at least one legal
  move to zero. If that actor is the victim, deferred nonchecked resolution
  awards the victim20. Otherwise each remaining active player gets10. Rescue
  clears the cause; a subsequent re-block records the new actor and changes
  self-stalemate to opponent-caused when appropriate.
- Other owners' pieces never contribute to the mover's multi-check count or
  Queen classification, even when the mover uncovers their attacks.

Additional explicit fixture inputs before integration:

- SCORE-03/04: Red King `(3,0)` trapped by Blue Knights `(5,0),(6,1),(6,2)`;
  Blue Rook `(3,3)` checks. Green's quiet King move advances to Red: Blue20,
  Green0. Add Yellow Rook `(4,0)`: Blue10/Yellow10. Also add Green Bishop
  `(5,2)`: Blue/Yellow/Green each20/3. All resolve only on Red's turn.
- SCORE-05: same unchecked King trap, Red's only movable Pawn `(7,5)→(7,6)`
  blocked by Blue Knight `(7,7)`. Quiet intervening turns preserve self cause:
  Red20, others0 at Red's scheduled stalemate.
- SCORE-06: add Yellow Knight `(5,8)`. After the self-blocking Pawn move,
  Blue Knight `(7,7)→(9,6)` rescues it; Yellow Knight `(5,8)→(7,7)` re-blocks;
  Green quiet move reaches Red. Blue/Yellow/Green10 each, Red0.
- SCORE-13 foreign-only: change SCORE-13 Rook owner to Yellow. Knight move
  reveals Yellow's check of Blue, but Red checks only Yellow: no bonus.
- SCORE-14 mixed-owner: SCORE-13 with Green King `(10,10)` and Blue Queen
  `(4,4)`. Moving the Knight also reveals Blue's Queen to Green: Red still +5.
  Control with Blue Queen `(4,6)` and original Green King: it newly checks
  Yellow alongside Red's Knight; Red still +5 for its own two checked kings.
- SCORE-15: Red King `(7,0)`, Blue King `(3,0)`, Yellow King `(10,3)`, Green
  King `(13,7)`, Red Knights `(5,0),(6,1),(6,2)`, Red Rook `(3,5)` captures
  Blue Knight `(3,3)`: capture +3, double-check +5, scheduled Blue mate +20,
  ordered totals 3, 8, 28 on one initiating action.

Awards are multiples of one third of a point. Totals are accumulated in integer
thirds and projected as JSON numbers, preventing floating addition from breaking
mathematically equal placement ties. This is a representation choice, not rounding
the documented shared award to an integer.

The official linked help/terms were reread on 2026-09-06. They confirm the
accepted amounts but do not supply multiple-owner mate attribution or deferred
self-stalemate causation. An independent reviewer identified those same gaps;
the maintainer addendum above resolves them. M1-01/02
remain accepted; no settled amount, objective, or promotion rule is reopened.
