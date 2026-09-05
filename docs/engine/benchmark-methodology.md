# Performance methodology

```sh
pnpm --filter @li4chess/arena bench arena-results/bench-example
pnpm --filter @li4chess/arena experiments arena-results/ablation-example bench
pnpm --filter @li4chess/arena exec vite-node src/classic-bench.ts arena-results/classic-example
pnpm --filter @li4chess/arena exec node --cpu-prof --cpu-prof-dir=arena-results --cpu-prof-name=baseline.cpuprofile node_modules/vite-node/vite-node.mjs src/bench.ts arena-results/profile-example
```

Run timings serially on an idle machine, repeat across Node and browser/device
versions, and retain all trials. The classic command runs the unchanged baseline
in isolated processes with a 30-second external watchdog (optional second argument
in ms). Process timeouts include module startup. The initial spike measurement
predated this watchdog: level 4 completed and level 5 was externally stopped;
both are retained. Timed-out searches are not reported as completed search times.

`bench` measures legal generation, full `applyMove`, board-only application,
structured cloning, repetition key creation, check detection, full evaluation
and frozen level-1 move latency. Five measured trials follow one warmup per
operation. It also runs three searches per position with max depth 3, 300 nodes
and 500 ms, recording reached depth and nodes/s. These are search entry counts,
not perft nodes and not all oracle-internal operations. The instrumentation's
legalMoves/moveGenerations count explicit search calls only; `applyMove`'s internal
legality/elimination work is additional and is captured by wall time/profiling.
Leaves count static evaluations (including quiescence stand-pat evaluations).

The ablation command runs each variant at depth 3 / 500 nodes with no time cap.
Thus equal nodes do **not** imply equal elapsed compute: Max^n evaluates four
components and quiescence may generate tactical lists at leaves. Report both.
No neural inference, WASM, Rust, remote compute or network telemetry is used.
`process.memoryUsage` includes Node/Vite loader overhead; it is not exact engine
memory accounting. TT capacity limits entry count but signatures grow with game
history. Production limits need long-game memory profiling.

The initial corpus includes the true opening plus synthetic low-material
promotion, capture, poisoned capture, multiple-check, mate, two-king and
king-escape positions. Its `middlegame` tag denotes tactical material interaction,
not a representative 64-piece played middlegame. Opening tournament histories
provide real developed positions, but a stratified middlegame performance corpus
remains next work. These short microbenchmarks and synthetic positions do not
justify a language rewrite or a general performance ratio.

CPU profiles include module loading and JIT. Summaries should separate engine/bot
source self-samples from loader/Node work; do not sum inclusive parent/child time.
Board-copy microtimings below timer precision are order-of-magnitude indicators.
The immutable engine remains the oracle; no make/unmake representation was added,
so cross-implementation differential testing is not claimed. Hash delta parity
is a separate invariant and is covered by tests.

Next performance experiment: preserve the oracle, implement a separate
square-centric attack query/piece-list cache, compare all attackers/checks over
seeded legal histories, then measure legal generation and whole move latency.
For 160 squares, use piece lists plus occupancy arrays first; compare a 256-bit
logical occupancy split across Uint32 words only after profiling. BigInt or a
single 64-bit chess board is not an assumed optimization. Only then consider
make/unmake and a Rust/WASM implementation with per-move/state differential gates.
