# UI1: Lichess-style UI sprint

Status: planned, 2026-09-08. The maintainer requested a close match to the style
of lichess.org, especially its interface, chessboard and icons, with open-source
reuse. Schedule one bounded sprint before L1; no UI implementation or asset import
is claimed by this planning update. This updates D08's visual direction while
preserving the existing four-player information architecture.

## Deliverable

Restyle the existing setup, game, history and result screens into a cohesive
Lichess-style experience: restrained surfaces, compact typography and controls,
a prominent board, familiar highlights, crisp pieces and consistent icons.
Use li4chess identity and retain the cross-shaped 14-by-14 board, four directional
seat panels, scores, turn indicators, dead armies and walking kings.

Start by inspecting current Lichess desktop/mobile game screens and the local
application, then implement in apps/web and packages/ui-kit. Keep the current
renderer as the default; borrowing board appearance and pieces does not require
adopting another board library. Choose one coherent board/piece treatment rather
than building a theme catalog. A Cburnett-derived set is a candidate, not a final
asset selection; prove four-color and passive-piece legibility before settling it.
Do not add chat, studies, ratings, new settings systems or multiplayer activation.

## Reuse inventory

Official sources reviewed on 2026-09-08:

- [Lila copying inventory](https://github.com/lichess-org/lila/blob/master/COPYING.md):
  default code and listed board images are AGPLv3+; Cburnett pieces are GPLv2+.
  The lichess icon font lists OFL, MIT, CC BY 3.0 and AGPLv3+ sources. Some other
  piece sets have restrictive terms. The logo is limited to referring to Lichess.
- [Chessground](https://github.com/lichess-org/chessground): a separate GPL-3.0-or-later
  board UI. Do not assume it is a drop-in fit for our cross board and four seats.

The shared AGPL family does not license every bundled asset identically. For
each selected file, pin its upstream revision/path, verify its applicable terms
and modification rights, retain required license/author notices, and record
recoloring or other changes. Add a third-party notices file with the actual
imports and a source/credits link in the app. Keep editable sources where required.
Prefer assets allowing redistribution and four-army adaptation; choose an
alternative when a file's terms are unclear. Keep our name and logo. This is
permission to reuse suitable material, not a requirement to recreate everything.

## Completion

- Inspect before/after desktop, short-desktop, tablet and phone captures of setup,
  ordinary play and terminal results, plus checked, dead and walking-king states.
- Verify readable armies, score/turn feedback, focus, keyboard navigation,
  touch controls and unclipped layout. Preserve existing local save and replay UX.
- Verify asset loading under both the current Pages subpath and the planned domain
  root. Keep opt-in multiplayer screens usable where shared styles affect them.
- Run pnpm lint, pnpm test, pnpm build and
  pnpm --filter @li4chess/web test:e2e; run affected Worker/multiplayer checks if
  shared behavior changes. Record actual visual and test evidence, then update
  [project state](project-state.md) and mark UI1 complete only when supported.

Routine design and asset choices belong to the implementation task. Provide a
reviewable result without requiring the maintainer to write a detailed design brief.
