import { resolve } from "node:path";
process.env.M3_06_CASES="replay";
process.env.M3_06_OUTPUT=process.env.M3_07_OUTPUT??resolve("../../arena-results",`m3-07-${Date.now()}`);
await import("./campaign.js");
