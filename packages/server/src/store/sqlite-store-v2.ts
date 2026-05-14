// ──────────────────────────────────────────────
// Engine v2 — SQLite Session Store
// ──────────────────────────────────────────────

import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { SessionStateV2 } from "@hushline/shared";

export interface SessionStoreV2 {
  getSession(id: string): SessionStateV2 | null;
  saveSession(session: SessionStateV2): void;
  deleteSession(id: string): void;
}

export function createSqliteStoreV2(dbPath = defaultDbPath()): SessionStoreV2 {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions_v2 (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      scenario_pack_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  const upsertSession = db.query(`
    INSERT INTO sessions_v2 (id, state_json, scenario_pack_id, created_at, updated_at)
    VALUES ($id, $stateJson, $scenarioPackId, $createdAt, $updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `);
  const selectSession = db.query("SELECT state_json FROM sessions_v2 WHERE id = $id");
  const deleteSessionQuery = db.query("DELETE FROM sessions_v2 WHERE id = $id");

  return {
    getSession(id: string): SessionStateV2 | null {
      const row = selectSession.get({ $id: id }) as { state_json: string } | null;
      if (!row) return null;
      return JSON.parse(row.state_json) as SessionStateV2;
    },

    saveSession(session: SessionStateV2): void {
      upsertSession.run({
        $id: session.id,
        $stateJson: JSON.stringify(session),
        $scenarioPackId: session.scenarioPackId,
        $createdAt: session.createdAt,
        $updatedAt: session.updatedAt,
      });
    },

    deleteSession(id: string): void {
      deleteSessionQuery.run({ $id: id });
    },
  };
}

function defaultDbPath(): string {
  return resolve(process.env.HUSHLINE_DB_PATH ?? "packages/server/data/hushline.db");
}
