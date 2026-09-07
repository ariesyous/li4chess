# M3-04 authoritative GameRoom acceptance plan

Declared 2026-09-07 before behavior changes. Scope ends before M3-05. Fetched
origin/main and PR #14 merge are `898be37cc7889e5bea9fefe5e5b819e1b7351784`;
GitHub confirms CI 34083211956 and Pages 34083211924 succeeded on that revision.
The clean checkout is on `codex/m3-04-authoritative-gameroom`. Use Node 24.18.0
and Corepack pnpm 10.33.0; the global pnpm 11.19.0 wrapper is unsuitable.

## Ownership and authorization

The maintained `packages/game-room` owns SQLite operational state and a serialized
queue spanning every external await: creation, commands, reads, presence, alarms,
and recovery. D1 remains canonical through `@li4chess/persistence`. The historical
architecture spike remains separate. Namespace, object identity, game ID, owner
generation, immutable producer/header and seed cannot silently change.

Only an internal authenticated service integration may supply creation/seat grants
and authenticated connection context. No public fetch gameplay endpoint is added.
Submitted principal/seat/generation fields are records, never credentials. Room
methods validate persisted grants, current connection and control generation before
receipt lookup or state disclosure. Own-seat move/resign/claim are player actions;
timeout, disconnect exhaustion and seeded walking are exclusively room actions.
Current D1 ownership must fence reads/publication as well as writes. An explicit
ownership transfer is not permission for the previous owner to publish a receipt.

Connections have opaque IDs and increasing control generations. A trusted explicit
control takeover revokes old control; other authenticated connections may observe.
Any valid connection supplies presence, so two tabs do not double-charge a bank.
Disconnecting the controlling tab does not silently promote an observer. Persist
grants/generations; clear transport liveness on cold recovery and reconnect through
the trusted integration. Guest issuance, expiry/revocation and public wire parsing
are M3-05. Test-only credentials, SQL/fault/time controls remain outside deployable
entry points and cannot be activated by application request fields.

## State machine and transaction boundaries

1. Persist stable complete creation intent, including header and timing policy,
   before D1 creation. Reconcile uncertain creation against exactly that identity;
   retry only its absence. Never regenerate game ID, seed or producer.
2. Authenticate, reconcile pending work, fence owner, and use `lookupReceipt`
   before stale/terminal/new-admission decisions. Exact retries return the original
   receipt/input, including admission; conflicting ID reuse rejects.
3. Recheck due server work, expected command sequence and shared-engine legality.
   Admission is the serialized eligibility point after those checks. Compute one
   complete deterministic transition. Atomically persist its entire prepare and
   debited, suspended timing in SQLite. No success or speculative snapshot escapes.
4. Commit exact prepared bytes in one canonical D1 transaction. Uncertainty retains
   prepare and incident, freezes clocks/banks and schedules recovery. Primary
   reconciliation proves committed/absent/conflicting without rerunning the action.
5. After canonical proof, atomically replace local cache/marker and remove prepare.
   Persist next-clock activation separately; an interruption between these steps
   remains suspended. Only after durable activation/finalize may success or a
   committed snapshot be published. Keep platform output gates and await durability.
6. Cold recovery persists a suspension/incident before external I/O, verifies
   independent local canonical markers and reconstructs a bounded D1 suffix.
   Divergent restore quarantines. Missing timing is an explicit non-resuming incident;
   never infer balances from canonical admission timestamps. Pending work survives
   disconnected clients and repeated recovery. Terminal state never admits new work.

## Timing policy and compatibility

No launch time control is chosen. Tests supply bounded initial and increment
durations. The implementation policy is increment once after a legal ordinary move
by an active player, including a terminal move; no increment for forfeits, claims,
walking turns, rejected requests or duplicate receipts. Store per-seat balances,
active seat, activation/deadline, accounted time, operational revision, policy and
durable suspend/resume markers. Canonical command-v2 carries a strictly validated
versioned admission timing snapshot; v1 remains readable without invented metadata.
No state-v2/replay-v2 keys or released migrations are rewritten. A v1-only record
policy rejects v2 explicitly. New writers use actual build identity and reject old
producer append; source-linked verified checkpoints remain the explicit branch path.

