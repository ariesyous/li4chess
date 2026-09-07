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
