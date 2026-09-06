# REPLAY acceptance and implementation choices — 2026-09-06

Written before implementation from the accepted [v2 contract](ruleset-versioning.md).
The implementation closes the accepted v2 contract; final local validation and
final-revision CI remain the M1 release gate. Legacy data is never relabelled.

| ID | Explicit input and expected outcome |
| --- | --- |
| REPLAY-01 | Required format/schema/ruleset/setup/build identities and initial canonical hash. Missing/unknown/mismatched identity rejects before action replay; clean builds require immutable revision and package versions, dirty builds a content digest or explicit unreproducible label. |
| REPLAY-02 | Equivalent object key orders produce identical canonical JSON and SHA-256; array order remains significant except normalized EP eligibility and repetition maps. Non-finite numbers, sparse arrays and unsupported values reject. Null differs from omitted optional data. Known SHA-256 vectors and all rules/state fields have hash controls. |
| REPLAY-03 | Legal move action produces its canonical move and exact resulting state. Wrong actor, illegal move, forged capture/promotion/check/elimination metadata, skipped/duplicate sequence or before/after hash rejects. |
| REPLAY-04 | Each nonzero capture/multi-check/mate/stalemate/draw/survivor/claim award is a separate contiguous event with rule, recipient, subject when applicable, delta, cause and resulting total. Missing/reordered/edited awards reject. |
| REPLAY-05 | Recorded walking action includes canonical move, forfeit cause, algorithm/seed/cursor/draws-used and candidate hash. Replay validates the recorded action and fixed algorithm independently of ambient RNG; altered selection, actor, cause, candidate hash or move rejects. |
| REPLAY-06 | Resign, zero-clock timeout and exhausted cumulative disconnect-bank facts are distinct validated local inputs. Opening abort records exact vector/classification/liable actor/facts without placements; later forfeit follows WALK. Network clock/session authority remains M3. |
| REPLAY-07 | Every terminal/abort event carries the exact recomputed result and final hash; extra actions reject. Named draw, claim, third-elimination and shared-point results round-trip. |
| REPLAY-08 | A null result denotes incomplete state, never a draw/loss. Export/resume preserves every counter, right, ledger and random cursor. Truncation inside an action's award transaction retains pending effects and cannot authorize a new action until those effects complete. |
| REPLAY-09 | Raw v1/unversioned/house/partial snapshots reject in default readers and aggregation. Separate read-only legacy manifest records actual checksums/provenance or unclassified status. Original bytes and frozen classic remain unchanged. |
| REPLAY-10 | Complete games starting from Modern setup, plus synthetic cross-feature promotion/EP/scoring/walking/end/draw fixtures, replay to exact final canonical state. Arena writers use v2 with build/environment/config/seed/budget provenance and validate before reporting. App export/import resumes incomplete games and shows terminal results. |
| REPLAY-11 | Explicit content-addressed checkpoints preserve state and history without claiming a Modern start. Local event sequences and historical position sequences are distinct and validated. |
| REPLAY-12 | Malformed fields, EP geometry/eligibility, passive turns, fabricated terminal predicates and inconsistent claim facts reject; canonical state covers all rule inputs. |

Canonical encoding is `li4chess-canonical-json-v1`: recursively sorted object
keys, ECMAScript finite-number/string JSON encoding, no whitespace, UTF-8, SHA-256
named as `sha256:<64 lowercase hex>`. Object-valued undefined optionals are omitted;
undefined array entries and unsupported values reject. EP records/eligible seats
are normalized in the state projection because their order is not semantic.

State-v2 is an explicit envelope around the engine position, with schema, ruleset,
immutable setup ID and a pending-effect queue. An initiating action computes the
engine transition atomically. Its first event applies non-score position changes
and queues the independently recomputed ordered awards/result; each subsequent
event consumes exactly one expected effect and advances the logical sequence.
The pending queue is hashed and forbids another initiating action. This preserves
meaningful before/after hashes for every award without exposing half-applied
states to normal game input. It is a local recording convention, not a claim
about Chess.com's internal event order.

Build provenance belongs to the producer, never the reader's installed revision.
Browser builds embed the Git revision and dirty content digest at Vite startup;
HMR development output is explicitly unreproducible. Arena output uses fresh
directories and records the actual source tree/environment. Historical research
is checked/read at its producing revision or rejected by default; no cross-ruleset
strength inference is made during compatibility validation.

Implementation details and checkpoint/cause namespaces: [state-v2/replay-v2](state-replay-v2.md). Executable cases: [protocol](../packages/protocol/test/replay.test.ts), [producer provenance](../packages/protocol/test/node.test.ts), [arena](../packages/arena/test/arena.test.ts), [legacy rejection](../packages/arena/test/legacy.test.ts), and [browser](../apps/web/e2e/replay.spec.ts).
