# M3-03 persistence model and M3-04 handoff

Implementation and validation in progress on 2026-09-06. M3 remains incomplete.
The [acceptance plan](m3-03-acceptance.md) records the pre-change contract.

## Data and transaction contract

`@li4chess/persistence` owns migrations and the D1 adapter. `users` and `identities`
contain only opaque identity references and creation time, with identity uniqueness
and user foreign keys. They have no tokens, email addresses, credentials, sessions
or account APIs. `games` stores immutable creation metadata plus current owner,
head, lifecycle and a quarantine marker. `commands` stores bounded canonical
intentions, expected predecessor, effect boundaries, command digest and stable
receipt. `events` stores one replay-v2 event per row. `checkpoints` stores complete
state-v2 only at creation, every 16 commands, and terminal completion. `results`
is an immutable terminal projection in the cause's atomic batch.

Command sequence starts at 1 and counts actions; creation is 0. Event sequence
starts at 1 and counts action plus every ordered award/result. Engine position
sequence can predate an imported checkpoint and is never renumbered. A commit
hash covers the command record and all events; the record includes the previous
chain hash, state hash, immutable header digest, owner and checkpoint/result
commitments. Producer and source replay lineage live in the immutable header.

The insert trigger rejects a missing game, quarantine, terminal state, wrong
namespace/generation, command/event predecessor, state/chain hash or header.
The final head trigger verifies complete inserted event ranges and required
checkpoint/result commitments. Any SQL failure rolls back all statements. The
head UPDATE is unconditional for the game already checked by the insert trigger
inside the same transaction; a zero-row conditional UPDATE is never the fence.
Unique keys protect game/command ID, game/command sequence and game/event sequence.

Prepared DTOs are internal durable server records, not accepted network messages.
The trusted room authors legality once with `prepareCommand`. `verifyPrepared`
validates exact receipt commitments, a complete state-v2 successor and its hash,
all event boundaries and optional payloads without executing an action. The full
successor is part of the DO prepare, not an extra per-command D1 snapshot. It
closes the truncated-effects hole discovered in substantive review. D1 replay
readers independently regenerate request/effects with the shared engine; this is
not a separately implemented chess oracle.

## API sequence for the next slice

1. Construct `D1Persistence(binding, ReaderPolicy)`. Direct binding reads use
   primary; do not replace them with unconstrained replica sessions. Authenticate
   before every call. Caller context merely records authenticated seat/principal/
   control generation or server authority; these bytes grant no capability.
2. Create a stable game ID/seed once and a zero-event `createReplay` header under
   the actual immutable producer. Persist owner namespace/generation. Handle an
   uncertain creation using that same header and inspection; do not mint a new
   seed/game silently. Creation retry automation is not implemented by this API.
3. Serialize all room operations across awaits. Use `lookupReceipt(gameId,
   stableRequest)` before admission, stale or terminal rejection. Stable request
   contains ID, authenticated caller, action and expected command sequence; lookup
   returns the original canonical input/receipt without requiring server time.
   Preserve original `admittedAt` and caller context on exact
   retries; transport arrival is not a fresh canonical admission. Changed caller
   control generation needs explicit policy and cannot claim an old receipt.
4. Reconcile pending DO prepare before accepting work. `reconcile(prepared)` is
   `committed`, `absent` at its exact predecessor, or throws conflict/quarantine/
   fencing/unavailability. It never calls the action reducer or rerolls a King.
   Only retry the same prepared bytes when absent and still the fenced owner.
5. `prepareCommand(boundary, owner, input, actualProducer)` returns `{prepared,
   next}`. Durably store the whole prepare plus operational timing changes in DO
   SQLite before `commit(prepared)`. Success requires canonical D1 commit. On an
   uncertain error retain prepare, suspend and reconcile; never expose `next`.
6. After canonical proof, atomically replace local cache/delete prepare and then
   acknowledge/broadcast. Restore cache via `recover`; validate separately saved
   canonical markers with `verifyRestore`. A divergent prefix quarantines instead
   of picking the longest history. `transferOwner` is an explicit CAS against full
   head and old generation, increments generation, and supplies no automatic takeover.
