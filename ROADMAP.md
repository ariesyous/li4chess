# li4chess roadmap

Last reviewed: 2026-09-06. This is a capability roadmap, not a dated delivery
promise. Milestone order and implementation choices are the working plan; the
product decisions below were confirmed by the maintainer.

## Vision and product decisions

Build a four-player equivalent of Lichess: a welcoming, free, ad-free,
open-source place to play, compete, learn, and build a community around
four-player chess.

- **First public release:** free-for-all with public matchmaking and ratings.
- **Rules target:** match Chess.com's standard FFA rules. M1 implements the
  accepted contract; the former house rules remain versioned history.
- **Access:** free access, no ads, anonymous casual matchmaking, and games
  against CPUs are launch requirements. Rated play and persistent leaderboards
  require an account.
- **Long-term principles:** competitive fairness and community participation in
  governance, alongside the existing AGPL-3.0-only licensing.
- **Constraints:** no target date; lean operating costs; keep the system simple.
  Start the online service on Cloudflare's application platform: Workers and
  Static Assets, Durable Objects for active games, and D1 for canonical SQL
  persistence. Add R2, Queues, Containers, or another data store only when a
  demonstrated requirement justifies them. No paid plan has been selected or
  infrastructure provisioned.

Teams/2v2 and other variants are later candidates. Invite rooms are useful for
development and testing; an invite-only release does not fulfill the public
matchmaking-and-ratings goal.

## Current baseline

The repository has local hotseat and CPU games, a pure TypeScript rules engine,
a React board, production bot search, a separate research laboratory, and CI.
It does not yet have a multiplayer server, durable player accounts, public
queues, ratings, authoritative clocks, or server-side game persistence. Local replay export/import is implemented.

The protocol package validates state-v2 and replay-v2, including canonical hashes
and producer provenance. Server authority remains M3 work. Browser CPU search
runs in a bounded Worker; M2 validation is in progress. M1 fixtures cover the accepted FFA contract.

See [README.md](README.md) for implemented capabilities and
[project state](docs/project-state.md) for the current focus and evidence.

## Milestones

Status vocabulary: **planned**, **in progress**, **blocked**, **complete**.
Complete means the exit criteria have supporting evidence. Existing partial
capabilities do not make a milestone complete.

| ID | Milestone | Status | Depends on | Player outcome |
| --- | --- | --- | --- | --- |
| M1 | Compatible, versioned FFA rules | Complete | Existing engine | The game behaves as a Chess.com FFA player expects. |
| M2 | Responsive local and CPU play | In progress | M1 for final validation | Anyone can play an enjoyable game on desktop or phone. |
| M3 | Reliable online game service | Planned | M1 | Four remote players can finish and recover a game. |
| M4 | Public matchmaking and rated beta | Planned | M2, M3 | Players can find opponents and build a credible rating. |
| M5 | Analysis and learning | Planned | M4; editor/replay work can begin earlier | Players can understand and improve their play. |
| M6 | Community and organized competition | Planned | M4 | Communities can organize and follow events. |
| M7 | Sustainable open platform | Planned | Public usage and operational evidence | Contributors can maintain, operate, and extend the service. |

### M1 — Compatible, versioned FFA rules

