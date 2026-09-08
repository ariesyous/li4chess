# Authoritative GameRoom

Maintained internal SQLite Durable Object state machine, separate from the
architecture spike. D1 remains canonical through `@li4chess/persistence`.
See the [acceptance contract](../../docs/m3-04-acceptance.md). The maintained GuestService adds authenticated private transport under an explicit
local Worker entry; see the [wire contract](../../docs/multiplayer-v1.md). GameRoom
remains binding-only. No account-owned binding or automatic deployment activation.

## Internal service contract

`GameRoom` exports binding-only methods. The GuestService holding that binding
must authenticate credentials and authorize game membership before calling them.
Principal/seat/generation bytes are records of that authentication, never proof.
The room additionally checks immutable game/object/namespace identity, persisted
seat grants and designated controller, and the current canonical owner generation.
The shipped application's fetch router does not call any room method.

- `create({header, owner, seats, policy})` persists stable creation intent and
  reconciles uncertain creation using the same game ID, header and seed. Creation
  policy has explicit `initialMs`, `incrementMs`, `increment: "after-move"`; no
  launch time control is selected. Supply an actual build producer and validated
  Modern replay or explicit source-linked checkpoint, never a rewritten producer.
- `attach(context)` receives an already authenticated service context and returns
  a room-owned output WebSocket. Context has gameId, principal, seat, connectionId,
  generation. First connection controls a seat; later connections observe. All
  valid connections count as presence. Unsolicited incoming gameplay frames close.
- `command(context, {id, expectedCommand, action})` permits only own-seat move,
  resignation and Claim Win. Server IDs beginning `server:` are reserved. Exact
  retries return original receipt/admission, including after terminal completion;
  changed content/actor/generation rejects before disclosure. Other canonical
  actions originate only from the room's persisted deadlines and walking schedule.
- `takeControl(context, nextGeneration)` is an explicit trusted-service takeover
  by an attached seat connection. Generation advances by one, that connection
  becomes controller, and its next requests carry the new generation. Older
  connections retain observation but cannot command or claim old receipts.
- `read(context, expectedCommand)` provides a complete committed snapshot with
  operational timing. Future sequences reject. A receipt may refer to an older
  sequence; M3-05 must not roll back the displayed board to that receipt.

`Room` is the same state machine with storage/canonical/clock/connection ports,
allowing isolated tests to instrument dependencies without production fault hooks.
All operations share a bounded queue spanning external awaits. A coalesced reserved
alarm slot prevents ordinary queue saturation from exhausting recovery wakeups.
Ordinary queue cap is 16 and total connections are capped at eight. These are
implementation ceilings, not hosted throughput or spectator capacities.

The persistence adapter's per-call query ceiling is not a whole-room invocation
ceiling: room authorization, receipt lookup, reconciliation and publication make
several fenced calls. Worst-case room work may exceed the Free plan's 50-query
allowance even though it remains bounded. Verify aggregate query/CPU budgets and
the chosen operating plan before hosted activation; no plan is selected here.

## Persistence and timing

SQLite `room_records` holds separate bounded identity, complete prepare, cache,
canonical marker, timing/hash, controller IDs and incident records. A storage
transaction includes SQL changes and the alarm; default output gates are retained
and writes synchronize before downstream work. Each encoded row is at most
1,100,000 bytes. Persistence also applies its stricter action/state/prepare bounds.

Admission uses one authoritative timestamp after authorization, receipt lookup,
deadline and engine checks. Debit and full prepared action are stored atomically.
The v2 command receipt commits a strict admission timing snapshot; state-v2 and
replay-v2 are unchanged. D1 commit proof precedes atomic cache/marker finalize and
prepare deletion, then separate durable activation, then publication/success.
No infrastructure failure converts into a chess result. Oversized preparation
suspends with a capacity incident before canonical writes.

Every active disconnected seat has one cumulative 60,000 ms bank regardless of
tab count. Main clocks and banks freeze while persistence is unresolved. The
earliest persisted deadline wins, with timeout before disconnect at a tie and
Red/Blue/Yellow/Green ordering. Walking work runs on its normal engine turn through
the same prepare/commit path. Late alarm arrival is never the expiry timestamp.
Server wall time is clamped against durable timing floors if it moves backwards.

Cold recovery freezes at the last durably accounted balances, verifies their hash,
canonical marker and pending debit/increment commitments, and reconstructs at most
the persistence checkpoint suffix. It never rerolls actions or reconstructs missing
timing from D1. Disconnected infrastructure intervals are not charged. A valid
same-prefix clock rollback with no independent newer operational marker cannot be
detected from canonical D1 alone; coordinated restore must preserve those markers.
Missing/malformed timing or divergent prefixes stop with an operator incident.
No clear-incident, destructive restore or automatic ownership-transfer API exists.

Recovery retries use durable capped exponential backoff from one to 60 seconds,
one canonical attempt/action per alarm invocation, indefinitely beyond platform
retries. Rejected traffic cannot extend recovery backoff. The last resolved incident
retains reason, first occurrence, attempts and resume revision/time. Terminal games
stop automatic work permanently. Connection delivery remains best effort; ambiguous
failures send `resyncRequired` and require reauthentication/resync with the same ID.

## Local validation and future activation

Completed-private replay reads use a separate binding-only `completedReplay`
operation and `completedStatus` preflight. They authenticate server-derived member
identity and verify both stores without boot/recovery, control acquisition, clock
accounting, writes or incident clearance. Disposable per-principal continuations
hold one audited page; [wire limits](../../docs/multiplayer-v1.md#completed-private-replay-retrieval-m3-07)
define expiry, restarts and the explicit 32 MB artifact ceiling. Historical completed
games can render/export under a compatible reader without relabeling their producer.

Terminal publication now prunes closed channels and republishes corrected presence
in a loop bounded by the eight-connection ceiling. A closed sibling tab during
rotation cannot suspend an immutable completed game. Canonical history, result,
controls, accounted time and clock/bank balances remain unchanged; active-game
ambiguous publication recovery and persistence errors retain their existing behavior.

From the root with Node 24 and pnpm 10.33.0:

```sh
pnpm --filter @li4chess/game-room test
pnpm --filter @li4chess/game-room test:integration
pnpm build:workers
pnpm --filter @li4chess/worker check:room
```

Integration uses actual local Wrangler/workerd and D1, fixture-only credentials,
injected time/durable interruption adapters, real delivered alarms and whole-runtime
restarts. Fresh evidence is written under `arena-results`; `M3_04_OUTPUT` may select
an unused absolute directory. Source fingerprint drift fails acceptance. Test
credentials, fake-time, administrative SQL and crash hooks occur only under `test/`.

`apps/worker/wrangler.room.local.jsonc` explicitly registers the maintained class
against a placeholder local D1 binding. The existing default Worker configuration
and Pages behavior are unchanged. `check:room` bundles it locally, verifies actual
build identity and checks that fixture identifiers are absent. Future hosted
activation needs separately authorized real namespace/database/environment choices,
migrations, compatible active-game producer handling and deployment/restore drills.
Local restart/alarms do not prove hosted latency, capacity, hibernation/eviction,
regional failover, alarm punctuality or availability of a selected launch clock.
