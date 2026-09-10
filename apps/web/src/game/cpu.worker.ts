import { runCpuJob } from "./cpuJob.js";
import { browserAdviser } from "@li4chess/tetrarch-engine/browser";
const adviser = browserAdviser();

// One fresh Worker per request. terminate() interrupts synchronous computation;
// a cancellation message queued behind the search would not.
self.onmessage = (event: MessageEvent<unknown>) => {
  void runCpuJob(event.data, message => self.postMessage(message), adviser)
    .then(response => self.postMessage(response))
    .catch(error => { setTimeout(() => { throw error; }, 0); });
};