**Status note (2026-09-06):** All accepted M1 rule groups and replay-v2/state-v2
are implemented and independently reviewed. `li4chess-ffa-standard-v1` is
activated in the current implementation. Complete Modern games, rotated
cross-feature awards, checkpoint recovery, browser controls, arena reports and
legacy rejection have executable evidence. Fresh local validation passed with
571 unit tests and 21 browser tests; [Node 24 CI passed on the final implementation](https://github.com/ariesyous/li4chess/actions/runs/34052398852).
M1 is complete. See the [fixture map](docs/m1-03-fixtures.md),
[format implementation](docs/state-replay-v2.md), and [validation evidence](docs/project-state.md).

**Capabilities**

- A sourced compatibility matrix covering setup, movement, check, castling,
  en passant, promotion, scoring, elimination, resignation, timeout, draws,
  placement ties, and early aborts. Distinguish documented behavior, observed
  behavior, unresolved questions, and deliberate deviations.
- An executable specification with regression positions for all four seats,
  multiplayer interactions, and complete game endings.
- Explicit ruleset and replay/schema versions so later changes cannot silently
  reinterpret saved games or research records.
- Engine, UI explanations, bot outcome evaluation, and arena reporting aligned
  with the agreed FFA objective.

**Exit criteria:** each compatibility requirement has a test or documented
verification method; unresolved release-affecting behavior is resolved; full
validation passes; known king-capture and castling-ownership issues are audited
against the target rules. Old evidence remains unchanged: replay it only through
a verified producing revision or explicit compatibility path; quarantine and
reject records whose producing provenance cannot be established.

**Historical initial research:** the audited house engine and the published FFA overview differed
in these areas. This is a starting inventory, not a complete specification.

| Area | Audited historical engine | Published Chess.com FFA target |
| --- | --- | --- |
| Winner | Last active player | Highest points total |
| Promotion | Far local rank | Player's eighth rank |
| Eliminated army | Mate armies removed; stalemated armies frozen | Dead pieces remain; captures give no points |
| Scoring | Capture values; bishop worth 3 | Bishop worth 5; mate, stalemate, and multi-check awards |
| Resignation/timeout | No complete game action | Dead army with a live king that moves randomly |
| Draw ending | Repetition ties active players first | Draw awards affect final points |

Source: [Chess.com 4PC help](https://support.chess.com/en/articles/8614233-4-player-chess-4pc),
reviewed 2026-09-06. The overview leaves details to investigate, including ties,
some final awards, promotion choices, and special-move interactions. Do not
infer a complete ruleset from this table or silently retain house rules where
the reference is unclear. Record reproducible observations where documentation
is insufficient. Preserve the existing specification as versioned history when
implementing the replacement.

### M2 — Responsive local and CPU play

**Status (2026-09-06):** authorized from merged M1 `7f2593c`. Bounded Worker
implementation is committed as `839aa46`. Validated local autosave/resume is the
second slice. [Acceptance plan](docs/m2-acceptance.md) records inputs and thresholds
before changes. Interface work, full-game evidence and calibration remain pending.

**Capabilities**

- Bounded CPU search in a Web Worker, request IDs, reset cancellation,
  stale-result rejection, and a legal fallback after failure or a watchdog expiry.
- Difficulty levels with measured response budgets and understandable behavior;
  evaluation aligned with M1. Stronger-search research remains a separate track.
- Anonymous CPU and hotseat play, local save/resume, explicit CPU labels, and
  onboarding that explains scoring, turns, elimination, and results.
- Responsive board and controls for phones/tablets; keyboard operation, readable
  contrast, and player identification that does not depend only on color.
- Promotion interaction and game controls consistent with the verified rules.

**Exit criteria:** desktop and phone testing demonstrates a complete playable
game, refresh/resume, readable results, and usable controls during CPU thinking.
Cancellation and worker failure cannot apply a move to a replaced game. Published
difficulty budgets identify code version, device, and runtime. Tests cover the
behavior, including mixed human/CPU and four-CPU play.

Worker infrastructure and UI improvements can start alongside M1, but final bot
and game-result validation depends on the new rules. Expensive analysis and
training infrastructure are not prerequisites for responsive CPU games.

**UI/UX direction (2026-09-06):** Use the board-first, four-player information
architecture in the [UI/UX reference](docs/ui-ux-reference.md): original
li4chess components, stable edge player panels, concise game context, readable
event/replay history, and mobile/accessibility parity. This is a product
direction, not Chess.com visual copying or a claim of implemented parity.

### M3 — Reliable online game service (internal alpha)

**Capabilities**

- An architecture spike and ADR that validate the Cloudflare design against game
  ownership, WebSocket lifecycle, D1 consistency and recovery, local development,
  deployment, observability, limits, costs, and failure modes before runtime code
  commits the project to the design.
- A TypeScript Worker reusing the engine, serving the React/Vite application with
  Workers Static Assets and exposing HTTP interfaces. Use Wrangler, Vite, and
  workerd for local Windows development, and Cloudflare's GitHub build integration
  for deployment.
- Rooms, invite links, ready/start flow, guest sessions, and complete game actions.
  One authoritative `GameRoom` Durable Object per active game owns legal moves,
  clocks, timeouts, final results, sequence numbers, WebSockets, and randomness
  required by the rules; clients send intentions rather than trusted game state.
- A runtime-validated, versioned multiplayer protocol covering commands, events,
  seat authorization, duplicate and stale commands, reconnect/resynchronization,
  and a documented disconnect/abort policy.
- D1 migrations and durable users, games, and events sufficient for replay and
  recovery. D1 is the initial canonical SQL store; moving to PostgreSQL or another
  database requires demonstrated limitations. Persist rule-driven random actions
  so replay is deterministic.
- Saved-game replay and rematches. Client-side CPU games remain available
  independently; any shared online CPU seats need a separate server-owned design.
- R2 is reserved for blobs, Queues for asynchronous work, and Containers for
  compute that cannot remain in the browser or Worker; none is an initial M3
  dependency without evidence.

**Exit criteria:** four independent browser sessions complete games with clocks;
refresh, reconnect, duplicate commands, out-of-turn commands, and late moves
cannot desynchronize results. Durable Object restart/eviction and D1-failure tests
demonstrate the specified recovery/abort behavior, without inventing moves or
silently changing results. Server tests and four-browser Playwright scenarios are
added to CI and cover refresh, disconnect, restart, and recovery.

**Initial work breakdown**

| ID | Work item | Outcome |
| --- | --- | --- |
| M3-01 | Cloudflare architecture spike and ADR | The intended topology, consistency model, recovery contract, limits, cost assumptions, local workflow, and fallback criteria are recorded and validated with focused prototypes. |
| M3-02 | Workers deployment foundation | React/Vite is served with Workers Static Assets; the Worker has a minimal HTTP surface, repeatable Wrangler/Vite/workerd development, CI, and GitHub deployment configuration. |
| M3-03 | D1 persistence model | Versioned migrations cover users, games, events, and replay data; write ordering, idempotency, retention, and recovery semantics are tested. |
| M3-04 | Authoritative `GameRoom` Durable Object | One game owner validates moves and owns state, clocks, sequence numbers, randomness, and WebSockets, with persistence and recovery behavior defined. |
| M3-05 | Multiplayer protocol | Runtime-validated commands/events cover authorization, versioning, duplicates, stale input, reconnect, resync, and terminal actions. |
| M3-06 | Four-browser multiplayer validation | Playwright proves complete games and the required refresh, reconnect, disconnect, restart, and recovery cases in CI. |

### M4 — Public matchmaking and rated beta (first public release)

**Capabilities**

- Public casual and rated FFA queues, a small initial set of time controls, fair
  seat assignment, queue cancellation, and clear waiting/reconnect states.
- Free anonymous play and CPU games; persistent identity, profiles, game history,
  rating history, provisional status, and basic leaderboards for account holders.
  Guests remain eligible for casual matchmaking and CPU games.
- A documented multiplayer rating policy tied to final M1 placements, including
  ties, inactivity, aborted games, and corrections. Use the
  [published Chess.com rating overview](https://support.chess.com/en/articles/8724787-how-do-ratings-work-in-4-player-chess)
  as a reference; exact formula/parameter parity requires a separate decision.
- Transactional, idempotent result/rating updates and an auditable correction
  path. Simulations and fixtures evaluate placement handling and rating behavior.
- Basic fair-play rules addressing assistance, collusion, and account abuse;
  reporting, operator review, sanctions, and an appeal/contact route. Detection
  flags are evidence for review, not automatic proof of cheating.
- A lean production deployment, health checks, useful logs, error monitoring,
  rate limits, backups, tested restoration, upgrade/rollback instructions, and
  documented account/data handling.

**Exit criteria:** public users can join, finish, and replay games; rating changes
are applied once despite retries/restarts and match the documented policy.
Anonymous and CPU access work. A small multi-user beta exercises queue churn,
disconnects, and moderation. A declared concurrency target is load-tested on
the intended deployment with recorded resource use and a cost estimate. Backup
restore and rollback drills pass before launch.

**Account policy (confirmed):** accounts are required for rated play; anonymous
games are casual. **Working scope proposal:** keep CPU games outside human
rating pools. Do not silently fill human queues with bots or present CPUs as
human opponents.

### M5 — Analysis and learning

**Capabilities:** a position editor, replay navigation, shareable annotated
variations/studies, import/export with a documented four-player format, bounded
analysis, and curated lessons and puzzles using verified FFA rules.

**Exit criteria:** a completed game can become a persistent, shareable lesson;
exports round-trip correctly; analysis names the ruleset, search version, and
budget and distinguishes estimates from forced outcomes. Puzzle answers have
verified continuations. Begin with browser analysis and curated content; remote
analysis and automatic puzzle mining need their own cost and quality evidence.

### M6 — Community and organized competition

**Capabilities:** clubs/groups, player challenges, event listings, spectating,
moderated communication, and tournaments with four-player pairings, seating,
scoring, and tie-breaks. Expand reporting and organizer tools with these features.

**Exit criteria:** an organizer can run an event through withdrawals, disconnects,
uneven attendance, and final standings; players understand the scoring; operators
can handle abuse. Team/2v2 play requires its own ruleset, bot, rating, and queue
design before inclusion. Avoid fragmenting a small population across many queues.

### M7 — Sustainable open platform

**Capabilities:** localization, deeper accessibility support, documented public
APIs, contributor and self-hosting guides, security reporting, transparent project
decisions, community governance, and a funding/maintenance plan consistent with
free access and no ads. Native apps, additional variants, and larger-scale
infrastructure remain candidates based on demand.

**Exit criteria:** someone outside the original development sessions can deploy,
recover, and contribute to the service using repository documentation. Capacity
and operating costs are measured; maintenance responsibilities and community
decision processes are documented. Publish feature-specific gates before taking
on broad later-stage work.

## Architecture direction and scope control

Start with the existing monorepo and a Cloudflare-native TypeScript application:

| Responsibility | Initial direction |
| --- | --- |
| Frontend and static assets | React/Vite through Workers Static Assets |
| HTTP API | Cloudflare Workers |
| Active game ownership and realtime | One `GameRoom` Durable Object per game, with WebSockets |
| Canonical SQL persistence | D1 |
| Assets and blobs | R2 when required |
| Asynchronous work | Queues when required |
| Heavy engine compute | Browser initially; Containers only if justified |
| Deployment | Cloudflare GitHub build integration |
| Local development | Wrangler, Vite, and workerd on Windows |

Keep rules, Worker, Durable Object, persistence, protocol, UI, and bot
responsibilities modular. Treat D1 as the initial canonical SQL store; a move to
PostgreSQL or another database requires measured limits or missing capabilities,
an explicit migration decision, and a recovery plan. This is a planning direction,
not authorization to create accounts, purchase a plan, provision resources, or
deploy the application.

Specify Durable Object lifecycle, command ordering, persistence boundaries,
alarms/clocks, WebSocket behavior, crash recovery, and deployment rollback before
depending on the topology. M3-01 must verify then-current platform limits, pricing,
data-location options, development tooling, D1 transaction/consistency behavior,
and observability. Choose a concrete operating budget and load target when
deployment work becomes actionable.

Do not introduce Kubernetes, a service mesh, distributed queues, Redis, a native
app, PostgreSQL, Containers, R2, Queues, or a language rewrite without a
demonstrated requirement. Keep CPU practice and early analysis in the browser to
limit server compute. Accessibility, fairness, observability, and documentation
are ongoing work, not deferred until M7.

Stronger bots, Teams, correspondence play, advanced anti-cheat automation,
donations, and public datasets are future workstreams. Define scope and privacy
implications before implementation; none is an implicit M4 launch requirement.

## Keeping the plan current

Use stable milestone IDs in tasks and decision notes. Keep implementation detail,
the immediate task queue, open questions, and dated validation in
[docs/project-state.md](docs/project-state.md). Link substantial design decisions
to focused documents when they outgrow that file. Follow the session workflow
in [AGENTS.md](AGENTS.md), and update README when implemented capabilities change.
