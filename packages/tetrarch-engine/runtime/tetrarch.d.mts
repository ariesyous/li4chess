import type { WasmModule } from "../src/wasm.js";
export default function createModule(options: { wasmBinary: Uint8Array }): Promise<WasmModule>;
