// ──────────────────────────────────────────────
// Engine v2 — API Routes
// ──────────────────────────────────────────────
// Mounted alongside v1 routes during migration.
// All v2 endpoints live under /api/v2/
// ──────────────────────────────────────────────

import { Hono } from "hono";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenarioPack, listScenarioPacks } from "./engine-v2/index.js";
import { registerMakerRoutes } from "./app-v2/maker-routes.js";
import { registerSessionRoutes } from "./app-v2/session-routes.js";
import { registerCardRoutes } from "./app-v2/card-routes.js";
import { registerProfileLibraryRoutes } from "./app-v2/library-routes.js";
import { createMemoryStoreV2 } from "./store/memory-store.js";
import type { MemoryCortexStore } from "./store/memory-cortex-store.js";
import { createMemoryProfileLibraryStore, type ProfileLibraryStore } from "./store/profile-library-store.js";
import type { SessionStoreV2 } from "./store/sqlite-store-v2.js";

export interface CreateAppV2Options {
  store?: SessionStoreV2;
  memoryStore?: MemoryCortexStore;
  profileLibraryStore?: ProfileLibraryStore;
  scenariosDir?: string;
}

export function createAppV2(options: CreateAppV2Options = {}) {
  const store = options.store ?? createMemoryStoreV2();
  const profileLibraryStore = options.profileLibraryStore ?? createMemoryProfileLibraryStore();
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const scenariosDir = options.scenariosDir ?? resolve(__dirname, "../scenarios");
  const app = new Hono();

  app.get("/api/v2/scenarios", (context) => {
    const packs = listScenarioPacks(scenariosDir);
    return context.json({ scenarios: packs });
  });

  app.get("/api/v2/scenarios/:packId", (context) => {
    const packId = context.req.param("packId");
    const result = loadScenarioPack(resolve(scenariosDir, packId));

    if (!result.success) {
      return context.json({ error: "Scenario pack validation failed", details: result.errors }, 400);
    }

    return context.json({
      manifest: result.pack.manifest,
      scenarioCard: result.pack.scenarioCard,
      characters: result.pack.characters.map((character) => ({
        id: character.id,
        name: character.name,
        shortName: character.shortName,
        role: character.role,
        anonymousLabel: character.anonymousLabel,
        autonomy: character.autonomy,
      })),
      mainObjective: result.pack.mainObjective,
    });
  });

  registerMakerRoutes(app);
  registerProfileLibraryRoutes(app, profileLibraryStore);
  registerCardRoutes(app, { profileLibraryStore });
  registerSessionRoutes(app, {
    store,
    ...(options.memoryStore ? { memoryStore: options.memoryStore } : {}),
    scenariosDir,
  });

  return app;
}
