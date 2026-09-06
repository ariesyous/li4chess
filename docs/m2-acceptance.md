# M2 acceptance and delivery plan

Declared 2026-09-06 before behavior changes, from merged M1 `7f2593c`.
Scope ends at M2; rules and historical evidence remain unchanged.

## Slice 1: bounded CPU Workers

Inputs: every difficulty on opening, middlegame, tactical and endgame positions;
real in-flight search interrupted by reset, import, exit, terminal action and
teardown; duplicate, malformed, illegal, wrong-identity and late messages;
constructor failure, runtime error, message decoding failure and watchdog expiry.
Expected: one canonical legal action at most for the matching current position;
termination stops computation immediately; replaced games receive no old action.
Recovery selects from the already generated legal list without main-thread search.
Walking Kings and secure Claim Win continue through M1's canonical action boundary.

Initial policies to calibrate: levels 1–5 use 50/100/250/500/1000 ms soft search
budgets, 128/512/2048/8192/32768 nodes, depth ceilings 1/2/3/4/5. Completed
iterations determine the choice; deterministic node-only mode supports tests.
These are resource tiers, not measured playing-strength or Elo claims.
Hard watchdog: search allowance + 2000 ms including initialization/communication.
Search checks its limits between engine operations; an individual rules operation
is indivisible. On the recorded desktop environment, acceptance requires all
calibration results legal, no normal watchdog recoveries, p95 search within budget
+ 100 ms and maximum within budget + 250 ms. Browser input-to-next-frame p95
must be under 100 ms, maximum under 250 ms during search (30 samples per scenario).
Report startup/communication overhead separately, including cold Workers.

## Slice 2: validated local persistence

Inputs: refresh CPU/hotseat/mixed games, interrupted award transactions, imported
lineage, terminal and abort records, empty/corrupt/incompatible/unavailable storage,
rapid actions while saving and recovery during actual Worker search.
Expected: a discoverable saved game resumes only through replay-v2 validation and
transaction recovery; seat settings, score ledger, randomness and producer lineage
survive. Save failures are visible and do not prevent play or replay export.
No obsolete asynchronous save/import/search completion replaces newer state.

Implementation decision before slice 2: one atomic localStorage journal stores a
state-v2 initial checkpoint, canonical action requests, producer identity and
optional source replay hash. Write synchronously after each accepted action so
refresh cannot race an asynchronous save. Resume must deserialize state-v2,
rebuild the journal with `recordReplay`, and pass `replayCheckpoint` before
mounting a game. This uses M1's existing action, effect-recovery and provenance
boundaries; the local envelope introduces no alternative rules-state shape.
Imported unfinished effect queues continue to recover via `replayCheckpoint`.
An explicit Resume saved game control avoids starting CPU work before the user
chooses to resume. Missing/corrupt/quota/security failures leave setup/play usable.

## Slice 3: game frame and accessibility

Original components: concise context header, board with four directional player
panels, game controls, result panel, move/action history, ordered points ledger,
setup/resume and concise rules help. No fictitious clocks, accounts or networking.
Inputs: desktop, 768 px tablet, 360 px touch phone, each rotation, long history,
checked/dead/walking/terminal/abort states and keyboard-only operation.
Expected: full board without horizontal overflow, readable seat identity and status
beyond color, stable directional anchoring, visible focus, arrow navigation with
Enter/Space selection, practical game-control targets and deliberate forfeits.
Inspect actual captures and record keyboard observations; distinguish browser
emulation and accessibility-tree inspection from physical devices/screen readers.

## Slice 4: evidence and closeout

Complete hotseat, mixed and four-CPU games, replay-validate results, verify refresh,
active-search replacement/failure and usable input. New measurements retain source
revision, dirty content fingerprint, runtime/hardware, policies and sample counts.
Do not count capped games as completed. Every slice receives fresh independent
diff review and lint, unit, build, browser and changed-test type checks.
Final pushed revision requires green CI. M2 stays in progress until every gate
has linked evidence; no merge, publication or M3 implementation is authorized.
