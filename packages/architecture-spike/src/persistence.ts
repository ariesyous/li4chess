import { canonicalJson, sha256 } from "@li4chess/protocol";
import type { ReplayEnvelopeV2 } from "@li4chess/protocol";
import { PROTOCOL } from "./command.js";

export interface Snapshot {
  protocol: typeof PROTOCOL; commandSequence: number; replay: ReplayEnvelopeV2;
  receipt: { id: string; commandHash: string };
}

/** Refuse individually valid but divergent restored stores. This supplements
 * replay-v2 validation: a valid replay alone does not prove canonical lineage. */
export async function assertSuccessor(prior: Snapshot | null, next: Snapshot, previousHash: string | null): Promise<void> {
  if (next.commandSequence !== (prior ? prior.commandSequence + 1 : 0)) throw new Error("Canonical sequence gap");
  if (previousHash !== (prior ? await sha256(canonicalJson(prior)) : null)) throw new Error("Canonical predecessor conflict");
  if (!prior) {
    if (next.replay.events.length !== 0) throw new Error("Initial record has actions");
    return;
  }
  const { events: beforeEvents, result: _beforeResult, finalStateHash: _beforeHash, ...beforeHeader } = prior.replay;
  const { events: afterEvents, result: _afterResult, finalStateHash: _afterHash, ...afterHeader } = next.replay;
  if (canonicalJson(beforeHeader) !== canonicalJson(afterHeader) ||
      canonicalJson(beforeEvents) !== canonicalJson(afterEvents.slice(0,beforeEvents.length))) throw new Error("Canonical replay prefix conflict");
  const actions = afterEvents.slice(beforeEvents.length).filter(event => !["scoreAward", "terminal", "abort"].includes(event.type));
  if (actions.length !== 1) throw new Error("Expected one authoritative action");
}
