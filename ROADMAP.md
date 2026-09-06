# li4chess roadmap

Last reviewed: 2026-09-06. This is a capability roadmap, not a dated delivery
promise. Milestone order and implementation choices are the working plan; the
product decisions below were confirmed by the maintainer.

## Vision and product decisions

Build a four-player equivalent of Lichess: a welcoming, free, ad-free,
open-source place to play, compete, learn, and build a community around
four-player chess.

- **First public release:** free-for-all with public matchmaking and ratings.
- **Rules target:** match Chess.com's standard FFA rules. The current local house
  rules are an implementation baseline, not the intended public ruleset.
- **Access:** free access, no ads, anonymous casual matchmaking, and games
  against CPUs are launch requirements. Rated play and persistent leaderboards
  require an account.
- **Long-term principles:** competitive fairness and community participation in
  governance, alongside the existing AGPL-3.0-only licensing.
- **Constraints:** no target date; lean operating costs; keep the system simple.
  Plan for a VPS behind Cloudflare and PostgreSQL, potentially managed by Aiven
  or another provider. No provider or paid service has been selected.

Teams/2v2 and other variants are later candidates. Invite rooms are useful for
development and testing; an invite-only release does not fulfill the public
matchmaking-and-ratings goal.

## Current baseline

The repository has local hotseat and CPU games, a pure TypeScript rules engine,
a React board, production bot search, a separate research laboratory, and CI.
It does not yet have a multiplayer server, durable player accounts, public
queues, ratings, authoritative clocks, or application game persistence.

The protocol package currently serializes JSON; it is not yet a validated
network protocol. CPU search still runs synchronously on the browser thread.
Existing tests establish a regression baseline, not Chess.com compatibility.

See [README.md](README.md) for implemented capabilities and
[project state](docs/project-state.md) for the current focus and evidence.

## Milestones

Status vocabulary: **planned**, **in progress**, **blocked**, **complete**.
Complete means the exit criteria have supporting evidence. Existing partial
capabilities do not make a milestone complete.

| ID | Milestone | Status | Depends on | Player outcome |
| --- | --- | --- | --- | --- |
| M1 | Compatible, versioned FFA rules | In progress | Existing engine | The game behaves as a Chess.com FFA player expects. |
| M2 | Responsive local and CPU play | Planned | M1 for final validation | Anyone can play an enjoyable game on desktop or phone. |
| M3 | Reliable online game service | Planned | M1 | Four remote players can finish and recover a game. |
| M4 | Public matchmaking and rated beta | Planned | M2, M3 | Players can find opponents and build a credible rating. |
| M5 | Analysis and learning | Planned | M4; editor/replay work can begin earlier | Players can understand and improve their play. |
| M6 | Community and organized competition | Planned | M4 | Communities can organize and follow events. |
| M7 | Sustainable open platform | Planned | Public usage and operational evidence | Contributors can maintain, operate, and extend the service. |

### M1 — Compatible, versioned FFA rules

**Status note (2026-09-06):** M1-01 produced the sourced
[compatibility audit](docs/rules-compatibility.md), and M1-02 now records a
[versioned migration contract](docs/ruleset-versioning.md) with proposed
identifiers, replay requirements, evidence-status fixtures, and no-guess
decision gates. M1 remains in progress: M1-02 now has D/O target evidence for
each release-affecting game rule, but its product-owned identifier/replay/legacy
policy still needs maintainer acceptance; M1-03 implementation and exit-criterion
validation remain.

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
against the target rules. Old evidence remains unchanged and replayable through
its recorded revision or an explicit compatibility path.

**Initial research:** the current engine and the published FFA overview differ
in these areas. This is a starting inventory, not a complete specification.

| Area | Current engine | Published Chess.com FFA target |
| --- | --- | --- |
| Winner | Last active player | Highest points total |
| Promotion | Far local rank | Player's eighth rank |
| Eliminated army | Checkmated pieces removed | Dead pieces remain; captures give no points |
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

- A TypeScript service reusing the engine, with HTTP and WebSocket interfaces,
  runtime-validated commands, seat authorization, and versioned messages.
- Rooms, invite links, ready/start flow, guest sessions, and complete game actions.
  The server owns legal moves, clocks, timeouts, final results, and randomness
  required by the rules; clients send intentions rather than trusted game state.
- Per-game command ordering, sequence numbers, duplicate-command handling,
  reconnect/resynchronization, and a documented disconnect/abort policy.
- PostgreSQL migrations and durable games/events sufficient for replay and
  recovery. Persist rule-driven random actions so replay is deterministic.
- Saved-game replay and rematches. Client-side CPU games remain available
  independently; any shared online CPU seats need a separate server-owned design.

**Exit criteria:** four independent browser sessions complete games with clocks;
refresh, reconnect, duplicate commands, out-of-turn commands, and late moves
cannot desynchronize results. Restart and database-failure tests demonstrate the
specified recovery/abort behavior, without inventing moves or silently changing
results. Server tests and multi-browser tests are added to CI.

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

Start with the existing monorepo, one deployable application service, and
PostgreSQL. Keep rules, service, UI, and bot responsibilities modular inside that
system. A VPS behind Cloudflare is the intended hosting shape; managed Postgres
is optional. This is a planning direction, not an infrastructure purchase or
deployment authorization.

Initially, one service process can own active games and matchmaking while the
database stores durable state. Specify crash recovery and deployment behavior
before depending on this arrangement. Add replicas only with a design for game
ownership and routing. Choose a region, hosting size, database provider, and a
concrete operating budget when deployment work is actionable. Verify then-current
WebSocket/proxy limits and database connectivity before provisioning.

Do not introduce Kubernetes, a service mesh, distributed queues, Redis, a native
app, or a language rewrite without a demonstrated requirement. Keep CPU practice
and early analysis in the browser to limit server compute. Accessibility,
fairness, observability, and documentation are ongoing work, not deferred until M7.

Stronger bots, Teams, correspondence play, advanced anti-cheat automation,
donations, and public datasets are future workstreams. Define scope and privacy
implications before implementation; none is an implicit M4 launch requirement.

## Keeping the plan current

Use stable milestone IDs in tasks and decision notes. Keep implementation detail,
the immediate task queue, open questions, and dated validation in
[docs/project-state.md](docs/project-state.md). Link substantial design decisions
to focused documents when they outgrow that file. Follow the session workflow
in [AGENTS.md](AGENTS.md), and update README when implemented capabilities change.
