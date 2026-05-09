import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { ChatMessage, SessionState } from "@hushline/shared";
import { createInitialSessionState, type CreateSessionOptions } from "../engine/turn-engine";

export interface SessionStore {
  createSession(options?: CreateSessionOptions): SessionState;
  getSession(id: string): SessionState | null;
  saveSession(session: SessionState): void;
  appendMessage(sessionId: string, message: ChatMessage): SessionState | null;
}

export function createSqliteStore(dbPath = defaultDbPath()): SessionStore {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  const insertSession = db.query(
    "INSERT INTO sessions (id, state_json, created_at, updated_at) VALUES ($id, $stateJson, $createdAt, $updatedAt)",
  );
  const updateSession = db.query(
    "UPDATE sessions SET state_json = $stateJson, updated_at = $updatedAt WHERE id = $id",
  );
  const selectSession = db.query("SELECT state_json FROM sessions WHERE id = $id");

  return {
    createSession(options) {
      const session = createInitialSessionState(crypto.randomUUID(), options);
      insertSession.run({
        $id: session.id,
        $stateJson: JSON.stringify(session),
        $createdAt: session.createdAt,
        $updatedAt: session.updatedAt,
      });
      return session;
    },

    getSession(id: string) {
      const row = selectSession.get({ $id: id }) as { state_json: string } | null;
      if (!row) {
        return null;
      }
      return JSON.parse(row.state_json) as SessionState;
    },

    saveSession(session: SessionState) {
      updateSession.run({
        $id: session.id,
        $stateJson: JSON.stringify(session),
        $updatedAt: session.updatedAt,
      });
    },

    appendMessage(sessionId: string, message: ChatMessage) {
      const session = this.getSession(sessionId);
      if (!session) {
        return null;
      }
      const nextSession = {
        ...session,
        messages: [...session.messages, message],
        updatedAt: new Date().toISOString(),
      };
      this.saveSession(nextSession);
      return nextSession;
    },
  };
}

function defaultDbPath(): string {
  return resolve(process.env.HUSHLINE_DB_PATH ?? "packages/server/data/hushline.db");
}
