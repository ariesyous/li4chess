# UI1 evidence — 2026-09-08

UI1 is complete within the [bounded brief](../ui-sprint-lichess.md). The result
retains the React cross-board renderer and four directional seats, with a warm
continuous board, outlined Cburnett pieces, flat light surfaces, compact controls,
seat-colored history/result rows and source/credits links. No rules, search,
CPU budgets, persistence, replay protocol or hosted configuration changed.

## Code and environment

Baseline code: `c5e74f495dd95a9d2a6069445286da246c0a81f4`. The seven pending
D14 scope documents were preserved separately as
`6ef04256db56dee9d9fbc013be91e34d46fecb4b` on `codex/ui1-lichess-refresh`.
Before captures use that unchanged UI and the initial capture driver.
Final validation uses that base plus this UI1 implementation; the tested tree was
dirty. The [manifest](manifest.json) records its exact fingerprint, Windows
environment and SHA-256 hashes for the UI source, capture tests, multiplayer test
and piece sources. Raw hashes describe Windows working-tree bytes; normalized
hashes also allow comparison across Git line-ending conversion. Later evidence
and documentation edits are not presented as part of the runtime fingerprint.

Node **24.18.0**, Corepack pnpm **10.33.0**, Playwright **1.56.1**, Chromium on
Windows. The global pnpm 11 wrapper was not used for the top-level commands.
Phone/tablet input is desktop Chromium touch emulation. No physical-device,
screen-reader, Safari/Firefox, remote CI or live Pages verification is claimed.

## Visual review

