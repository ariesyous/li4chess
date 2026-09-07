# M3-03 D1 persistence acceptance plan

Declared 2026-09-06 before behavior changes. Scope: maintained canonical SQL
persistence under the accepted M3-01 ADR and M3-02 handoff; stop before M3-04.
Fetched `origin/main` is `6530c64aa9be910cff9c63e8d737ea6fc4b9d4ef`.
GitHub verified PR #12 merge `145001ae579a53bd3dc08a1a9ee3d070add92339`,
PR #13 merge above, and successful CI 34079300521 / Pages 34079300482.
The clean baseline became `codex/m3-03-d1-persistence`; human Git identity is
Aries Youssefian. Node 24.18.0 and Corepack pnpm 10.33.0 are verified; the
default host wrapper is pnpm 11.19.0 and will not be used.

## Ownership and invariants

- `packages/persistence` owns versioned SQL migrations and typed D1 access.
  The architecture spike remains historical evidence. The application Worker
  receives no D1 binding, test routes, credentials or authority in this slice.
- Minimal opaque users/identities establish future foreign-key targets, without
  credential storage, issuance, sessions, account flows or player authorization.
  Caller context records an already authenticated principal/seat/generation or
  server authority; future GameRoom must authenticate before every API call.
- Games retain immutable creation replay header/checkpoint, ruleset/setup,
  producer and optional source replay hash. Commands have unique game/ID and
  game/command sequence, canonical input digest and original stable receipt.
  Command sequence counts actions; event sequence counts every ordered effect.
- A command commit contains exactly one legal action and its complete ordered
  effects, optional checkpoint, immutable terminal result and head advancement.
  Expected command/event heads, state/chain hash and namespace owner generation
  fence the whole batch with an aborting constraint/trigger. A zero-row UPDATE
  cannot authorize unrelated inserted rows. Competing writers yield one successor.
- Prepared bytes include exact events and deterministic random selections.
  Duplicate IDs return the original receipt only for identical canonical input;
  changed content rejects. Uncertain writes reconcile against primary canonical
  rows, comparing the complete prepared commit; never execute or reroll an action.
- D1 is canonical. DO durable prepare, clocks, alarms, admission, local finalize
  and acknowledgement remain M3-04. There is no cross-store transaction.

## Reconstruction and recovery policy

Incremental protocol primitives reuse the existing reducer without changing
state-v2/replay-v2 or M1 rules. Readers verify immutable header/setup/producer,
checkpoint hashes and complete boundaries, then contiguous command/event pages,
input/effect correspondence, hash chain and terminal results. Reader policy must
explicitly recognize the producing build; changed writers cannot append under it.
Checkpoint integrity anchors are canonical command receipts; hashes detect
corruption, not malicious coordinated database rewriting. A full audit from the
creation checkpoint remains available to prove reachability before a checkpoint.

Bound command/event/page/encoded-byte sizes and checkpoint age. Measure actual
engine-generated Modern histories, effects, bytes, statement/parameter counts,
read pages and SQL metadata before accepting limits. State-v2 itself retains
growing engine history; document this limit rather than claiming constant storage.
Keep creation, canonical events, commands/receipts and terminal results for the
game lifetime. Only superseded intermediate checkpoints may be pruned, preserving
creation and the latest recovery checkpoint. No game deletion/TTL or archive service.

Versioned migrations must work on fresh local D1, reapply safely via Wrangler's
migration ledger, preserve populated prior-version data through additive upgrades,
and reject unknown reader/schema versions. Divergent restore markers quarantine
the game rather than selecting a convenient history. No automatic unquarantine;
operator reconciliation requires preserved independent evidence and later tooling.

## Proof and completion criteria

Use actual Wrangler/workerd local D1 on Windows and CI. Cover full-batch rollback
including a late failure, stale/wrong-generation/competing writers, unique keys,
exact/conflicting duplicates, lost acknowledgement, whole-runtime restart,
complete terminal/random effects, pagination, checkpoint retention, corruption,
gaps, unknown provenance and divergent restore. Isolate test binding/config,
databases, administrative SQL and faults; bind loopback, verify readiness identity,
use fresh evidence directories, own all child cleanup and check released ports.

Fresh independent substantive and final reviewers cover SQL atomicity/fencing,
idempotency, reconstruction/provenance, deployment isolation and evidence quality.
Resolve substantive findings. Required fresh checks: frozen install, lint including
changed test sources, unit tests, build, web E2E, architecture integration,
build:workers, check:workers, test:workers, new migrations/persistence integration,
local documentation links and diff checks. Preserve Pages deployment and frozen
classic/archived evidence. Record exact revision or source digest, source snapshot,
versions, command/configuration, measurements, failures and limitations.

Complete only M3-03 after reviewed commits, branch push, draft PR to main and
passing CI on the final pushed revision. Update README, roadmap and project state
with evidence and a concrete M3-04 API/fencing/prepare/reconciliation/clock handoff.

## Official platform review and hosted boundary

Reviewed 2026-09-06 (2026-09-07 UTC): D1 batch executes statements in a SQL
transaction and rolls back a failing batch. Direct binding queries without
Sessions use primary; this slice deliberately uses that path for reconciliation.
A `first-primary` session would route only its first query to primary and does
not promise every later read is primary.
[Database API](https://developers.cloudflare.com/d1/worker-api/d1-database/).

D1 documents 100 parameters/query, 100 KB SQL, 2 MB row/string, 30-second query,
and 50/1000 queries per Free/Paid invocation. Per-statement limits also apply
inside batches. Database capacity is 500 MB Free/10 GB Paid; these are platform
ceilings, not this implementation's capacity claims.
[Limits](https://developers.cloudflare.com/d1/platform/limits/).
Wrangler migrations track applied versioned SQL files; use explicit `--local`
and an isolated persistence directory for all tests.
[Migrations](https://developers.cloudflare.com/d1/reference/migrations/).

Local runtime proves application consistency at tested durable boundaries, not
hosted replication/failover, power-loss durability, Time Travel, coordinated D1/DO
restore, regional latency, quotas, load/cost or deployment rollback. Account-owned
bindings, database IDs, environment separation, hosted verification and any
activation require separate authorization. No resource provisioning, connection,
paid plan, secrets, upload, deploy, merge or direct main push is authorized.
