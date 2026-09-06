import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readBuildIdentity } from "@li4chess/protocol/node";
import { fileURLToPath } from "node:url";

export default defineConfig(({ command }) => ({
  define: { __ENGINE_BUILD__: JSON.stringify(readBuildIdentity(fileURLToPath(new URL("../..",import.meta.url)),command === "serve")) },
  plugins: [react()],
  // Served from https://ariesyous.github.io/li4chess/ (a project Pages site), so
  // asset URLs need the repo name as a base path rather than the domain root.
  base: "/li4chess/",
}));
