# External evidence, checked 2026-09-05

This is fresh source inspection and literature research, not an external-engine
strength tournament. No third-party engine code or network weights were copied.
Repository dates below are GitHub API default-branch commit dates, not a claim
that each described feature was introduced on that date. Search-engine crawl
dates are not publication dates.

## Implementations

| Project / inspected revision | Date | Mode and license | Evidence and testable lessons |
|---|---|---|---|
| [Athena](https://github.com/arianahejazyan/Athena/tree/4c598f4fa95aa7b5e52b3ae00d01adc681f7fd73) | 2026-08-19 | Teams-oriented scalar negamax, MIT; source available | README describes 256-bit boards and perft tooling. [Search source](https://github.com/arianahejazyan/Athena/blob/4c598f4fa95aa7b5e52b3ae00d01adc681f7fd73/src/search.cpp) implements make/undo, iterative deepening, alpha-beta; evaluation calls NNUE. README's material-only description lags code. Advertised ~120 million perft nodes/s is the author's claim, not our measured search throughput. Test representation and accumulator invariants, not claimed strength. |
| [Samaritan](https://github.com/Moxile/Samaritan/tree/de8e31df0e49add2b2ef287cb61d4ab7fcb31bed) | 2026-08-22 | **Teams confirmed in evaluate.h**, source available; engine-wide license not established | [Evaluator](https://github.com/Moxile/Samaritan/blob/de8e31df0e49add2b2ef287cb61d4ab7fcb31bed/samaritan/include/evaluate.h) explicitly sums RY/BG team material and mobility; NNUE dispatch falls back to HCE. Search includes quiescence, TT and ordering. README describes mailbox/piece lists, oracle checks and accumulator parity. Its ~20M nps claim is unverified here. [licences/LICENCE](https://github.com/Moxile/Samaritan/blob/de8e31df0e49add2b2ef287cb61d4ab7fcb31bed/licences/LICENCE) licenses CLI11, not clearly the engine. Do not reuse engine source without clarification. |
| [Titan / obryanlouis/4pchess](https://github.com/obryanlouis/4pchess/tree/a3c7b61c6ab75e6be18d21efff913d0e3aae7128) | 2024-02-20 | Teams, MIT, source available | README explicitly identifies teams; includes balanced opening FENs, regression and speed tools, TT, tuning, and match commands. Reusable idea: fixed move budgets and opening suites. Team win/loss significance tests are not directly transferable to four independent seats. No claim of current active maintenance. |
| [Enigma / Anurag-Baundwal/4pchess](https://github.com/Anurag-Baundwal/4pchess/tree/uci_gui) | pushed 2026-09-01 | MIT, source available; listed as TeamEnigma by Athena | Active fork candidate for a later rules/API audit; not benchmarked or independently certified as FFA. |
| [Fairy-Stockfish](https://github.com/fairy-stockfish/Fairy-Stockfish) | source inspected 2026-09-05 | Two-color variant engine, GPL-3.0, source available | [types.h](https://github.com/fairy-stockfish/Fairy-Stockfish/blob/master/src/types.h) defines two colors; [maintainer explanation](https://github.com/fairy-stockfish/Fairy-Stockfish/discussions/696) (2023-08-19) gives a 12×10 maximum. Enlarging the board alone does not provide four-player turn/elimination/utility semantics. No drop-in FFA core established. |

These sources do not establish a current open-source FFA strength leader under
li4chess rules. Teams differ in friendly occupancy, king loss, scoring, promotion
and turn handling; comparing their perft counts against ours without translating
the rules would be misleading.

## Academic evidence

* **Max^n / paranoid:** Sturtevant's [2002 comparison](https://www.cs.du.edu/~sturtevant/papers/sturtevant2002comparison.html)
  and [2003 thesis](https://www.cs.du.edu/~sturtevant/papers/multiplayergamesthesis.pdf)
  examine vector decisions, restricted pruning, tie-breaking and coalition search.
  Paranoid's extra pruning can outweigh a worse opponent model in tested games;
  that is evidence to compare algorithms, not evidence that it wins 4PC.
  Academic algorithms, no source code reused; noncooperative multiplayer domains.
* **Best-Reply Search:** Schadd's [2011 thesis, chapter 6](https://project.dke.maastrichtuniversity.nl/games/files/phd/Schadd_thesis.pdf)
  lets the strongest opponent reply while other opponents pass. It enables deeper
  search in its tested domains. In li4chess, skipping turns alters deferred mate,
  en passant and third-party interventions. A faithful BRS implementation needs
  explicit synthetic-turn semantics and its own key namespace. It is deferred,
  not approximated by illegally changing `state.turn` and calling `applyMove`.
  The same thesis explains classical ordering, ID, TT and search extensions.
* **Multiplayer MCTS:** Nijssen and Winands, [Search Policies in Multi-Player Games](https://project.dke.maastrichtuniversity.nl/games/files/articles/policies.pdf),
  ICGA Journal 36(1), March 2013, compare Max^n/paranoid/BRS policies in Chinese
  Checkers, Focus, Rolit and Blokus; vector-style MCTS performs best overall in
  those experiments. These are not four-player chess benchmarks. Code availability
  was not established; no implementation was imported.
* **Neural multiplayer policy/value:** [Multiplayer AlphaZero](https://arxiv.org/abs/1910.13012)
  (2019) tests modifications in two simple three-player games. It establishes a
  plausible research route, not a ready 160-square chess solution or browser budget.

## Training, utility, ratings and licensing

[Stockfish's NNUE trainer](https://github.com/official-stockfish/nnue-pytorch) and
its [architecture documentation](https://github.com/official-stockfish/nnue-pytorch/blob/master/docs/nnue.md)
(living source inspected 2026-09-05, GPL-3.0) demonstrate sparse incremental
features and a substantial data/training pipeline. Existing chess weights are
not trained for our four owners, board or placement objective. Samaritan's current
accumulator parity tests are a useful independent implementation example, but
its team scalar is not an FFA vector. No credible li4chess-compatible training
dataset was established by this search.

Proposed future encoding: piece type × owner × playable square, player-relative
king features, turn/status/castling flags, and four utility outputs. Rotate the
board **and** ownership, turn, rights, en passant, statuses, score, history and
labels together. Fixed-seat placement tie breaks break exact rotational symmetry;
exclude those cases or encode the asymmetry. Promotion/elimination change many
features and require accumulator refresh/delta parity tests. Benchmark integer
WASM inference before WebGPU: dispatch overhead may dominate a small network.
These are design proposals, not measured conclusions.

[Spall's SPSA overview](https://www.jhuapl.edu/spsa/pdf-spsa/spall_an_overview.pdf)
(1998) describes simultaneous-perturbation gradient estimates from two objective
measurements. [Fishtest](https://github.com/official-stockfish/fishtest) demonstrates
engine-match testing; its [SPSA discussion](https://github.com/official-stockfish/fishtest/issues/535)
(opened 2020-02-03) warns about time-control sensitivity. A local two-weight
pilot should pair seeds/rotations, perturb pawn and threat weights, and reserve
separate validation openings/seeds. Our heavily censored results do not yet supply
a useful strength objective, so no tuned weights are claimed. Evolutionary or
Bayesian methods remain options once evaluations are informative; launching them
now would optimize noise or draw-seeking artifacts.

[TrueSkill 2](https://www.microsoft.com/en-us/research/publication/trueskill-2-improved-bayesian-skill-rating-system/)
(Microsoft Research, 2018) is evidence for Bayesian multiplayer ranking models.
It is not validation of its assumptions in four-seat chess with third-party
interactions. For this spike, report actual placements, pairwise scores and
seat/seed blocks; do not publish ordinary two-player Elo or an unsupported
cross-project rating. No rating service or proprietary dependency is required.
