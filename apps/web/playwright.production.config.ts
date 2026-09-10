import { defineConfig } from "@playwright/test";
import config from "./playwright.config.js";
const base = process.env.LI4CHESS_PREVIEW_BASE === "/" ? "/" : "/li4chess/";
export default defineConfig({ ...config, testMatch: "hybrid.spec.ts",
  webServer: { command:`npx vite preview --port 5183 --host 127.0.0.1 --base ${base}`,url:`http://127.0.0.1:5183${base}`,reuseExistingServer:false },
});
