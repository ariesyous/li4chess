# Tetrarch v8 integration spike: architecture before implementation

Baseline: `c62507e60b24955950af3d6a5780d4c62347c410` (latest fetched main,
2026-09-09). This explicitly authorized research task is separate from L1.

## Existing boundaries

- `packages/engine/src/types.ts` owns immutable, JSON-shaped `GameState`:
  196-cell board, four player records, turn, rights, scores, action/award ledger,
  move history, repetition counts, draw counters and seeded walking actions.
- Squares are `rank * 14 + file`, with 160 playable cells. Player numbers are
  Red=0, Blue=1, Yellow=2, Green=3. Geometry belongs to shared board transforms.
- `Move` includes from/to, piece, optional captured/promotion/castle/EP victim,
  checks and eliminations. Only from/to/promotion are external intentions.
  `applyMoveRequest` regenerates legal moves and applies the canonical match.
- Browser path: `useLocalGame` → `requestCpu` → fresh `cpu.worker` →
  `runCpuJob` → `chooseBoundedCpuMove`. State SHA-256, request/game/state/seat
  identity, node/depth bounds, watchdog and Worker termination protect replies.
  Search is synchronous inside the Worker; the UI flow is asynchronous.
- `chooseCpuMove` remains the synchronous comparison API. Frozen classic and
  experimental `searchPosition` are distinct baselines, not replacement targets.
- `ArenaEngine.choose` already accepts a promise. `runGame` clones the state,
  matches replies to canonical legal moves, records canonical actions and
  replay-verifies them. No second tournament framework is necessary.
- Rules identity is `li4chess-ffa-standard-v1`; state-v2/replay-v2 preserve
  complete canonical state, awards, seeded actions, hashes and producer identity.
  Tetrarch FEN4 must never replace this serialization.

## Proposed insertion point and gates

A separate `packages/tetrarch-engine` research package isolates upstream inputs,
build tooling and a typed adapter. Application code must never see WASM memory
or an upstream board. Convert a clone, extract only move identity, then resolve
against `legalMoves`; all actions/results remain li4chess decisions.

First prove unmodified C and NNUE loading. Then compare legal sets and classify
semantic failures before arena or browser integration. Root move agreement alone
does not prove search-tree compatibility: future king captures, elimination and
scoring can corrupt a legal root choice. A production capability predicate must
fail closed until those differences are resolved, even for the initial board.

Tetrarch v8 is pinned to commit `4a35cea06b710a6633302c2226ebfebbba52d7a4`
(annotated tag object `f48d63ba7297e667bd47d6a7b716f7a31c87e710`). Its
`src/c/tetrarch.c` is a single compilation unit with standard C dependencies;
architecture-specific inference branches have a scalar path. Python supplies
geometry/Zobrist parameters, NNUE file parsing, board packing, iteration/time
management, history and protocol/book orchestration. C supplies movegen,
make/unmake, evaluation, NNUE, TT, fixed-depth paranoid search and PV extraction.

For the proof, generate immutable parameter bytes from pinned upstream Python
at build time; runtime uses TypeScript and WASM only. Recreate NNUE parsing,
board packing and root iteration in TypeScript. No book is needed for search.
No upstream behavior patch is authorized implicitly by a parity mismatch.
