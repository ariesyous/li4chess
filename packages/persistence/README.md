# Canonical D1 persistence

Maintained internal binding library for M3-03. No HTTP handler, GameRoom,
credential lifecycle or application D1 binding is shipped. The only Worker here
is a test fixture under `test/`, used with a generated loopback-only config.
[Acceptance contract](../../docs/m3-03-acceptance.md) and
[M3-04 handoff](../../docs/m3-03-handoff.md).

From the repository root with Node 24 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm --filter @li4chess/persistence lint
pnpm --filter @li4chess/persistence test
pnpm --filter @li4chess/persistence test:integration
```

Integration invokes Wrangler `d1 migrations apply DB --local --config <generated>
--persist-to <isolated>`, first with migration 0001, then populates the database,
applies additive 0002, and reapplies the ledger. It uses actual local D1 and
workerd, no account or remote binding. `M3_03_OUTPUT` selects a fresh absolute
evidence directory; existing directories reject. Defaults to a timestamp under
ignored `arena-results`. Ports are allocated on loopback and readiness verifies
the source fingerprint and per-run fixture key. All spawned trees are owned,
hidden on Windows, terminated on completion/cancellation, and ports checked free.
Do not edit source while collecting evidence. Failed assertions are not retried.

`migrations/` is the schema authority. Never modify an applied migration after
release; add a numbered SQL file. Reader v1 explicitly accepts database versions
1 and 2 because 0002 adds only a quarantine index. Unknown versions reject. These
migrations never alter the architecture spike's independent database. The
application Worker retains only its existing ASSETS/APP_ENV bindings. Actual
staging/production D1 IDs, namespace generations, migration rollout and backups
require separately authorized hosting work.

`create` retains a zero-event replay-v2 header and validated state-v2 checkpoint,
including setup, seed, producer and optional source replay hash. Terminal imported
checkpoints are supported without claiming Modern reachability. `prepareCommand`
authors one action/effect group using the existing protocol reducer. It returns
the complete successor state and exact durable prepare bytes; only periodic or
terminal checkpoints store full states in D1. `commit` inserts command, events,
checkpoint/result and advances the head in one batch. SQL insert/head triggers
raise errors on stale/missing authority or incomplete batches, forcing rollback.

`lookupReceipt` accepts the stable authenticated request (ID, caller, action and
expected command) before admission and returns the original canonical input/time
and receipt, including after cache loss or checkpoint pruning. Changed stable
fields reject before returning stored input. `receipt` requires identical canonical input, including already authenticated
caller/control generation and the original admission facts. The future room must
look up/reuse those facts for retries; a fresh arrival timestamp is not a new
admission. `reconcile` compares exact prepared record/events/receipt/result and
any retained checkpoint with primary D1 rows. It never runs the engine. A matching
receipt remains available after later commits or checkpoint pruning. A different
ID payload conflicts; divergent prepared recovery quarantines. Old owner prepares
cannot fill an absent row after an explicit increasing-generation handoff.

`recover` atomically captures header/head/latest checkpoint and its receipt,
validates their identities/hashes and replays a bounded tail. Reads stay pinned
to that head during concurrent appends/pruning. `readPage` advances at most eight
commands from a trusted verified Boundary; use separate invocations to audit from
creation. Neither continuation state nor prepare DTO is an untrusted wire format.
The `ReaderPolicy` must explicitly recognize producer identities; `exactReader`
is the conservative default helper. Changed deployments must drain old games or
use a separately verified compatibility reader/source-linked checkpoint branch.

Only creation and newest checkpoints remain after checkpoint commits; commands,
events and immutable results remain for the game lifetime. No TTL, user deletion,
game deletion or archival service is supplied. Hashes detect corruption and link
source content; they do not authenticate arbitrary database rewrites. Recovery
from a checkpoint verifies its canonical receipt commitment, not reachability of
the discarded prefix. Genesis audit verifies every retained action. Restore
markers not on the canonical chain quarantine; no automatic unquarantine exists.
