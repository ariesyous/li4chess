# Chess.com standard FFA compatibility audit

**Task:** M1-01. **Retrieved:** 2026-09-06. **Implementation examined:**
`5c089934d736bd19199875637a864e4bd395055b` plus the uncommitted planning
documents present when this audit began. This is an audit of the current local
house-rules engine; it does not change the ruleset.

## Scope and evidence

The target is **Chess.com's standard four-player Free-for-All (FFA)**, not a
generic four-player convention. The primary source is Chess.com's current
[4 Player Chess help article](https://support.chess.com/en/articles/8614233-4-player-chess-4pc),
published October 10, 2025 and retrieved 2026-09-06 ("FFA help"). It explicitly
says that its FFA section does not apply to Diplomacy. The contemporaneous
[2026 4-Player Championship rulebook](https://www.chess.com/article/view/official-event-rules-2026?page=2),
retrieved 2026-09-06, calls its format FFA with the *modern setup* and random
colors, but does not define the setup or ordinary move rules. It is cited only
where that limited context matters.

Evidence labels below mean:

- **Documented** — the linked official FFA material says it explicitly.
- **Observed** — reproducible behavior was observed in the live product. No
  target behavior is labelled observed in this initial, documentation-only
  audit.
- **Inferred** — a possible reading of generic chess material or of an FFA
  statement; it is not a compatibility fact until verified.
- **Unresolved** — the official FFA material does not settle it. Each item has
  a live-product verification method; do not substitute Teams, Solo, Diplomacy,
  a custom variant, or an old community post for the result.

The current behavior is documented by
[the current house specification](rules-spec.md) and the linked source/tests.
Tests demonstrate the implementation, not Chess.com compatibility. File links
use the source tree's current paths and line ranges are intentionally avoided so
this audit remains useful as the code changes.

### Variant boundary

Teams is not the target: it has opposite-seat teammates, prohibits capturing a
teammate, promotes on the 11th rank, ends when a team first mates an enemy, and
draws on stalemate. Its documented delayed-mate statement therefore cannot by
itself establish FFA mate timing. Solo is FFA with winner-takes-all **rating**
treatment, not a separate board-rules source. Chess.com says custom Variants can
be Solo, FFA, or Teams and display their rules in the product; neither custom
variants nor Diplomacy establish standard FFA behavior. These distinctions come
from the [FFA help article](https://support.chess.com/en/articles/8614233-4-player-chess-4pc).

## Compatibility matrix

### Board setup and turn order

- **Current — documented/tested:** A 14×14 grid with four 3×3 cutouts gives
  160 playable squares. Four standard 16-piece armies occupy the edges in
  Red → Blue → Yellow → Green clockwise order; Red starts. See
  [rules-spec.md](rules-spec.md),
  [board.ts](../packages/engine/src/board.ts),
  [setup.ts](../packages/engine/src/setup.ts), and
  [board.test.ts](../packages/engine/test/board.test.ts) /
  [setup.test.ts](../packages/engine/test/setup.test.ts).
- **Target — unresolved:** The FFA help article documents neither exact board
  geometry, starting array, color order, nor who starts. The official 2026
  event rulebook identifies a "modern setup" with random colors, but does not
  define it. Do not treat the current layout as documented compatibility.
- **Required change / acceptance scenario:** Record a standard, non-Diplomacy
  FFA board at game creation (all 64 piece squares, color order, first mover,
  and orientation) and convert it into a four-color fixture. Assert the target
  fixture square-for-square and assert the first four turns. Capture the game
  URL/ID, selected mode, date, and screenshots or a legal move list as evidence.

### Ordinary movement and king safety

- **Current — documented/tested:** Pawns are oriented per seat and may make an
  unobstructed two-square opening push; leapers/sliders use ordinary geometry
  on the cross board. Legal moves may not leave the mover's king attacked by an
  *active* opponent. Pseudo-legal generation can currently target an opposing
  king, so the enemy-king-capture edge case is not separately prevented. See
  [rules-spec.md](rules-spec.md),
  [movegen/index.ts](../packages/engine/src/movegen/index.ts),
  [pawns.ts](../packages/engine/src/movegen/pawns.ts),
  [legality.ts](../packages/engine/src/rules/legality.ts), and
  [movegen.test.ts](../packages/engine/test/movegen.test.ts) /
  [legality.test.ts](../packages/engine/test/legality.test.ts).
- **Target — unresolved:** The FFA help article does not define ordinary piece
  movement, pawn double pushes, self-check, king adjacency, or whether an
  active enemy king is capturable. Its +20 active-king scoring entry is not
  enough to infer when a king can be captured.
- **Required change / acceptance scenario:** In an isolated standard FFA game,
  test a legal ordinary move for each of four orientations, a move exposing the
  mover's king, adjacent live kings, and an apparent capture of an active
  opponent king. Save the move list/rejection and replay. Add a fixture for
  every confirmed behavior before altering move generation.

### Check, checkmate, and stalemate

- **Current — documented/tested:** A move reports every active opposing king in
  check, but only the mover's king constrains legality. When rotation reaches a
  player with no legal move, check means checkmate: all of that army is removed;
  otherwise the player is stalemated, frozen, and skipped. Resolution is
  deferred until that player's turn. See [rules-spec.md](rules-spec.md),
  [check.ts](../packages/engine/src/rules/check.ts),
  [legality.ts](../packages/engine/src/rules/legality.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — mixed:** FFA help **documents** +20 for checkmating an opponent
  and +20 for stalemating oneself, but does not state FFA check legality,
  delayed resolution, who receives a stalemate award, or the effect of a
  non-resigned stalemate. Teams documents delayed checkmate and stalemate-as-
  draw, but that is explicitly a different mode and is not FFA evidence.
- **Required change / acceptance scenario:** Create an FFA position where a
  player is checked while another seat intervenes; record whether the checked
  player can be saved before their turn and when mate is finalized. Separately
  construct a no-legal-move/not-in-check position, note the player(s) credited
  and piece state, then use those observed results to test check/mate/stalemate
  scoring and timing in all four orientations.

### Castling

- **Current — documented/tested:** Kings and rooks castle two/three local files
  with standard clear-path, unmoved-piece, not-in-check, and no-attacked-king-
  path restrictions across all active opponents. Rights are recomputed from
  unmoved home pieces. See [rules-spec.md](rules-spec.md),
  [movegen/castling.ts](../packages/engine/src/movegen/castling.ts),
  [legality.ts](../packages/engine/src/rules/legality.ts),
  [elimination.ts](../packages/engine/src/rules/elimination.ts), and
  [movegen.test.ts](../packages/engine/test/movegen.test.ts) /
  [legality.test.ts](../packages/engine/test/legality.test.ts).
- **Target — unresolved:** The current FFA help and event rulebook do not
  mention castling. Generic Chess.com chess documentation is insufficient to
  prove that castling exists in standard FFA, its destination squares, or how
  attacks by three opponents and eliminated armies count.
- **Required change / acceptance scenario:** On a standard FFA board, clear
  kingside and queenside paths for each color without moving the king/rook;
  attempt both castles, then repeat with the king in check and each transit/
  destination square attacked by another live color. Test a rook capture and a
  dead rook/king edge case. Preserve the replay or screenshots and only then
  set the ruleset's castling contract.

### En passant

- **Current — documented/tested:** A double pawn push sets one target square
  until the next move by any player. A qualifying enemy pawn can capture it;
  due to the current geometry, the test finds only the opposite seat can do so.
  See [rules-spec.md](rules-spec.md),
  [pawns.ts](../packages/engine/src/movegen/pawns.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [pawns.test.ts](../packages/engine/test/pawns.test.ts).
- **Target — unresolved:** Neither current official FFA source mentions en
  passant. The older community material returned by search conflicts with the
  contemporary help page's lack of detail and is not used as target evidence.
- **Required change / acceptance scenario:** In standard FFA, arrange a double
  push next to each geometrically possible opposing pawn; try en passant on the
  immediately eligible turn and after every intervening color has moved. Record
  which color(s) may capture, whether the target expires after one global move
  or one turn of a particular player, and whether the move is rejected for king
  safety. Add a four-orientation fixture for every supported case.

### Promotion

- **Current — documented/tested:** A pawn promotes only on local rank 13 (the
  far edge), with generated Queen/Rook/Bishop/Knight choices. The local UI
  always selects Queen for humans and CPUs. See [rules-spec.md](rules-spec.md),
  [pawns.ts](../packages/engine/src/movegen/pawns.ts),
  [pawns.test.ts](../packages/engine/test/pawns.test.ts), and
  [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts).
- **Target — documented:** FFA help says pawns promote on the player's **8th
  rank**. It does not state available promotion choices, default selection, or
  the exact relationship between that rank and the modern-board coordinates.
  The Teams 11th-rank rule is not applicable.
- **Required change / acceptance scenario:** From each color's starting edge,
  advance a pawn to the product's displayed eighth rank and assert that the
  promotion UI and replay contain the selected target piece. Try all offered
  choices and determine the resulting piece's point value (especially a
  "1-point Queen"). Assert a pawn at the old far edge does not promote unless
  the live product demonstrates otherwise.

### Scoring

- **Current — documented/tested:** Captures immediately add Pawn 1, Knight 3,
  Bishop 3, Rook 5, Queen 9, King 0. Check/mate/stalemate awards do not exist;
  score only breaks same-turn elimination placement ties. See
  [rules-spec.md](rules-spec.md),
  [scoring.ts](../packages/engine/src/rules/scoring.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented, with a narrow unresolved term:** FFA help specifies:
  mate +20; self-stalemate +20; active Pawn/"1-point Queen" +1, Knight +3,
  Bishop +5, Rook +5, Queen +9, King +20, and Spare king +3; a double check is
  Queen +1/other +5 and a triple check is Queen +5/other +20. It calls the
  objective the highest points. The source does not define how a 1-point Queen
  or spare king arises, nor whether a check bonus is awarded once per move,
  newly checked king, or continuing check.
- **Required change / acceptance scenario:** Build independent fixtures for
  every active-piece value, mate, self-stalemate, queen/non-queen double and
  triple checks, last-live-king award, a 1-point Queen, and a spare king. For
  each, assert exact deltas, recipients, event ordering, and no award for a
  capture of a dead piece. Resolve undefined piece identities by inspecting
  standard FFA move history/scoreboard rather than guessing from the labels.

### Eliminated and dead pieces

- **Current — documented/tested:** Checkmate removes every owned piece from the
  board. Stalemated armies stay frozen but remain ordinary capturable material;
  captures still score. See [rules-spec.md](rules-spec.md),
  [elimination.ts](../packages/engine/src/rules/elimination.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented:** FFA help says an eliminated player's pieces become
  dead/grey and captures of dead pieces earn no points. It does not explicitly
  say whether dead pieces block movement, are capturable, attack kings, retain
  special rights, or how ordinary stalemate turns an army dead.
- **Required change / acceptance scenario:** Checkmate a player with a blocker,
  slider, pawn, rook, and king still on board. On the next turns, try moving
  through, capturing, and using each as a shield; compare displayed points and
  legal moves. Repeat for a stalemate. Model a confirmed dead piece distinctly
  enough that replay and move generation preserve its interaction rules.

### Resignation

- **Current — documented/tested:** `PlayerStatus` includes `resigned`, but no
  engine action, UI control, result reason, or test can resign a player.
  [types.ts](../packages/engine/src/types.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [GameScreen.tsx](../apps/web/src/components/GameScreen.tsx) show the gap.
- **Target — documented:** In FFA, resignation turns the army dead but leaves a
  live king that moves randomly until checkmated or stalemated; points for a
  stalemated resigned king are shared. FFA help also specifies an early-resign
  abort condition below.
- **Required change / acceptance scenario:** After the protected opening,
  resign one player with material around the king. Assert the army becomes
  dead, the king remains live, the random-move authority/seed/event is recorded
  in the replay, ordinary turns proceed, and checkmate/stalemate produces the
  documented award split. Test resigning with two, three, and four live players.

### Timeout

- **Current — documented/tested:** The local engine has no clocks, timeout
  command, server authority, random king, or timeout result. CPU delay is not a
  chess clock. See [types.ts](../packages/engine/src/types.ts),
  [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts), and the absence of a
  timeout test in `packages/engine/test`.
- **Target — documented:** FFA help assigns timeout the same dead-army/live,
  randomly moving king outcome as resignation, and includes timeout in its
  early-abort condition.
- **Required change / acceptance scenario:** With an authoritative per-seat
  clock, flag one player after the protected opening and assert the same state
  transition and replayed random-king behavior as resignation. Assert a flag at
  each boundary of the early-abort threshold and that a clock cannot be advanced
  by client input.

### Disconnection

- **Current — documented/tested:** This is a single-browser local game; it has
  no connection/session state, reconnect token, clock authority, or disconnect
  test. [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts) owns all state
  in React and [protocol/index.ts](../packages/protocol/src/index.ts) only
  JSON-stringifies state.
- **Target — documented:** FFA help gives a disconnected player 60 seconds to
  reconnect before forfeiture on time. It does not define grace-period clock
  behavior, repeated disconnects, or reconnect authorization.
- **Required change / acceptance scenario:** In an authoritative multiplayer
  harness, sever a player connection at 59 s and 61 s, reconnect with the same
  identity, and confirm the authoritative clock/result. Test a move sent around
  a disconnect boundary and duplicate reconnects. These belong to M3 but must
  share the M1 timeout semantics.

### Draws and non-elimination endings

- **Current — documented/tested:** The third occurrence of a position ends the
  game immediately; all active players tie for first, receive no bonus, and
  inactive players are ordered by elimination. There is no insufficient-
  material, 50-move, agreement, or other draw rule. See
  [rules-spec.md](rules-spec.md),
  [repetition.ts](../packages/engine/src/rules/repetition.ts),
  [elimination.ts](../packages/engine/src/rules/elimination.ts), and
  [repetition.test.ts](../packages/engine/test/repetition.test.ts).
- **Target — documented, with ranking unresolved:** FFA help says insufficient
  material, threefold repetition, and the 50-move rule give each remaining
  player +10. It does not say whether repetition is automatic or claimed, how
  the 50-move count is defined in four-player turns, whether other draw paths
  exist, or how equal final scores rank/are displayed.
- **Required change / acceptance scenario:** Reproduce each named ending in
  standard FFA. For repetition, log the exact recurring position and trigger;
  for 50 moves, log pawn/capture resets and whether the counter is plies or
  full rotations; for insufficient material, record the qualifying material.
  Assert +10 to every remaining player and the final placements/scoreboard.

### Game conclusion and placement ties

- **Current — documented/tested:** The game ends when one active player remains;
  that player wins. Others rank by later elimination, then score, then fixed
  Red/Blue/Yellow/Green order. Repetition gives all active players first place.
  See [rules-spec.md](rules-spec.md),
  [elimination.ts](../packages/engine/src/rules/elimination.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented, with ties unresolved:** FFA help says the objective is
  most points, three eliminations end the game, the final surviving player gets
  +20 (or +40) for each other live king, and only final placement affects
  ratings. It does not specify the conditional +20/+40 calculation, tie-break
  ordering for equal points, or a deterministic seat-order rule. Tournament
  tie policy is event scoring, not a substitute for standard-game placement.
- **Required change / acceptance scenario:** Construct finish states in which
  elimination chronology conflicts with score; equal first, second, and lower
  scores; and 0/1/2/3 other live kings remain. Capture the final standard FFA
  scoreboard and rating placement. Implement point-based ranking only after the
  tie semantics and +20/+40 condition are observed or clarified by Chess.com.

### Early aborts

- **Current — documented/tested:** A local game starts immediately and cannot
  abort; it has no per-player move counts, rating event, or abort result reason.
  See [setup.ts](../packages/engine/src/setup.ts),
  [types.ts](../packages/engine/src/types.ts), and
  [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts).
- **Target — documented:** If resignation or timeout happens before **all**
  players have made at least three moves, FFA help says the game is aborted and
  the resigning player loses rating points. This differs from the Teams wording
  (first move), which must not be imported into FFA.
- **Required change / acceptance scenario:** Maintain an authoritative move
  count per player. Test resignation and timeout when (a) one seat has 0–2
  moves, (b) every seat has exactly three, and (c) one player has more while
  another has fewer. Assert abort/result visibility, no ordinary placement,
  correct rating-event payload, and replay labels that prevent an aborted game
  from being counted as a completed game.

## Cross-cutting implications and M1-02 handoff

### State, protocol, and replay versioning

Current `GameState` is a plain unversioned JSON shape, and protocol helpers
blindly stringify/parse it ([protocol/index.ts](../packages/protocol/src/index.ts)).
The target changes require a declared `rulesetVersion` and a replay/schema
version before migration. At minimum, the target schema needs a terminal reason
that distinguishes mate, stalemate, resignation, timeout, disconnect/forfeit,
draw type, and abort; rules-driven randomness for resigned/flagged kings must
be deterministic and recorded (seed plus generated action, or authoritative
action events). It also needs enough immutable event data to reproduce points,
dead-versus-live pieces, clocks, per-seat opening move counts, and the final
point-based placement. Old house-rule replays/results must retain their current
ruleset identifier and be replayed by that implementation or an explicit
compatibility path; do not reinterpret historical arena records.

### Bot and arena evaluation

Production and frozen classic bots both consume engine `PIECE_VALUES`, player
scores, status, `GameResult`, and the current survival/placement objective; the
arena also reports engine placements and scores. Relevant consumers include
[evaluate.ts](../packages/bot/src/evaluate.ts),
[utility.ts](../packages/bot/src/utility.ts),
[hash.ts](../packages/bot/src/hash.ts), and
[arena/index.ts](../packages/arena/src/index.ts). M1-03 must therefore update
evaluation, hashes, terminal utility, move ordering, result reporting, and their
tests together with the engine. Do not compare new-rule bot results with the
archived house-rule experiments; label any new run with ruleset, replay schema,
code revision, budget, seeds, and environment.

### UI and future ratings

The UI currently explains removed checkmated armies, frozen stalemates, and a
threefold draw, and it auto-chooses Queen promotion
([GameScreen.tsx](../apps/web/src/components/GameScreen.tsx) and
[useLocalGame.ts](../apps/web/src/game/useLocalGame.ts)). It will need explicit
dead-piece rendering, point-event explanation, promotion choice, end/abort
status, and eventually clocks/reconnect state. Standard FFA says points choose
placement while ratings use placement, whereas Solo changes rating treatment;
future M4 must keep game scoring, placement/tie policy, queue mode, and rating
calculation as separately versioned contracts. This audit does not choose a
li4chess rating algorithm.

## Reproducible verification protocol for unresolved rules

1. Create a four-human, standard **FFA** game on Chess.com (not Teams, Solo,
   Diplomacy, or a custom Variant); record the visible mode/setup and game URL
   or ID before moving.
2. Use legal, minimally modified positions built from ordinary moves where
   possible. If a sandbox/editor is required, record exactly how it proves the
   behavior and do not call it standard FFA without a live standard-game replay.
3. Save screenshots of the board, move list, score panel, terminal panel, and
   clocks before/after the decisive action. Record UTC date, client platform,
   time control, player colors, and all moves.
4. Replay the game in a fresh session and transcribe the smallest fixture into
   a proposed engine test. State separately what was observed and what remains
   inferred. Ask Chess.com support for clarification when a condition cannot be
   reached reproducibly without collusion or privileged controls.
5. Review the evidence into M1-02's versioned target specification before any
   M1-03 implementation. A test fixture is an acceptance test only after its
   target behavior has documented or observed evidence.
