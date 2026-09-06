# SCORE acceptance inputs (2026-09-06)

Derived before implementation from the accepted [contract](ruleset-versioning.md)
and [audit](rules-compatibility.md). Synthetic Red-frame positions rotate to all
four seats where geometry matters. Empty squares and moved pieces are the default;
each fixture supplies four safe kings unless explicitly testing checks.

| ID | Input and expected outcome |
| --- | --- |
| FFA-SCORE-01 | Red Rook `(5,5)` captures each Blue P/N/B/R/Q at `(5,8)`: +1/+3/+5/+5/+9 respectively, with one capture ledger entry. A pawn-Queen is +1. Live King remains non-capturable; its documented value is 20 for later king awards. |
| FFA-SCORE-02 | Same captures for each inactive status and piece including King: zero, no nonzero ledger entry. |
| FFA-SCORE-03 | Sole-owner deferred mate: +20 to mating player at resolution, not at an earlier unresolved check. Recipient causation beyond this simple case is pending clarification. |
| FFA-SCORE-04 | Multiple checking owners / intervening escape-blocker: expected recipient requires the missing attribution rule. Do not implement a guessed tie-break. |
| FFA-SCORE-05 | Self-stalemate: +20 to victim. Deferred causation predicate pending clarification. |
| FFA-SCORE-06 | Opponent-caused stalemate: +10 each remaining active player, no dead-recipient award. Deferred causation predicate pending clarification. |
| FFA-SCORE-07 | Red Queen `(4,4)→(6,6)`, Blue King `(3,6)`, Yellow King `(6,10)`, Green King `(12,8)`, Red King `(7,0)`: two newly checked kings, +1. |
| FFA-SCORE-08 | Same with Green King `(10,6)`: three newly checked kings, +5. |
| FFA-SCORE-09 | Red Knight `(6,3)→(5,5)`, Blue King `(3,4)`, Yellow King `(7,6)`, other Kings safe: two newly checked kings, +5. |
| FFA-SCORE-10 | Red Rook `(6,4)→(6,6)` with SCORE-08 Kings and Blue Knight blocking `(6,6)`: capture +3 followed by three newly checked kings +20. |
| FFA-SCORE-11 / PROMO-07 | Explicit saved pawn-Queen provenance in SCORE-07/08: still Queen tier +1/+5, despite capture value 1. Also exercise actual promotion that delivers multiple checks. |
| FFA-SCORE-12 | SCORE-07 plus an existing Red Rook check to Blue: Blue is already checked, only Yellow is new; no multi-check bonus. Other owners' continuing checks and inactive Kings likewise cannot inflate the count. |
| FFA-SCORE-13 | Red Rook `(6,4)` screened by own Knight `(6,6)→(8,7)`; Blue King `(6,10)` newly revealed, Yellow King `(10,6)` newly attacked by Knight: +5. |
| FFA-SCORE-14 | SCORE-13 with Queen replacing Rook: +1. Queen anywhere among newly delivered own-army checking pieces selects Queen tier; continuing Queen checks alone do not select it. Mixed-owner causation requires clarification. |
| FFA-SCORE-15 | SCORE-07 plus Blue Knight on `(6,6)`: capture +3 then double-check +1, totals 3 then 4. Mate stacking follows once attribution is specified. |
| FFA-SCORE-16 | Multiple legal actions preserve immutable input and ordered prior ledger; nonzero awards contain recipient, rule, delta, triggering event sequence and resulting total. JSON reproduction agrees and bot hashes distinguish differing ledger state. |

Deterministic ledger order is a li4chess implementation choice: initiating action,
capture award, current-move multi-check award, scheduled elimination awards in
rotation order, terminal awards/result. It is not claimed as observed client order.

The official linked help/terms were reread on 2026-09-06. They confirm the
accepted amounts but do not supply multiple-owner mate attribution or deferred
self-stalemate causation. An independent reviewer identified those same gaps;
maintainer clarification is pending while settled fixtures proceed. M1-01/02
remain accepted; no settled amount, objective, or promotion rule is reopened.