7. Keep current clocks/disconnect storage separate. Persist debit/admission,
   recovery suspension and next-clock activation; activate only after canonical
   persistence and local finalize. Recheck deadlines before moves and on alarms.
   Implement bounded retry/backoff/re-armed alarms and durable incident markers.
   Do not infer missing operational timing from D1 or punish infrastructure delays.

Recommended M3-04 slice: build the authoritative GameRoom prepare/commit/finalize
state machine with serialized authorized actions and recovery suspension first,
then implement and test clock activation/debit, disconnect-bank deadlines and
idempotent alarm scheduling. Follow the ADR's full timing boundary inventory.
No GameRoom, guest lifecycle, live clocks/alarms or multiplayer protocol/UI is
implemented by M3-03. No shared online CPU authority is implied.

## Bounded reads, retention and recovery

The local admission ceilings are 2,048 commands/game, 32 events/action, 4 KiB
canonical request, 16 KB/event, 512 KB state and 1 MB entire durable prepare.
The prepare limit includes its successor and optional checkpoint, so it can bind
before the individual state ceiling. Reject oversize work before durable prepare;
the room must suspend/report capacity and never reinterpret it as a chess result.
These are conservative implementation ceilings, not a launch capacity or promise
that every theoretically possible game fits. State-v2 retains move/repetition/
award/random histories; individual states grow even with incremental event storage.

Every SQL statement binds at most 14 parameters, below D1's 100. At the maximum
32 effects a successful command uses at most 37 batch statements (command, events,
checkpoint, result, head, checkpoint pruning) plus bounded primary preflight reads.
Normal recovery reads at most 16 trailing commands in pages of eight and at most
32 events per command. The total stays below 50 SQL queries per invocation; full
genesis audit instead uses successive `readPage` calls in separate invocations.
Per-call query and byte bounds do not establish CPU/latency budgets on a hosted
plan. Long-game measurements must accompany acceptance evidence.

Checkpoint commits atomically prune every prior non-genesis checkpoint. This
retains only two full states and removes quadratic accumulated checkpoint copies;
canonical command/event storage grows incrementally. Keep every creation header,
event, command digest/receipt and terminal result for replay, idempotency and
recovery. No expiration or personal-data deletion policy is selected here.
Any future pruning of those records requires a new recoverable archive/tombstone
contract and measurements. D1 storage quotas remain a hosted admission gate.

Recovery captures the head and chosen checkpoint/anchor in a single primary batch,
then reads immutable rows only through that head. A concurrent append or pruning
cannot invalidate the captured checkpoint bytes. Its digest and anchor establish
canonical integrity, not pre-checkpoint reachability under a coordinated rewrite.
Audit from `creationBoundary` through `readPage` to verify the complete retained
history. Unknown database versions, command formats, rules/setup or producers
reject explicitly. Do not whitelist a producer without reader compatibility proof.

Reader v1 accepts schema 1 and additive schema 2; tests populate v1, apply v2,
verify old rows/receipts and reapply Wrangler's ledger without changes. After
release never edit these migration files. Future incompatible records require
new readers and an admission/drain plan; code rollback never rewinds D1 data.

During coordinated restore stop admission, preserve DO prepares/clock facts and
independent canonical receipts/heads, restore into isolation, and compare markers
using `verifyRestore` plus exact prepared reconciliation. Missing/divergent markers
persist a quarantine reason. No clear-quarantine or destructive restore API is
provided. Recovering a lost uncommitted DO prepare from D1 alone is impossible;
loss of operational timing needs an explicit incident, not invented deadlines.
Local SQL corruption and process restart tests do not prove hosted Time Travel,
regional failure, OS disk-flush durability or coordinated restoration.

## Hosted activation remains separate

Reviewed 2026-09-06: [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/),
[limits](https://developers.cloudflare.com/d1/platform/limits/) and
[migration tracking](https://developers.cloudflare.com/d1/reference/migrations/).
The [M3-02 operations handoff](m3-02-operations.md) continues to govern deployment.
Application Worker and Pages configuration are unchanged. No hosted binding,
resource, secret, route, account connection, deployment or paid plan was created.
Later authorized work must isolate staging/production D1 and DO namespaces,
apply migrations locally then in staging, test compatible rollback and coordinated
restore, verify primary/replica behavior, establish CPU/latency/load/storage budgets,
and test logs/alerts and quota responses before admitting remote players.
