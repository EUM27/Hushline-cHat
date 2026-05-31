import { createApp } from "./app";
import { createAppV2 } from "./app-v2";
import { createMemoryStore, createMemoryStoreV2 } from "./store/memory-store";

const app = createApp({ store: createMemoryStore() });
const appV2 = createAppV2({ store: createMemoryStoreV2() });

app.route("/", appV2);

export default app;
