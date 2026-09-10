import { runCpuJob } from "./cpuJob.js";
self.onmessage = (event: MessageEvent<unknown>) => {
  void runCpuJob(event.data, message => self.postMessage(message))
    .then(response => self.postMessage(response))
    .catch(error => { setTimeout(() => { throw error; }, 0); });
};
