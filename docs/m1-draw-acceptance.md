# DRAW acceptance inputs — 2026-09-06

Written before implementation from the [accepted contract](ruleset-versioning.md)
and [draw evidence](rules-compatibility.md). Named draws end automatically and
give each active player a single flat +10; points still determine all placements.

| ID | Explicit input and expected outcome |
| --- | --- |
| FFA-DRAW-01 | A legal reversible cycle reaches the same board, turn, rights, EP eligibility, player/King interaction state and promotion provenance for the third time: automatic repetition. Prior two occurrences do not terminate. Earned scores are not repetition identity. |
| FFA-DRAW-02 | Change turn, castling bit, EP eligibility, pawn first-move entitlement, promotion provenance, active/passive/walking state or dead blocker square: distinct repetition position. EP array order alone is immaterial. |
| FFA-DRAW-03 | With four or three active players, all active armies are bare Kings: automatic insufficient material. A single active Pawn, Knight or Bishop prevents that predicate. Dead pieces do not count as mating material. |
| FFA-DRAW-04 | Two active: K v K, K+B v K, K+N v K and K+B v K+B with same-colour Bishops draw. Opposite-colour Bishops, K+N v K+N, two Knights, a Pawn, Rook or Queen do not satisfy the listed dead-position predicate. Rotate geometry and test both Bishop colours. |
| FFA-DRAW-05 | Reversible counter 198 before quiet move becomes 199 without draw; next quiet move reaches exactly 200 and ends. Same 200 individual-move threshold with 2, 3 or 4 active seats; not 100 plies. |
| FFA-DRAW-06 | Pawn quiet move, pawn capture, promotion, live capture, passive capture and EP capture each reset a 199 counter to zero, preventing a 50-move draw on that action. Castling/quiet King moves increment. |
| FFA-DRAW-07 | Every named draw gives each still-active player exactly +10 with separate ordered entries; inactive or walking owners receive zero. No survivor/claim award stacks with a named draw. Preserve pre-existing scores and award history. |
| FFA-DRAW-08 | Multiple simultaneous draw predicates still give only one flat +10 each. A third elimination or immediate claim takes terminal precedence over draw testing. Completed state rejects further actions. |
| FFA-DRAW-09 | Counter, position history, terminal reason, award order and points-based results survive protocol/replay and bot hashing. UI explains the actual draw cause and arena reports it as completed, separately from abort/incomplete. |

Implementation choice: evaluate automatic draw predicates after a completed
action and scheduled turn resolution, before returning its state. Forfeits can
remove active mating material and therefore also trigger the material predicate;
they do not increment the individual-move counter or repeat a position occurrence.
Named-draw priority when simultaneous is repetition, insufficient material,
then 50-move. This deterministic recording order never changes the flat award.
Synthetic fixtures intended to continue play must retain sufficient active
material, rather than disable an automatic draw rule.
