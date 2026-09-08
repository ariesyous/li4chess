import { resolve } from "node:path";
process.env.M3_06_CASES="rematch";
process.env.M3_06_OUTPUT=process.env.M3_08_OUTPUT??resolve("../../arena-results",`m3-08-${Date.now()}`);
await import("./campaign.js");
