import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

if (!process.env.WORKER_BASE_URL || !process.env.M3_02_OUTPUT) throw new Error("Run via pnpm test:workers");
export default defineConfig({
  testDir: ".", testMatch: "acceptance.spec.ts", timeout: 30000, retries: 0, workers: 1,
  outputDir: resolve(process.env.M3_02_OUTPUT, "browser"),
  reporter: [["list"], ["json", { outputFile: resolve(process.env.M3_02_OUTPUT, "browser-results.json") }]],
  use: { baseURL: process.env.WORKER_BASE_URL, trace: "retain-on-failure" },
});
