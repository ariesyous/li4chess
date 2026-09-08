# Authenticated multiplayer wire v1

Implemented for explicit local private rooms, 2026-09-07. The exhaustive runtime
contract is [multiplayer.ts](../packages/protocol/src/multiplayer.ts). All envelopes
have `version: "li4chess-online-v1"`; unknown fields/versions reject. POST
`/api/online` requires exact configured Origin, JSON Content-Type, the
`X-Li4chess-Protocol` version header and the guest cookie (except `issue`).
No query strings or CORS credential sharing are accepted.

| Request type | Additional fields | Authority |
| --- | --- | --- |
| issue | none | deliberate issuance when no valid guest cookie exists |
| session, rotate, revoke | none | authenticated current guest |
| create | id | stable principal-bound lobby creation |
| join | invitation | request membership only |
| lobby, connection | room | existing member; connection also requires assigned seat |
| seat | room, seat (0..3) | request an available seat while waiting |
| ready | room, ready (boolean) | seated member; all four freeze creation |
| command | room, id, expectedCommand, action | current authenticated tab controller |
| takeControl | room, id | attached tab with explicit stable takeover intention |
| resync | room, expectedCommand | attached member tab, including observer |
| retire | room | authenticated tab proof; deliberate connection cleanup |
| replay | room, cursor (null or 64 lowercase hex characters) | current guest and existing room member; no tab proof or seat control |
| replayStatus | room | same member authority; read-only producer preflight before socket attachment |

Command action is `{type:"move",from:17,to:31}`, `{type:"resign"}` or
`{type:"claimWin"}`. Actor, principal, connection ID and generation are derived
by the service. Engine legality is authoritative. Resign and Claim Win retain
their legal out-of-turn behavior; timeout/disconnect/walking remain server-only.
Commands retain their original ID, sequence, action and admission facts across
uncertainty. `server:` IDs are reserved. Input maximum is 4096 UTF-8 bytes; IDs
are 1..128 ASCII letters/digits/`_.:-`; command expected sequence is 0..2047.
The maintained canonical history cap remains 2048 commands.

`connection` returns a random 64-hex tab proof and control information. The proof
goes in `X-Li4chess-Connection` for command/resync/takeControl/retire, and only in
the owning document's sessionStorage. It is insufficient without the HttpOnly
guest cookie. WebSocket `/api/online` requires the fixed version subprotocol and
cookie. Its first frame is exactly
`{version:"li4chess-online-v1",type:"attach",room:"room:…",proof:"…"}`,
at most 512 UTF-8 bytes within five seconds. Later input frames close the socket.
No guest token or proof appears in URL/subprotocol/logs.

Responses are session, revoked, lobby, created, connection, control, snapshot,
suspended, receipt, error and resyncRequired. The schema lists exact keys and
validates nested timing/state/build identities; snapshots verify canonical state
hashes and completed-effect boundaries, maximum 600000 bytes. Public snapshots
include game/command/event/chain identity, state-v2, producer/source lineage,
server time and operational clock revision. Receipt contains original command ID,
hash, command/event ranges, state/commit hash and original admittedAt. Receipts
never replace the displayed board. State-v2/replay-v2 and command-v1/v2 remain
unchanged; no released D1 migration was rewritten.

The browser also displays the stable unresolved takeover ID, retries that same
intention after refresh, and asks before leaving abandons its recovery. Storage
failure prevents sending an unsaved takeover; failed acknowledgement cleanup
retains the original ID. These are browser recovery fixes, not a wire revision.

Errors contain only code and ambiguous. Codes are invalid, unauthorized, expired,
revoked, conflict, stale, terminal, unavailable, capacity and origin. An unavailable
or lost transport outcome may conceal a committed command; retain the exact ID.
Expired/revoked identities stop reconnect. Old-generation pending commands are not
sent under a new generation. Deliberate cleanup does not undo canonical work.

Snapshots apply monotonically by command/hash and timing revision. Gaps/conflicts
trigger full resync; resyncRequired starts recovery immediately. A suspension
notification is anchored to the last finalized command/hash and freezes displayed
balances without exposing a prepared successor or increment. Countdown uses
monotonic browser elapsed time from server timing only as an estimate. It cannot
admit commands or establish timeout. See the [acceptance contract](m3-05-acceptance.md)
for lifecycle, origin/security choices and bounded deployment scope.

## Completed private replay retrieval (M3-07)

