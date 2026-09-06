# M1-02 standard-FFA ruleset and replay migration contract

**Status:** accepted migration contract; M1-02 complete 2026-09-06. The
maintainer accepted the identifiers, replay v2 invariants, canonical state/hash
policy, and legacy classification policy below. This document does **not** make
the local engine compatible, resolve an undocumented Chess.com behavior, or
authorize M1-03 implementation to guess one.

The target is Chess.com's current **standard FFA / Modern** game only. Teams,
Solo, Diplomacy, custom variants, generic two-player chess rules, and historic
community posts are out of scope except where the
[compatibility audit](rules-compatibility.md) contrasts them to prevent an
incorrect import. The primary external authority is Chess.com's current
[4 Player Chess help article](https://support.chess.com/en/articles/8614233-4-player-chess-4pc)
and its [4 Player Chess terms article](https://www.chess.com/terms/4-player-chess),
both retrieved 2026-09-06. The audit also records the dated, read-only Modern
editor and standard-game replay observations on which this contract relies.

## Contract vocabulary and authority

An assertion has exactly one of these evidence states:

| State | Meaning | May become an implementation assertion? |
| --- | --- | --- |
| **D — documented** | Explicit in the current official standard-FFA help. | Yes, after the fixture specifies inputs and result. |
| **O — observed** | Seen in a dated standard FFA / Modern client or replay, including a dated maintainer report of live-product observation; the audit records its provenance. | Only for the exact observed behavior. |
| **V — verify** | Not settled by D/O. The listed procedure must produce a standard-game replay, screenshots, or an official Chess.com clarification. | No. |
| **M — maintainer decision** | A li4chess identifier, storage policy, or deliberate non-compatibility choice. It is not evidence of Chess.com behavior. | Only after maintainer acceptance, and never as a substitute for D/O/V. |

`standard` in an identifier means li4chess intends to match the documented and
verified standard-FFA contract; it does not claim Chess.com ownership or imply
that an unresolved item has been copied. The target ruleset remains **reserved**
until M1-03 implements and tests the accepted contract.

## Accepted identifiers

These are the identifiers M1-03 must use. They are intentionally stable product
identifiers, not dates, display labels, or a Chess.com trademark.

| Identifier | Status | Meaning and write policy |
| --- | --- | --- |
| `li4chess-house-ffa-v1` | M — historical | The current engine behavior in [rules-spec.md](rules-spec.md): far-edge promotion, removed mate armies, frozen stalemates, elimination-first result, and immediate threefold draw. It is never rewritten to mean the target rules. |
| `li4chess-ffa-standard-v1` | M — reserved | The first ruleset which satisfies the documented/observed standard-FFA contract. Do not produce, advertise, or accept it as an implemented game before V items, implementation, and tests close. |
| `li4chess-replay-v2` | M — accepted schema identifier | The append-only replay envelope below. Its numeric JSON field is `replaySchemaVersion: 2`; its string identifier prevents a bare number being mistaken for semantic rules. |
| `li4chess-state-v2` | M — accepted canonical state identifier | The canonical snapshot/hash projection used by replay v2. It changes only when a state field's serialized meaning changes. |
| `legacy-arena-v1` | M — historical format identifier | Existing `GameRecord.version === 1` arena data. It is not replay v2 and is not automatically any semantic ruleset. |

Every new replay additionally records an **engine build identity**, not another
ruleset version:

```ts
interface EngineBuildIdentityV1 {
  readonly format: "li4chess-engine-build-v1";
  readonly sourceRevision: string; // full immutable Git commit, not a branch name
  readonly packageVersions: Readonly<Record<string, string>>;
  readonly buildFingerprint?: string; // reproducible CI/build artifact digest when available
}
```

`sourceRevision` and package versions are required. A dirty working tree must
be represented by a separately stored patch/content digest or be labelled
`unreproducible`; it must not reuse a clean commit identity. Compatible bug fixes
create a new engine build identity, not a new ruleset ID. A semantic rules
change creates a new ruleset ID even if its envelope schema is unchanged.

## Target contract: verified core and implementation boundaries

The following is all that M1-02 may presently state as target behavior. It
summarizes, but does not replace, the detailed audit.

| Area | Target fact now safe to state | Evidence | Implementation boundary |
| --- | --- | --- | --- |
| Setup and normal legality | Modern setup is the recorded 14×14/160-square four-wing position; Red starts and rotation is clockwise. Ordinary self-check, pins, live-king non-capture, king adjacency, and first-move double pushes apply across active opponents. | D + O | Use the recorded coordinate fixture; do not retain a differing house orientation. |
| Objective and finish | Points determine placement; three eliminations end a game. A two-player leader may claim at a 21-point lead by surrendering their king; the trailing player gets +20 and the leader +0. A sole survivor gets +20 per live walking king; +40 is legacy/custom, not Modern. | D + O | Fixture the claim and per-walking-king ledgers; do not infer tie ordering. |
| Scores | The sources list active-piece values, +20 mate/self-stalemate, +10 for each remaining active player when an opponent or walking king is stalemated, multi-check awards, final live-king award, and +10 named draws. Direct-current-move eligibility and same-move stacking are observed; Queens use +1/+5 and other pieces +5/+20. | D + O | Fixture award ordering and mixed discovered-check ledgers. |
| Promotion | A pawn promotes automatically to a Queen on its eighth rank; capturing that promoted Queen gives one point. It remains a Queen for multi-check scoring; spare kings are legacy/custom-only and unreachable in Modern. | D + O | Preserve promoted-piece provenance in state/replay; omit spare king from Modern fixtures. |
| Elimination | Checkmate/stalemate pieces become inactive/dead/grey; captures give no points. Dead pieces never move, attack, or retain special rights; they only occupy/block and remain zero-point capturable, including after a dead double push. | D + O | Model a passive obstacle rather than an active owner piece. |
| Resign/timeout | The army becomes dead, its king remains live and moves uniformly at random from legal moves on its own scheduled turn; mate gives +20 and stalemate gives +10 to each remaining active player. | D + O | Record server PRNG algorithm/seed, candidate ordering, and chosen move. |
| Draws | Insufficient material, threefold, and 50-move outcomes are automatic and award a flat, non-stacking +10 to each active player. The counter resets on pawn moves/captures, including dead capture; 50 rotations = 200 turns. Three/four-player insufficient material requires bare kings; two-player uses the stated FIDE dead positions. | D + O | Fixture the stated thresholds and material cases. |
| Early abort | A resign or timeout before **all** players have made at least three moves aborts; the resigning player loses rating points. | D | Record per-seat move counts and event boundary; do not infer rating arithmetic or a normal placement. |
| Special-move availability | Modern FFA replay shows both castles; Modern defaults enable en passant and disable Capture the King. | O | Availability is not a complete legality contract. |

### Release-affecting verification ledger

All release-affecting rows below are closed with D/O evidence. If later evidence
reopens a row as `V`, it requires the reproducible procedure specified here and
the common capture protocol in the
[audit](rules-compatibility.md#reproducible-verification-protocol-for-unresolved-rules);
M1-03 must not fill it with a rule borrowed from another mode.

| Area | Current status | Required standard-FFA evidence / procedure | Contract after verification |
| --- | --- | --- | --- |
| Castling rights and geometry | O | O establishes ordinary two-player destination/path and rights rules, plus passive dead-path blocking/no attack. Add fixtures and replay evidence; no further target semantic is open. | Standard geometry/rights/path rules and passive dead-path blocking. |
| En-passant timing | O | O establishes each eligible pawn owner gets one chance on that owner's next scheduled turn, no global expiry, a zero-point dead-double-push capture, and ordinary self-check rejection. Add every-geometry fixture. | Per-player eligibility/expiry, target state, dead-pawn case, and king-safety treatment. |
| Dead-piece interactions | D + O | D/O establish passive occupancy, zero-point capture, no attacks, no moves/special rights, path blocking, and dead-pawn en-passant. Add checkmate/stalemate fixtures. | Passive obstacle semantics. |
| Walking-king randomness | D + O | O establishes regular-turn cadence, uniform legal-move choice, active-opponent safety, and no-legal-move resolution. The replay design must record PRNG algorithm/seed/candidate ordering and canonical selected move. | Server-authoritative deterministic replay of the stated selection rule. |
| Promotion value and choices | D + O | Automatic Queen, one-point capture value, Queen scoring classification, and no Modern spare king are settled. Add four-orientation fixture. | Four-orientation coordinate fixture and provenance. |
| Score-award timing | D + O | Direct-current-move eligibility, capture/mate stacking, Queen/non-Queen schedule, and Queen-priority mixed discovered checks are settled. Add award-ledger fixture. | Recipient, mixed-check classification, and ledger ordering. |
| Final +20/+40 predicate and claim | D + O | Standard Modern is +20 per live walking king only for a sole survivor; +40 is legacy/custom. A Claim Win ends immediately after the leader's surrendered king awards +20 to the trailer. Add ledgers. | Claim event, per-walking-king award, point ordering, and shared ties. |
| Draw counters | D + O | Automatic triggers, flat +10 award, 50-rotation/200-turn threshold, pawn/capture resets, and stated 2-player/3+-player material predicates are settled. Add fixtures. | Counter projection and terminal ledger. |
| Placement ties | O | O establishes shared equal placements and mean rank points for ratings; add result/rating fixtures. | Shared ranks with no chronology/seat/threshold tie-break. |
| Early-abort boundaries | D | Exercise resign and timeout with per-seat completed-move vectors `[2,3,3,3]`, `[3,3,3,3]`, and an uneven vector. The documented predicate remains: abort iff any player has fewer than three completed moves. | Authoritative counter and abort replay/result fields. |

An official support response that explicitly answers a row may replace a live
replay for that row. The evidence record must retain the URL, retrieval date,
quoted behavior in a short paraphrase, and why it applies to standard FFA.

## Replay v2: deterministic event and state contract

Replay v2 is an append-only, ruleset-specific log plus a canonical initial
snapshot and final projection. JSON versus JSONL is storage detail; event order
and canonical serialization are not.

```ts
interface ReplayEnvelopeV2 {
  readonly format: "li4chess-replay-v2";
  readonly replaySchemaVersion: 2;
  readonly rulesetId: "li4chess-house-ffa-v1" | "li4chess-ffa-standard-v1";
  readonly stateSchemaId: "li4chess-state-v2";
  readonly engineBuild: EngineBuildIdentityV1;
  readonly game: {
    readonly mode: "ffa";
    readonly setupId: string; // immutable, versioned board/setup fixture ID
    readonly seatOrder: readonly PlayerColor[];
    readonly timeControl?: { readonly initialMs: number; readonly incrementMs: number };
  };
  readonly initialState: RulesetStateV2;
  readonly initialStateHash: string;
  readonly events: readonly ReplayEventV2[];
  readonly result: RulesetResultV2 | null;
  readonly finalStateHash: string;
}
```

`RulesetStateV2` and `RulesetResultV2` are names for future explicitly
versioned types, not aliases for today's unversioned `GameState`/`GameResult`.
Their canonical projection must contain every rules input and visible result:

- setup ID, board square contents, each piece's owner, identity/provenance and
  dead/live interaction state; current turn and player/king state;
- castling rights, en-passant target/eligibility, draw counters/position
  identity, per-seat completed-move counts, and all scoring totals;
- authoritative clocks when present, status/cause fields, and any pending
  walking-king/random decision state;
- final terminal reason, all placements/ties, and an ordered award ledger with
  rule, recipient(s), delta, triggering event sequence, and resulting total.

The state hash uses one documented canonical JSON encoding and a named digest
algorithm. A future hash-algorithm change is a new state-schema ID or replay
schema; it must never merely change a helper under an unchanged identifier.

```ts
type ReplayEventV2 =
  | MoveEventV2
  | ResignEventV2
  | TimeoutEventV2
  | DisconnectForfeitEventV2
  | RandomKingMoveEventV2
  | ScoreAwardEventV2
  | TerminalEventV2
  | AbortEventV2;

interface EventBaseV2 {
  readonly sequence: number; // contiguous, starting at 1
  readonly stateHashBefore: string;
  readonly stateHashAfter: string;
}

interface RandomKingMoveEventV2 extends EventBaseV2 {
  readonly type: "randomKingMove";
  readonly actor: PlayerColor;
  readonly causeSequence: number;
  readonly move: Move;
  readonly selection: {
    readonly algorithmId: string;
    readonly candidateMovesHash: string;
    readonly seed?: string;
    readonly drawIndex?: number;
  };
}
```

The remaining event types carry the same base fields plus their actor/cause,
canonical move or authoritative clock fact, and any required award/terminal
data. A `ScoreAwardEventV2` is required for every non-zero rule award; its
delta cannot be reconstructed later from a UI total. `TerminalEventV2` records
the reason and final result projection. `AbortEventV2` records the triggering
resign/timeout sequence, per-seat move counts, and its `early-resign` or
`early-timeout` classification.

### Replay invariants

1. `initialStateHash` is the canonical hash of `initialState`. Events are
   contiguous and authorized by the ruleset state before them; the first event's
   `stateHashBefore` equals `initialStateHash`. Replaying each event produces
   its recorded hash; the final event hash equals `finalStateHash`; recomputed
   terminal output equals `result`.
2. The chosen walking-king move is always recorded. Its selection metadata
   makes a repeatable random derivation auditable, but a reader must be able to
   replay the recorded canonical action even if platform RNG changes.
3. A timeout, disconnect forfeit, random action, score award, result, or abort
   is server-authoritative in networked play. Client clocks, wall-clock event
   timestamps, chat, and presence are diagnostics, never reducer inputs.
4. A `null` result is an incomplete/censored game, not a draw, placement, or
   loss. It must retain enough state/events to resume or diagnose it.
5. `rulesetId`, `setupId`, and `engineBuild` are mandatory. A move list alone
   cannot claim compatibility or safely reproduce a result.

## Legacy replay and arena preservation

Do not edit, relocate, bulk-rewrite, or recompute files under
`docs/engine/results/`. They remain historical evidence under their producing
engine, not test inputs for the new ruleset.

1. Existing `GameRecord.version === 1` data is `legacy-arena-v1`. Its
   provenance is its `initial` state and producing code, not the current
   installed engine or a v2 label.
2. Before a legacy record may be replayed or aggregated, create a separate,
   read-only manifest entry containing artifact path and checksum, format ID,
   producing revision, engine/config IDs, seeds/budgets, environment, and its
   classification: `li4chess-house-ffa-v1` only when supported by provenance,
   otherwise `unclassified`.
3. Replay a classified legacy record at its producing revision or through a
   dedicated compatibility reader. A future engine must not silently consume it
   through its default reducer.
4. Never relabel or overwrite a legacy result as `li4chess-ffa-standard-v1`.
   Any conversion is a new derived artifact with its own source checksum,
   producing build, ruleset ID, and result; it cannot replace the original.
5. New M1-03 onward arena output uses a fresh directory and records all v2
   identities, engine configuration, seeds, budgets, environment, and replay
   validation. Cross-ruleset strength comparisons are prohibited unless an
   explicit methodology defines their interpretation.

## Acceptance-fixture inventory

Fixtures are written only after the stated evidence exists; `D + V` is not
permission to hard-code the V part. Geometry-sensitive fixtures run for Red,
Blue, Yellow, and Green.

| IDs | Evidence status | Required assertion |
| --- | --- | --- |
| `FFA-SETUP-01..04` | D + O | Canonical 160-square setup, Red-first clockwise order, orientation, and coordinate fixture. |
| `FFA-CASTLE-01..16` | O | Both sides, all seats, ordinary rights/path restrictions, and passive dead-path blocking/no attack. |
| `FFA-EP-01..12` | O | Per-player eligibility/expiry, target, dead-pawn capture, and king-safety timing. |
| `FFA-DEAD-01..08` | D + O | Zero score, passive occupation/no attack/no special rights, path blocking, and dead-pawn en passant. |
| `FFA-WALK-01..08` | D + O | Resign/timeout transition, regular-turn uniform legal move, PRNG derivation, and stalemate award. |
| `FFA-PROMO-01..08` | D + O | Eighth-rank coordinates, automatic 1-point-Queen provenance/value/classification, and no spare king. |
| `FFA-SCORE-01..16` | D + O | Active-piece values, mate/stalemate, direct-check/stacking, Queen schedule, mixed discovered checks, award ledger. |
| `FFA-END-01..08` | D + O | Third elimination, immediate 21-point claim, sole-survivor per-walking-king award, point ordering and shared ties. |
| `FFA-DRAW-01..09` | D + O | Automatic insufficient-material/repetition/50-move triggers, 50 rotations/200 turns, resets, material predicate, and flat +10 terminal award. |
| `FFA-ABORT-01..06` | D | Resign/timeout opening vectors and terminal classification without normal placement. |
| `FFA-CORE-01..12` | O | Ordinary legality, active-king capture, deferred mate/stalemate timing, and turn rotation. |
| `REPLAY-01..12` | M | v2 round-trip, event/hash rejection, ruleset/setup mismatch, random action, award ledger, abort, incomplete game, build provenance, and legacy-manifest rejection. |

## Completed M1-02 gates and next action

These gates deliberately keep maintainer authority distinct from reference-game
evidence.

1. **Evidence gate (D/O) — complete:** The current ledger has a D/O target fact for every
   release-affecting behavior. Preserve the source date/scope and write the
   listed fixtures as executable evidence; a later contradiction reopens the
   affected row rather than silently changing the ruleset.
2. **Contract gate (M) — complete 2026-09-06:** The maintainer accepted the five
   identifiers, replay v2 invariants, canonical state/hash policy, and legacy
   classification policy. This chooses li4chess storage/migration behavior; it
   does not assert a Chess.com rule or claim implementation compatibility.
3. **Executable-fixture gate (D/O + M) — first M1-03 phase:** Write one target
   input and expected result per fixture, including event ordering, awards,
   final placement/ties, and verified randomness. There must be no fallback to
   house-rule behavior for a reopened `V` item.
4. **Behavior-change gate — M1-03:** Only after its relevant fixtures exist,
   implement focused engine, protocol, UI, bot, and arena changes. Preserve old
   artifacts and run a ruleset-specific replay reader/fixture suite before
   comparing measurements.

**Exact next actionable task:** begin M1-03 by turning the D/O fixture
inventory—starting with `FFA-SETUP-01..04`, `FFA-CORE-01..12`, and
`FFA-EP-01..12`—into focused engine/replay tests before changing behavior.
