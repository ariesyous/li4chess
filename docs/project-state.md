# Project state

Last updated: 2026-09-06.

Read this file with [ROADMAP.md](../ROADMAP.md) and [AGENTS.md](../AGENTS.md) at
the start of repository work. This is a compact handoff, not a transcript.
Git history preserves earlier snapshots; keep this file focused on current work.

## Current focus

**M1 is in progress.** M1-01 completed the sourced
[standard-FFA compatibility audit](rules-compatibility.md) on 2026-09-06; it
does not change the local house rules. **Next actionable focus: M1-02**, resolve
the audit's live-product questions and propose a versioned target ruleset/replay
migration. The first public release is M4, public FFA matchmaking with ratings,
anonymous access, and CPU play.

Code baseline reviewed: `5c089934d736bd19199875637a864e4bd395055b` on `main`.
The local game currently implements house rules. CPU search is synchronous;
networking, application persistence, clocks, accounts, queues, and ratings are
not implemented. See [README.md](../README.md) for the package map.

This planning update includes README/agent guidance, AGPL licensing and package
metadata, and the roadmap and session handoff documents. The maintainer requested
that these changes be committed and pushed to `origin/main`. Check `git status`
and branch history at the next session to establish the current checkout; do not
assume a new worktree includes uncommitted changes from another checkout.

## Accepted decisions

| ID | Date | Decision and rationale |
| --- | --- | --- |
| D01 | 2026-09-06 | Build a four-player Lichess equivalent covering play, competition, learning, and community over time. This is the maintainer's product vision. |
| D02 | 2026-09-06 | First public release targets FFA public matchmaking and ratings. Invite rooms can serve internal testing but do not replace this goal. |
| D03 | 2026-09-06 | Free access, no ads, anonymous play, and CPU opponents are initial requirements. Competitive fairness and community governance are longer-term guiding principles. |
| D04 | 2026-09-06 | Match Chess.com's standard FFA rules. Existing house rules must be audited and migrated before launch, rather than assumed compatible. |
| D05 | 2026-09-06 | No target date; lean hosting budget. Keep a VPS behind Cloudflare plus PostgreSQL as the hosting direction. Aiven is a candidate, not a selected dependency. |
| D06 | 2026-09-06 | Repository licensing is AGPL v3, declared as `AGPL-3.0-only` in `package.json`. Preserve original research evidence and human Git attribution. |
| D07 | 2026-09-06 | Anonymous players get casual matchmaking and CPU games. Accounts are required for rated play and persistent leaderboards; confirmed after the initial planning questions. |

The seven-milestone sequence and architecture details in the roadmap are the
working implementation plan. Revise them when evidence warrants it; distinguish
such revisions from changes to the maintainer's accepted product decisions.

## Next actionable tasks

These are queued tasks, not claims of work already started. Start with M1-01.

| ID | Task | Done when |
| --- | --- | --- |
| M1-01 | Create `docs/rules-compatibility.md`: compare current code/spec against current official FFA documentation; record source dates and unresolved cases. | **Complete 2026-09-06.** [Audit](rules-compatibility.md) covers every requested category, current code/tests, official source dates, scoped variant distinctions, and reproducible open-case checks. |
| M1-02 | Resolve compatibility questions and specify ruleset/replay versioning, including old artifacts and rule-driven randomness. | The target specification and migration approach are reviewable, with acceptance examples for points, promotion, elimination, draws, and aborts. |
| M1-03 | Implement the verified differences in focused changes, updating the engine, evaluation, result UI, and tests together where needed. | M1 exit criteria and repository validation pass; historical evidence remains intact. |
| M2-01 | Define and implement the Worker request/result contract and bounded CPU scheduling. Can begin independently after agreeing its scope. | Reset/cancellation/failure/stale-result tests pass and UI input remains responsive during search. |

Do not change game rules while merely collecting comparison evidence. M1-02
must identify compatibility tests before M1-03 changes behavior. Do not treat
the old recommendation's throughput figures or strongest configured bot level
as measurements of the new ruleset.

## Open decisions and verification needs

| ID | Question | Working proposal / next step | Needed by |
| --- | --- | --- | --- |
| Q2 | Which launch time controls and disconnect/abort details? | Start with few queues; verify Chess.com behavior before choosing compatible defaults. | M1 audit / M3 clocks |
| Q3 | Must rating calculations exactly match Chess.com's? | Rules compatibility is accepted. Use its rating overview as a reference; document ties, parameters, and corrections before choosing an implementation. | M4 |
| Q4 | Which hosting provider, region, budget ceiling, and load target? | Defer selection and current price research until deployment design; keep PostgreSQL portable. | M4 release gate |
| Q5 | How should mixed online human/CPU games work? | Local anonymous CPU play is required. Shared online CPUs are optional; propose explicit opt-in, labels, server ownership, and exclusion from human rating pools. | Before adding online CPU seats |
| Q6 | Which undocumented standard-FFA mechanics govern setup, ordinary movement/active-king capture, mate/stalemate timing, castling, en passant, promotion choices, dead-piece interactions, score-label meanings, draw counters, and equal-point placements? | Use the [M1-01 verification protocol](rules-compatibility.md#reproducible-verification-protocol-for-unresolved-rules) in standard FFA only; record a replay/URL and evidence label for each answer before M1-03. | M1-02 |
| Q7 | What exactly makes the final-survivor live-king award +20 versus +40, and how are timeout/resignation random kings selected and replayed? | Observe targeted standard FFA finishes and timeout/resignation flows; specify deterministic event/seed recording with the ruleset/replay migration. | M1-02 / M3 |

Q1 (anonymous rating eligibility) is resolved by D07. No unresolved question
blocks beginning the rules audit. Only ask for decisions when the current work
depends on them; do not reopen already accepted requirements.

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
