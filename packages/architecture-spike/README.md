# M3-01 local architecture probe

Isolated Workers Static Assets → HTTP Worker → SQLite GameRoom → local D1
prototype. It does not enable networked play in the shipped app. See the
[acceptance plan](../../docs/m3-01-acceptance.md) and
[ADR](../../docs/m3-01-adr.md) for the consistency contract and later gates.

From the repository root, with Node 24 and pnpm 10.33.0:

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm --filter @li4chess/architecture-spike test
pnpm --filter @li4chess/architecture-spike test:integration
```

Integration requires free port 8799 and uses no Cloudflare credentials. It starts
local Wrangler/workerd, stages the existing Vite build under `/li4chess/`, creates
fixture-only capabilities, and exercises HTTP commands and real WebSockets. It
kills only its own runtime process tree at deliberate boundaries, restarts with
the same persistence directory, independently validates replays, and stops the
runtime on completion. Do not edit source during evidence collection.

By default evidence goes to a fresh timestamped `arena-results/m3-01-*` directory.
Set `M3_OUTPUT` to an unused absolute path to select another. Existing directories
reject. A run retains source, build/environment identity, staged asset hashes,
configuration with the key redacted, exact observations, replays and runtime log.
Generated credential-bearing config remains in ignored `.generated`; do not
publish it or runtime SQLite files. CI uploads only explicitly selected redacted
artifacts. Logs do not replace canonical D1 history.

Faults are deliberate application injections: before/after prepare, failing D1
batch, a 500 ms delay before D1, after D1, and after local finalize. The subsequent
whole-runtime termination is real; it occurs at a known completed write boundary,
not while the OS is flushing a disk write. This is not a power-loss, regional
failover or hosted durability test. The `.generated` configuration supplies
fixture keys and actual producer identity; the checked-in config intentionally
has no real credentials or deploy command.

The bounded full-replay snapshots trade efficiency for auditability. They are
limited to 64 actions and 1 MB each. Input, queue and socket caps are probe bounds;
guest issuance, live clocks/alarms, production schema migrations and full online
UI remain later M3 slices. Existing engine/protocol APIs, local saves and CPU
Workers remain unchanged.
