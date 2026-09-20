import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  // @novnc/novnc uses a top-level await internally (its WebCodecs H.264
  // capability probe) - the default target predates that being legal.
  build: {
    target: "es2022",
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
