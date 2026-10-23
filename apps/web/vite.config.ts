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
  // Local/project-path builds use /li4chess/. Pages supplies its configured base
  // at build time: / for the existing li4chess.org custom domain.
  base: mode === "workers" ? "/" : "/li4chess/",
  build: { outDir: mode === "workers" ? "dist-workers" : "dist" },
}));
