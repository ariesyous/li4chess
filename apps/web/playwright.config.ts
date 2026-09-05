import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:5183",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --port 5183 --host 127.0.0.1",
    url: "http://127.0.0.1:5183",
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
