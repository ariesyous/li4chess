# Third-party assets

## Cburnett chess pieces

The six white-piece SVG sources by **Colin M. L. Burnett** are redistributed
under **GNU GPL version 2 or later (GPL-2.0-or-later)**. They are editable SVG
sources, retained without modification in
[`packages/ui-kit/src/assets/cburnett`](packages/ui-kit/src/assets/cburnett).
The complete [GPL v2 license](packages/ui-kit/src/assets/cburnett/COPYING) and
[upstream copying inventory](packages/ui-kit/src/assets/cburnett/UPSTREAM-COPYING.md)
are included. These assets carry their own license; the application remains
AGPL-3.0-only.

Retrieved 2026-09-08 from the official
[Lila repository at a05a5a45770f8ca73f124305df8cd515d4a9a47f](https://github.com/lichess-org/lila/tree/a05a5a45770f8ca73f124305df8cd515d4a9a47f/public/piece/cburnett).
Exact imported paths: `public/piece/cburnett/wK.svg`, `wQ.svg`, `wR.svg`,
`wB.svg`, `wN.svg`, `wP.svg` (all under the same directory).
The [revision-pinned inventory](https://github.com/lichess-org/lila/blob/a05a5a45770f8ca73f124305df8cd515d4a9a47f/COPYING.md)
identifies the author and GPLv2+ terms for this directory.

li4chess modifications, 2026-09-08: the
[generator](packages/ui-kit/scripts/generate-pieces.mjs) extracts the SVG shapes
into [React SVG markup](packages/ui-kit/src/Piece.tsx), converts SVG attribute
names to JSX, replaces white fill with `currentColor`, and replaces black
details/outlines with `#292621`. The renderer applies red, blue, yellow, green
or passive-grey fills. Geometry is unchanged. Regenerate from the repository
root with `node packages/ui-kit/scripts/generate-pieces.mjs`.

SVGs are bundled inline: no third-party requests or domain-root asset paths.
Source and credits links appear on setup and local game screens.

## Interface and board

Lichess analysis desktop and mobile layouts were inspected on 2026-09-08 at
[lichess.org/analysis](https://lichess.org/analysis) and
[the current game on Lichess TV](https://lichess.org/tv). The warm board palette,
restrained surfaces and compact hierarchy are visual references. The CSS,
control SVG icons and existing cross-board renderer are li4chess code.
No Lichess logo, board bitmap, icon font, font file or Chessground code was
imported. Control icons keep visible text labels and use the application license.
