import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./acceptance", timeout: 900_000, workers: 1, fullyParallel: false,
  reporter: [["list"]], outputDir: "test-results/evidence",
  use: { baseURL: "http://127.0.0.1:5185/li4chess/", trace: "retain-on-failure" },
  webServer: { command: "pnpm preview --port 5185 --host 127.0.0.1", url: "http://127.0.0.1:5185/li4chess/", reuseExistingServer: false },
});
