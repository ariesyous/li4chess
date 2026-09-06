# Project state

Last updated: 2026-09-06.

Read this file with [ROADMAP.md](../ROADMAP.md) and [AGENTS.md](../AGENTS.md) at
the start of repository work. This is a compact handoff, not a transcript.
Git history preserves earlier snapshots; keep this file focused on current work.

## Current focus

**M1 is in progress.** M1-01 completed the sourced
[standard-FFA compatibility audit](rules-compatibility.md) on 2026-09-06; it
does not change the local house rules. **M1-02 is complete:** the maintainer
accepted the [ruleset/replay migration contract](ruleset-versioning.md), including
the product-owned identifiers, v2 deterministic event/state requirements, legacy
preservation, and evidence-status fixture inventory. All release-affecting game
semantics have D/O target evidence. **M1-03 is in progress:** the
setup/core/en-passant and castling slices are implemented; the remaining
accepted differences still need fixture-first engine, protocol, UI, bot,
and arena changes.
The first public release is M4, public FFA matchmaking with ratings, anonymous
access, and CPU play.

Repository baseline verified: `0f01a2b8e23c3e14e293650e579f79e5b2d4a7f1` on `main`,
with a clean working tree before the castling slice. The previous setup/core/EP
slice is committed in that revision; its earlier handoff's "uncommitted" wording
was stale. The castling slice described below follows that baseline; use Git
history and status to verify its commit and publication state.
The local game now implements a partial M1 migration. CPU search is synchronous;
networking, application persistence, clocks, accounts, queues, and ratings are
not implemented. See [README.md](../README.md) for the package map.

The accepted M3 direction is now Cloudflare-native, with an architecture spike
and ADR required before implementation. This planning decision does not start M3,
provision infrastructure, or change the current M1 focus.

## Completed M1-03 slices and remaining work

The second slice implements `FFA-CASTLE-01..16`: 64 tests across all four
seats, with both castles, independent absolute destinations, missing/moved/
foreign pieces, king/rook move-return and rook-capture rights loss, saved revoked
rights, occupancy, each opponent's origin/transit/destination attacks, allowed
rook-only attacks, and passive dead blockers/screens/no attacks. Rights now
require own home pieces, can only be lost, and are cleared for inactive owners
and in the existing deferred-elimination transition. Path geometry and attack
filtering already satisfied the fixtures and were not changed.

Inputs and expected results were written before behavior changes. The baseline
had 52 passing and 12 failing castling tests; a deferred-mate rights-cleanup
assertion was also written before implementation. All 64 final cases pass.
Passive death snapshots use existing owner statuses; this adds no new death,
walking-king, scoring, promotion, or replay behavior. See the
[fixture map](m1-03-fixtures.md) for the exact inputs/outputs and boundaries.

The first slice implements `FFA-SETUP-01..04`, `FFA-CORE-01..12`, and
`FFA-EP-01..12`. See [the fixture map](m1-03-fixtures.md) for individual
assertions and source files. Four setup tests use independent absolute
coordinates; core and EP each have 12 scenarios repeated for all four seats.
The corrected pre-implementation run had 32 passing and 68 failing cases.

Implemented differences: active kings are non-capturable; pawn double pushes
require an unmoved pawn; inactive players generate no moves; en-passant rights
record the victim and per-owner opportunities across overlapping pushes.
Adjacent/opposite capturers, individual expiry, own-king safety, and the
explicit dead-pawn zero-point capture are covered. Captures of all inactive
material now score zero. Deferred mate/stalemate timing already worked and
now has accepted-ID rescue/rotation coverage. External app requests select a
canonical legal move; protocol round-trips and bot hashes include the new rights.

Implementation decision: local states carry `rulesetId: null` and the new
`enPassantRights` array. This is an explicitly uncertified partial migration,
not a sixth ruleset ID or a claim of state-v2/replay-v2 implementation. Old or
labelled snapshots are rejected by the reducer, protocol state helpers, and
arena input/replay/aggregation. The
[historical house specification](rules-spec-house-ffa-v1.md) is preserved from
the starting commit. Frozen classic sources and archived research are unchanged;
no new benchmark/tournament measurements or replay conversions were performed.
The existing v1 arena harness remains regression infrastructure; new research
output must wait for the accepted v2 provenance/replay migration.