Inspected current [Lichess analysis](https://lichess.org/analysis) and
[Lichess TV](https://lichess.org/tv) desktop/mobile screens. Observed a dominant
tan board, crisp outlined pieces, restrained surfaces, compact controls and a
history beside the desktop board that moves below it on mobile. li4chess uses a
light treatment with its own branding and four-army information architecture.
Exact imported sources, revision, license, attribution, modifications and the
regeneration command are in [third-party notices](../../THIRD_PARTY_NOTICES.md).
Only six Cburnett SVG sources were imported; control icons are original code.

All linked contact sheets and their full-size source PNGs were inspected.
Each contact sheet shows setup, selected-piece play, walking/passive pieces and
terminal shared placements. Final full-size captures come from the final suite;
the contact sheets show the same local appearance from the earlier visual pass.

| Viewport (CSS pixels) | Before | After |
| --- | --- | --- |
| Desktop, 1440 × 1000 | [Contact sheet](before/desktop-contact.png) | [Contact sheet](after/desktop-contact.png) |
| Short desktop, 1280 × 720 | [Contact sheet](before/short-desktop-contact.png) | [Contact sheet](after/short-desktop-contact.png) |
| Tablet, 768 × 1024 | [Contact sheet](before/tablet-contact.png) | [Contact sheet](after/tablet-contact.png) |
| Phone, 360 × 800 | [Contact sheet](before/phone-contact.png) | [Contact sheet](after/phone-contact.png) |

Full-size examples: [desktop play](after/desktop-play.png),
[phone setup](after/phone-setup.png), [phone play](after/phone-play.png),
[check](after/phone-check.png), [walking/passive](after/phone-walking.png),
[shared results](after/phone-result.png), [opening abort](after/result-360.png),
[long history](after/long-history-360.png). The other sizes have the same named
states in `before/` and `after/`; check captures are additional after-only evidence.

Findings and fixes:

- Replaced font-dependent, shadowed glyphs with consistent SVG silhouettes. Four
  fills plus owner initials preserve army identity; passive grey retains an ×,
  while walking kings retain their owner color. Check has a red inset glow and
  text; keyboard focus remains a separate visible outline.
- Removed the board's inter-square gaps and reduced the desktop board height
  allowance. At 1280 × 720 the complete board, seat panels and rotation control
  fit vertically; secondary history/results remain deliberately scrollable.
- Kept full-width phone board squares, 44-pixel action controls, keyboard setup
  order and displayed-orientation arrow navigation. All four panel directions,
  touch moves, cancellation, autosave/resume and replay paths pass regression tests.
- Inspected [local multiplayer lobby](after/online-lobby-phone.png),
  [play](after/online-play-phone.png) and [terminal](after/online-terminal.png).
  The first phone check exposed overflowing state hashes. Scoped wrapping fixes
  contain those strings, the heading and invitation label. Captures use disposable
  local test rooms whose runtime is stopped; they are not hosted sessions.

The new [capture test](../../apps/web/e2e/ui1.spec.ts) exercises public setup and
validated replay import. It checks horizontal containment, panel containment,
touch/click movement, checked-player text and terminal shared places at each size.
Existing dead-army tests now inspect the SVG and verify no check glow; their
legality, capture and score assertions remain intact.

## Final validation

The four required commands ran sequentially on final code; lint/test/build were
uncached (`--force`). No test retries or timeout increases were used.

| Command | Result and log |
| --- | --- |
| `corepack pnpm lint --force` | [10 packages passed](logs/final-lint.log) |
| `corepack pnpm test --force` | [731 tests passed](logs/final-unit.log) |
| `corepack pnpm build --force` | [10 packages passed](logs/final-build.log) |
| `corepack pnpm --filter @li4chess/web test:e2e` | [51 tests passed](logs/final-browser.log) |
| `corepack pnpm build:workers` | [Passed; Pages bytes preserved](logs/final-worker-build.log) |
| `corepack pnpm test:workers` | [4 browser checks plus runtime/lifecycle checks passed](logs/final-worker-runtime.log) |
| `corepack pnpm --filter @li4chess/worker build:multiplayer` | [Passed](logs/multiplayer-build-fixed.log) |
| `corepack pnpm --filter @li4chess/worker test:multiplayer` | [14 groups passed](logs/multiplayer-fixed.log), [summary](multiplayer-summary.json) |

The [Worker artifact](worker-artifact.json), [Worker environment](worker-manifest.json)
and [multiplayer artifact](multiplayer-artifact.json) retain bundle hashes and
producer identity. Larger local runtime outputs remain in ignored
`arena-results/ui1-worker-final` and `arena-results/ui1-multiplayer-fixed`.
The full historical M3 campaigns were not repeated for this visual slice.

The Pages production preview was also opened at `/li4chess/`: 64 SVG pieces
rendered, a human pawn move was followed by all three CPU turns, and the observed
console had no errors. Pieces/icons are inline SVG, with no external image or
font requests. The separate Workers build preserves the Pages asset paths and
output; the default build still excludes private multiplayer navigation.

Closeout checks resolved all 200 local links in the seven updated documentation
entry points, matched all 53 recorded source hashes, regenerated the piece module
byte-for-byte, and passed `git diff --check`.

Earlier unsuccessful attempts are retained and excluded from acceptance:
[unit provenance guard](logs/unit-initial-failed.log),
[Worker provenance guard](logs/worker-build-initial-failed.log) (live evidence
was initially written into fingerprinted source paths),
[arena timeout under concurrent suites](logs/unit-concurrent-timeout.log),
[old glyph assertions](logs/browser-initial-failed.log), and
[multiplayer phone overflow](logs/multiplayer.log). Live output was moved to the
ignored results directory; the isolated final unit run passed with unchanged
timeouts. Test assertions were updated for the intentional renderer appearance.
The initial esbuild sandbox denial was resolved by running authorized local
checks outside that filesystem restriction. No gameplay fix was needed.

## L1 handoff and limits

UI1 does not merge, deploy or tag. Follow the [L1 checklist](../local-launch-handoff.md)
for release-candidate review, exact-revision CI, the actual Pages HTTPS deployment,
complete local games, release notes/tag and update/rollback verification. Preserve
the asset notices. Browser-local save limits, compact 14-column phone squares and
known CPU endgame shuffling remain; no playing-strength claim is made. Physical
device and screen-reader checks remain unperformed. Cloudflare/domain launch,
hosted multiplayer and broader bot research remain outside this checkpoint.
