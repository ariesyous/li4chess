# Chess.com standard FFA compatibility audit

**Task:** M1-01. **Retrieved:** 2026-09-06. **Implementation examined:**
`5c089934d736bd19199875637a864e4bd395055b` plus the uncommitted planning
documents present when this audit began. This is an audit of the current local
house-rules engine; it does not change the ruleset.

## Scope and evidence

The target is **Chess.com's standard four-player Free-for-All (FFA)**, not a
generic four-player convention. The primary sources are Chess.com's current
[4 Player Chess help article](https://support.chess.com/en/articles/8614233-4-player-chess-4pc),
published October 10, 2025 and retrieved 2026-09-06 ("FFA help"), and its
[4 Player Chess terms article](https://www.chess.com/terms/4-player-chess),
retrieved 2026-09-06 ("FFA terms"). The help explicitly says its FFA section
does not apply to Diplomacy; the terms article has a dedicated "Rules Of
Standard Free-For-All" section. The contemporaneous
[2026 4-Player Championship rulebook](https://www.chess.com/article/view/official-event-rules-2026?page=2),
retrieved 2026-09-06, calls its format FFA with the *modern setup* and random
colors, but does not define the setup or ordinary move rules. It is cited only
where that limited context matters.

**Live-client observations:** On 2026-09-06, the signed-in Chess.com
[4PC analysis editor](https://www.chess.com/variants/4-player-chess/analysis)
showed the current default **FFA / Modern** configuration. It was inspected
read-only; no challenge or rated game was created. The visible board was a
14×14 cross with the familiar four 16-piece armies. Its generated header was
`[Variant "FFA"]` and `[RuleVariants "DeadKingWalking EnPassant PromoteTo=D"]`.
The client also showed 1-point-queen eighth-rank promotion, `+20` points for
mate, and "The stalemated player receives the points." These are **observed**
client settings, not a substitute for a completed-game replay where behavior
still needs exercising.

Later that day, a completed standard **1 | 7 FFA / Modern** game supplied a
linked [replay](https://www.chess.com/variants/4-player-chess/game/108222020).
This audit records only rule-relevant UI/replay facts: 14×14 four-army play,
castling, eighth-rank `=Q` promotion notation, a timeout's dead army and
automatic king move, resign events, and the terminal award. It does not use
player identities, ratings, or the result as evidence for any unexercised edge
case. This is **observed** product evidence; the linked FFA help remains the
documented target authority.

Evidence labels below mean:

- **Documented** — the linked official FFA material says it explicitly.
- **Observed** — reproducible behavior was observed in the live product and
  recorded with a replay/URL or configuration capture, or reported by the
  maintainer as a dated live-product observation. It establishes only the
  particular behavior seen, not neighboring undocumented semantics.
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
- **Target — documented + observed (maintainer report):** FFA terms documents
  a 160-square board, Red first, and clockwise Red → Blue → Yellow → Green
  play. The exact Modern layout is a 14×14 grid with four 3×3 corner cutouts:
  Red occupies ranks 1–2/files d–k, Blue files a–b/ranks 4–11, Yellow ranks
  13–14/files d–k, and Green files m–n/ranks 4–11. In each player's outward
  baseline frame, the back rank is Rook, Knight, Bishop, Queen, King, Bishop,
  Knight, Rook; the Queen is left of the King. Random color assignment assigns
  seats only—Red always moves first.
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
- **Target — observed (maintainer report):** A move may not leave its own king
  in check from any active opponent; absolute pins apply across all opponents.
  Active kings cannot be orthogonally or diagonally adjacent and a live king can
  never be captured. Pawns may double-push from their designated starting
  rank/file on their first move. These rules apply in all four orientations.
- **Required change / acceptance scenario:** Add four-orientation fixtures for
  self-check/pin rejection, live-king capture rejection, king adjacency, and
  unobstructed first-move double pushes.

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
- **Target — documented + observed (maintainer report):** FFA help documents
  +20 for checkmating an opponent and +20 for stalemating oneself. FFA terms
  further says that ordinary stalemate eliminates the player and makes all their
  pieces inactive, and awards +10 to each player still in the game when an
  opponent is stalemated. The maintainer reports that mate/stalemate is resolved
  only at the affected player's scheduled turn: earlier players may capture the
  checker, block, create an escape, or checkmate the attacker and thereby rescue
  them. A live king is never capturable; only mate, stalemate, resignation, or
  timeout changes it to a removed/dead state. Award-event ordering remains a
  replay requirement; Teams' delayed-mate rule remains non-FFA evidence.
- **Required change / acceptance scenario:** Add four-orientation fixtures for
  deferred rescue, deferred mate/stalemate, active-king capture rejection, and
  no-legal-move transition. Assert the documented recipients/deltas and record
  award order as explicit replay events.

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
- **Target — observed + maintainer-reported observation:** The current FFA help
  and event rulebook do not mention
  castling. The observed standard FFA replay includes both `O-O-O` and `O-O`,
  confirming that castling exists in current Modern FFA. On 2026-09-06, the
  maintainer reported that live standard FFA castling otherwise follows ordinary
  two-player chess: the king uses the standard two-square destination and rook
  placement; a moved king or rook, or a captured rook, removes the relevant
  right; the king may not castle while checked or through/onto an attacked
  square; and every intervening square must be clear. A dead piece on that path
  is still an occupying blocker, so it prevents castling. This is a dated
  maintainer observation, not an official documentation claim or an attached
  replay fixture. FFA terms now documents that pieces of a checkmated or
  stalemated player are inactive; the maintainer additionally confirmed that
  dead pieces do not attack or retain special rights. They are only passive
  physical obstacles until an active piece captures them for zero points.
- **Required change / acceptance scenario:** Add four-orientation fixtures for
  each side's standard destination, rights loss after king/rook movement or
  rook capture, check/transit/destination restriction, and dead-path blocker.
  Fixture all four orientations and both castle sides, including the passive
  dead-path blocker/no-attack case. Preserve a replay or screenshot when
  available.

### En passant

- **Current — documented/tested:** A double pawn push sets one target square
  until the next move by any player. A qualifying enemy pawn can capture it;
  due to the current geometry, the test finds only the opposite seat can do so.
  See [rules-spec.md](rules-spec.md),
  [pawns.ts](../packages/engine/src/movegen/pawns.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [pawns.test.ts](../packages/engine/test/pawns.test.ts).
- **Target — observed (maintainer report):** Any opponent whose pawn attacks
  the skipped square immediately after a double push is eligible. Each eligible
  player has the right only on that player's next scheduled turn; each loses it
  permanently after making another move. Thus each eligible opponent has one
  chance when their clockwise turn arrives, not one global-move window. The
  current Modern header's `EnPassant` setting corroborates that the feature is
  enabled. Like every move, en passant is illegal if it exposes the capturer's
  king to any active opponent; standard absolute-pin legality applies.
- **Required change / acceptance scenario:** Store eligibility per player, not
  one globally cleared target. In standard FFA, arrange every geometrically
  possible double-push/capturer relation and assert each player's scheduled
  expiry. Add a pinned/self-check case and assert its rejection.

### Promotion

- **Current — documented/tested:** A pawn promotes only on local rank 13 (the
  far edge), with generated Queen/Rook/Bishop/Knight choices. The local UI
  always selects Queen for humans and CPUs. See [rules-spec.md](rules-spec.md),
  [pawns.ts](../packages/engine/src/movegen/pawns.ts),
  [pawns.test.ts](../packages/engine/test/pawns.test.ts), and
  [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts).
- **Target — documented + observed:** FFA help says pawns promote on the
  player's **8th rank**. FFA terms makes the standard-FFA choice/value explicit:
  promotion is automatically to a Queen and capture of that promoted Queen is
  worth one point. The observed Modern client states "Pawns promote to a
  1-point queen on the 8th rank" and emits `PromoteTo=D`; the replay records
  ordinary and capture promotions as `=Q` (including `7xh6=Q`). This establishes
  default identity, automatic choice, and capture value. Exact modern-board
  coordinates now have the recorded Modern setup fixture. A promoted pawn-Queen
  is still a Queen for multi-check scoring despite its one-point capture value.
  "Spare King +3" is legacy/custom odds infrastructure: standard Modern FFA
  matchmaking never creates spare kings, so it is outside target fixtures. The
  Teams 11th-rank rule and underpromotion option are not applicable.
- **Required change / acceptance scenario:** From each color's starting edge,
  advance a pawn to the product's displayed eighth rank and assert automatic
  Queen promotion, its 1-point capture value, and the replay token. Assert a
  pawn at the old far edge does not promote, and assert Queen-tier multi-check
  scoring for a pawn-Queen.

### Scoring

- **Current — documented/tested:** Captures immediately add Pawn 1, Knight 3,
  Bishop 3, Rook 5, Queen 9, King 0. Check/mate/stalemate awards do not exist;
  score only breaks same-turn elimination placement ties. See
  [rules-spec.md](rules-spec.md),
  [scoring.ts](../packages/engine/src/rules/scoring.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented + observed, with replay-ledger fixture work remaining:**
  FFA help specifies:
  mate +20; self-stalemate +20; active Pawn/"1-point Queen" +1, Knight +3,
  Bishop +5, Rook +5, Queen +9, King +20, and Spare king +3; a double check is
  Queen +1/other +5 and a triple check is Queen +5/other +20. It calls the
  objective the highest points. FFA terms defines the 1-point Queen as the
  automatic promotion result and its one-point capture value. The sources do
  not define how a spare king arises, nor whether a check bonus is awarded once
  per move, newly checked king, or continuing check. The observed default
  `PromoteTo=D` setting and replay notation corroborate the documented result.
  The maintainer further reports that multi-check rewards apply only to kings
  directly checked by the current move, excluding a pre-existing check, and
  stack with capture and mate rewards on that move. The documented Queen-specific
  schedule applies: Queen double/triple check = +1/+5; a Rook, Bishop, Knight,
  or Pawn = +5/+20. For a discovered/mixed check, evaluate every checking piece
  newly delivered on that turn; if any is a Queen (including a pawn-Queen), use
  the lower Queen tier to prevent score inflation.
- **Required change / acceptance scenario:** Build independent fixtures for
  every active-piece value, mate, self-stalemate, queen/non-queen double and
  triple checks, last-live-king award, automatic 1-point Queen, and a spare
  king. For each, assert exact deltas, recipients, event ordering, direct-check
  eligibility, stacking, Queen/non-Queen schedule, mixed discovered checks, and
  no award for a capture of a dead piece. Omit spare king from Standard Modern
  fixtures; it is not a reachable target-game piece.

### Eliminated and dead pieces

- **Current — documented/tested:** Checkmate removes every owned piece from the
  board. Stalemated armies stay frozen but remain ordinary capturable material;
  captures still score. See [rules-spec.md](rules-spec.md),
  [elimination.ts](../packages/engine/src/rules/elimination.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented + observed:** FFA help says an eliminated player's
  pieces become dead/grey and captures of dead pieces earn no points. FFA terms
  says checkmate and ordinary stalemate make all of the player's pieces
  inactive, and says capture of those pieces earns no points. The maintainer
  reports that dead pieces do not attack and confirms their occupancy blocks a
  castle path. Dead pieces can be captured normally for zero points. They cannot
  move or execute en passant; a pawn which double-pushes then immediately dies
  may still be captured en passant by an eligible active opponent for zero
  points. They retain no special rights beyond these explicitly passive cases.
- **Required change / acceptance scenario:** Checkmate a player with a blocker,
  slider, pawn, rook, and king still on board. On the next turns, confirm
  blocking, zero-point capture, no attacks, and the dead-double-push en-passant
  case. Repeat for a stalemate. Model the passive obstacle distinctly enough
  that replay and move generation preserve its interaction rules.

### Resignation

- **Current — documented/tested:** `PlayerStatus` includes `resigned`, but no
  engine action, UI control, result reason, or test can resign a player.
  [types.ts](../packages/engine/src/types.ts),
  [applyMove.ts](../packages/engine/src/rules/applyMove.ts), and
  [GameScreen.tsx](../apps/web/src/components/GameScreen.tsx) show the gap.
- **Target — documented + observed:** In FFA, resignation turns the army dead
  but leaves a live king that moves randomly until checkmated or stalemated.
  FFA terms specifies +20 for checkmating that king and +10 to each remaining
  active player for stalemating it. The maintainer reports that it moves only on
  its own scheduled clockwise turn: enumerate all legal king moves (safe from
  active opponents, including legal captures) and choose uniformly with the
  server PRNG; no legal move resolves mate/stalemate on that turn. The observed
  default header includes `DeadKingWalking`, and replay logs `R` events and
  later `R`-prefixed king moves. FFA help also specifies early abort below.
- **Required change / acceptance scenario:** After the protected opening,
  resign one player with material around the king. Assert the army becomes
  dead, the king remains live, its regular turn chooses a uniform legal move,
  and the PRNG identity/seed/candidate order/selected move are recorded in the
  replay. Test no-legal-move resolution and the documented award split with two,
  three, and four live players.

### Timeout

- **Current — documented/tested:** The local engine has no clocks, timeout
  command, server authority, random king, or timeout result. CPU delay is not a
  chess clock. See [types.ts](../packages/engine/src/types.ts),
  [useLocalGame.ts](../apps/web/src/game/useLocalGame.ts), and the absence of a
  timeout test in `packages/engine/test`.
- **Target — documented + observed:** FFA help assigns timeout the same
  dead-army/live, randomly moving king outcome as resignation, and includes
  timeout in its early-abort condition. In the observed standard replay, the
  client announced a forfeit on time, rendered that army's non-king pieces
  grey while its king remained live, recorded `T Ki1`, and continued play. No
  immediate score delta was shown at that transition. This does not establish
  random-selection semantics or the early-abort boundary.
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
- **Target — documented + observed (maintainer report):** FFA help gives a
  disconnected player 60 seconds to reconnect before forfeiture on time. The
  main game clock continues during that window and flags immediately at zero.
  The 60 seconds is one cumulative disconnect bank per match; after it is spent
  across any number of drops, a later disconnect forfeits immediately.
- **Required change / acceptance scenario:** In an authoritative multiplayer
  harness, test clock flag before reconnect, cumulative 59/60-second drops,
  reconnect authorization, duplicate reconnects, and move ordering around a
  disconnect. These are M3 tests but must share M1 timeout semantics.

### Draws and non-elimination endings

- **Current — documented/tested:** The third occurrence of a position ends the
  game immediately; all active players tie for first, receive no bonus, and
  inactive players are ordered by elimination. There is no insufficient-
  material, 50-move, agreement, or other draw rule. See
  [rules-spec.md](rules-spec.md),
  [repetition.ts](../packages/engine/src/rules/repetition.ts),
  [elimination.ts](../packages/engine/src/rules/elimination.ts), and
  [repetition.test.ts](../packages/engine/test/repetition.test.ts).
- **Target — documented + observed (maintainer report):** FFA help says
  insufficient material, threefold repetition, and the 50-move rule give each
  remaining active player +10. The maintainer confirms this is a flat,
  non-stacking +10 award regardless of whether two or three players remain;
  threefold and 50-move triggers are automatic. The latter resets on every pawn
  move or capture, including capture of a dead piece. Insufficient material is
  automatic when no remaining active player can mate another. With three or
  four active players, that means every active player is a bare King; any pawn
  or minor piece preserves mating potential. With two active players, standard
  FIDE dead-position cases apply: K v K, K+B v K, K+N v K, and K+B v K+B with
  bishops on the same colour.
- **Required change / acceptance scenario:** Fixture automatic threefold,
  automatic 50-move threshold/reset (including dead capture), and the stated
  insufficient-material predicate. The 50-move threshold is 50 completed
  four-player rotations (200 individual turns), not 100 plies. Preserve the
  score ledger before/after the terminal event and assert exactly +10 to each
  active player.

### Game conclusion and placement ties

- **Current — documented/tested:** The game ends when one active player remains;
  that player wins. Others rank by later elimination, then score, then fixed
  Red/Blue/Yellow/Green order. Repetition gives all active players first place.
  See [rules-spec.md](rules-spec.md),
  [elimination.ts](../packages/engine/src/rules/elimination.ts), and
  [applyMove.test.ts](../packages/engine/test/applyMove.test.ts).
- **Target — documented + observed:**
  FFA help says the objective is most points, three eliminations end the game,
  the final surviving player gets +20 (or +40) for each other live king, and
  only final placement affects ratings. FFA terms additionally documents a
  two-player victory claim: when one player leads by at least 21 points, they
  may resign and grant the other player +20, which cannot overtake first place.
  The sources do not specify the +20/+40 condition, tie-break ordering for
  equal points, or a deterministic seat-order rule. The maintainer reports
  equal scores share placement with no chronology/seat/threshold tie-break, and
  ratings use the mean rank points of tied positions. Tournament tie policy is
  event scoring, not a substitute for standard-game placement. The observed
  standard game ended at the third resignation/forfeit condition and displayed
  `Yellow +60`; that confirms a terminal live-king award can be aggregated in
  the client, not its predicate or equal-score ordering.
- **Required change / acceptance scenario:** Construct finish states in which
  elimination chronology conflicts with score; equal first, second, and lower
  scores; and 0/1/2/3 other live kings remain. Capture the final standard FFA
  scoreboard and rating placement; separately exercise the documented two-player
  21-point victory claim. The maintainer clarifies that it is not a shared
  survivor award: with exactly two active players and a lead of at least 21,
  the leader may claim by surrendering their own king; the trailing player gets
  +20, the leader gets +0, and the margin preserves the leader's first place.
  Named draws instead award only their flat +10. In Standard Modern FFA, a sole
  survivor receives +20 for **each live walking king** left on the board; +40
  is legacy/custom configuration, not the Standard Modern base value. Fixture
  the claim ledger and per-walking-king award alongside point ordering/ties. A
  Claim Win ends the game immediately: scores/placements freeze and no walking
  king turn follows.

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