No accepted-contract conflict was found. The dead-pawn fixture uses an explicit
inactive-owner snapshot; this slice does not add resignation/timeout or retained
mate-army transitions. The existing owner status expresses that passive case,
but a live walking king with a dead army will need finer state. Mate removal,
far-edge promotion, award-free scoring, elimination-first placements, and the
old draw ending remain partial-migration limitations, accurately described in
[rules-spec.md](rules-spec.md). No M2/M3 work was started.

**Exact next slice (working plan):** fixture-first `FFA-DEAD-01..08`, covering
retained passive mate/stalemate armies, zero-point captures, no attacks/moves/
special rights, path blocking, and dead-pawn en passant. Then implement only
required passive dead-army transitions/interactions. Awards and walking kings
remain separate SCORE/WALK work; this slice has not started. PROMO, SCORE, WALK,
END, DRAW, ABORT, replay-v2/state-v2, and consumer alignment remain later M1-03
work. Standard-v1 remains reserved. M2/M3 remain untouched.

**Castling validation, 2026-09-06:** Windows, Node 24.18.0, pnpm **10.33.0** via
temporary Corepack shims on PATH, including Turbo child processes, against
`0f01a2b8e23c3e14e293650e579f79e5b2d4a7f1` plus the castling slice (uncommitted
at validation time):

- `pnpm lint --force`: all six packages passed.
- `pnpm test --force`: **266 passed** (engine 211, bot 46, protocol 4, arena 5).
- `pnpm build --force`: all six packages passed, including the Vite app.
- `pnpm --filter @li4chess/web test:e2e`: **2 passed**, human/CPU play and
  four-CPU autoplay; only non-failing npm environment/colour warnings.
- `--force` bypassed Turbo caches for fresh lint/test/build execution.
- Separate strict TypeScript validation of the new fixture file passed;
  source-only lint does not include test files.
- The initial test attempt hit esbuild's sandbox parent-directory read
  restriction; approved baseline and final test/build/browser runs outside it
  passed. Corepack used its temporary cache; the host pnpm 11.19.0 wrapper was
  not used for validation.
- Complete diff review found only the three castling-related engine files,
  the new fixture file, and six current documentation files changed. All 146
  local links across 18 Markdown files resolved; tracked and new files passed
  `git diff --check` with the repository's normal line-ending configuration.
  Frozen classic sources, archived research, and the historical house spec
  are unchanged. No research measurement or deployment occurred during validation.

**Previous slice validation, 2026-09-06 (historical):** Windows, Node 24.18.0, pnpm **10.33.0** via
temporary Corepack shims (including Turbo child processes), against
`bb6677439c159a9b53ce3a5029982f667c4a99d4` plus the then-uncommitted setup/core/EP
slice, subsequently committed as `0f01a2b8e23c3e14e293650e579f79e5b2d4a7f1`:

- `pnpm lint`: passed across all six packages.
- `pnpm test`: **202 passed** (engine 147, bot 46, protocol 4, arena 5).
- `pnpm build`: passed across all six packages, including the Vite app.
- `pnpm --filter @li4chess/web test:e2e`: **2 passed**, human/CPU play and
  four-CPU autoplay. Only non-failing npm environment/colour warnings.
- Turbo caching was bypassed for fresh lint/test/build execution. The initial
  baseline `pnpm test` was a cached 91-test run, not fresh baseline evidence.
- A separate strict TypeScript check of the new fixture files found tuple
  inference errors omitted by source-only lint. Those were corrected; the
  fixture type-check and 52 affected setup/core cases then passed.
- Sandbox attempts initially blocked esbuild's parent-directory reads and the
  pinned package-manager download. Approved reruns outside the restriction
  passed; the host wrapper's pnpm 11.19.0 was not used for final validation.
- Final diff review found no unrelated implementation changes. All 144 local
  links across 18 Markdown files resolved; tracked and new files passed
  `git diff --check`. The frozen specification matches its producing revision
  (apart from its provenance preface and line endings); classic sources and
  archived research have no changes.

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

