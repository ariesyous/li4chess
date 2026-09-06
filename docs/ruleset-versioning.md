# M1-02 standard-FFA ruleset and replay migration contract

**Status:** proposed migration contract, refined 2026-09-06. This document
locks the proposed identifiers and the evidence/replay requirements for the
first li4chess standard-FFA ruleset. It does **not** make the local engine
compatible, resolve an undocumented Chess.com behavior, or authorize M1-03
implementation to guess one.

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
that an unresolved item has been copied. A target ruleset remains **reserved**
until every release-affecting V item is closed and the maintainer accepts the
target contract.

## Final proposed identifiers

These are the identifiers M1-03 must use if the maintainer accepts this
contract. They are intentionally stable product identifiers, not dates, display
labels, or a Chess.com trademark.

| Identifier | Status | Meaning and write policy |
| --- | --- | --- |
| `li4chess-house-ffa-v1` | M — historical | The current engine behavior in [rules-spec.md](rules-spec.md): far-edge promotion, removed mate armies, frozen stalemates, elimination-first result, and immediate threefold draw. It is never rewritten to mean the target rules. |
| `li4chess-ffa-standard-v1` | M — reserved | The first ruleset which satisfies the documented/observed standard-FFA contract. Do not produce, advertise, or accept it as an implemented game before V items, implementation, and tests close. |
| `li4chess-replay-v2` | M — proposed schema identifier | The append-only replay envelope below. Its numeric JSON field is `replaySchemaVersion: 2`; its string identifier prevents a bare number being mistaken for semantic rules. |
| `li4chess-state-v2` | M — proposed canonical state identifier | The canonical snapshot/hash projection used by replay v2. It changes only when a state field's serialized meaning changes. |
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

## Target contract: verified core and implementation stops

The following is all that M1-02 may presently state as target behavior. It
summarizes, but does not replace, the detailed audit.

| Area | Target fact now safe to state | Evidence | Implementation boundary |
| --- | --- | --- | --- |
| Objective and finish | Points determine placement; three eliminations end a game. A two-player leader may claim at a 21-point lead by surrendering their king; the trailing player gets +20 and the leader +0. A sole survivor gets +20 per live walking king; +40 is legacy/custom, not Modern. | D + O | Fixture the claim and per-walking-king ledgers; do not infer tie ordering. |
| Scores | The sources list active-piece values, +20 mate/self-stalemate, +10 for each remaining active player when an opponent or walking king is stalemated, multi-check awards, final live-king award, and +10 named draws. Direct-current-move eligibility and same-move stacking are observed; Queens use +1/+5 and other pieces +5/+20. | D + O | Fixture award ordering and mixed discovered-check ledgers. |
| Promotion | A pawn promotes automatically to a Queen on its eighth rank; capturing that promoted Queen gives one point. Default Modern configuration says `PromoteTo=D`; replay notation displays `=Q`. | D + O | Do not assume the four-orientation coordinates beyond a fixture. |
| Elimination | Checkmate/stalemate pieces become inactive/dead/grey; captures give no points. Dead pieces do not attack, but occupy/block; a dead double-pushed pawn remains en-passant capturable for zero. | D + O | Do not assume unreported special-right interactions. |
| Resign/timeout | The army becomes dead, its king remains live and moves uniformly at random from legal moves on its own scheduled turn; mate gives +20 and stalemate gives +10 to each remaining active player. | D + O | Record server PRNG algorithm/seed, candidate ordering, and chosen move. |
| Draws | Insufficient material, threefold, and 50-move outcomes are automatic and award a flat, non-stacking +10 to each active player. The 50-move counter resets on pawn moves/captures, including dead capture; insufficient material means no active player can mate another. | D + O | Fixture thresholds and edge material. |
| Early abort | A resign or timeout before **all** players have made at least three moves aborts; the resigning player loses rating points. | D | Record per-seat move counts and event boundary; do not infer rating arithmetic or a normal placement. |
| Special-move availability | Modern FFA replay shows both castles; Modern defaults enable en passant and disable Capture the King. | O | Availability is not a complete legality contract. |

### Release-affecting verification ledger

