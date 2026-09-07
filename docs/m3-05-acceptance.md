# M3-05 authenticated multiplayer acceptance plan

Declared 2026-09-07 before behavior changes. Scope is authenticated private-room
transport and the browser interruption flow against maintained GameRoom; stop
before M3-06's complete-game campaign. Branch `codex/m3-05-multiplayer-protocol`
starts at fetched `origin/main`, PR #15 merge
`1d12d4ba81330d65134b6b7d3afd2c76809fbc91`. Final M3-04 PR CI 34087298251 and
post-merge Pages 34126884525 are verified successful. Post-merge CI 34126885407
is still running at plan declaration; verify its conclusion before implementation.
Node is `C:/Program Files/nodejs/node.exe`, 24.18.0. Repository-local ignored
Corepack shims select pnpm 10.33.0; the host's default 11.19.0 is unsuitable.

## Identity and service authority

A maintained SQLite guest-service Durable Object serializes bounded guest,
private-lobby and authenticated connection operations. This deliberately small
local service is not a scalable public lobby. GameRoom remains the sole game
authority and D1 remains canonical. Authenticate credentials and authorize room
membership before obtaining/invoking a privileged GameRoom stub. No public body
may supply a principal, actor, seat credential, connection identity, session or
control generation. A seat-selection integer requests an available seat only.

Issue 32 cryptographically random credential bytes, store only their SHA-256
digest with stable principal, credential/session generation, absolute expiry and
revocation state. Cookie is host-only, HttpOnly, SameSite=Strict, Path=/, Secure
on HTTPS. Explicit loopback configuration alone permits the non-Secure development
cookie. No guest bearer credential in URLs, browser storage, response JSON or logs.
Expiration is absolute, with no silent extension on activity. Rotation advances
the session generation and invalidates the previous credential; logout revokes.
Lost rotation response requires deliberate new identity, never recovery by trusting
an old token. Reconnect authenticates again. Identity changes clear stale pending
intentions deliberately and explain loss of the old guest's room ownership.

Use exact configured Origin for all public POSTs and WebSocket handshakes; never
reflect arbitrary Host into an allowlist. Reject absent/null/foreign origins,
unexpected methods, query parameters, content types and protocol headers. POST
requires JSON and the version header; sockets require one fixed version subprotocol.
The browser's same-origin cookie authenticates the socket; a bounded first frame
within five seconds supplies the session-bound per-tab proof before room attach.
No ticket appears in its URL or subprotocol. No room data precedes that proof.
Bound handshake/body bytes and body read duration before invoking privileged APIs.
No CORS credential sharing. This is a CSRF design using exact origin, custom header,
JSON and SameSite together; SameSite alone is insufficient.

Credential expiry applies to existing connections, presence, publication and new
admission, including time spent queued. Trusted room contexts receive an absolute
lease; room checks at admission/publication and schedules expiry with its alarm.
Late alarm execution uses the recorded expiry for presence accounting. Service
revocation durably denies future requests before closing/detaching connections.
An in-flight accepted command may finish before revocation completes: canonical
prepared work is never discarded. No revoke success may imply rollback. Service
and room queues establish explicit ordering; infrastructure failures are ambiguous.

## Invitations, seats, readiness and creation

An invitation is a high-entropy permission to request membership, not an identity
or seat capability. Store its digest; carry invitation bytes only in explicit join
JSON, never in automatic URL logging. Room creation has a stable client request
ID bound to its authenticated principal; retries recover the same lobby and invite
result without allocating a new game. Bound lifetime membership to four guests,
one seat per guest. Atomic seat requests arbitrate concurrency and clear readiness
on seat changes. Ready requires a seat. Freeze all four principal grants and one
exact game/header/owner/producer/seed/policy intent when all four seats are ready,
before calling GameRoom.create. While creating/started, membership and seats are
immutable. Uncertain creation retries the frozen intent, never rerolls randomness.

Local configuration must explicitly supply initial and increment durations. They
are development controls, not launch policy. No launch time control, public rate
limit/retention policy, operating plan, region, budget or load target is selected.

## Public wire and connection control

Publish versioned exact-key runtime schemas for requests, receipts, complete
snapshots, errors and controls in a browser-safe shared protocol module. Bound
requests to 4 KiB, snapshots to a documented ceiling compatible with maintained
state bounds, safe integer sequences and bounded opaque IDs. Reject unknown
versions/fields, reserved server IDs, malformed moves and server actions before
forwarding. Public intentions are move(from,to), resign and claimWin; adapter
adds authenticated actor. Preserve legal out-of-turn resign/Claim Win.

Server issues high-entropy per-tab connection proofs (digest stored), carried in
an HTTP header and retained only in the owning tab's sessionStorage. This secondary
proof cannot replace the HttpOnly guest cookie and is never broadcast to other tabs.
Server binds them to authenticated principal,
room, session generation and room control generation. Body tab labels and connection
IDs cannot grant authority. First connection controls;
additional tabs observe and count presence. Explicit takeover persists its intent,
advances generation once and reconciles uncertain completion against room-owned
control status and an exact persisted takeover request ID. Old tabs visibly
observe and cannot command or retrieve old-generation receipts. No automatic
observer promotion. Reattach the authenticated server record after refresh when
valid; stale socket callbacks must match the actual transport instance.

