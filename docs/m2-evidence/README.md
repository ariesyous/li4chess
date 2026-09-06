# M2 acceptance evidence

Measured and inspected 2026-09-06. Scope is local play; no networking, clocks,
accounts, deployment or playing-strength claim. [Acceptance inputs and thresholds](../m2-acceptance.md)
were fixed before implementation. [Draft PR #11](https://github.com/ariesyous/li4chess/pull/11)
contains the reviewed slices.

## Production difficulty and responsiveness

The original budgets are retained after calibration. A fresh production Worker
handles each request; completed iterations determine its evaluated choice. Search
can return early at its depth/node ceiling. A 400 ms pacing delay precedes CPU
turns; it is excluded from search/Worker measurements. Watchdog allowance is the
search time cap plus 2000 ms, including startup and communication.

| Level | Label | Depth ceiling | Nodes | Time cap | Desktop observed search maximum |
| --- | --- | --- | --- | --- | --- |
| 1 | Beginner | 1 | 128 | 50 ms | 26.0 ms |
| 2 | Casual | 2 | 512 | 100 ms | 100.2 ms |
| 3 | Thoughtful | 3 | 2048 | 250 ms | 250.2 ms |
| 4 | Challenging | 4 | 8192 | 500 ms | 500.7 ms |
| 5 | Patient | 5 | 32768 | 1000 ms | 1000.2 ms |

**214 searches, all legal; zero recovery/fallback/watchdog events.** Opening,
seeded 32-ply middlegame, tactical double-check and sparse endgame were measured
at all five levels on 1280 px desktop. Level 5 was additionally measured at
768 and 360 px. Each group has at least five fresh Workers. The fast endgame
needed 29/30/30 level-5 trials to obtain the input sample minimum. Exact inputs,
continuation seed, returned moves, node counts and completed depths are retained.
The largest search overrun across all groups was **0.7 ms**, below both declared
limits (p95 ≤ cap +100 ms; max ≤ cap +250 ms).

**360 native checkbox inputs during confirmed active search**, 30 for each of
four positions at each viewport, met the p95 <100 ms / max <250 ms thresholds.
The largest group p95 was **13.3 ms**; the overall maximum was **14.7 ms**.
This measures input-event timestamp to the next animation-frame callback,
including the React input handler. It is a rendering opportunity, not physical
input-to-display latency. Group Worker startup p95 was at most **11.1 ms**;
round-trip minus search overhead p95 was at most **11.4 ms**. Cold/fresh Worker
startup is included. Five-sample nearest-rank p95 equals that group's observed
maximum; these small samples describe this environment, not a population tail.

Environment: Windows 10.0.26200 x64, AMD Ryzen 5 5600X (12 logical CPUs),
34,269,650,944 bytes RAM, Node 24.18.0, pinned pnpm 10.33.0, Chromium 141.0.7390.37.
No CPU throttling; phone/tablet sizes are desktop browser emulation.
Production `Math.random` sampling was retained; chosen moves and the rules PRNG
seed/cursor are recorded. Deterministic node-only mode has separate unit coverage.

Source revision `386ca599bdf99f80a98f7bc6abcc8a59f48fa5f6` plus the saved test/harness
diff; dirty content fingerprint
`sha256:4f14da005fe66868ad6360054d4f77d012fc6ba7bfafe65a30b646cc9b769552`.
The measured production Worker hash is
`a08d3cea0a40ddcec609d9b69dc3c8211deb1a1b878d0c3336c221a73a238470`.
Source drift checks passed throughout the run. The later source-snapshot collector
fix only changes test provenance collection; game/search code is unchanged.

- [Environment and asset hashes](calibration/environment.json), [per-group metrics](calibration/summary.json).
- [Exact state-v2 fixtures and seeded continuation](calibration/positions.json).
- [Raw observations](calibration/raw.json.gz), [complete dirty-source snapshot](calibration/dirty-source.json.gz).

The first calibration attempt rejected an invalid fixture elimination timestamp
before measuring anything. The corrected run above used the unchanged strict
state-v2 reader. An initial subtree-only source snapshot was supplemented with
the complete frozen repository diff/untracked contents before any mutation;
the harness now collects from the repository root.

## Complete games, recovery and interface

| Flow | Evidence and result |
| --- | --- |
| Phone hotseat | Modern setup, 16 knight moves, repetition, four shared first places at 10 points; keyboard interaction, replay verification and exact terminal refresh/resume. |
| Tablet mixed human/CPU | Modern setup, 13 ordinary moves with actual CPU search, three deliberate human forfeits, two recorded walking-King moves, survivor awards +60; verified replay and exact terminal refresh/resume. |
| Desktop four CPUs | Uninterrupted production level-1 play from Modern setup, **465 plies**, 465 successful unique Worker requests, no errors/fallbacks; automatic 50-move ending. Yellow 126, Red 51, Blue 41, Green 37 points. All 543 replay events (465 moves, 77 awards, terminal) validate; refresh/resume preserves result and ledger. |

The controlled hotseat/mixed workflows are correctness tests, not tournaments.
The four-CPU run reached an actual engine result after about 3.6 minutes with
normal pacing; no observation cap was reclassified as a completed game.
Its source revision is also `386ca59`, with dirty fingerprint
`sha256:d9e614a69d6384def6539db8f90797b73cae2d345fccb778c367b67d6cab2298`.
The production Worker hash matches calibration. Original source is preserved.

- [Four-CPU replay](four-cpu/game.replay.json), [result capture](four-cpu/result-1280.png),
  [summary](four-cpu/summary.json), [resume check](four-cpu/resume.json).
- [Four-CPU environment](four-cpu/environment.json), [Worker observations](four-cpu/observations.json.gz),
  [producing source snapshot](four-cpu/dirty-source.json.gz).
- [Frame captures and manual observations](ui-inspection.md) include 360/768/1280,
  touch controls, rotations, long histories, visible focus and terminal results.
- [Completed phone hotseat result](complete/hotseat-360.png) and [replay](complete/hotseat-360.replay.json);
  [completed tablet mixed result](complete/mixed-768.png) and [replay](complete/mixed-768.replay.json).
  These two controlled UI checks use Vite development mode, whose replay producer
  explicitly labels the session unreproducible under HMR; the production run above
  carries the frozen asset/source identity. Every delivered replay was validated.

Browser regressions cover real active-Worker exit, reset, import, terminal action
and refresh; initialization failure, module crash and hung-Worker watchdog recovery;
termination/error-event fault injection after real production search has started;
duplicate/malformed/identity/message-error contracts; stale async resume/import;
strict local journals, unavailable/corrupt storage, producer lineage and interrupted
terminal effects. Keyboard setup, all orientations, selection/clearing, save/resume,
result focus, non-current check, score and active/walking elimination announcements
are covered. M1 rules, frozen classic and archived research remain unchanged.

Manual observations and actual captures use browser emulation and accessibility
trees. No physical-device, screen-reader or comprehensive WCAG audit is claimed.
Calculated contrast: body 12.32:1, current-seat text 11.44:1, muted text 7.19:1;
piece outline against dark squares 4.00:1. Phone board squares are dense (~24 px),
with browser zoom enabled; surrounding controls are at least 44 px high.

## Reproduce

Use Node 24 and pnpm 10.33.0. From the repository root:

```sh
pnpm build --force
# Set M2_OUTPUT to a fresh directory relative to apps/web, or allow a timestamped default.
pnpm --filter @li4chess/web exec playwright test --config playwright.evidence.config.ts
pnpm --filter @li4chess/web test:e2e
```

The evidence suite runs against Vite production preview on port 5185 and rejects
nonempty output directories and source drift. It keeps capped games unfinished.
Large JSON evidence is gzip-compressed; decode with Node's `gunzipSync` or a gzip
reader. Source snapshots contain the tracked Git diff and base64 untracked files
relative to the recorded revision. Do not replay this evidence under changed rules.

M2 is complete. Fresh lint, 602 unit tests, build and 46 browser tests passed;
independent reviews are resolved. [CI on final implementation e02a0ad](https://github.com/ariesyous/li4chess/actions/runs/34058335008)
passed. [Project state](../project-state.md) records the validation and the
documentation-only closeout, whose pushed-revision checks are verified again.
