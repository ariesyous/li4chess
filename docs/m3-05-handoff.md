# M3-04 room authority to M3-05 transport handoff

Implementation contract, 2026-09-07. M3-04 acceptance status and fresh validation
are recorded in [project state](project-state.md); this document does not imply
that public multiplayer or hosted services are activated.

## First M3-05 slice

Implement an authenticated service adapter and strict public command/receipt/resync
protocol against the maintained [GameRoom](../packages/game-room/README.md).
Keep the engine and persistence state machine shared. Begin with one private room
and four explicit authenticated seats, then test reconnect and ambiguous receipts
before building lobby/room UI. Guest credential issuance/expiry/revocation and
public WebSocket authentication are M3-05 work; fixture credentials are unsuitable.
No account features, ratings, matchmaking or shared online CPUs are implied.

The service must verify credentials before obtaining or invoking a DO stub. Its
binding is privileged: caller principal/seat fields received through HTTP are not
credentials. Bind authenticated identity to game membership and an authorized seat;
never forward a body-provided `Caller`. Own-seat move/resign/claim are the only
player commands. Clock, disconnect and seeded walking actions belong to the room.
Creation has stable game ID/seed/header/owner/policy and four immutable principal
grants; uncertain creation retries the exact intent. Time controls are explicit
configuration, with launch queue controls still unselected.

## Connections and control

Connection context carries gameId, principal, seat, opaque connectionId and current
control generation. First attached connection controls a seat; additional tabs
observe and count toward that seat's presence. An explicit `takeControl` advances
generation and binds control to the requesting attached connection. Older tabs
cannot command or claim receipts under old generations. Disconnecting the controller
does not silently promote observers. Persist/reuse a connection ID only through the
authenticated service policy; after cold recovery reattach that ID or explicitly
take control. The public protocol must make takeover visible and deterministic.

Room owns membership, publication and close/presence transitions in its serialized
queue. `GameRoom.attach` currently offers an internal output WebSocket; incoming
gameplay frames reject. Choose and validate public cookie/ticket/subprotocol/origin
rules in M3-05. No credentials in URLs or logs. Credentials, ticket lifecycle and
revocation remain the service's responsibilities; define how revocation calls close
or takeover without discarding pending canonical work.

## Commands, receipts and reconnect

Commands contain a bounded opaque ID, expected command sequence and minimal action.
The `server:` ID prefix is reserved. Engine position/event sequence is distinct from
command sequence. The room first checks authorized current control, reconciles any
pending work, verifies current canonical owner, and looks up exact retries before
stale/terminal rejection. A matching retry returns original receipt and admittedAt;
same ID with changed action/expected sequence/principal/generation conflicts.

Receipt fields are id, commandHash, sequence, firstEvent, lastEvent, stateHash and
commitHash. Treat receipts as confirmations of one canonical command, not automatic
instructions to replace a newer displayed board. Resync snapshots contain the
complete committed boundary and operational timing. Reject future sequences;
monotonically apply command sequence/hash, tolerate exact duplicate publication,
and resync on gaps/conflicts. Version and strictly validate every public envelope;
the internal TypeScript DTO is not a public validated network protocol.

A transport error after sending a command is ambiguous. Retain that exact ID and
intention until retry/resync determines its outcome. Never invent a new ID merely
because the connection closed. `resyncRequired` contains no speculative state and
requires immediate reconnect/resync rather than waiting for a TCP close handshake.
When persistence is unresolved the room withholds state/success and freezes timing;
display a clear unavailable/recovering state without guessing a winner or timeout.

## Timing visibility and recovery

Snapshots expose stored balances, active seat, activation/deadline, accounted time,
operational revision, policy and suspend/resume markers. Render countdowns from
server deadlines with a client offset estimate; client time is never admission
authority. Increment is once after a legal ordinary move; rejects and retries do
not pause/replenish clocks. Every active disconnected seat has a cumulative 60-second
bank independent of tab count. Earliest deadline wins; equal deadlines use timeout,
then disconnect, then seat order. Walking work and awards remain engine actions.

Operational clocks remain in DO SQLite. Command-v2 records a strict admission
timing snapshot committed by its receipt; v1 records remain readable without timing.
Latest checkpoint command anchors carry these commitments without adding fields to
state-v2/replay-v2. The room cannot recover missing operational timing from D1 alone.
Cold reconstruction deliberately freezes unaccounted infrastructure time from the
last durable balances, records a recovery incident and rebases after proof. A
same-prefix operational rollback needs independently preserved newer operational
markers to detect; preserve DO timing/prepare and canonical markers during restore.
Missing timing or divergent prefixes require operator recovery; there is no public
clear-incident or automatic owner takeover route.

## Producer and deployment gates

Use the actual immutable build producer. A different producer cannot append under
an existing identity. Drain games on their original compatible deployment or use an
explicit verified checkpoint with source replay hash and newly authorized game
identity/policy; do not silently fork live games. Explicit v1-only record policies
reject v2. Released D1 migrations remain unchanged. Review readers and active-game
drain/forward-fix strategy before enabling any incompatible writer.

The application has only an explicit local room config; default Workers/Pages
behavior remains intact. Hosted activation requires separate authorization for
account-owned staging/production D1 and DO bindings, service permissions, migrations,
region/data policy, operating plan, load target and budget. Before launch prove
real deployment interruption, hibernation/eviction clock availability, alarm delays,
regional latency/failover, overload, coordinated backup/restore, rollback and
observability. Local workerd tests do not establish these guarantees. M3-06 owns
complete four-browser online scenarios and separately authorized hosted evidence.
