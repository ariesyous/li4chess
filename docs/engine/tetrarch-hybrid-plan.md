# Bounded Tetrarch hybrid experiment

Accepted follow-up, 2026-09-09, starting from `cf122b5` on draft PR #24.
The maintainer accepted an advisory hybrid after distinguishing canonical game
correctness from external search-model quality. This supersedes the initial
spike's decision to stop before arena testing, not its measured findings.

## Boundary

The canonical rules engine always owns legal moves, transitions, awards, seeded
walking actions and final placements. Tetrarch v8 is an imperfect adviser.
The existing bounded production bot supplies fallback thinking. No C rules patch,
network retraining, browser switch, merge or deployment is part of this slice.

The experiment's root capability uses the tested transport restrictions: no
pending EP, forfeits/walking owners, fractional/out-of-u16 scores, moved pawns on
their home rank, wrong ruleset or terminal roots. Passive mate/stalemate armies
are representable. Historical repetition, descendant EP, score attribution and
terminal-utility differences remain explicit model limitations, not assertions
of equivalent search rules. Production acceptance remains separately gated.

An isolated Node Worker owns C/WASM execution. Request identity, hard watchdog,
cancellation, worker failure and malformed results must not grant move authority.
The parent matches returned identity against the current canonical legal list.
Fallback uses the same bounded production configuration as the baseline. Claims
and walking moves remain owned by the existing arena's canonical action flow.

## Predeclared comparison

Use the existing `ArenaEngine`/`runGame`/`tournament`/replay/report framework.
First validate the routing and failure boundaries. Then run paired, seeded Modern
opening histories with full seat rotation, preserving all capped games as censored.
Compare one hybrid against three current bounded production bots. Include a
four-native control on the same openings; report actual resource settings,
completion, placement, first-place shares, rejection/fallback rates and latency.
Initial campaign: four distinct opening seeds, four rotations each, 400-ply cap.
Use 20,000 Tetrarch nodes and the current level-3 production budget (250 ms,
2,048 nodes, depth 3) for baseline/fallback. This compares concrete configurations,
not equal nodes, full-strength engines or Elo. A short pipeline smoke precedes it.

Only after inspecting those results, decide whether another predeclared resource
level or geometry is worthwhile. Do not tune the existing bot to manufacture a
comparison result, hide fallback moves, or silently filter out weak hybrid games.
No automatic production promotion follows a small successful campaign.

During campaigns freeze all tracked source/docs and write only into ignored
results directories so provenance checks remain meaningful. Record source, binary
and network hashes, environment, budgets, seeds and replay verification. Preserve
the original spike evidence and label this follow-up separately.
