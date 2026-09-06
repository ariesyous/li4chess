# Project state

Last updated: 2026-09-06.

Read this file with [ROADMAP.md](../ROADMAP.md) and [AGENTS.md](../AGENTS.md) at
the start of repository work. This is a compact handoff, not a transcript.
Git history preserves earlier snapshots; keep this file focused on current work.

## Current focus

**M1 is in progress.** M1-01 completed the sourced
[standard-FFA compatibility audit](rules-compatibility.md) on 2026-09-06; it
does not change the local house rules. **M1-02 is in progress:** its
[ruleset/replay migration contract](ruleset-versioning.md) now locks final
proposed product-owned identifiers, v2 deterministic event/state requirements,
legacy preservation, and evidence-status fixture inventory. All
release-affecting game semantics now have D/O target evidence; the remaining
work is maintainer acceptance of the migration choices and M1-03 fixtures/
implementation. The first public release is M4, public FFA
matchmaking with ratings, anonymous access, and CPU play.

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
| D08 | 2026-09-06 | The game UI/UX should take a board-first, four-player-panel reference direction similar in interaction quality to the observed Chess.com FFA client, while using original li4chess design and accessible non-colour cues. |

The seven-milestone sequence and architecture details in the roadmap are the
working implementation plan. Revise them when evidence warrants it; distinguish
such revisions from changes to the maintainer's accepted product decisions.

## Next actionable tasks

These are queued tasks, not claims of work already started. Start with M1-01.

| ID | Task | Done when |
| --- | --- | --- |
| M1-01 | Create `docs/rules-compatibility.md`: compare current code/spec against current official FFA documentation; record source dates and unresolved cases. | **Complete 2026-09-06.** [Audit](rules-compatibility.md) covers every requested category, current code/tests, official source dates, scoped variant distinctions, and reproducible open-case checks. |
| M1-02 | Resolve compatibility questions and specify ruleset/replay versioning, including old artifacts and rule-driven randomness. | **In progress 2026-09-06.** [Migration contract](ruleset-versioning.md) now has D/O target evidence for every release-affecting rule, including setup, ordinary legality, special moves, draws, endings, and disconnects. Next: maintainer acceptance of the proposed identifiers/replay/legacy policy; then M1-03 writes the fixture inventory as executable tests. |
| M1-03 | Implement the verified differences in focused changes, updating the engine, evaluation, result UI, and tests together where needed. | M1 exit criteria and repository validation pass; historical evidence remains intact. |
| M2-01 | Define and implement the Worker request/result contract and bounded CPU scheduling. Can begin independently after agreeing its scope. | Reset/cancellation/failure/stale-result tests pass and UI input remains responsive during search. |
| M2-02 | Design and implement the board-first local game frame and four-player panels from the [UI/UX reference](ui-ux-reference.md), using original accessible components. | Desktop/mobile/keyboard/screen-reader acceptance coverage shows all seat, turn, score, and status information without colour-only cues. |

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
| Q6 | Which remaining standard-FFA mechanics still need evidence before implementation? | None are currently unresolved: the maintainer supplied D/O-equivalent standard-FFA answers for setup, legality, special moves, scoring, endings, draws, ties, and disconnects. The remaining M1-02 gate is a maintainer decision on identifiers/replay/legacy migration; M1-03 then makes each documented fixture executable. | M1-02 |
| Q7 | What must a replay record for authoritative timeout/resignation randomness? | Record server PRNG algorithm/seed, canonical candidate ordering/hash, draw index, selected legal move, trigger sequence, and state hash. M3 must supply server authority; M1-02 defines the schema contract only. | M1-02 / M3 |

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
  and [versioning proposal](ruleset-versioning.md); the behavior-specific replay
  fixtures still need execution before M1-02 can complete.
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
  conflict; remaining work is evidence fixtures and maintainer acceptance, not
  target-score guessing.
- M1-02 complete rule-answer update on 2026-09-06: maintainer-provided standard
  FFA behavior resolved canonical setup/orientation, normal self-check/pin/king
  legality, en-passant pin legality, passive dead-piece semantics, pawn-Queen
  classification/no spare king, Queen-priority mixed checks, full draw identity
  and thresholds/material predicates, immediate Claim Win, and cumulative
  disconnect-bank behavior. The contract now classifies every release-affecting
  game rule D/O; it still requires explicit maintainer acceptance of the
  product-owned identifiers and replay/legacy policy before M1-03.
- Documentation validation on 2026-09-06: local Markdown links in the audit,
  versioning proposal, project state, and roadmap resolve; `git diff --check`
  also passed (including the untracked proposal). The official help and event
  rulebook links opened successfully. The linked game replay was inspected in
  the signed-in client; do not treat its availability as a public-API contract.
- UI/UX reference observation on 2026-09-06: inspected the completed FFA game
  screen on a narrow client viewport and documented the observed board-first
  hierarchy, four edge player panels, compact context header, terminal result,
  and replay/chat controls in [ui-ux-reference.md](ui-ux-reference.md). This
  is a product direction (D08), not a visual copy, rules claim, or implemented
  UI change.
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
