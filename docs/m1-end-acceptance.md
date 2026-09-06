# END acceptance inputs — 2026-09-06

Written before behavior changes from the accepted [contract](ruleset-versioning.md)
and [finish evidence](rules-compatibility.md). Scores determine all placements;
the engine records mean occupied rank for equal scores without implementing ratings.

| ID | Explicit input and expected outcome |
| --- | --- |
| FFA-END-01 | Scores Red 50, Blue 40, Yellow 30, Green 20, only Green active. Final order Red/Blue/Yellow/Green regardless of elimination chronology; Red wins. |
| FFA-END-02 | Score vectors `[50,50,20,10]`, `[50,20,20,10]`, `[50,20,10,10]`, `[0,0,0,0]`: shared places `[1,1,3,4]`, `[1,2,2,4]`, `[1,2,3,3]`, `[1,1,1,1]`; mean occupied ranks `[1.5,1.5,3,4]`, `[1,2.5,2.5,4]`, `[1,2,3.5,3.5]`, all 2.5. Unique highest score alone sets winner. Seat order is display order within a tie, never a tie-break. |
| FFA-END-03 | Post-opening third resignation/timeout ends immediately even with three legal walking Kings; first/second forfeits do not end solely by player count. |
| FFA-END-04 | Exactly two active seats, leader 21/trailer 0: Claim Win valid on or off leader's turn, trailer +20 and leader +0; at lead 20 or with 3/4 active reject. Reject inactive actor and trailer claim. Rotate actor through all seats. |
| FFA-END-05 | Two active plus two live walking Kings, scores leader 21/trailer 0: claim immediately ends with scores 21/20, no walking action or survivor extras. Preserve prior random cursor. Leader's surrendered King becomes passive and loses special rights. |
| FFA-END-06 | Sole survivor with 0/1/2/3 live walking Kings: award 0/20/40/60 in separate +20 entries identifying each King, no +40 per King. Previously passive King earns no award. |
| FFA-END-07 | A move resolving the third normal elimination awards mate/stalemate first, then eligible survivor awards, then terminal result. Completed state rejects all actions and never repeats final awards. |
| FFA-END-08 | Engine result, protocol, browser, production utility and arena agree: an eliminated high scorer can win; equal scores share place/mean rank. Active status alone confers no winning utility. Claim controls appear only when engine eligibility holds. |

Local representation choices: result stores claim actor, trailer, lead before
the claim and cause sequence. The action bypasses the ordinary forfeit/walking
path and opening abort classification. Each terminal result consumes one logical
event sequence. Survivor entries name the awarded walking-King owner as subject.
