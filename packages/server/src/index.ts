import { createApp } from "./app";

const port = Number(process.env.PORT ?? 7871);
const app = createApp();

Bun.serve({
  port,
  fetch: app.fetch,
});

console.info(`Hushline Chat API listening on http://localhost:${port}`);