The seven-milestone sequence and architecture details in the roadmap are the
working implementation plan. Revise them when evidence warrants it; distinguish
such revisions from changes to the maintainer's accepted product decisions.

## Next actionable tasks

Continue M1-03 with executable fixtures before each behavior change; M3-01 is
the first M3 task when that milestone becomes actionable.

| ID | Task | Done when |
| --- | --- | --- |
| M1-01 | Create `docs/rules-compatibility.md`: compare current code/spec against current official FFA documentation; record source dates and unresolved cases. | **Complete 2026-09-06.** [Audit](rules-compatibility.md) covers every requested category, current code/tests, official source dates, scoped variant distinctions, and reproducible open-case checks. |
| M1-02 | Resolve compatibility questions and specify ruleset/replay versioning, including old artifacts and rule-driven randomness. | **Complete 2026-09-06.** The maintainer accepted the [migration contract](ruleset-versioning.md); every release-affecting rule has D/O evidence, and the identifiers, replay/state invariants, and legacy policy are fixed for M1-03. |
| M1-03 | Implement the verified differences in focused changes, updating the engine, evaluation, result UI, and tests together where needed. | **In progress.** SETUP/CORE/EP and CASTLE slices implemented; [coverage and exact next slice](m1-03-fixtures.md). Next: fixture-first `FFA-DEAD-01..08`. Complete only when all M1 exit criteria and repository validation pass; historical evidence remains intact. |
| M2-01 | Define and implement the Worker request/result contract and bounded CPU scheduling. Can begin independently after agreeing its scope. | Reset/cancellation/failure/stale-result tests pass and UI input remains responsive during search. |
| M2-02 | Design and implement the board-first local game frame and four-player panels from the [UI/UX reference](ui-ux-reference.md), using original accessible components. | Desktop/mobile/keyboard/screen-reader acceptance coverage shows all seat, turn, score, and status information without colour-only cues. |
| M3-01 | Run the Cloudflare architecture spike and write an ADR before online-service implementation. Validate the Worker/Static Assets boundary, authoritative `GameRoom` Durable Object lifecycle and WebSockets, D1 event/replay persistence and recovery, protocol ownership, local Wrangler/Vite/workerd workflow, CI/deployment shape, platform limits, observability, and cost assumptions. | Focused prototypes and the ADR make consistency, failure/recovery, deployment/rollback, limits, fallback criteria, and deferred services explicit; no production infrastructure is provisioned merely to complete the design. |

Do not change game rules while merely collecting comparison evidence. M1-02
must identify compatibility tests before M1-03 changes behavior. Do not treat
the old recommendation's throughput figures or strongest configured bot level
as measurements of the new ruleset.

## Open decisions and verification needs

| ID | Question | Working proposal / next step | Needed by |
| --- | --- | --- | --- |
| Q2 | Which launch time controls and disconnect/abort details? | Start with few queues; verify Chess.com behavior before choosing compatible defaults. | M1 audit / M3 clocks |
| Q3 | Must rating calculations exactly match Chess.com's? | Rules compatibility is accepted. Use its rating overview as a reference; document ties, parameters, and corrections before choosing an implementation. | M4 |
| Q4 | Which Cloudflare plan, data location, budget ceiling, and load target meet the release needs? | M3-01 verifies current limits and pricing without purchasing or provisioning. Set the concrete budget/load gate when deployment becomes actionable; leave the D1-to-PostgreSQL fallback evidence-based. | M3 architecture / M4 release gate |
| Q5 | How should mixed online human/CPU games work? | Local anonymous CPU play is required. Shared online CPUs are optional; propose explicit opt-in, labels, server ownership, and exclusion from human rating pools. | Before adding online CPU seats |

Q1 (anonymous rating eligibility) is resolved by D07. Q6 (remaining rule
evidence), Q7 (authoritative-randomness replay fields), and the M1-02 contract
gate are resolved by D10. M3 must supply server authority for those replay fields.
No unresolved question blocks beginning M1-03. Only ask for decisions when the
current work depends on them; do not reopen already accepted requirements.

## Evidence and validation

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
