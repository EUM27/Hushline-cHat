import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const clientPort = Number(process.env.CLIENT_PORT ?? 4187);
const apiTarget = process.env.HUSHLINE_API_TARGET ?? "http://localhost:7871";

export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    port: clientPort,
    strictPort: true,
    proxy: {
      "/api": apiTarget,
    },
  },
});
