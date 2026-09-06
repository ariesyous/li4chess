# M3-01 acceptance plan

Declared 2026-09-06 before prototype behavior changes. Baseline: fetched
`d0249a3deffe0ed3e147b49b33e50ebc8b5c6f05`; PR #11 merged and CI runs
34060918247 / 34060918157 independently verified successful at that revision.
Pre-existing Wrangler dependency edits are preserved (a baseline patch was saved
outside the checkout). Scope stops before M3-02 and changes no shipped play path.

## Questions, inputs and required evidence

| Question | Executable input | Required outcome |
| --- | --- | --- |
| Can Windows run the accepted topology? | Local Wrangler/workerd, Static Assets, HTTP Worker forwarding to SQLite GameRoom, local D1 | Real HTTP response and static client; actual binding calls, no platform mocks |
| Does application serialization span D1 awaits? | Concurrent commands at identical expected sequence | Exactly one commits; other is stale; no sequence gaps |
| What is the commit point? | Stop before prepare, after DO prepare, after D1 commit, after DO finalize/before response | Unprepared request has no effect; durable prepared request finishes exactly once; D1 is canonical; lost response retry returns stored receipt |
| What happens when D1 is unavailable? | Inject an actual failing D1 SQL statement and delayed persistence | No success or gameplay broadcast before canonical commit; pending room rejects new work and resync until reconciliation |
| Can restart reconstruct authority? | Terminate the entire local runtime at durable boundaries; restart same persistence directory; separately discard DO cache via protected test hook | Identical replay, hashes, awards, random cursor and terminal result; exact canonical receipt on retry |
| Are WebSockets recoverable? | Real WebSocket handshake, disconnect, reconnect with stale/future sequence, restart | Full committed snapshot resync with protocol version, contiguous command and replay sequences; rejected invalid version/identity/origin |
| Are command boundaries trustworthy? | Wrong seat/game token, missing auth, malformed/extra fields, legacy version, server-only action, duplicate ID with different payload, stale and out-of-turn move | Rejection without state mutation; own-seat resign/claim remain subject to existing engine semantics |
| Do effects remain exact? | Modern repetition terminal game and post-opening forfeits with a seeded walking King; interrupt terminal/random command | Independent replay-v2 validation and full-state equality, ordered awards once, unchanged result on retry |
| Is the architecture operationally feasible? | Current official docs and explicit cost scenarios | ADR separates documented guarantees, measurements, injected failures and inference; hosted gates remain explicit |

## Prototype boundary and initial contract

Use an isolated workspace package with no imports from the shipped web app.
The room serializes **all** command/recovery/resync work across awaited external
I/O. Prepare a complete deterministic replay transition and receipt in DO storage;
persist the exact prepared bytes to D1; finalize the local cache; only then send
success/broadcast. A durable prepare is a commitment to reconcile, not a public
success. D1 failure leaves the room unavailable and the pending request retriable.
There is no cross-store atomic transaction. Never regenerate prepared randomness.

The bounded spike stores complete replay snapshots per command to make recovery
auditable. The ADR must identify production normalization/checkpoint work and
resource limits; this deliberately small representation is not a production
schema or scalability proof. Local fixture credentials and fault hooks must be
isolated and explicitly unsuitable for deployment. No provision/deploy commands.

Live production clocks, guest issuance, invite/ready rooms and automatic scheduling
remain later slices. Specify their contract now; any prototype clock policy is
illustrative, never a silently selected launch control. Persistence incidents
freeze play; durable timing metadata must prevent hidden clock advancement.

## Closeout gates

Fresh reviewer subagents inspect consistency/recovery, authorization, and evidence.
Resolve substantive findings. Run pinned pnpm 10.33.0 / Node 24 lint, unit tests,
build, all browser tests, prototype integration and test type-checking. CI must
reproduce local integration without Cloudflare credentials and run on the final
pushed draft-PR revision. Evidence retains exact revision, source snapshot/digest,
runtime versions, commands, faults, observations and limitations in a fresh path.
Update README/roadmap/state only as supported; M3 remains incomplete. Preserve
engine/protocol formats, M2, frozen classic and historical experiment artifacts.