Debit running clocks and all disconnected active-seat banks exactly once at eligible
admission. Freeze during preparation/persistence. Activate only after finalize.
Invalid, unauthorized, stale and duplicate traffic never changes running timing.
Presence changes account elapsed time without replenishing balances. Clamp backwards
server time to the persisted accounted/activation floor; record that observation.
Deadlines, not late alarm arrival, determine expiration facts. Resolve earliest
deadline first; ties use main-clock expiry before disconnect, then Red/Blue/Yellow/
Green. Exhaustion records the existing distinct 60,000 ms disconnect fact. Engine
opening guards, walking/automatic claims, ordered awards and terminal behavior apply.

On cold recovery, conservatively resume from the last durably accounted balances;
unaccounted time across unavailable infrastructure is not charged. Record a durable
incident and resume revision so recovery never reapplies debit/increment. This
deliberately does not infer outage duration or claim hosted lifecycle availability;
hosted eviction/hibernation cadence and clock service availability need staging proof.
No balance is reset to its initial value. Missing/divergent timing cannot auto-resume.

One durable alarm schedules the earliest main/disconnect deadline, walking work or
recovery retry. Each invocation performs bounded work (one canonical action/attempt),
then re-arms. Stale/duplicate/late alarms recheck persisted facts. Recovery uses
persisted capped exponential backoff, continuing beyond platform retries; retain
incident count/reason/first occurrence and resume markers. Alarm scheduling failures
must retain durable retry intent. Walking choices are made once in prepare and never
rerolled during recovery. All operational records and queues/connections are bounded.

## Validation and completion

Actual local Wrangler/workerd SQLite DO and D1 on Windows and CI are required.
Deterministic injected-time tests separately prove arithmetic and deadline edges;
real delivered alarms and entire runtime termination/restart prove tested lifecycle
boundaries. Exercise concurrent arrivals across D1 waits; grants/control/owner fences;
duplicates/conflicts after later and terminal commands; all before/after prepare,
debit, D1, finalize, activation and publication interruption boundaries; lost replies;
real SQL rollback/unavailability; autonomous recovery; cache/timing loss and divergent
restore; backwards time, ties, multiple connections and cumulative banks; interrupted
walking/terminal awards; no premature publication; version/provenance rejection;
admission/storage bounds and realistic engine-generated histories. Retain exact
state, receipt, timing and random/result equality, not only status assertions.

Run frozen install, lint (including changed tools/tests), units, build, all web E2E,
architecture and persistence integrations, Workers build/dry-run/runtime checks,
new room tests/integration, local Markdown links and diff checks. Use fresh isolated
databases/evidence paths, bounded identity-checked readiness, hidden owned subprocesses,
released-port checks and cleanup. Record failures without weakening tests/retries.
Evidence identifies revision or source snapshot/digest, executable versions, config,
commands, raw observations and measurement limitations. Fresh independent substantive
and final reviewers must resolve cross-store, auth, clock, recovery, provenance,
deployment and evidence findings. Commit reviewed slices with configured human identity,
push only dedicated branch and create a draft PR; exact final-head CI must pass.

Update README/roadmap/project state and write M3-05 integration handoff. Mark only
M3-04 complete with evidence. No merge, hosted activation, accounts, secrets, resources,
deployment changes, public protocol/UI, matchmaking or shared online CPUs.

## Official platform review and hosted gates

Reviewed 2026-09-07: SQLite `transactionSync` cannot span asynchronous D1 calls;
default output gates protect local durability. Use a room queue for external waits.
[SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/).
D1 batch rolls back failed transactions; direct binding reads use primary.
[D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).
Alarms are at least once, one per object, with six automatic retries; explicitly
re-arm extended incidents. Constructors must not overwrite an existing due alarm.
[Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).

Local tests do not prove hosted latency/capacity, alarm punctuality, eviction,
hibernation, regional failure, disk-flush durability, Time Travel or coordinated
restoration. Existing Pages and Workers environment behavior stays intact; only
explicit local room configuration is integrated. Hosted bindings, plan/load/budget,
staging restore/deploy/rollback and public authentication remain separate gates.
