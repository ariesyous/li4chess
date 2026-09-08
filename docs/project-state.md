# Project state

Last updated: 2026-09-08.

Read with [ROADMAP.md](../ROADMAP.md), [AGENTS.md](../AGENTS.md) and the working
tree. This file retains current decisions and evidence; Git history preserves
superseded handoffs.

## Current focus

**Bounded bot endgame follow-up complete (2026-09-08):** the
[implementation and evidence](engine/endgame-evidence-20260908/README.md) preserve
the original replay and independently reconstruct all 240 moves, including the
77 quiet final moves and unchanged draw counters. A small level-3–5 evaluation
term guides kings toward pawn support and credits clear, conservatively screened
promotion routes only in king-and-pawn endings. Rules, search budgets, Worker
cancellation/watchdog behavior, frozen classic, UI and hosting are unchanged.

The deterministic regression gets an escorted pawn exchange on continuation
plies 23/26/27, versus 32 more quiet baseline moves. Seed 41 still waits until
ply 123, but Yellow's king can now recapture; both 160-ply continuations remain
unfinished. Long shuffling is not solved. Exact depth 5 alone also retains the
original king-move preference. No winning pawn push is claimed.

Fresh Windows/Node 24.18.0/Corepack pnpm 10.33.0 validation on base `9a49a80`
plus preserved documentation and this implementation: lint, **731 unit tests**,
build and **47 browser tests** passed, all uncached with no browser retries.
The 48 balanced equal-budget validation games all replay-validated and completed;
candidate/baseline mean rank was 2.453/2.547 and king returns 223/245. Quiet king
moves overall did not decrease. Three artificial positions and two correlated
seed blocks cannot establish general strength. The report retains source
snapshots, hashes, timing, tactical checks, corrected exploratory fixture and
the reversed assignments added to balance pawn ownership. Further tuning needs
new validation positions/seeds; UI1/L1 remains the next accepted sequence.
Final diff/whitespace checks and 154 local links passed. Paired initial states,
reversed assignments, artifact checksums and archived source hashes were verified.

**Current sequence (2026-09-08): UI1 visual sprint, then L1 polished local/CPU
GitHub Pages checkpoint.** D14 records the maintainer's accepted stopping point:
keep the existing /li4chess/ project site, review the complete local experience,
fix concrete release defects, verify checks and deployment, then tag a release
with known limitations and update/rollback instructions. Human players share one
device; CPUs run in the browser. Further bot research is outside this release
unless a serious defect needs fixing. Afterwards, focus on bugs and occasional
feedback, with no promised feature schedule.

Cloudflare, the li4chess.org launch and hosted multiplayer are shelved; no hosted
phase automatically follows L1. Preserve local multiplayer and its evidence.
Matchmaking/ratings remain deferred; learning/community expansion is uncommitted.
D14 supersedes D12/D13's domain and hosted follow-up plans while retaining their
minimal-maintenance direction and bounded UI sprint.

The maintainer previously reported owning li4chess.org in Cloudflare. This
scope change does not change account/domain settings or remove infrastructure
code. M3 remains paused and incomplete. The [UI sprint](ui-sprint-lichess.md)
is next, followed by the [Pages checkpoint](local-launch-handoff.md); the
[preserved hosted handoff](m3-hosted-handoff.md) requires a new scope decision.
This task updates documentation only; no implementation, deployment, tag,
purchase or account change is part of this update. The working tree was clean
at the start. Inspected the actual Pages workflow and Vite configuration:
Pages publishes apps/web/dist, uses /li4chess/, and disables multiplayer.
Live deployment and remote CI were not checked in this documentation task.

D14 documentation validation (2026-09-08): all 153 local file links across seven
changed Markdown files resolved. Release commands match the root/web package
scripts; the Pages workflow and Vite base/feature gate match the handoff.
Reviewed the documentation diff and passed git diff --check. No code, rules,
configuration or evidence artifacts changed; unit/build/browser suites were not
rerun. UI1 and L1 remain planned; M3 remains paused and incomplete.

UI1 planning validation (2026-09-08): reviewed upstream Lila COPYING and
Chessground licensing, checked 151 local file links across eight changed
documents, and passed git diff --check. Sprint commands match the existing
package scripts. No assets were imported or UI code changed; tests/build were
not rerun. Existing uncommitted scope-reset documentation was preserved and
updated for UI1 and the GitHub Pages clarification.