Canonical command IDs and their original expected sequence/action/generation
survive retries, later commands and terminal completion. Conflicting reuse rejects.
Receipts contain original command hash, sequence, event range, state/commit hashes
and admission timestamp. A sent request with lost response is unresolved, not
rejected. Retain the exact ID/intention; never generate a replacement ID to retry.
After takeover, do not re-author an unresolved old-generation intention under a
new generation. Explain the boundary and require deliberate resolution/cleanup.

Preserve SQLite prepare -> exact D1 commit/reconciliation -> local finalize ->
durable activation -> publication. No speculative state, duplicate reducer,
random reroll, weakened namespace/owner fence or silent producer substitution.
Keep state-v2/replay-v2 and command-v1/v2 readers. No released migration changes;
new service SQLite class uses an additive local DO migration.

## Browser behavior

Keep local hotseat/CPU setup and game intact. Explicit local multiplayer
configuration adds private create/join, seat/ready and online board using the
existing accessible board. Show connecting, connected, unavailable/recovering,
expired/revoked and terminal states, own seat and observer/controller status.
Make takeover deliberate and visible. Persist one bounded pending command per
tab/identity/room before sending; refresh/reconnect retains it. Storage failures
must be visible before claiming refresh-safe retry behavior.

Reauthenticate then attach and resync on reconnect. Apply validated snapshots
monotonically by command boundary plus operational revision; verify same-sequence
hashes, ignore duplicates and older states, resync gaps/conflicts. Full resync may
jump forward. An old receipt confirms its command without replacing a newer board.
Immediately invalidate callbacks and recover on resyncRequired; never wait for
TCP close. Bound backoff and ensure late callbacks cannot close replacement sockets.
Terminal disables new intentions but permits exact pending receipt resolution.

Display authoritative stored clocks, deadlines, disconnect banks, presence and
suspension/resume markers. Estimate a server offset for cosmetic countdown only;
client time never admits commands, declares forfeits or changes canonical results.

## Required evidence and completion

Actual Wrangler/workerd SQLite DO + isolated local D1 on Windows and Linux CI:
guest issuance/digest/expiry/revocation/rotation; invitation versus seat ownership;
concurrent seat/ready; wrong principal/seat/room; origin/version/field/size rejection;
multiple tabs, takeover and late callbacks; exact/conflicting/stale commands;
lost responses and stable creation; refresh/reconnect/resync ordering; persistence
suspension/recovery and terminal immutability. Independent authenticated Playwright
contexts must prove four-client consistency and the implemented interruption flow.
Use real production paths plus separately isolated test adapters for fault/time
injection. No administrative/test credential routes in deployable entry points.
Retain room/persistence/architecture/local-play regression suites.

Run frozen install, lint including changed tools/tests, units, build, web E2E,
architecture/persistence/GameRoom integrations, Workers build/checks/check:room,
Workers runtime and new multiplayer runtime/browser checks. No assertion retries
or weakened tests. Fresh evidence directories record exact source revision/digest,
tools, configs, commands, raw results, failures and limitations. Reuse verifiable
Git source identity or source deltas rather than duplicating archived binaries.
Own hidden subprocesses, isolate databases/ports, verify readiness/build identity,
and await owned-process/port cleanup on success, failure and cancellation.

Fresh independent substantive and final reviewers cover security, retries,
cross-store consistency, fairness, browser races, provenance, deployment isolation
and evidence. Resolve substantive findings, commit reviewed slices under configured
human identity, push dedicated branch and create a draft PR to main. Verify passing
CI for exact final pushed revision. Update README/roadmap/project state and write
M3-06 handoff; mark only M3-05 complete once evidence meets these criteria.

Default Pages and existing Workers deployment stay unchanged. Multiplayer runs
only through explicit local configuration. No hosted resources, accounts, secrets,
deployments, purchases, matchmaking, ratings, online CPUs or M3-06 implementation.
Hosted TLS/cookie behavior, quotas, geographic latency, deployment interruption,
hibernation/eviction, alarm delivery, failover, coordinated restore, observability
and rollout/rollback remain separately authorized gates.

## Current official sources

Reviewed 2026-09-07: browser WebSocket constructor accepts URL and subprotocols,
not custom Authorization headers; cookies avoid URL credentials.
[MDN WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket).
HttpOnly restricts script access, Secure restricts transport, and SameSite controls
cross-site sending; deployment must preserve host-only scope and HTTPS.
[MDN Set-Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie).
Cloudflare supports Web Standard and hibernation socket APIs. The maintained
standard-socket bridge preserves current lifecycle semantics; local evidence must
not claim hosted hibernation behavior.
[Cloudflare WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).
One at-least-once alarm per object requires combined scheduling and persisted
deadlines; application rearming handles extended recovery.
[Cloudflare alarms](https://developers.cloudflare.com/durable-objects/api/alarms/).
