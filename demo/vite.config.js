import { defineConfig } from "vite";

// BASE_PATH=/autoportrait/ is set by the Pages workflow so the built demo
// serves from the project subpath on github.io.
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  server: { fs: { allow: [".."] } },
});