`replay` starts with `cursor:null`. The response is `{version,type:"replay",page}`;
page has exactly `room,principal,generation,head,command,header,events,next`.
`head` is the immutable terminal command/event/stateHash/chainHash. The first
page contains the exact zero-event creation replay-v2 in `header`, no events,
and command zero. Subsequent pages have null header and the exact complete stored
events of one command. Null `next` means the final command has been audited and
the reconstructed state/head matches canonical D1 and the room's terminal state.
Opening aborts are valid terminal artifacts; unfinished games are not exportable.

Each page authenticates the HttpOnly credential and existing lobby membership;
GameRoom repeats immutable seat membership, object/namespace, owner/header/head,
cache/marker/timing integrity and incident checks. These are reads only. No
connection, invitation or controller proof is required. The guest service rechecks
credential validity after awaited work and response validation. Rotation retains
the principal but invalidates old credentials and cursors. The new valid session
can start again without attaching or taking control. Expiry/revocation cannot be
undone by issuing a new principal. There is no public replay URL or history list.

`replayStatus` returns principal/generation plus `snapshot:null,seat:null` for the
current producer. Existing socket behavior follows unchanged. For an older
producer it returns a validated terminal snapshot and member seat through the
read-only compatibility path. The browser checks this before even reusing a saved
proof, renders replay-only observation, and preserves unresolved intentions until
deliberate Leave. It does not attach, retire, take over or invoke writer recovery.
Older active/incompatible/divergent rooms remain explicitly unavailable. Writer
producer guards reject before modifying operational storage under a different
producer; this does not authorize old-producer writes or active-game migration.

### Bounds and retries

- Existing 4,096-byte requests and 600,000-byte responses remain unchanged. Creation
  headers/states are at most 512,000 bytes; one command has at most 32 events of
  at most 16,000 bytes each. Genesis audit uses one command per HTTP invocation.
- Existing admission supports at most 2,048 commands. A download therefore uses
  at most 2,049 replay requests, plus a final credential check in the browser.
- The canonical replay artifact is limited to **32,000,000 UTF-8 bytes**, including
  the terminal result and exact comma overhead. Shared server/browser accounting
  enforces this bound. This is an explicit export ceiling, narrower than the
  theoretical product of persistence's independent limits (over 1 GB of events).
  Larger histories remain stored but return `replayLimit`; they never truncate or
  silently export a final checkpoint instead. This is not a long-game capacity claim.
- A room retains at most four disposable audit continuations, one per principal,
  each for ten minutes from start. Each holds verified current/terminal boundaries
  and only the last response, never a complete artifact. A new start for the same
  principal replaces its earlier continuation, including one in another tab.
  Existing guest/room queue limits still apply. No durable export history is added.
- Repeating the last cursor returns the identical page while both stores and the
  credential remain valid. Restart, expiry, a new same-principal start or changed
  session can require `replayRestart`. Retry the download from the beginning.
  No partial file is offered, and every callback is fenced by room/session and
  component lifetime. Leaving cancels before network cleanup is awaited.

### Typed failures and compatibility

`replayIncomplete` means no terminal game; `replayMissing` means a required room or
game record is absent; `replayIncompatible` means unsupported database/replay schema
or reader producer; `replayIntegrity` means corrupt/divergent/quarantined history
(including missing committed effects/result anchors); `replayRestart` means an
unavailable continuation; `replayLimit` means the aggregate artifact ceiling.
`unavailable` means transient persistence failure or unresolved operational
suspension/incident. Existing authentication, origin, invalid and capacity errors
remain. Reads never mutate or clear incidents. Failed retrieval is safely retryable
and is not an ambiguous game command.

The historical reader accepts reproducible build identities only for the maintained
standard-v1/state-v2/replay-v2 contract, validates the exact creation and every
recorded action/effect through the current reducer, and preserves the original
producer. Incompatible concrete history fails; accepting a build-shaped object
alone is not proof of compatible history. Source replay digest, initial checkpoint,
random algorithm/seed/cursor/draw/candidate facts and terminal placements survive.
Command-v1/v2, replay-v2, state-v2 and released SQL migrations are unchanged. The
online-v1 additions do not alter old request meanings; paired client/server builds
are required for the new operations.

The browser validates the final artifact through the existing replay-v2 reader,
compares it with the displayed terminal state/hash/producer/source identity, then
checks its current credential again before downloading. Local import retains its
existing semantics: a new checkpoint under the local producing build links to the
downloaded replay's canonical digest. The original downloaded producer is not
rewritten. [Acceptance and evidence inventory](m3-07-acceptance.md).