No row below may be filled with a rule borrowed from another mode. `V` requires
the reproducible evidence specified here and the common capture protocol in the
[audit](rules-compatibility.md#reproducible-verification-protocol-for-unresolved-rules).
Until closed, M1-03 must reject the behavior as an implementation decision.

| Area | Current status | Required standard-FFA evidence / procedure | Contract after verification |
| --- | --- | --- | --- |
| Castling rights and geometry | O + V | O (maintainer report, 2026-09-06) establishes ordinary two-player destination/path and rights rules, plus dead-path blocking and no dead-piece attacks. Capture any remaining dead-piece special-right case in four-seat standard FFA and preserve board, legal/rejected action, and move list. | Standard geometry/rights/path rules, dead-path blocking/no attacks, and any confirmed special-right interaction. |
| En-passant timing | O + V | O establishes each eligible pawn owner gets one chance on that owner's next scheduled turn, with no global expiry; a dead double-pushed pawn remains zero-point capturable. Capture every geometry and a pinned/king-safety case. | Per-player eligibility/expiry, target state, dead-pawn case, and king-safety treatment. |
| Dead-piece interactions | D + O + V | D establishes inactive pieces and zero-point capture; O establishes no attacks, castle-path blocking, normal zero-point capture, and dead-pawn en passant. Confirm any unreported special-right interaction after checkmate and ordinary stalemate. | Inactive occupancy, zero-point capture, no attacks, path blocking, dead-pawn en-passant, and remaining special-right semantics. |
| Walking-king randomness | D + O | O establishes regular-turn cadence, uniform legal-move choice, active-opponent safety, and no-legal-move resolution. The replay design must record PRNG algorithm/seed/candidate ordering and canonical selected move. | Server-authoritative deterministic replay of the stated selection rule. |
| Promotion value and choices | D + O + V | D establishes automatic Queen and one-point capture value. From each colour, reach eighth rank and preserve coordinate/token evidence; verify whether any standard-FFA UI can contradict the automatic-choice rule and resolve any spare-king path separately. | Four-orientation coordinate fixture, automatic identity/provenance, and spare-king relation. |
| Score-award timing | D + O + V | O establishes direct-current-move eligibility, capture/mate stacking, and Queen/non-Queen schedule. Capture award ordering and mixed discovered-check behavior. | Recipient, one-versus-per-king timing, stacking, and ledger ordering. |
| Final +20/+40 predicate and claim | D + O + V | D establishes the two-player 21-point claim/+20 grant; O resolves Standard Modern as +20 per live walking king only for a sole survivor, with +40 legacy/custom only. Capture claim and walking-king ledgers. | Claim event, per-walking-king award, point ordering, and shared ties. |
| Draw counters | D + O + V | D/O establish automatic triggers, flat +10 award, pawn/capture resets including dead capture, and no-active-mating-material predicate. Capture thresholds and edge material. | Counter projection, reset/automatic semantics, material predicate, and terminal ledger. |
| Placement ties | O | O establishes shared equal placements and mean rank points for ratings; add result/rating fixtures. | Shared ranks with no chronology/seat/threshold tie-break. |
| Early-abort boundaries | D + V | Exercise resign and timeout with per-seat completed-move vectors `[2,3,3,3]`, `[3,3,3,3]`, and at least one uneven vector where the actor has more than three moves. Preserve terminal panel and rating/result classification. | Inclusive/exclusive boundary, which action checks it, and abort replay/result fields. |

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
| `FFA-SETUP-01..04` | D + O + V | Canonical 160-square setup, Red-first clockwise order, orientation, and coordinate fixture. |
| `FFA-CASTLE-01..16` | O + V | Both sides, all seats, ordinary rights/path restrictions, dead-path blocker/no attack, and any remaining special-right case. |
| `FFA-EP-01..12` | O + V | Per-player eligibility/expiry, target, dead-pawn capture, and king-safety timing. |
| `FFA-DEAD-01..08` | D + O + V | Zero score, inactive/no-attack, occupation/path blocking, and remaining special-right behavior. |
| `FFA-WALK-01..08` | D + O | Resign/timeout transition, regular-turn uniform legal move, PRNG derivation, and stalemate award. |
| `FFA-PROMO-01..08` | D + O + V | Eighth-rank coordinates, automatic 1-point-Queen provenance/value, and spare-king relation. |
| `FFA-SCORE-01..16` | D + O + V | Active-piece values, mate/stalemate, direct-check/stacking, Queen schedule, mixed discovered checks, award ledger. |
| `FFA-END-01..08` | D + O + V | Third elimination, 21-point claim, sole-survivor per-walking-king award, point ordering and shared ties. |
| `FFA-DRAW-01..09` | D + O + V | Automatic insufficient-material/repetition/50-move triggers, resets, material predicate, and flat +10 terminal award. |
| `FFA-ABORT-01..06` | D + V | Resign/timeout opening vectors and terminal classification without normal placement. |
| `FFA-CORE-01..12` | O + V | Ordinary legality, active-king capture, mate/stalemate timing, and turn rotation. |
| `REPLAY-01..12` | M | v2 round-trip, event/hash rejection, ruleset/setup mismatch, random action, award ledger, abort, incomplete game, build provenance, and legacy-manifest rejection. |

## Decision gates and next action

These gates deliberately keep maintainer authority distinct from reference-game
evidence.

1. **Evidence gate (D/O/V):** Close every V row above with a linked official
   clarification or reproducible standard-FFA evidence reviewed into the audit.
   Mark its fixture expectation `D` or `O`; retain the source date and scope.
2. **Contract gate (M):** The maintainer accepts or revises the five identifiers,
   replay v2 invariants, canonical state/hash policy, and legacy classification
   policy. This acceptance chooses li4chess storage/migration behavior; it does
   not resolve a Chess.com rule.
3. **Specification gate (D/O + M):** Write one target expected result per
   fixture, including event ordering, awards, final placement/ties, and any
   verified randomness. There must be no fallback to a house-rule behavior for
   a V item.
4. **Implementation gate:** Only then begin M1-03 in focused engine, protocol,
   UI, bot, and arena changes. Preserve old artifacts and run a ruleset-specific
   replay reader/fixture suite before comparing measurements.

**Exact next actionable task:** capture `FFA-EP-01..12` king-safety/geometry
evidence in standard FFA / Modern: every eligible-owner geometry, each player's
scheduled expiry, dead-double-push capture, and a pinned/self-check rejection.
Add the evidence to the audit before implementation.
