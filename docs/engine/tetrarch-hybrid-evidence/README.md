# Hybrid evidence, 2026-09-09

Read the [report](../tetrarch-hybrid-report.md) and
[predeclared plan](../tetrarch-hybrid-plan.md) before interpreting results.

- `campaign/`: clean implementation commit `275f07da753b71227ff935b5bd0fb345a69a9240`,
  16 mixed games and four native controls; seeds 1–4, eight opening plies,
  400 measured plies maximum. All 20 replay-verified before saving and aggregation.
  `run.json` records the exact source fingerprint, runtime/hardware, budgets and
  WASM/glue/parameter/network hashes. The committed source is reproducible;
  wall-time-bounded native search and measured timings are nondeterministic.
- `smoke/`: separate dirty development fingerprint; four mixed games and one
  control, seed 1, 16-ply cap. Pipeline evidence only, not pooled with campaign.
- `validation/`: fresh local lint, test, build and real-worker smoke logs;
  main campaign console log; CI metadata and full log for implementation commit
  `275f07d`. Local lint/tests/build preceded the implementation commit; the final
  README/roadmap additions are documentation only. CI validates that exact commit
  with frozen install, lint, 755 unit tests, build and 53 Playwright tests.
- `manifest.json`: SHA-256 and byte length for every other file in this directory.
  `.gitattributes` preserves these measurement bytes across checkouts.

No C/upstream search behavior, canonical engine or native bot change is hidden
inside this comparison. Historical initial-spike evidence remains separate.
Generated WASM files remain ignored and are reproducible using the
[package build instructions](../../../packages/tetrarch-engine/README.md).

Revalidate saved canonical records from the repository root:

```sh
corepack pnpm --filter @li4chess/arena report ../../docs/engine/tetrarch-hybrid-evidence/campaign/mixed.jsonl.gz
corepack pnpm --filter @li4chess/arena report ../../docs/engine/tetrarch-hybrid-evidence/campaign/controls.jsonl.gz
```
