/** Harness-only subprocess. It never enters the deployed Worker bundle. */
import { handleSignals, startRuntime } from "../scripts/shared.js";
handleSignals();
// Windows Node cannot deliver POSIX SIGTERM. Exercise the same registered Node
// handler via IPC there; POSIX acceptance sends a real OS SIGTERM.
process.on("message", message => { if (message === "interrupt") process.emit("SIGTERM"); });
let starting = false;
await startRuntime(Number(process.env.TEST_PORT), process.env.TEST_OUTPUT!, process.env.TEST_FINGERPRINT!, () => {
  if (!starting) { starting = true; process.send?.("starting"); }
});
process.send?.("ready");
