import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // Served from https://ariesyous.github.io/li4chess/ (a project Pages site), so
  // asset URLs need the repo name as a base path rather than the domain root.
  base: "/li4chess/",
});