Earlier scope-reset validation on 2026-09-08 against 9a49a80 plus documentation edits:
143 local file links across all six changed documents resolved; referenced
commands were checked against package scripts; git diff --check passed.
Reviewed the diff: no code, rules, configuration or evidence artifacts changed.
Unit, browser and build suites were not rerun for this documentation-only task.

## Completed implementation and historical handoffs

The records below retain their original validation scope. Historical next-task
and authorization statements do not override D14 or the current task queue.

**M3-08 is complete within its local acceptance scope (2026-09-08).**
Four original authenticated principals independently consent before one fresh
successor is allocated. Entry and readiness remain deliberate; original results,
replays, seats and clock policy are preserved with fresh identity and seed.
See the [inventory](m3-08-acceptance.md), [contract](multiplayer-v1.md) and
[reviewed Windows/Linux evidence](m3-08-evidence/README.md).

PR #18 merged at 229e325c7f4ee4ebae7abe53f025047f070aa5f9 after independent
review and green exact-head CI. Post-merge CI 34180878295 and Pages 34180878310
passed before M3-08 implementation on codex/m3-08-private-rematches.

Reviewed implementation 44cfc48 and diagnostic revision
9cad92f435d7d4a949cc038d7e3447c2351a0252 passed all 18 fresh Windows commands.
[Linux CI 34185544401](https://github.com/ariesyous/li4chess/actions/runs/34185544401)
passed on the latter exact head. Each platform passed 716 units, 47 local browser
tests, 83/27 full-campaign observations/starts, 11/3 replay observations/starts and
16/21 rematch observations/starts. Independent server, browser, protocol and fresh
evidence reviews resolved substantive findings and verified canonical replay,
source maps, recovered genesis and credential redaction. Source remained frozen
during the full validation runs.

The first Linux attempt failed during browser startup before rematch construction;
its cause remains undetermined. Retained failed evidence is separate from acceptance.
Reviewed diagnostics preserve the original failure and add no assertion retries.
PR #19 is now merged at 9a49a80, verified by the 2026-09-08 pull. Its earlier
draft handoff is superseded by L1 above. Historical CI results in this file are
not fresh validation of this merge.

**M3-07 is complete within its local acceptance scope (2026-09-07).**
Authenticated room members can download completed private replay-v2 artifacts
without taking control, preserving initial state, events, results, random facts,
original producer and source lineage. Browser export guards room/session races
and supports safe retry and existing local import. The
[pre-change inventory](m3-07-acceptance.md), [contracts](multiplayer-v1.md) and
[Windows/Linux evidence](m3-07-evidence/README.md) define the precise boundary.
Rematches were excluded from M3-07 and are now covered by M3-08 above.
Hosted activation and M4 remain separate; M3 stays incomplete.

Reviewed implementation `c29885d` and test-driver correction
`f9c54928d7faece4b18e0b39f1cb317a258b2777` passed all 17 fresh Windows commands:
695 units, 47 local browser tests, all earlier integrations and both campaigns.
Each platform passed 83 full-campaign observations/27 starts and 11 focused replay
observations/3 starts. [CI 34171318234](https://github.com/ariesyous/li4chess/actions/runs/34171318234)
passed on exact head `f9c5492`; original CI merge tree and bytes are retained.
Independent source/evidence reviews resolved substantive findings and verified
source maps, canonical/download/import agreement, lineage and credential redaction.
[PR #18](https://github.com/ariesyous/li4chess/pull/18) is merged as verified above.
The [next bounded handoff](m3-08-handoff.md) proposes private rematch consent and
new-game creation without authorizing that work or any hosted activation.

The first clean implementation `c29885d` passed all 17 Windows invocations,
including 695 units, 47 local browser tests and both real-runtime campaigns.
Linux CI 34170371852 failed on a test-driver socket hang-up after successful
ordinary replay exports. The reviewed correction isolates driver HTTP sockets,
keeps retries at zero, and sanitizes thrown fixture errors. Browser/server product
behavior is unchanged. The failed run and redacted log are retained separately;
corrected acceptance passed as recorded above.

Verified M3-06 merge: PR #17 merged at
`eddbcad64d340ed7b4df4fe2baa277d4db5424f0`; post-merge CI 34166793615 and Pages
34166793571 both succeeded. Historical draft/unmerged wording below and in M3-06
evidence is superseded. The clean dedicated M3-07 branch starts from fetched
origin/main. Node 24.18.0 and Corepack pnpm 10.33.0 were verified; the global
pnpm 11 wrapper is not used. Initial independent contract review requires
proof-free member reads, post-await credential checks, bounded genesis audit and
a separate read-only path that cannot invoke gameplay recovery or producer relabeling.

**M3-06 is complete within its local acceptance scope.** The
[inventory](m3-06-acceptance.md) preceded changes, and
[Windows/Linux evidence](m3-06-evidence/README.md) records 70 campaign observations,
27 runtime starts and 13 terminal histories per platform. Six ordinary-setup
completions include two injected-clock endings and one recovery game; five endings
use source-linked checkpoints, two terminal histories are opening aborts, and six
incident/credential-loss rooms remain deliberately unfinished. Normal Modern games
complete through authenticated private-room UI creation/join/seats/readiness.

Clean implementation `d44847e8f4b281fbd9e6d8576e1c08a2af8e2b3a` passed all sixteen
required Windows invocations: 678 units, 46 local-play browser tests, all existing
runtime suites and the new campaign. [CI 34151136700](https://github.com/ariesyous/li4chess/actions/runs/34151136700)
passed on that head. Exact source maps, canonical/replay comparisons, four-client
results, clock conservation, failed attempts and tool/configuration identity are
retained. Fresh independent source and evidence reviewers resolved all substantive
findings and independently verified both platforms' artifacts and histories.
[PR #17](https://github.com/ariesyous/li4chess/pull/17) is merged; its final head
`270adfc6038332f09885c480a24ce5f249da9e3c` passed CI 34152475886. The merge and
post-merge checks above supersede the historical draft handoff.

Browser fixes make unresolved takeover IDs visible and retain both takeover and
game-command intentions across failed storage writes. Same-ID recovery survives
refresh/reconnect; explicit abandonment remains deliberate. Six prepare/commit/
finalize/activation boundaries and D1 rollback recover without outage debit,
duplicate increments or rerolled actions. Missing/incompatible timing, divergent
history and stale ownership stay unavailable/quarantined. Test adapters reuse the
maintained authority; deployable bundle checks exclude fixtures/time/admin hooks.
No rules, migrations, default hosting, classic bot or archived evidence changed.

M3 remains in progress: replay retrieval/export has completed M3-07 acceptance;
rematches have completed local acceptance; hosted TLS/origin/cookies, latency/load,
eviction/hibernation, restore and rollout/rollback need separate authorization.
The [next bounded handoff](m3-07-handoff.md) proposes completed-game replay export
first and separates rematches and hosted gates. No launch clock or public policy
is selected. Hosted activation and M4 were not started.

Verified M3-05 baseline: PR #16 merged at
`e8d5494898bcd7b88491aa3ea2ccc19e01d13816`; final head
`c0a418a1388472f34d301d3d10ca97443993d574` passed CI 34136255021.
Merge CI 34147880230 and Pages 34147880224 passed, verified before M3-06 behavior
changes. The dedicated branch started from fetched origin/main without replacing
existing work. Historical draft language is superseded by this verified merge.

**M3-05 is complete within its acceptance scope.** The authenticated private-room
service, strict public wire format and browser reconnect/resync flow are implemented
against maintained GameRoom. See the [pre-change plan](m3-05-acceptance.md),
[wire contract](multiplayer-v1.md), [evidence](m3-05-evidence/README.md), and concrete
[M3-06 handoff](m3-06-handoff.md). [PR #16](https://github.com/ariesyous/li4chess/pull/16) is merged; verified final
head and merge checks are recorded above. The following M3-05 implementation
and validation history remains historical evidence. M3 remains incomplete.
Verified M3-04 baseline: PR #15 merged at
`1d12d4ba81330d65134b6b7d3afd2c76809fbc91`. Final PR-head CI 34087298251,
post-merge Pages 34126884525 and post-merge CI 34126885407 all succeeded;
the last was verified before M3-05 behavior changes. Branch
`codex/m3-05-multiplayer-protocol` was created from fetched origin/main, preserving
unrelated work. Acceptance plan `630bc6f` preceded implementation.

Guest credentials are server-issued, digest-stored, absolutely expiring and
revocable, with session rotation. Private invitation membership and atomic seats
freeze four immutable grants. Public bodies cannot supply identity/control facts.
Cookie + exact origin + bounded first-frame tab proof protects transport. Strict
snapshots, receipts, controls and errors preserve canonical IDs, admission facts,
clock suspension and producer lineage. Observer tabs, explicit takeover, copied-tab
locks, reconnect epochs and deliberate old-identity cleanup preserve browser intent.

Independent substantive and final reviewers resolved expiry ordering, late socket
cleanup, ambiguous post-commit fences, suspension delivery, artifact mode isolation,
peer notification failures and browser identity/takeover/lobby response races.
Clean implementation `c0d8457` passed all 15 required local command invocations:
671 units, 46 browser tests, 14 architecture groups, nine persistence groups,
22 room groups/25 starts, default Workers build/dry-runs/runtime/lifecycle, and
14 authenticated multiplayer groups. Source fingerprint
`sha256:8397459b17078c188db89248f0afe9fcb09d4f7261396c9e5c070b22a88ff0b8`
and exact 448-file Git source map were independently verified.

CI 34133514555 exposed a retained mixed-game test's unsafe single-pawn corridor:
a legal CPU response could immobilize walking Kings. Test-only correction `45bbcff`
and reviewed `9efe602` preserve all exact ending assertions, prepare actual legal
King mobility and verify preconditions. No rules/gameplay change or test retries.
Standalone live revocation coverage was also strengthened. Fresh reviewed lint,
671 units, build, 46 browser tests and all 14 multiplayer groups passed on Windows;
all required suites then passed Linux CI. The independently reconstructed reviewed
494-file fingerprint is `sha256:b295d0047cfae663e0fe9a5c00c48b1a265fcebfabce970b12b0db1ffc84b1b1`.
Failed exploratory/CI evidence and the causal counterexample are retained separately.

Only explicit local configuration enables multiplayer. Default Pages and Worker
deployment are unchanged. No account, resource, live secret, deployment, paid plan
or launch time control was selected. Hosted TLS/cookie/lifecycle, load, rollout and
coordinated restore remain separate gates. M3 remains incomplete.

## M3-04 completed baseline

M3-04 authority/timing/persistence evidence remains in
[m3-04-evidence](m3-04-evidence/README.md). Its maintained SQLite room serializes
prepare, exact D1 commit, finalize, activation and publication with immutable
terminal results, persisted clocks/disconnect banks and seeded walking turns.
M3-05 preserves M1 rules, state-v2/replay-v2, command-v1/v2, source lineage and
released migrations. Historical measurements remain labeled with their own revision.

## M3-03 completed baseline

**M3-03 is complete**, scoped to the [acceptance contract](m3-03-acceptance.md),
with [reviewed evidence](m3-03-evidence/README.md) and a concrete
[M3-04 GameRoom handoff](m3-03-handoff.md). Dedicated branch
`codex/m3-03-d1-persistence` began at fetched clean `origin/main`
`6530c64aa9be910cff9c63e8d737ea6fc4b9d4ef`. PR #12/#13 merges and post-merge
CI 34079300521 / Pages 34079300482 were verified before work. The acceptance
contract was committed as `1511319`; maintained persistence as `5018521`; the
reviewed stable-request lookup and clean-CI setup fix as `098aaad`.

Final implementation `098aaadbc1348eee4a340dcf9468e2526748e242` passed
[CI 34081508076](https://github.com/ariesyous/li4chess/actions/runs/34081508076).
The clean Windows acceptance run used Node 24.18.0 / Corepack pnpm 10.33.0 and
source fingerprint `sha256:fb9fa0597d1861d254895805f8027e6f2469ce4613abcb975eef9d48030f3229`.
All 342 source files are retained and independently verified. Fresh checks passed:
frozen install, lint, 608 units, build, eight maintained D1 groups/four runtime
starts, 46 browser tests, 14 preserved architecture groups, Workers build, both
environment dry-runs and four Worker HTTP/browser tests plus lifecycle checks.
Linux CI ran the same suite. The initial CI failure was missing parent evidence
directory creation, fixed without relaxing assertions or adding retries.

`packages/persistence` owns normalized migrations, aborting SQL owner/head fences,
stable pre-admission receipt lookup, exact prepared reconciliation, ordered events,
immutable terminal results, two retained checkpoints and bounded recovery/audit.
Producer/source lineage and M1 rules/state-v2/replay-v2 are preserved. The measured
256-command/293-event history is unfinished/censored, not strength or capacity
proof. Fresh independent design, substantive, final-code and final-evidence reviews
resolved all substantive findings, including complete successor validation and
consistent producer/record-policy checks. Hosted failover, Time Travel, coordinated
D1/DO restore, quotas, regional latency and deployment behavior remain unproved.

[Draft PR #14](https://github.com/ariesyous/li4chess/pull/14) targets main. Final
documentation/evidence-revision CI is checked again before closeout and linked
from its PR description. No merge, main push, hosted connection, provisioning,
secret, deployment or paid plan was performed. Application Worker and Pages
configuration, frozen classic and archived evidence remain intact.

The M3-03 handoff is now implemented by the completed M3-04 slice above.

## Previous completed slice

**M3-02 is complete**, scoped to the [Workers acceptance plan](m3-02-acceptance.md).
Implementation `5508cdb18a1d9166177d5ef4f2ed736a9a9870c9` and final evidence
`4859395` passed CI. The maintainer later authorized merges: PR #12 merged at
`145001ae579a53bd3dc08a1a9ee3d070add92339`; PR #13 merged at
`6530c64aa9be910cff9c63e8d737ea6fc4b9d4ef`, verified with post-merge CI and Pages
above. [Accepted evidence](m3-02-evidence/README.md) retains the clean 302-file
source snapshot, both output builds, HTTP/browser tests, environment dry runs,
and reviewed lifecycle/CPU/layout fixes. The [operations handoff](m3-02-operations.md)
still defines separately authorized account/hosting/build/deployment gates.
Application Worker root-path assets and Pages deployment remain unchanged.
**M3-01 is complete**, scoped to isolated Cloudflare prototypes and the
[architecture ADR](m3-01-adr.md), [acceptance plan](m3-01-acceptance.md) and
[official-source research](m3-01-platform-research.md). [Acceptance evidence](m3-01-evidence/README.md), independent review,
fresh local checks and [implementation CI](https://github.com/ariesyous/li4chess/actions/runs/34062822436)
passed. Implementation/evidence commit is `c23746b3b3611b322132b637c3ee76be93e4b46e`;
[PR #12](https://github.com/ariesyous/li4chess/pull/12) has since merged, as recorded above.
M3 as a whole is incomplete. M3-02 Workers foundation is complete;
the ADR contains the concrete M3-02 through M3-06 handoff and hosted gates.
Cloudflare deployment, provisioning and purchases remain unauthorized.

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
and pinned pnpm 10.33.0 via temporary Corepack shims are verified. Current M3-04 completion and M3-05 handoff are stated above.

Local hotseat/CPU play now follows standard FFA points and actions. CPU search
uses the bounded Worker path with measured resource policies. Internal server clocks
and disconnect-bank tracking are implemented in M3-04. Public multiplayer, accounts,
matchmaking and ratings remain M3/M4 work. The local UI retains simulated timeout;
the shared engine/replay also consumes server-authoritative timeout/disconnect facts.

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
| D01 | 2026-09-06 | Scope narrowed by D12; retained aspiration: build a four-player Lichess equivalent covering play, competition, learning, and community over time. This is the maintainer's product vision. |
| D02 | 2026-09-06 | Superseded by D12. Earlier first public release targeted FFA public matchmaking and ratings. The earlier policy limited invite rooms to internal testing; that restriction no longer applies. |
| D03 | 2026-09-06 | Free access, no ads, anonymous play, and CPU opponents are initial requirements. Competitive fairness and community governance are longer-term guiding principles. |
| D04 | 2026-09-06 | Match Chess.com's standard FFA rules. Existing house rules must be audited and migrated before launch, rather than assumed compatible. |
| D05 | 2026-09-06 | Superseded by D09. The earlier hosting direction was a VPS behind Cloudflare plus PostgreSQL, with Aiven only a candidate. Preserve this row as decision history; do not implement it as the current plan. |
| D06 | 2026-09-06 | Repository licensing is AGPL v3, declared as `AGPL-3.0-only` in `package.json`. Preserve original research evidence and human Git attribution. |
| D07 | 2026-09-06 | Launch timing superseded by D12. If matchmaking is pursued, anonymous players get casual matchmaking; anonymous CPU play remains required. Accounts are required for rated play and persistent leaderboards; confirmed after the initial planning questions. |
| D08 | 2026-09-06 | The game UI/UX should take a board-first, four-player-panel reference direction similar in interaction quality to the observed Chess.com FFA client, while using original li4chess design and accessible non-colour cues. |
| D09 | 2026-09-06 | M3 will start with a Cloudflare-native architecture: React/Vite via Workers Static Assets, a TypeScript Worker API, one authoritative `GameRoom` Durable Object per active game with WebSockets, and D1 as the initial canonical SQL store. Local development uses Wrangler, Vite, and workerd on Windows; deployment targets Cloudflare's GitHub build integration. R2, Queues, Containers, PostgreSQL, or other infrastructure require demonstrated need. M3-01 must validate this direction in an architecture spike and ADR before implementation. |
| D10 | 2026-09-06 | Accept the M1-02 standard-FFA migration contract as written: the five product identifiers, replay v2 invariants, canonical state/hash policy, and provenance-based legacy classification are authoritative for M1-03. Acceptance does not claim the target ruleset is implemented; `li4chess-ffa-standard-v1` remains reserved until its fixtures and implementation pass. |
| D11 | 2026-09-06 | Clarify standard FFA SCORE attribution: active checking owners split +20 equally at scheduled mate, nonchecking escape-blockers get zero; the last actor changing legal moves from positive to zero determines self/opponent stalemate, rescue clears that cause; other-owner checking pieces never contribute to mover multi-check count or Queen tier. [Acceptance cases](m1-score-acceptance.md). |
| D12 | 2026-09-08 | Domain and hosted follow-up plans superseded by D14. Maintainer accepts minimal-time scope: launch existing local/CPU play at li4chess.org first, retain Cloudflare, then optionally host casual friend-invite games using completed local multiplayer. Matchmaking, then accounts/ratings, depend on demand and operating capacity; M5-M7 are uncommitted ideas. Supersedes D01's comprehensive commitment, D02 and D07's launch timing, and the old task sequence. Preserve rules, evidence, licensing and conditional account eligibility. Agents own routine engineering within scope; ask for maintainer involvement only when necessary for access, spending or material decisions. Domain ownership in Cloudflare is maintainer-reported; no deployment is implied. |
| D13 | 2026-09-08 | Domain hosting plan superseded by D14; UI1 retained. Add UI1 before L1: closely follow Lichess interface/board/icon style with verified licensed reuse, adapting four armies and retaining li4chess identity. Updates D08 visual direction without changing rules. Use existing GitHub Pages for L1 with Cloudflare DNS; Workers frontend migration is optional later. Asset choice and implementation remain sprint work. |
| D14 | 2026-09-08 | Maintainer accepts a polished local/CPU GitHub Pages checkpoint at the existing /li4chess/ site. Retain UI1, then bound L1 to full local-play review, concrete defect fixes, required checks, actual Pages verification, a release tag, known limitations and update/rollback instructions. Cloudflare, li4chess.org launch and hosted multiplayer are shelved with no automatic next phase; preserve local multiplayer and evidence. Further bot research is outside this release unless needed for a serious defect. Afterwards focus on bugs and occasional feedback without a feature schedule. Supersedes D12/D13's domain and hosted follow-up plans; D09 remains the preserved local M3 architecture, not active deployment work. |

The roadmap's UI1 then L1 sequence under D14 is current. Completed milestones and historical
engineering contracts retain their evidence; deferred features are not commitments.

## Next actionable tasks

1. **UI1: Lichess-style UI sprint.** Follow the [bounded brief](ui-sprint-lichess.md); adapt licensed assets, preserve four-player usability and validate visual results.
2. **L1: polished local/CPU GitHub Pages checkpoint.** Follow the
   [bounded release handoff](local-launch-handoff.md): review the full local
   experience, fix concrete defects, run required checks, verify the existing
   /li4chess/ deployment and record a release tag, limitations and rollback.
3. **After L1: maintenance checkpoint.** Focus on bugs and occasional feedback;
   no promised feature schedule. Cloudflare/domain launch and hosted multiplayer
   are shelved. The [preserved hosted handoff](m3-hosted-handoff.md) needs a new
   scope decision. Matchmaking/ratings and other ideas have no active task queue.

Do not change game rules while merely collecting comparison evidence. Preserve
the accepted M1 contract and its coverage. Do not treat the old recommendation's
throughput figures or strongest configured bot level as measurements of the new ruleset.

## Open decisions and verification needs

| ID | Question | Working proposal / next step | Needed by |
| --- | --- | --- | --- |
| Q2 | Which launch time controls? | Rule-level disconnect/abort facts are settled and implemented locally; authoritative clocks are implemented locally; select a small hosted friend-invite policy when M3 resumes. | Deferred hosted M3 |
| Q3 | Must rating calculations exactly match Chess.com's? | Rules compatibility is accepted. Use its rating overview as a reference; document ties, parameters, and corrections before choosing an implementation. | Deferred M4, only if pursued |
| Q4 | Which Cloudflare plan, data location, budget ceiling, and load target meet the release needs? | Shelved under D14; revisit only if hosted M3 is explicitly resumed. No Cloudflare choice blocks the existing Pages checkpoint. | Shelved hosted M3 |
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

## M3-01 validation and handoff

Retain D09's Worker/Static Assets, per-game SQLite Durable Object and canonical
D1 topology under the [ADR](m3-01-adr.md). Durable prepare records exact intent;
D1 commit precedes acknowledgement/gameplay broadcast, with predecessor/prefix
checks and stable receipts. Explicit resyncRequired handles ambiguous responses
without waiting for local TCP close. There is no cross-store atomic transaction.

Independent reviewers verified consistency, authorization, source/artifact hashes
and all 34 distinct recorded replays. The accepted local run passed 14 groups
across 8 runtime starts, including complete repetition and walking/survivor games,
real D1 failure, concurrent arrivals, boundary restarts and exact recovery. The
272-file source snapshot records base d0249a3 and dirty fingerprint
`sha256:f2df1ffc9634697115e700338d9ee6436650d8a77ffb380ef20049527ea9b1f3`.
Unsuccessful attempts remain explicitly labelled; stream handling and close
notification fixes were validated without weakening canonical-state assertions.

Fresh Windows/Node 24.18.0/pnpm 10.33.0 checks passed: frozen install, lint,
606 unit tests, build and all 46 browser tests without retries; the final runtime
source and changed tests additionally passed the complete integration and lint.
All 260 local Markdown file links resolved before closeout and diff checks passed.
The shipped engine/protocol/web/bot, frozen classic, archived experiments and
Pages deployment workflow have no changes. Historical archive byte-preservation
attributes remain alongside the new M3 evidence attribute.

[CI run 34062822436](https://github.com/ariesyous/li4chess/actions/runs/34062822436)
passed every step on PR head `c23746b3b3611b322132b637c3ee76be93e4b46e`.
Its clean PR merge checkout was `76ed445c0c70d1e60811647edd6a395bb21c298d`;
the uploaded runtime artifact was inspected: all 14 groups and 8 starts passed
on Linux/Node 24.20.0, pnpm 10.33.0, Wrangler 4.129.0 and workerd 1.20260903.1.
The documentation-only closeout is checked again through the draft PR's checks.

M3-02 should establish the actual Worker/Static Assets foundation and local
workflow without promoting fixture credentials/fault hooks. M3-03 owns normalized
D1 migrations; M3-04 owns clocks/alarms/room authority; M3-05 owns multiplayer
protocol and guest/reconnect UX; M3-06 proves four-browser complete/recoverable
games. Hosted latency, hibernation, failover, restoration, rollback and costs
require separately authorized staging. Launch time controls, operating plan,
region, load target and budget remain open; none blocks this local architecture
conclusion. That M3-01 task ended with M3 incomplete and PR #12 a draft; no merge,
publication, provisioning, purchase or M3-02 implementation occurred in that task.
The subsequent M3-02 completion and current handoff are recorded above.
