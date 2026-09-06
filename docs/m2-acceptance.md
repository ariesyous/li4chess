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

Frame decision before implementation: keep a full-width board on phones, with
top/bottom seat cards and compact left/right cards using the board's empty corner
space. Derive directional identity from the same orientation used by the board.
Use one board tab stop with arrow-key movement in displayed coordinates; Enter
and Space activate squares, Escape clears selection. Controls use visible focus
and at least 44 px height; the dense board retains browser zoom and full width.
Native confirmation dialogs make resign/timeout/claim/reset deliberate and keep
queued CPU replies from applying until the synchronous decision completes.
Verify Cancel leaves the game untouched and confirmation cancels obsolete search.

## Slice 4: evidence and closeout

Complete hotseat, mixed and four-CPU games, replay-validate results, verify refresh,
active-search replacement/failure and usable input. New measurements retain source
revision, dirty content fingerprint, runtime/hardware, policies and sample counts.
Do not count capped games as completed. Every slice receives fresh independent
diff review and lint, unit, build, browser and changed-test type checks.
Final pushed revision requires green CI. M2 stays in progress until every gate
has linked evidence; no merge, publication or M3 implementation is authorized.

### Evidence procedure fixed before slice 4

Measure the built Vite preview, not HMR, with actual app-created production Workers.
Observe request/start/result timestamps without replacing search or its responses.
Use five fresh Workers per level/position on desktop; add level-5 responsiveness
runs at 360 and 768 px. Opening is Modern setup; middlegame is a deterministic
legal 32-ply continuation; tactical is a four-live-King double-check opportunity;
endgame is a valid sparse two-active-player King/pawn position. Save exact inputs.
Record the bundle hashes, build/tree fingerprint, Node/Chromium/OS/hardware,
policies, sample counts, returned intentions and completed-depth diagnostics.
Native checkbox input timestamp to animation-frame callback measures main-thread
input/render opportunity (not physical input or display latency). Collect at least
30 samples during confirmed active search per position/viewport and report p95/max.
Search and Worker startup/round-trip are distinct from the app's deliberate 400 ms
turn pacing. Search sampling randomness remains production Math.random; fixtures
and walking-King seed are recorded, and returned moves are saved for replayability.

Complete-game checks begin at Modern setup: hotseat knight repetition (16 plies),
mixed human/CPU ordinary opening followed by deliberate post-opening forfeits,
and uninterrupted four-CPU play until an engine terminal result. The first two
are controlled rules/UI workflows, not playing-strength experiments. A four-CPU
run that reaches the observation limit must be saved and labelled unfinished;
it cannot satisfy the completion gate. Export and replay-validate every completed
flow, including exact final awards/results and refresh/resume after termination.
