import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { readBuildIdentity } from "@li4chess/protocol/node";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

export default defineConfig(({ command, mode }) => ({
  define: { __MULTIPLAYER__: JSON.stringify(mode === "workers" && JSON.parse(readFileSync(new URL("../worker/.generated/build.json", import.meta.url), "utf8")).multiplayer === true), __ENGINE_BUILD__: JSON.stringify(mode === "workers"
    ? JSON.parse(readFileSync(new URL("../worker/.generated/build.json", import.meta.url), "utf8")).producer
    : readBuildIdentity(fileURLToPath(new URL("../..",import.meta.url)),command === "serve")) },
  plugins: [react()],
  // Served from https://ariesyous.github.io/li4chess/ (a project Pages site), so
  // asset URLs need the repo name as a base path rather than the domain root.
  base: mode === "workers" ? "/" : "/li4chess/",
  build: { outDir: mode === "workers" ? "dist-workers" : "dist" },
}));
