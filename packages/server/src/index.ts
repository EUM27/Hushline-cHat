import { createApp } from "./app";
import { createAppV2 } from "./app-v2";
import { createMemoryCortexStore } from "./store/memory-cortex-store";
import { createSqliteProfileLibraryStore } from "./store/profile-library-store";
import { createSqliteStore } from "./store/sqlite-store";
import { createSqliteStoreV2 } from "./store/sqlite-store-v2";

const port = Number(process.env.PORT ?? 7871);
const app = createApp({ store: createSqliteStore() });
const appV2 = createAppV2({
  store: createSqliteStoreV2(),
  memoryStore: createMemoryCortexStore(),
  profileLibraryStore: createSqliteProfileLibraryStore(),
});

// Mount v2 routes on the same server
app.route("/", appV2);

Bun.serve({
  port,
  fetch: app.fetch,
});

console.info(`Hushline Chat API listening on http://localhost:${port}`);
console.info(`  v1 endpoints: /api/sessions, /api/assets, ...`);
console.info(`  v2 endpoints: /api/v2/sessions, /api/v2/scenarios, ...`);
