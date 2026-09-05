# Experimental search contract

The TypeScript engine remains the sole rules oracle. `searchPosition` accepts
an active on-turn state; it never swaps turns, invents passes or mutates inputs.
The classic snapshot and production `chooseCpuMove` retain their original behavior.

## Objective and repetition

The product is survival/placement-first, not capture-score-first. Terminal
elimination utility is `5 - 2 * place`: `[3, 1, -1, -3]`. Thus a sole victory
beats any ordinary evaluation and fourth loses to any ordinary evaluation.
Already eliminated players have a fixed placement below all active players;
the oracle's elimination turn, capture-score and seat tie breaks determine it.
Nonterminal active utility is `2.5 * tanh(classicFull / 40)`, strictly inside
the extreme outcomes. Forty is approximately an initial army's material; this
is an untrained calibration, not a predicted win probability.

The UI labels surviving repetition participants tied first. Search assigns them
the average utility of the occupied ranks (two survivors: 2; three: 1; four: 0).
This is a deliberate preference for a sole win over shared survival, not a rule
change. A sufficiently winning static value can exceed a draw; a losing one can
prefer it. First and second occurrences receive ordinary searched utility; the
oracle's third occurrence is terminal. There is no blanket novelty exclusion.
Tests force both draw preferences. This calibration can encourage premature draws
because the inherited own-minus-three-armies evaluator is negative at the opening;
recalibration requires informative outcome data before production use.

## Algorithms and bounds

Paranoid maximizes the root component on its turns and minimizes it on all other
turns. Max^n evaluates four components and chooses the child maximizing the
acting player's component. No scalar alpha-beta pruning is used in Max^n. Ties
use the first move in deterministic ordering, so changing ordering can change
Max^n's strategic tie resolution. Vector values currently wrap the same classic
features; they are an interface foundation, not a new learned relational model.
Opponent material, mobility and threats are still too collapsed. A future shared
feature extraction pass should expose material by owner, threat matrix and
turn-distance urgency, one measured ablation at a time.

Root paranoid search shares alpha. Only an improving root score is exact; other
scores may be upper bounds. `exactRootScores` requests full windows before
score-distance sampling. `chooseWithinDistance` only samples exact scores and
never randomly chooses arbitrary top K. No new production difficulty presets
are enabled without strength and human enjoyment testing.

Iterative deepening publishes only completed iterations. A zero budget or early
cancellation returns a legal ordered fallback with **null** value and depth 0;
no invented evaluation or partial iteration is exposed. Node budgets are strict
search-entry caps. Time budgets are cooperative: one oracle operation may exceed
the deadline. Root legal generation happens even for a zero budget to obtain a
valid fallback. Cancellation callbacks work synchronously; message-based browser
cancellation requires terminating a Worker, not expecting its blocked event loop
to process a message.

## Hashing and TT

The 64-bit XOR key uses deterministic pseudorandom piece-square-owner-moved keys
and all relevant metadata. It includes turn, absolute turn number, player statuses,
scores, elimination turns, rights, en passant, result and **all repetition counts**.
CPU seat settings and move history objects are omitted because the oracle uses
neither for future legal play; counts and player metadata capture relevant history.
A full canonical signature verifies hash collisions. Tables live within one
search so evaluator/root/strategy do not leak across calls. Max^n does not use
the scalar table. Equal-depth exact/lower/upper bounds are distinguished. A TT
cutoff can truncate the PV; the exposed prefix remains legal, not necessarily
full depth. Capacity bounds entries, not exact bytes (history signatures vary).

Delta-hash tests compare recomputation across legal paths. This is a board-scan
delta adapter over immutable oracle states, not an O(1) make/unmake optimization.
Metadata history hashing is expensive and conservative histories suppress useful
transpositions. Zero score hits in this corpus is a result, not grounds to omit
history unsafely. Consider a board-only **ordering** cache before relaxing score
reuse, with explicit draw-path correctness tests.

## Ordering and quiescence

Enhanced ordering uses previous PV/TT move, promotions and victim/attacker capture
values, checks, then color/depth killers and color-specific history. Those are
priority bands, not utility weights or a claimed FFA static exchange evaluator.
Countermoves and SEE are deferred until simpler ordering has measured benefit.

Paranoid quiescence searches captures, promotions, annotated checks and **all**
legal evasions when the acting player is checked. It has a hard extra-ply cap and
shares budgets. At the cap even checked states use static evaluation. Stand-pat
is a heuristic endpoint, not an actual legal pass; intervening quiet third-party
moves and zugzwang can invalidate it. Check annotations may include pre-existing
checks, making this a broad tactical set. Max^n+quiescence is explicitly rejected
until vector stand-pat semantics are designed. No unsafe null-move/LMR pruning,
BRS approximation, new representation or Rust core was introduced.

## Browser integration boundary

This spike supplies an integration plan, not a production search replacement.
Put a versioned `{requestId, state, engineId, limits, seed}` request in a module
Worker; return `{requestId, move, stats}`. Validate the move against the current
state and reject stale IDs. On reset/unmount or a watchdog deadline, terminate
and recreate the worker. Only the active CPU searches; all four seats share a
single sequential service. Budget tiers should begin with 100/250/500 ms and a
small TT cap, then be measured on mobile hardware. A worker crash should surface
a local error and use a bounded legal fallback, not restart unbounded level 5
on the main thread. Static hosting and local-only play remain requirements.

Browser tasks for the next phase: initialization/serialization timing, cancellation
mid-search, reset during a turn, stale reply rejection, four CPU sequencing,
memory growth and slow-device p95 latency. Existing E2E verifies classic autoplay;
it does not validate this proposed Worker contract.
