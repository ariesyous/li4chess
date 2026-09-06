# State-v2 and replay-v2 implementation

Implemented for `li4chess-ffa-standard-v1` from the accepted
[migration contract](ruleset-versioning.md). Public TypeScript shapes live in
[protocol types](../packages/protocol/src/types.ts); executable evidence is
mapped in [REPLAY acceptance](m1-replay-acceptance.md).

## State and canonical hashes

`RulesetStateV2` contains `stateSchemaId`, `rulesetId`, `setupId`, a replay-local
`sequence`, the explicit `position` projection and `pendingEffects`. Position
contains every engine field except its duplicate ruleset marker: all 196 cells,
owners/types/moved flags/pawn-Queen provenance, players/king states/forfeit facts,
no-move causation, seat controls, scores, turn and turn number, castling and EP
rights, completed/reversible counts, repetition history, random seed/cursor and
actions, move history, ordered awards, logical position sequence and result.
`RulesetResultV2` has schema/ruleset identities and the full result projection.

`li4chess-canonical-json-v1` recursively sorts object keys and uses finite
ECMAScript JSON number/string encoding, UTF-8 and no whitespace. Undefined
object optionals are omitted; undefined/sparse array entries, non-finite values,
cycles, symbols and non-plain values reject. Null is distinct from omission.
EP records sort by victim/target/owner and eligible seats sort numerically in
both state hashes and checkpoint identity. Other array order is significant.
The digest is SHA-256, written `sha256:<64 lowercase hexadecimal digits>`.
Known vectors and independent field/order controls cover the implementation.

State imports validate all field shapes and cross-field constraints, including
live Kings, current-turn eligibility, EP geometry, ledger totals, random cursor
history, terminal predicates, claim facts and points placements. They do not
prove a checkpoint was reached by legal play before its recorded history.

## Starting positions and provenance

`li4chess-modern-ffa-setup-v1` requires the canonical Modern initial position.
Human/CPU controls, difficulty and random seed may vary; board, rights, counts,
turn, scores and histories must match the initial setup. Other starts use
`li4chess-ffa-checkpoint-v1:sha256:<digest>` of the normalized initial position.
Readers recompute this identity. A checkpoint result is never evidence of a
complete game from the Modern board.

Each producer records its immutable Git revision, package versions, full source
content fingerprint, and clean/dirty/unreproducible status. Dirty trees retain
their content hash; Vite HMR output is explicitly unreproducible. The Node
producer hashes tracked and nonignored untracked files, including deletions,
and guards arena runs against source/commit drift before and after play.
Readers preserve the producer identity; it is not their installed revision.

Appending an existing replay requires an explicit matching producer identity.
The app instead creates a new checkpoint after a verified import, recording the
canonical source replay SHA-256 in `game.sourceReplayHash` and the current build
on export. The original source remains unchanged. This is a content link, not
authentication or proof of ownership. M3 supplies network seat/clock authority.

## Events and interrupted transactions

Events are `move`, `resign`, `timeout`, `disconnectForfeit`, `randomKingMove`,
`claimWin`, `scoreAward`, `terminal` and `abort`. Every event has contiguous
replay-local `sequence` starting at 1, `positionSequence`, and canonical before/
after hashes. Move metadata is regenerated from legal intentions; unknown
fields, actors, moves, captures, promotions, checks and eliminations reject.
Walking events retain the chosen canonical move, fixed algorithm/seed/cursor/
draw count/candidate hash, and forfeit cause; replay never uses ambient RNG.

The engine's logical history may predate a checkpoint. `positionSequence`
preserves that history while local `sequence` counts this log. Event-level
`causeSequence` refers to this log's initiating event. A walking forfeit before
the checkpoint instead uses `checkpointCause: { positionSequence }`. Embedded
engine ledgers, random history and result facts retain their original global
position sequences. For a complete Modern game the two sequence spaces coincide.

For example, a checkpoint at position sequence 17 can record a move as local
event 1 / position 18, then its capture as local event 2 / position 19 with
`causeSequence: 1`. That event's embedded award preserves `sequence: 19` and
`causeSequence: 18`. Both namespaces and tampering are tested explicitly.

An initiating action computes the complete immutable engine transition. Its
first event applies the non-score changes and hashes the expected pending
awards/result. Each subsequent effect consumes one recomputed queue entry,
updates the ledger/total or result, and advances both sequences. Capture,
multi-check, scheduled mate/stalemate, survivor/draw/claim awards and the result
retain engine order. Every nonzero award is a separate event; zero awards vanish.

Imported queues are never trusted. The initial checkpoint must have no pending
effects; replay derives them from each validated action. A truncated log can end
with a pending queue and null result. It is unfinished, not a draw or loss, and
cannot authorize another action until its effects finish. `appendReplay` can
complete the transaction for the same producer; `replayCheckpoint` can recover
the deterministic remainder for a new producer's derived checkpoint. The local
app pauses input/CPU scheduling during imports and rejects invalid files without
replacing its current game.

## Local forfeit facts

Timeout requires `clock: { remainingMs: 0 }`. Disconnect forfeit requires
`bankMs: 60000`, zero remaining bank and an integer cumulative disconnected time
of at least 60000 ms. It uses timeout status/early-timeout abort semantics but
retains its distinct disconnect cause, never a fabricated zero main clock.
Resignation carries neither clock nor disconnect facts. The opening count vector
and liable actor survive abort without normal placements or awards. Live clock
updates, reconnect tracking and authoritative sessions are M3 work.

## Arena and historical records

`GameRecord.version: 2` wraps replay-v2 with seed, engine/config IDs, ply budget,
runtime/OS/hardware environment and diagnostic move metrics. Replay and
aggregation are asynchronous and validate the replay plus redundant result,
scores, statuses, eliminations, move source and actual branching. Automatic
walking moves remain game plies but are excluded from engine timing/search
statistics. Capped/error games remain unfinished; aborts have separate counts;
completed games use points/shared mean ranks and distinguish tied from sole wins.

Writers require fresh output directories and record current build/config/budget
facts. No current playing-strength conclusion is drawn by M1 validation. The
current sparse experiment uses rank-six promotion pawns and is explicitly a new
setup; it does not rewrite historical measurements.

Default readers reject raw/unversioned/partial/house snapshots and every legacy
arena-v1 record. The separate [legacy manifest](legacy-replay-manifest.json)
checksums all 29 archived artifacts; all 14 replay logs remain unclassified
because their declared baseline does not establish an exact producing build.
Their bytes are preserved and rejection is executable. Reclassification/replay
requires producing-revision evidence or a dedicated compatibility reader;
no old game was rerun or reaggregated under standard-v1. The old archival writer
is disabled before I/O to protect the frozen directory.
