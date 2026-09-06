import { runCpuJob } from "./cpuJob.js";

// One fresh Worker per request. terminate() interrupts synchronous computation;
// a cancellation message queued behind the search would not.
self.onmessage = (event: MessageEvent<unknown>) => {
  void runCpuJob(event.data, message => self.postMessage(message))
    .then(response => self.postMessage(response))
    .catch(error => { setTimeout(() => { throw error; }, 0); });
};
