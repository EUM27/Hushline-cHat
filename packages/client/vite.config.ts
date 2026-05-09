import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const clientPort = Number(process.env.CLIENT_PORT ?? 4187);
const apiTarget = process.env.HUSHLINE_API_TARGET ?? "http://localhost:7871";

export default defineConfig({
  plugins: [react()],
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
});
