# Project state

Last updated: 2026-09-06.

Read with [ROADMAP.md](../ROADMAP.md), [AGENTS.md](../AGENTS.md) and the working
tree. This file retains current decisions and evidence; Git history preserves
superseded handoffs.

## Current focus

**M3-01 is in progress**, scoped to isolated Cloudflare prototypes and the
[architecture ADR](m3-01-adr.md), [acceptance plan](m3-01-acceptance.md) and
[official-source research](m3-01-platform-research.md). The authorized goal ends
before M3-02, after independent review, fresh checks, commits and a draft PR.
No merge, main push, deployment, provisioning or purchase is authorized.

**M2 is complete and merged.** [PR #11](https://github.com/ariesyous/li4chess/pull/11)
merged at `d0249a3deffe0ed3e147b49b33e50ebc8b5c6f05`.
[Post-merge CI](https://github.com/ariesyous/li4chess/actions/runs/34060918247) and
[Pages deployment](https://github.com/ariesyous/li4chess/actions/runs/34060918157)
were independently verified successful at that revision on 2026-09-06.
M3-01 started on `codex/m3-01-architecture` from that fetched remote baseline.
Pre-existing Wrangler dependency/workspace edits were preserved and reused for
the authorized prototype; their original patch was saved outside the checkout.
**M1 is complete.** M1-01/M1-02/M1-03 are complete and
all D/O requirements in the accepted contract have executable coverage. The
implementation activates `li4chess-ffa-standard-v1` after independently
reviewed rule and replay implementations. Preserve its accepted contract.

M2 began from clean fetched `origin/main`, merge `7f2593c96301853c6b3a9ebeaaaf6ea4683dc698`,
on dedicated `codex/m2-completion`. GitHub verifies [M1 PR #10](https://github.com/ariesyous/li4chess/pull/10)
merged with passing checks. Human Git identity is Aries Youssefian. Node 24.18.0
and pinned pnpm 10.33.0 via temporary Corepack shims are verified. Current
M3-01 scope is stated above.

Local hotseat/CPU play now follows standard FFA points and actions. CPU search
uses the bounded Worker path with measured resource policies. Live clocks, connection-bank tracking,
networking, accounts, matchmaking and ratings are M3/M4. Local timeout and
exhausted-disconnect facts are deterministic engine/replay inputs only.

## M2 slice 1: bounded Worker search

Implemented from `7f2593c` on 2026-09-06. `chooseBoundedCpuMove` retains the
production evaluator and exact contender semantics under one iterative node/time
budget. Browser requests validate state-v2, hash/game/request/seat identities and
move intentions. Cancellation terminates the Worker; initialization, crash,
decode, malformed and watchdog failures use a current legal fallback. Request
diagnostics separate search, startup and round-trip time and identify recovery.
Reset/import/teardown invalidate asynchronous operations. Walking/Claim Win remain
canonical M1 actions. No engine, frozen classic or archived evidence changed.

Fresh independent reviews covered search suitability and the actual Worker diff.
The laboratory terminal-scale mismatch was avoided; the diagnostics finding was
resolved. Browser tests exposed redundant cleanup termination, now idempotent.
Acceptance inputs and remaining calibration/UI/save gates:
[M2 acceptance](m2-acceptance.md). Unit/browser test sources now type-check in lint;
one existing bot test helper had its unnecessarily readonly return annotation fixed.

Validation on Windows, Node 24.18.0, pnpm 10.33.0 against `7f2593c` plus this
slice: fresh `pnpm lint --force`, `pnpm test --force` (**597 tests**: engine 471,
bot 63, protocol 36, arena 11, web 16), and `pnpm build --force` passed.
`pnpm --filter @li4chess/web test:e2e` passed **27 browser tests**, including real
busy-Worker exit/import/terminal interruption and constructor/crash/hung-Worker
recovery, without retries. Local Markdown file
links: 201 resolved; `git diff --check` passed. These are correctness/lifecycle
checks, not difficulty calibration or playing-strength measurements.

Subsequent slices below add persistence, the frame, production calibration and
complete-game evidence. M3 remains outside this goal.

## M2 slice 2: validated local save/resume

Implemented from `839aa46` on 2026-09-06. One atomic synchronous local journal
retains a state-v2 initial checkpoint, strict action intentions, producer and
source replay hash. Resume rebuilds and validates through M1 replay-v2 before
mounting the game; every accepted action autosaves, with an explicit retry control.
Setup offers Resume saved game after refresh. Unavailable/corrupt/incompatible
storage reports an error while play/setup/replay export remain usable. Human
seat difficulty is retained as well as CPU difficulty.

Fresh independent review found no blocking defect and requested added coverage
for pending terminal recovery and obsolete resume completion. Both were added,
alongside strict rejection of unknown journal action fields. The new cases
verify interrupted award import → autosave → refresh → resume → export, exact
awards/result/source lineage, and a latched old resume losing to Start game.
Real active-search refresh preserves CPU L5 and applies exactly one resumed move.

Fresh final checks on `839aa46` plus this slice, Windows/Node 24.18.0/pnpm 10.33.0:
`pnpm lint --force`, `pnpm test --force` (**602 tests**), `pnpm build --force`,
and `pnpm --filter @li4chess/web test:e2e` (**33 passed**, no retries) succeeded.
All 202 local Markdown links resolved; diff formatting and preserved paths passed.
An earlier browser run was stopped after concurrent source edits invalidated
Vite fixture routes; the final full run used stable files. Later slices below
record the frame, accessibility, calibration and complete-game evidence.

## M1 implementation history

- SETUP/CORE/EP, CASTLE and DEAD were verified at the baseline. Their full
  four-orientation coverage remains in [the fixture map](m1-03-fixtures.md).
- `4c331f2` implements eighth-rank automatic one-point Queens; `f3a0101` adds
  capture/own-army multi-check ledgers; `5361be7` adds deferred SCORE attribution,
  walking Kings and opening aborts; `11bdfae` adds points/shared ranks, immediate
  claims and survivor awards; `9a5c8c5` adds automatic draws/counters/flat awards.
  Each slice was independently reviewed, validated and pushed.
- `e0adfd5` implements explicit state-v2/result-v2/replay-v2,
  canonical SHA-256, validated actions/effects, recorded random provenance,
  resumable pending transactions, complete Modern starts and content-addressed
  checkpoints, actual producer identities, and explicit legacy rejection.
  [Format details](state-replay-v2.md) and [acceptance](m1-replay-acceptance.md).
- The app exports/imports and resumes verified games with imported CPU controls;
  a new export records its producer and source replay hash. Arena version-2
  writers and reports validate all games, metadata, environment and branching;
  walking moves are excluded from engine search metrics. Runs detect source drift.
- Two complete Modern games provide cross-feature evidence: 12 opening moves
  followed by three forfeits and survivor +60; a 16-ply legal Knight cycle ending
  in threefold repetition and four shared first places. Rotated replay fixtures
  cover promotion capture, capture/check/mate stacking and three-way mate thirds.
- [Legacy quarantine](legacy-replay-manifest.json) hashes 29 unchanged archived
  artifacts and rejects all 14 replay logs by default. Their declared baseline
  cannot prove an exact producing build, so classification remains unclassified.
  No historical result was rerun/reaggregated under the new engine. Frozen classic
  and the historical house specification remain unchanged.

## Final M1 validation

REPLAY core and consumer reviewers approved after fixes to checkpoint identity,
producer attribution, EP validation, terminal/claim consistency, causal namespaces,
walking metrics and source drift. The final Node-only bootstrap also passed
independent review. Fresh checks on `9a5c8c5` plus the final REPLAY implementation
passed on Windows, Node 24.18.0 and pinned pnpm 10.33.0 (2026-09-06):

- `pnpm lint --force` and `pnpm build --force` passed for all packages.
- `pnpm test --force`: **571 unit tests** (471 engine, 53 bot, 36 protocol, 11 arena).
- `pnpm --filter @li4chess/web test:e2e`: **21 browser tests**.
- Strict standalone TypeScript checks passed for changed/new engine, protocol,
  arena and browser tests; the JSDoc Node bootstrap is checked by package lint.
- `pnpm install --frozen-lockfile` and a direct Node bootstrap import passed.

The maintainer requested Node 24 for CI. Both validation and Pages build workflows
now select Node 24, and the documented/package runtime floor is 24. This changes
future build configuration only; no deployment was run.

[CI run 34052398852](https://github.com/ariesyous/li4chess/actions/runs/34052398852)
passed on final implementation commit `e0adfd5b79f5f16c1a8283355e946725bcb1461d`
using Ubuntu/Node 24 and pinned pnpm: install, lint, unit tests, build and browser
tests all succeeded. Local links (197 across 24 Markdown files), diff checks and
frozen-path checks also passed. This closeout changes documentation only; CI on
its pushed revision is checked again before ending the goal. No merge or deployment.

## Accepted decisions

| ID | Date | Decision and rationale |
| --- | --- | --- |
| D01 | 2026-09-06 | Build a four-player Lichess equivalent covering play, competition, learning, and community over time. This is the maintainer's product vision. |
| D02 | 2026-09-06 | First public release targets FFA public matchmaking and ratings. Invite rooms can serve internal testing but do not replace this goal. |
| D03 | 2026-09-06 | Free access, no ads, anonymous play, and CPU opponents are initial requirements. Competitive fairness and community governance are longer-term guiding principles. |
| D04 | 2026-09-06 | Match Chess.com's standard FFA rules. Existing house rules must be audited and migrated before launch, rather than assumed compatible. |
| D05 | 2026-09-06 | Superseded by D09. The earlier hosting direction was a VPS behind Cloudflare plus PostgreSQL, with Aiven only a candidate. Preserve this row as decision history; do not implement it as the current plan. |
| D06 | 2026-09-06 | Repository licensing is AGPL v3, declared as `AGPL-3.0-only` in `package.json`. Preserve original research evidence and human Git attribution. |
| D07 | 2026-09-06 | Anonymous players get casual matchmaking and CPU games. Accounts are required for rated play and persistent leaderboards; confirmed after the initial planning questions. |
| D08 | 2026-09-06 | The game UI/UX should take a board-first, four-player-panel reference direction similar in interaction quality to the observed Chess.com FFA client, while using original li4chess design and accessible non-colour cues. |
| D09 | 2026-09-06 | M3 will start with a Cloudflare-native architecture: React/Vite via Workers Static Assets, a TypeScript Worker API, one authoritative `GameRoom` Durable Object per active game with WebSockets, and D1 as the initial canonical SQL store. Local development uses Wrangler, Vite, and workerd on Windows; deployment targets Cloudflare's GitHub build integration. R2, Queues, Containers, PostgreSQL, or other infrastructure require demonstrated need. M3-01 must validate this direction in an architecture spike and ADR before implementation. |
| D10 | 2026-09-06 | Accept the M1-02 standard-FFA migration contract as written: the five product identifiers, replay v2 invariants, canonical state/hash policy, and provenance-based legacy classification are authoritative for M1-03. Acceptance does not claim the target ruleset is implemented; `li4chess-ffa-standard-v1` remains reserved until its fixtures and implementation pass. |
| D11 | 2026-09-06 | Clarify standard FFA SCORE attribution: active checking owners split +20 equally at scheduled mate, nonchecking escape-blockers get zero; the last actor changing legal moves from positive to zero determines self/opponent stalemate, rescue clears that cause; other-owner checking pieces never contribute to mover multi-check count or Queen tier. [Acceptance cases](m1-score-acceptance.md). |

The seven-milestone sequence and architecture details in the roadmap are the
working implementation plan. Revise them when evidence warrants it; distinguish
such revisions from changes to the maintainer's accepted product decisions.

## Next actionable tasks

Complete only M3-01 under the current goal. The ADR records the handoff to
M3-02 through M3-06; no later implementation is authorized in this task.

| ID | Task | Done when |
| --- | --- | --- |
| M1-01 | Create `docs/rules-compatibility.md`: compare current code/spec against current official FFA documentation; record source dates and unresolved cases. | **Complete 2026-09-06.** [Audit](rules-compatibility.md) covers every requested category, current code/tests, official source dates, scoped variant distinctions, and reproducible open-case checks. |
| M1-02 | Resolve compatibility questions and specify ruleset/replay versioning, including old artifacts and rule-driven randomness. | **Complete 2026-09-06.** The maintainer accepted the [migration contract](ruleset-versioning.md); every release-affecting rule has D/O evidence, and the identifiers, replay/state invariants, and legacy policy are fixed for M1-03. |
| M1-03 | Implement the verified differences in focused changes, updating the engine, evaluation, result UI, and tests together where needed. | **Complete 2026-09-06.** All rule groups, REPLAY, complete games and consumers are implemented and independently reviewed. [Coverage](m1-03-fixtures.md), fresh full local checks and final implementation CI satisfy the M1 exit criteria. |
| M2-01 | Implement the Worker contract and bounded production CPU scheduling. | **Complete 2026-09-06.** Real active-search replacement/failure tests and measured input responsiveness pass; all five policies have production evidence. |
| M2-02 | Implement the original board-first frame and accessible controls. | **Complete 2026-09-06.** Desktop/tablet/phone emulation, keyboard/accessible-name checks and inspected captures pass. Physical-device and screen-reader testing were unavailable and are not claimed. |
| M2-03 | Provide validated local save/resume and refresh recovery. | **Complete 2026-09-06.** Strict replay-backed journals preserve seats, scores, randomness, pending effects and lineage; active-search refresh and storage failures are covered. |
| M2-04 | Calibrate resource policies and prove complete local games. | **Complete 2026-09-06.** [Evidence](m2-evidence/README.md) retains 214 searches, 360 active-search inputs, complete hotseat/mixed/four-CPU replays, independent review and full validation. |
| M3-01 | Run the Cloudflare architecture spike and write an ADR before online-service implementation. Validate the Worker/Static Assets boundary, authoritative `GameRoom` Durable Object lifecycle and WebSockets, D1 event/replay persistence and recovery, protocol ownership, local Wrangler/Vite/workerd workflow, CI/deployment shape, platform limits, observability, and cost assumptions. | Focused prototypes and the ADR make consistency, failure/recovery, deployment/rollback, limits, fallback criteria, and deferred services explicit; no production infrastructure is provisioned merely to complete the design. |

Do not change game rules while merely collecting comparison evidence. Preserve
the accepted M1 contract and its coverage. Do not treat the old recommendation's
throughput figures or strongest configured bot level as measurements of the new ruleset.

## Open decisions and verification needs

| ID | Question | Working proposal / next step | Needed by |
| --- | --- | --- | --- |
| Q2 | Which launch time controls? | Rule-level disconnect/abort facts are settled and implemented locally; choose online queue controls and authoritative clocks in M3. | M3 clocks |
| Q3 | Must rating calculations exactly match Chess.com's? | Rules compatibility is accepted. Use its rating overview as a reference; document ties, parameters, and corrections before choosing an implementation. | M4 |
| Q4 | Which Cloudflare plan, data location, budget ceiling, and load target meet the release needs? | M3-01 verifies current limits and pricing without purchasing or provisioning. Set the concrete budget/load gate when deployment becomes actionable; leave the D1-to-PostgreSQL fallback evidence-based. | M3 architecture / M4 release gate |
| Q5 | How should mixed online human/CPU games work? | Local anonymous CPU play is required. Shared online CPUs are optional; propose explicit opt-in, labels, server ownership, and exclusion from human rating pools. | Before adding online CPU seats |

Q1 (anonymous rating eligibility) is resolved by D07. Q6 (remaining rule
evidence), Q7 (authoritative-randomness replay fields), and the M1-02 contract
gate are resolved by D10. M3 must supply server authority for those replay fields.
No unresolved question blocks M1 completion. Only ask for decisions when the
current work depends on them; do not reopen already accepted requirements.

## Historical evidence and validation

- Baseline validation earlier in this conversation on 2026-09-06: `pnpm lint`,
  all **91 unit tests**, `pnpm build`, and **2 Playwright tests** passed against
  code revision `5c089934d736bd19199875637a864e4bd395055b`. These are earlier runs,
  not fresh validation of future edits or proof of rules compatibility.
- Environment for that baseline: Windows, Node 24.18.0; host pnpm wrapper reported
  11.19.0 although the repository pins 10.33.0. esbuild initially hit sandbox
  filesystem restrictions; tests/build/browser tests succeeded outside that
  restriction. Record environment differences in future results.
- Planning validation on 2026-09-06: local Markdown links resolved across README,
  AGENTS, ROADMAP, this state file, and the rules specification; `git diff --check`
  passed. Documentation only; unit/browser tests and benchmarks were not rerun.
- M1-01 audit validation on 2026-09-06: retrieved and reviewed the current
  official [Chess.com 4PC help](https://support.chess.com/en/articles/8614233-4-player-chess-4pc)
  article (published 2025-10-10) and the official 2026 4PC event rulebook;
  inspected the engine, local UI, protocol, bot, arena, and their cited tests.
  The audit intentionally records documentation gaps as unresolved rather than
  treating Teams, Solo, custom variants, or historic community posts as FFA
  authority. Fresh local Markdown-link and diff-format checks are required at
  the end of this documentation change; unit/browser tests are not required for
  documentation-only edits.
- M1-02 planning validation on 2026-09-06: inspected the current engine state,
  protocol serialization, arena record/replay path, and bot/arena consumers.
  The new [ruleset/replay proposal](ruleset-versioning.md) preserves legacy
  artifacts by provenance or quarantine and requires deterministic random-action
  events. It is a design document only; no engine/protocol/arena code or historic
  result changed. Validate its local links and formatting before committing.
- M1-02 live-configuration observation on 2026-09-06: inspected the signed-in,
  read-only Chess.com FFA / Modern analysis editor without creating a game or
  challenge. Its generated header included `DeadKingWalking EnPassant
  PromoteTo=D`; the visible defaults also showed a 14×14 four-army board,
  eighth-rank 1-point-queen promotion, +20 mate, points to the stalemated
  player, and disabled No En Passant/Capture the King rules. These are observed
  configuration facts, recorded in [the compatibility audit](rules-compatibility.md)
  and [versioning contract](ruleset-versioning.md); the behavior-specific replay
  fixtures remain M1-03 implementation work.
- M1-02 live standard-game observation on 2026-09-06: reviewed the completed
  linked [1 | 7 FFA / Modern replay](https://www.chess.com/variants/4-player-chess/game/108222020)
  read-only. It observed `O-O-O`/`O-O` castling, `=Q` promotion notation,
  timeout `T Ki1` with a grey dead army and live king, resignation `R` events,
  and terminal `Yellow +60` after the timeout and two resignations. The replay
  does not settle special-move rights, dead-piece geometry, random selection,
  promotion value, award predicate, or placements/ties. These facts are linked
  into the audit and versioning proposal; no game, engine, bot, protocol, or
  historical artifact was modified.
- M1-02 contract refinement on 2026-09-06: retained the M1-01 audit as the
  evidence baseline and made the target's proposed identifiers explicit:
  `li4chess-house-ffa-v1`, reserved `li4chess-ffa-standard-v1`,
  `li4chess-replay-v2`/numeric schema 2, `li4chess-state-v2`, and
  `legacy-arena-v1`. The contract now requires canonical event hashes, state
  inputs, score awards, terminal/abort facts, and recorded walking-king actions;
  it quarantines legacy records without provenance. Each unresolved
  release-affecting rule has a D/O/V/M evidence status and a standard-FFA
  verification procedure. This is documentation only and does not complete M1
  or M1-02.
- M1-02 refinement validation on 2026-09-06: rechecked the current official
  [Chess.com 4PC help](https://support.chess.com/en/articles/8614233-4-player-chess-4pc)
  against the D rows; all release-affecting gaps remain V rather than inferred.
  Local file and heading links resolved across the 16 repository Markdown files,
  and `git diff --check` passed, including a no-index check for the untracked
  migration contract. Documentation only; no code, bot behavior, UI, or
  historical experiment artifact changed.
- M1-02 castling update on 2026-09-06: the maintainer reported live standard
  FFA castling uses ordinary two-player king/rook destinations, rights loss,
  and check/path restrictions; a dead piece still blocks a required-clear
  castle path. This is recorded as maintainer-provided O evidence, not as an
  official-source claim. The later clarification closes dead-piece attacks;
  only unreported special-right semantics remain V. The terminal-point conflict
  has since been reconciled; no implementation changed.
- M1-02 terms-source update on 2026-09-06: reviewed Chess.com's current
  [4 Player Chess terms article](https://www.chess.com/terms/4-player-chess).
  Its standard-FFA section documents Red-first clockwise play on 160 squares,
  automatic Queen promotion worth one point when captured, ordinary
  checkmate/stalemate making an army inactive, random walking kings after
  resign/timeout, named stalemate/draw awards, and the two-player 21-point
  victory claim. The maintainer also clarified that dead pieces do not attack.
  The audit and contract now distinguish these D/O facts from still-open event
  timing, counter, tie, final-award, en-passant, and special-right V cases.
- M1-02 maintainer-rule update on 2026-09-06: recorded per-player en-passant
  opportunity/expiry; deferred mate/stalemate and active-king non-capture;
  regular-turn uniform server-PRNG walking kings; direct-only, stacking
  multi-check awards; automatic draw triggers and resets; shared placements;
  and dead-piece zero-value/attack/en-passant/castling behavior. It initially
  exposed a terminal-award conflict pending clarification.
- M1-02 terminal-scoring clarification on 2026-09-06: named draws award a flat,
  non-stacking +10 to every active player; the two-player 21-point claim gives
  only the trailing player +20 while the leader gets +0; Standard Modern sole
  survivors get +20 per live walking king, with +40 legacy/custom only. Queen
  multi-check is +1/+5 and non-Queen is +5/+20. This resolves the recorded
  conflict; executable evidence fixtures remain M1-03 work, not target-score
  guessing.
- M1-02 complete rule-answer update on 2026-09-06: maintainer-provided standard
  FFA behavior resolved canonical setup/orientation, normal self-check/pin/king
  legality, en-passant pin legality, passive dead-piece semantics, pawn-Queen
  classification/no spare king, Queen-priority mixed checks, full draw identity
  and thresholds/material predicates, immediate Claim Win, and cumulative
  disconnect-bank behavior. The contract classifies every release-affecting game
  rule D/O; the maintainer subsequently accepted its product-owned identifiers
  and replay/legacy policy in D10.
- Documentation validation on 2026-09-06: local Markdown links in the audit,
  versioning proposal, project state, and roadmap resolve; `git diff --check`
  also passed (including the untracked proposal). The official help and event
  rulebook links opened successfully. The linked game replay was inspected in
  the signed-in client; do not treat its availability as a public-API contract.
- M1-02 acceptance and closeout on 2026-09-06: the maintainer explicitly
  accepted the migration contract as written. D10 records acceptance of the five
  identifiers, replay v2 invariants, canonical state/hash policy, and
  provenance-based legacy policy. M1-02 is complete; M1-03 starts with executable
  setup, core-legality, and en-passant fixtures before behavior changes.
  `li4chess-ffa-standard-v1` remains reserved until implementation and validation.
  Local links in all 12 Markdown files containing links resolved, and
  `git diff --check` passed. Documentation only; code tests were not rerun.
- UI/UX reference observation on 2026-09-06: inspected the completed FFA game
  screen on a narrow client viewport and documented the observed board-first
  hierarchy, four edge player panels, compact context header, terminal result,
  and replay/chat controls in [ui-ux-reference.md](ui-ux-reference.md). This
  is a product direction (D08), not a visual copy, rules claim, or implemented
  UI change.
- M3 architecture planning update on 2026-09-06: replaced the superseded
  VPS/PostgreSQL direction with accepted decision D09 and an explicit M3-01 through
  M3-06 work breakdown. The intended initial stack is Workers Static Assets,
  Workers, a per-game authoritative Durable Object with WebSockets, and D1;
  optional Cloudflare services and database migration require evidence. This is a
  documentation-only decision record: no runtime code, account, paid plan,
  infrastructure, or deployment changed. Local links across all 12 Markdown files
  containing links resolved, and `git diff --check` passed.
- Historical production/research measurements remain in
  [engine/reconciliation.md](engine/reconciliation.md) and linked artifacts.

## Session handoff procedure

1. Read this file, the roadmap, repository instructions, and `git status`; verify
   that the stated baseline and outstanding changes still apply.
2. Identify the active task and its exit criteria. Mark work in progress only
   when it starts; do not interpret the entire roadmap as authorization to
   implement all milestones, provision services, or launch the site.
3. After meaningful work, update the current focus, next tasks, decisions,
   blockers, and actual checks with the date and relevant code revision or
   dirty-tree context. Link files, commits, or PRs when available.
4. Update milestone status only with evidence for its exit criteria. Keep
   README's implemented features distinct from roadmap targets.
5. Remove stale handoff notes as they are resolved. Keep a concise decision
   ledger; move substantial designs to dedicated docs and link them here.

## M2 slice 3: responsive frame and accessibility

Implemented from `a61031b`: original board-first frame, directional player cards,
seat resource labels, contextual rules help, bounded scrollable histories, explicit
results, native confirmation for consequential controls, and keyboard board
navigation using shared transforms. Reset preserves the currently loaded seats.
Text/initials/status and shape supplement hue; focus is visible and reduced motion
is respected. [Actual captures and manual observations](m2-evidence/ui-inspection.md)
cover 360/768/1280 widths, touch emulation, long histories and terminal layout.
Independent review found missing score/non-current-check/elimination announcements;
a concise action summary and active/walking King regression cases resolve them.
No screen-reader or physical-device test is claimed. Fresh final validation on Windows/Node 24.18.0/pnpm 10.33.0 passed:
`pnpm lint --force`, `pnpm test --force` (602 unit tests),
`pnpm build --force`, and all 43 Playwright tests without retries.
Changed tests type-check in lint; 211 local Markdown links and diff checks pass.
No engine, frozen classic or archived research paths changed.
Calibration and complete-game proof are now recorded in slice 4 below.


## M2 slice 4: measured budgets and complete-game evidence

[Evidence report](m2-evidence/README.md) records 214 legal production searches,
360 active-search input frames across four positions and three viewports, and
the unchanged five resource policies. Every declared timing gate passed; no
recovery/fallback/watchdog event occurred. Exact code/tree/asset/environment
provenance, inputs and raw observations are retained. Complete Modern hotseat
(16 plies), mixed (13 ordinary +2 walking moves), and uninterrupted four-CPU
(465 plies) games reached terminal results, replay-validated and resumed exactly.
Actual result captures were inspected. These are correctness and responsiveness
checks, not playing-strength evidence. Physical phones/screen readers were not tested.

Independent review verified Worker/replay correspondence and the CI test fix.
The first calibration fixture was rejected before measurement, then corrected
to a valid elimination timestamp. The full frozen source snapshot was preserved
before fixing its subtree-scoped collector. No runtime/rules change was needed.

CI on frame commit `386ca59` failed the existing REPLAY-10 test at its five-second
timeout ([run 34057195819](https://github.com/ariesyous/li4chess/actions/runs/34057195819)).
The test now batch-records the same canonical complete game, preserving every
assertion and adding full final-state equality after independent replay validation.
This removes quadratic repeated prefix reads without extending the timeout.
All 36 protocol tests passed; protocol test files now type-check in package lint.
Independent review recomputed all 28 calibration groups and verified request/state
identities, legal results, resource caps, full-game replay and source snapshots.
An additional reviewed browser case injects failure during confirmed production
search and verifies one legal recovery move with no late response.

Fresh final checks on `386ca59` plus this slice, Windows/Node 24.18.0/pnpm 10.33.0,
passed: `pnpm lint --force`, `pnpm test --force` (**602 unit tests**),
`pnpm build --force`, and `pnpm --filter @li4chess/web test:e2e`
(**46 browser tests**, no retries). All 234 local Markdown links and diff checks
passed. The built Worker hash still matches the measured production asset.
All substantive independent review findings are resolved, including a final
cross-check against the full goal and roadmap. Slice 4 is committed as `e02a0ad`.
[CI run 34058335008](https://github.com/ariesyous/li4chess/actions/runs/34058335008)
passed on `e02a0adf6c95e812912eb8dbebdf5d38e0261198`: frozen install, lint, unit
tests, build and browser tests on Ubuntu/Node 24/pnpm 10.33.0. Every M2 exit
criterion has evidence; M2 is complete. This final closeout changes documentation
only, with links/diff checks and pushed-revision CI verified again before ending
the goal. This was the M2 closeout state; PR #11 has since merged, and its successful
post-merge CI/deployment are verified in the current focus above.
