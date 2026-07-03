import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/app/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "../api/public/app",
    emptyOutDir: true,
  },
  server: {
    proxy: { "/api": "http://localhost:3000" },
  },
});
