/** Research-only WASM interface; no application imports this module. */
export interface WasmModule {
  HEAPU8: Uint8Array;
  _malloc(size: number): number;
  _free(ptr: number): void;
  _tt_params_size(): number;
  _tt_init(ptr: number): void;
  _tt_ready(): number;
  _tt_alloc(mb: number): number;
  _tt_clear(): void;
  _tt_net_loaded(): number;
  _sp_load_net(ptr: number): number;
  _sp_board(squares: number, meta: number): void;
  _sp_legal(ptr: number): number;
  _sp_search(depth: number, nodes: number): void;
  _sp_nodes(): number;
  _sp_best(): number;
  _sp_score(): number;
  _sp_aborted(): number;
  _sp_eval(): number;
  _sp_pv(first: number, ptr: number): number;
}

export function validateNetwork(bytes: Uint8Array): void {
  if (bytes.length !== 1976880) throw new Error("NNUE length mismatch");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (String.fromCharCode(...bytes.slice(0,4)) !== "TTNN") throw new Error("NNUE magic mismatch");
  const expected = [2,3840,256,7,32,32,6,6,6,0];
  if (expected.some((v,i) => view.getUint32(4+i*4,true) !== v)) throw new Error("NNUE format/dimensions mismatch");
}

export class ResearchWasm {
  readonly initializationMs: number;
  readonly nnueLoadMs: number;
  constructor(private readonly wasm: WasmModule, params: Uint8Array, net: Uint8Array) {
    const started = performance.now();
    if (params.length !== wasm._tt_params_size()) throw new Error("Parameter ABI mismatch");
    validateNetwork(net);
    this.withBytes(params, ptr => wasm._tt_init(ptr));
    if (!wasm._tt_ready() || !wasm._tt_alloc(16)) throw new Error("WASM initialization failed");
    const nnStarted = performance.now();
    this.withBytes(net, ptr => { if (!wasm._sp_load_net(ptr)) throw new Error("NNUE loading failed"); });
    if (!wasm._tt_net_loaded()) throw new Error("NNUE not loaded; hand evaluation is forbidden");
    this.nnueLoadMs = performance.now() - nnStarted;
    this.initializationMs = performance.now() - started;
  }
  private withBytes<T>(bytes: Uint8Array, fn: (ptr: number) => T): T {
    const ptr = this.wasm._malloc(bytes.length);
    if (!ptr) throw new Error("WASM allocation failed");
    try { this.wasm.HEAPU8.set(bytes, ptr); return fn(ptr); } finally { this.wasm._free(ptr); }
  }
  setPosition(squares: Uint8Array, meta: Int32Array): void {
    if (squares.length !== 256 || meta.length !== 18 || squares.some(p => p > 35)) throw new Error("Invalid research board");
    this.withBytes(squares, a => this.withBytes(new Uint8Array(meta.buffer, meta.byteOffset, meta.byteLength), b => this.wasm._sp_board(a,b)));
    this.wasm._tt_clear();
  }
  private moves(fn: (ptr: number) => number): number[] {
    return this.withBytes(new Uint8Array(4096), ptr => {
      const n = fn(ptr);
      if (n < 0 || n > 1024) throw new Error("Invalid move count");
      return Array.from(new Uint32Array(this.wasm.HEAPU8.buffer, ptr, n));
    });
  }
  legal(): number[] { return this.moves(ptr => this.wasm._sp_legal(ptr)); }
  evaluate(): number { return this.wasm._sp_eval(); }
  memoryBytes(): number { return this.wasm.HEAPU8.buffer.byteLength; }
  search(options: { nodeBudget: number; maxDepth: number; timeMs?: number }) {
    if (!Number.isSafeInteger(options.nodeBudget) || options.nodeBudget < 1 || !Number.isInteger(options.maxDepth)
      || options.maxDepth < 1 || options.maxDepth > 32 || (options.timeMs !== undefined && (!Number.isFinite(options.timeMs) || options.timeMs <= 0)))
      throw new Error("Invalid research budget");
    const started = performance.now();
    let nodes = 0, depth = 0, best = this.legal()[0], score: number | null = null;
    for (let d = 1; d <= options.maxDepth && nodes < options.nodeBudget; d++) {
      const elapsed = performance.now() - started;
      if (options.timeMs !== undefined && elapsed >= options.timeMs) break;
      // Mirrors v8's rate-estimated root cap. This is NOT a hard wall-clock guarantee.
      let limit = options.nodeBudget - nodes;
      if (options.timeMs !== undefined && nodes > 0)
        limit = Math.min(limit, Math.max(1, Math.floor(nodes / elapsed * (options.timeMs - elapsed))));
      this.wasm._sp_search(d, limit);
      nodes += this.wasm._sp_nodes();
      if (this.wasm._sp_aborted()) break;
      best = this.wasm._sp_best(); score = this.wasm._sp_score(); depth = d;
    }
    const elapsedMs = performance.now() - started;
    return { best, score, depth, nodes, elapsedMs, nodesPerSecond: nodes / elapsedMs * 1000,
      pv: best === undefined ? [] : this.moves(ptr => this.wasm._sp_pv(best,ptr)),
      nnueLoaded: !!this.wasm._tt_net_loaded(), memoryBytes: this.memoryBytes() };
  }
}
