# M3-01 Cloudflare platform research

Reviewed **2026-09-06** against the official sources linked beside each claim.
This is a feasibility input to the architecture decision, not a hosted benchmark
or a service-level guarantee. **D** means documented platform behavior;
**I** means li4chess inference or proposed operational policy. Local observations
belong in the separate acceptance evidence. No account, plan, resource, or
deployment was created for this research. Prices are USD before tax, mutable,
and must be checked again before choosing an operating budget.

## Ownership, storage, and concurrency

| Topic | Documented behavior (D) | Consequence for li4chess (I) |
| --- | --- | --- |
| Object storage | Storage is private to an object, transactional and strongly consistent. SQLite is the recommended backend. `transactionSync` rolls back on exceptions and cannot contain asynchronous work. SQL cursors crossing an `await` do not provide snapshot isolation. [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) | Consume SQL results synchronously. Use a local transaction for checkpoint, pending record, and metadata; D1 cannot participate in that transaction. |
| Storage gates | Default output gates defer outgoing messages until preceding local writes are durable; write failure resets the object and discards queued output. `allowUnconfirmed` opts out. Input gates protect local storage operations. [SQLite storage](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) | Keep default gates. They do not establish an atomic commit with a D1 binding or serialize arbitrary external awaits. A pending-record state machine and explicit command serialization are still required. |
| Blocking event delivery | `blockConcurrencyWhile` blocks other event delivery until its callback finishes; uncaught error or its 30-second timeout resets the object. It is intended for initialization and exceptional external-I/O ordering. [Object state](https://developers.cloudflare.com/durable-objects/api/state/) | Keep initialization bounded. A long D1 outage must not leave an indefinitely blocked constructor. Model unavailable/recovering states and keep command queues bounded. |
| D1 atomic unit | `batch()` executes prepared statements in order; failure aborts/rolls back the batch. Sessions preserve sequential consistency among their queries. [D1 database API](https://developers.cloudflare.com/d1/worker-api/d1-database/) | Put event insert, command receipt, and canonical game-head/result update in one batch. A conditional update affecting zero rows is not an SQL error: assert ownership/sequence predicates through constraints and inspect results. No cross-object/D1 transaction is documented. |
| D1 recovery reads | `withSession("first-primary")` starts on the latest primary version. A bookmark starts at a version at least as current as that bookmark. Subsequent session queries are sequentially consistent. [Read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/) | Resolve ambiguous writes on the primary, or a session with a sufficient bookmark. An unconstrained replica read cannot prove that a timed-out commit was absent. Do not enable replicas as an unmeasured latency fix. |

The absence of a cross-service transaction is an architectural boundary, not a
claim that local storage is unreliable. A D1 timeout can mean either no commit or
a committed transaction whose response was lost. Recovery must compare the
durable command ID, payload digest, sequence, predecessor hash, resulting state
hash, and recorded random action. Recomputing a different random choice on retry
would violate the rules/replay contract even if the move were legal. Neither
output gates nor TCP delivery guarantee that all four clients saw an event.

## WebSockets, lifecycle, and clocks

**D:** Hibernatable server WebSockets use `ctx.acceptWebSocket` and event
handlers. Their attachments survive hibernation only while the connection
remains healthy; closing the connection loses the attachment. Attachments are
limited to 16,384 bytes. Persist longer-lived identity elsewhere.
[WebSocket guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/)

**D:** Hibernation discards in-memory state and reruns the constructor on wake.
Scheduled JavaScript timers, unfinished handlers, awaited fetches, standard
WebSockets, and active outbound sockets prevent hibernation. Hibernated objects
can keep client connections, but the runtime may later move them to an inactive
state. [Lifecycle](https://developers.cloudflare.com/durable-objects/concepts/durable-object-lifecycle/)

**D:** Each object has one alarm. Execution is at least once; uncaught failures
receive up to six retries, starting with a two-second delay. For longer outages,
the application must explicitly schedule another alarm. An alarm is therefore
neither exactly-once delivery nor an unlimited retry mechanism.
[Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/)

**I:** Persist clock deadlines, remaining times, suspension reason, and sequence;
render countdowns on clients, and treat alarms as wakeups to recheck those facts.
Recheck expiry before every command, so an alarm arriving late cannot make a
late move legal. Send automatic walking-King actions through the same durable
command path. Reconnection must authenticate again and request the authoritative
sequence/hash; socket attachment data is an optimization, not seat ownership.
Avoid a per-second server interval. Whether a hosted connection survives a
particular deploy, eviction, failover, or mobile network transition is a later
measurement, not an assumption derived from local reconnect tests.

## Limits and capacity risks

The following are documentation ceilings, not demonstrated li4chess capacity.

| Service | Relevant documented limits | Application implication |
| --- | --- | --- |
| Workers | 128 MB memory per isolate; Free CPU 10 ms/invocation; Paid default CPU 30 s, configurable to 5 min. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) | Measure engine legality and replay reconstruction in workerd. Browser CPU search timings do not establish server budgets. Use bounded payloads and replay pages. |
| SQLite DO | 2 MB row/key-plus-value; 100 bound parameters; 100 KB SQL; incoming WebSocket messages up to 32 MiB; soft throughput limit 1,000 requests/s/object. Limits page lists 10 GB storage generally, while its full-storage section specifies 1 GB Free and 10 GB Paid. [DO limits](https://developers.cloudflare.com/durable-objects/platform/limits/) | Use the conservative 1 GB Free ceiling pending account verification. Four players fit the topology, but spectators and abusive clients need separate caps. Reject oversized commands well below the platform limit. |
| D1 | 500 MB/database Free, 10 GB Paid (not increaseable); 2 MB row; 100 parameters/query; 100 KB statement; 30 s query duration; 50/1,000 queries per Worker invocation Free/Paid. Each database processes queries one at a time and can return overload errors. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) | Start with indexed game/sequence and command lookups. Track write latency, rows scanned, and storage growth. Many game DOs still converge on one canonical database; DO scaling does not remove that bottleneck. |

**I:** Before public load, set a real concurrency target and measure p50/p95/p99
command-to-durable-ack latency, legal-action CPU, event bytes, reconnect replay
work, and D1 queueing. Declare a latency/error budget before the load run. Stop
admitting new games when persistent overload threatens existing games; preserve
accepted results and expose persistence unavailability. Archival retention and
checkpoint cadence must follow measured bytes and restoration requirements.

## Local workflow and hosting boundary

**D:** Wrangler runs Workers in workerd and supports maintained/current Node
versions; its documented OS support is Windows 11, macOS 13.5+, and Linux with
glibc 2.35. Install Wrangler locally to pin it with the project.
[Wrangler installation](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
Wrangler 3+ persists local D1 across runs by default; `--persist-to` selects a
directory. Miniflare provides local D1 bindings.
[D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)

**I:** Use this repository's Node 24 and pnpm 10.33.0, the locked Wrangler/workerd
versions, and a fresh persistence directory per integration run. Reuse that
directory only for the test's restart phase. Record subprocess exits and the
same state/event/result after restart. A clean stop/restart is real process
recovery evidence but not proof of crash durability under abrupt power loss.
Injected D1 errors are application failure tests, not a hosted D1 incident.
The prototype must use local bindings only and must not require Cloudflare
credentials in CI. Keep it outside the shipped React/local-game path.

**D:** Workers Static Assets can deploy application assets and Worker code as one
unit. Matching assets normally bypass Worker code. SPA fallback can use
`not_found_handling`, with selective `run_worker_first` paths for APIs.
[Static Assets](https://developers.cloudflare.com/workers/static-assets/)

**I:** M3-02 should test `/li4chess/` asset/base handling, direct navigation,
unknown API paths, and WebSocket upgrade routing explicitly. An API failure
must remain a structured API failure instead of returning the SPA shell. The
current GitHub Pages workflow must stay intact until a separate authorized
deployment transition; this spike does not implement that transition.

## Deployment, rollback, observability, and location

**D:** GitHub integration supports automatic builds/deployments, PR comments,
and check runs. Preview URLs are **not generated for Workers implementing
Durable Objects**. Scope GitHub App access to the intended repository.
[GitHub integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/)
Build limits are 20 minutes, 3,000 monthly Free minutes or 6,000 Paid minutes
then $0.005/minute; concurrency is 1/6 Free/Paid.
[Build limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)

**I:** Later configure repository-root builds with locked tools and explicit
frontend/Worker outputs. Keep CI validation a precondition for promotion;
automatic GitHub integration alone does not prove required tests ran. Use a
separate staging Worker, DO namespace, and D1 database for hosted checks; do not
assume a PR preview isolates state. Do not expose real data or deployment
credentials to untrusted pull requests. Pin compatibility date and record source
commit, build ID, Worker version, and migration version together.

**D:** Worker rollback selects an earlier deployed code version (within the most
recent 100). It does not rewind bound data. DO class lifecycle changes can
prevent rollback; older code may be incompatible with newer data.
[Rollbacks](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
DO SQLite PITR covers 30 days and is unavailable locally.
[SQLite PITR](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/)
D1 Time Travel retention is 7 days Free/30 days Paid.
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

**I:** Use additive schema changes and a tested previous-version reader before
rolling out writers. Keep the engine/protocol producer version in every game.
If rollback cannot read existing games, stop new admission and use a compatible
forward fix or controlled recovery; never silently reinterpret games. Restoring
D1 alone or a DO alone creates divergent histories. A coordinated maintenance
procedure must reconcile them with canonical receipts before accepting commands.
Hosted restoration and rollback drills remain required before public launch.

**D:** Workers Logs supports structured application logs and configurable request
sampling. Retention is 3 days Free or 7 days Paid, with 200,000 events/day Free
or 20 million/month Paid then $0.60/million. Individual logs can be truncated at
256 KB. [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)

**I:** Log version, opaque room/command ID, sequence, failure stage, durations,
rows read/written, recovery outcome, and final hash. Exclude seat tokens, cookie
headers, full command bodies, and personal data. Use canonical D1 history for
audit/replay; sampled, expiring logs cannot replace it. Alert on hash conflicts,
unresolved pending commits, durable-write failures, alarm exhaustion, reconnect
failure, and sustained latency/overload. Verify hosted log redaction, retention,
and metrics before enabling real users.

**D:** DO jurisdictions include EU, US, and FedRAMP; location hints are best
effort and affect only the first placement. DO IDs may be logged outside the
jurisdiction. [DO data location](https://developers.cloudflare.com/durable-objects/reference/data-location/)
D1 jurisdictions include EU/FedRAMP, must be chosen at creation, and cannot be
changed afterwards. D1 location hints are not guarantees; jurisdiction overrides
the hint and constrains replicas. Worker access can still originate elsewhere.
[D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)

**I:** Choose intended player regions and data-handling requirements before
creating databases. Do not claim US-only D1 residency from a North America hint,
or end-to-end regional processing from a storage jurisdiction. Measure the
extra round trip between the chosen DO placement and D1 primary; four players
may be on four continents. No jurisdiction or legal-compliance commitment is
selected here.

## Illustrative operating costs

These are calculations, **not measured traffic or a plan selection**. Allocations
are shared with other account workloads. Assume a 30-day month, four players,
no spectators/bots, no paid add-ons, and no substantial attack traffic.

| Paid-plan rate used | Included allocation and overage |
| --- | --- |
| Workers | $5 monthly base; 10 million dynamic requests, then $0.30/million; 30 million CPU ms, then $0.02/million. Static asset requests are free. [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) |
| DO compute | 1 million billing requests, then $0.15/million; 400,000 GB-s, then $12.50/million GB-s. Incoming WebSocket messages count at 20:1, outgoing messages are free; connection upgrades count. Duration uses 0.128 GB/object. Overage dimensions round upward to whole million units. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |
| D1 storage/operations | 25 billion rows read, then $0.001/million; 50 million rows written, then $1/million; 5 GB included, then $0.75/GB-month. Index changes add write work. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) |
| DO SQLite | Same included row quantities/rates as D1; separate 5 GB-month storage allocation, then $0.20/GB-month. Alarm writes/deletes and index maintenance must be counted. [DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) |

Use the accepted default HTTP command transport: each 1,800-second game has
240 HTTP commands, 60 HTTP resync/control requests, four WebSocket upgrades,
and ten miscellaneous HTTP requests, totaling **314 Worker requests/game**.
Conservatively assume all 314 also reach the DO at the full request rate, plus
100 alarm or other DO requests/game. WebSockets carry server broadcasts;
discounted incoming WebSocket commands are an optional, unimplemented future
transport and are not assumed here. Assume 5 ms CPU per Worker request
(including upgrades), 20 ms DO active wall time/request including persistence,
and 10 billed rows written/command **per store**
including prorated indexes, alarm changes, creation and metadata, and 20 rows
read/command/store. These row multipliers are placeholders to replace with
actual metadata. Assume no other active work between requests and hibernation
eligibility throughout idle time.

| Monthly calculation | Small alpha: 1,000 games | Larger illustration: 100,000 games |
| --- | --- | --- |
| Worker requests and CPU | 1,000 × 314 = 314,000 requests; × 5 ms = 1,570,000 CPU ms, included | 31.4m requests; (31.4m−10m)/1m × $0.30 = **$6.42**. 157m CPU ms; (157m−30m)/1m × $0.02 = **$2.54** |
| DO billing requests | 1,000 × (314 + 100) = 414,000, included | 41.4m; excess 40.4m rounds to 41m × $0.15 = **$6.15** |
| DO active duration | 1,000 × 414 × 0.020 s × 0.128 = 1,059.84 GB-s | 105,984 GB-s, within allocation |
| Rows written, each store | 1,000 × 240 × 10 = 2.4m | 240m; excess 190m × $1/m = **$190 each** |
| Rows read, each store | 1,000 × 240 × 20 = 4.8m | 480m, within allocation |
| Assumed average retained storage | D1 1 GB; DO 0.1 GB: $0 | D1 40 GB spread over databases; DO 1 GB: (40−5) × $0.75 = **$26.25** |
| Logs/builds assumption | 1m billed log events, 200 build minutes: included | Sampling limits billed log events to 10m; 1,000 build minutes: included |
| Illustrative total | **$5/month** | $5 + $6.42 + $2.54 + $6.15 + $380 + $26.25 = **$426.36/month** |

The large scenario's 40 GB cannot fit in a single D1 database; it deliberately
exposes a retention/partitioning gate before that volume. It is not a claim that
the initial unpartitioned schema serves this load. Average storage includes all
retained history, not only this month's games. Checkpoints containing full
states may make bytes and writes higher; measure before selecting retention.

Duration is a major sensitivity: if all game objects remain awake throughout
their games, 100,000 × 1,800 × 0.128 = 23,040,000 GB-s. Subtract 400,000, round
22.64m upward to 23m, and add 23 × $12.50 = **$287.50**, giving **$713.86/month**
with the same other assumptions. Database waits count as active wall time even
though they are not CPU execution. Hibernation eligibility, retention, and
write amplification require measurement.

Free-tier feasibility must be checked daily: each of D1 and DO SQLite includes
100,000 writes/day and 5m reads/day; DO compute includes 100,000 requests and
13,000 GB-s/day. Limits fail operations when exhausted. At the small scenario's
evenly distributed traffic, 2.4m/30 = 80,000 writes/day/store leaves little
headroom for creation, retries, deletion, or spikes. A $0 steady-state forecast
does not establish safe availability. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/),
[DO pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Hosted validation and reconsideration gates

These gates are intentionally outside this local spike. They require separately
authorized hosting work and must remain visible in M3-02 through M3-06/M4.

1. **Placement/latency:** measure geographically separated players through the
   deployed Worker, room, and D1 primary with declared concurrency, command CPU,
   and acknowledgement targets. Include overloaded/slow canonical persistence.
2. **Lifecycle:** establish hibernation billing/attachment behavior, alarm wakeup
   and delay, deployment disconnect/reconnect, and hosted object recovery. Local
   process restart and injected errors cannot prove regional failover.
3. **Consistency:** hosted concurrent duplicate commands, uncertain D1 responses,
   primary recovery reads, and replay/hash reconciliation. If replicas are later
   enabled, verify bookmarks with deliberately stale reads.
4. **Operations:** isolated GitHub staging build, selected routing/base path,
   backward-compatible deployment and rollback, coordinated D1/DO recovery,
   redacted logs, alert delivery, quotas, retention and deletion measurements.
5. **Security/product:** complete guest credential issuance, expiry/revocation,
   Origin/CSRF policy, seat authorization, abuse controls, disconnect bank and
   illustrative-clock replacement before admitting remote players.

**Reconsideration criteria (I):** keep the accepted stack if bounded commands,
canonical D1 writes, replay correctness, latency and cost fit measured targets.
Investigate query/index/retention changes first. A measured single-database
bottleneck or unavoidable transactions spanning a future partition may justify
partitioning or a new SQL-store ADR; do not quietly add PostgreSQL. R2 requires a
demonstrated blob/archive need; Queues require work whose completion can safely
lag canonical game acceptance; Containers require measured compute that cannot
remain in browser/Worker budgets. None solves the atomicity gap by merely being
added. Any replacement must preserve recorded ruleset/provenance, sequence,
random actions, ordered awards and terminal results with a migration/recovery
plan.
