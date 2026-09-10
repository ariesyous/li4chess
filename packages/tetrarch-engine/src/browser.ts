import createModule from "../runtime/tetrarch.mjs";
import runtime from "../runtime/manifest.json";
import vendor from "../vendor/tetrarch/manifest.json";
import { ResearchWasm } from "./wasm.js";
import type { AdvisorySearch } from "./hybrid.js";

async function asset(url: URL, hash: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error("engine-asset-unavailable");
  const buffer = await response.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2,"0")).join("");
  if (actual !== hash) throw new Error("engine-asset-integrity");
  return new Uint8Array(buffer);
}

/** Instantiate only inside a terminable browser Worker. No network or C work on the UI thread. */
export function browserAdviser(): AdvisorySearch {
  let loading: Promise<ResearchWasm> | undefined;
  const prepare = async () => {
    loading ??= (async () => {
      const [binary, params, net] = await Promise.all([
        asset(new URL("../runtime/tetrarch.wasm", import.meta.url), runtime.hashes["tetrarch.wasm"]),
        asset(new URL("../vendor/tetrarch/params.bin", import.meta.url), vendor.imported.find(f=>f.name==="params.bin")!.sha256),
        asset(new URL("../vendor/tetrarch/net-ffa1.nnue", import.meta.url), vendor.imported.find(f=>f.name==="net-ffa1.nnue")!.sha256),
      ]);
      return new ResearchWasm(await createModule({ wasmBinary: binary }), params, net);
    })();
    await loading;
  };
  return { prepare, async search(request) {
    await prepare();
    const engine = await loading!;
    engine.setPosition(request.squares, request.meta);
    return engine.search(request.budget);
  } };
}
