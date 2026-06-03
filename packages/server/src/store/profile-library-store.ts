import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Database } from "bun:sqlite";
import type { CharacterDefinition } from "@hushline/shared";
import { characterCardSourceMetadataSchema, type CharacterCardSourceMetadata } from "../engine-v2/schemas.js";

export interface ReusablePersonaProfile {
  name: string;
  shortName?: string;
  role?: string;
  description?: string;
  appearance?: string;
  portraitUrl?: string;
  relationshipTags: string[];
}

export interface PersonaProfileRecord {
  id: string;
  label: string;
  persona: ReusablePersonaProfile;
  createdAt: string;
  updatedAt: string;
}

export interface CharacterCardRecord {
  id: string;
  name: string;
  sourceFileName?: string;
  sourceMetadata?: CharacterCardSourceMetadata;
  character: CharacterDefinition;
  createdAt: string;
  updatedAt: string;
}

export interface SavePersonaProfileRecordInput {
  id?: string;
  label?: string;
  persona: ReusablePersonaProfile;
}

export interface SaveCharacterCardRecordInput {
  id?: string;
  name?: string;
  sourceFileName?: string;
  sourceMetadata?: CharacterCardSourceMetadata;
  character: CharacterDefinition;
}

export interface ProfileLibraryStore {
  listPersonaProfiles(): PersonaProfileRecord[];
  getPersonaProfile(id: string): PersonaProfileRecord | null;
  savePersonaProfile(input: SavePersonaProfileRecordInput): PersonaProfileRecord;
  listCharacterCards(): CharacterCardRecord[];
  getCharacterCard(id: string): CharacterCardRecord | null;
  saveCharacterCard(input: SaveCharacterCardRecordInput): CharacterCardRecord;
  close(): void;
}

export function createMemoryProfileLibraryStore(): ProfileLibraryStore {
  const personas = new Map<string, PersonaProfileRecord>();
  const cards = new Map<string, CharacterCardRecord>();

  return {
    listPersonaProfiles(): PersonaProfileRecord[] {
      return sortByUpdatedAtDesc([...personas.values()].map(clonePersonaRecord));
    },

    getPersonaProfile(id: string): PersonaProfileRecord | null {
      const record = personas.get(id);
      return record ? clonePersonaRecord(record) : null;
    },

    savePersonaProfile(input: SavePersonaProfileRecordInput): PersonaProfileRecord {
      const now = new Date().toISOString();
      const existing = input.id ? personas.get(input.id) : undefined;
      const record: PersonaProfileRecord = {
        id: input.id ?? crypto.randomUUID(),
        label: input.label?.trim() || input.persona.name,
        persona: clonePersona(input.persona),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      personas.set(record.id, clonePersonaRecord(record));
      return clonePersonaRecord(record);
    },

    listCharacterCards(): CharacterCardRecord[] {
      return sortByUpdatedAtDesc([...cards.values()].map(cloneCharacterCardRecord));
    },

    getCharacterCard(id: string): CharacterCardRecord | null {
      const record = cards.get(id);
      return record ? cloneCharacterCardRecord(record) : null;
    },

    saveCharacterCard(input: SaveCharacterCardRecordInput): CharacterCardRecord {
      const now = new Date().toISOString();
      const existing = input.id ? cards.get(input.id) : undefined;
      const record: CharacterCardRecord = {
        id: input.id ?? crypto.randomUUID(),
        name: input.name?.trim() || input.character.name,
        ...(input.sourceFileName ? { sourceFileName: input.sourceFileName } : {}),
        ...(input.sourceMetadata ? { sourceMetadata: cloneCharacterCardSourceMetadata(input.sourceMetadata) } : {}),
        character: cloneCharacterDefinition(input.character),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      cards.set(record.id, cloneCharacterCardRecord(record));
      return cloneCharacterCardRecord(record);
    },

    close(): void {
      personas.clear();
      cards.clear();
    },
  };
}

export function createSqliteProfileLibraryStore(dbPath = defaultDbPath()): ProfileLibraryStore {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS persona_profiles (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      persona_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS character_cards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      source_file_name TEXT,
      source_metadata_json TEXT,
      character_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  ensureColumn(db, "character_cards", "source_metadata_json", "TEXT");

  if (dbPath !== ":memory:") {
    db.exec("PRAGMA journal_mode = WAL;");
  }

  const listPersonas = db.query(`
    SELECT id, label, persona_json, created_at, updated_at
    FROM persona_profiles
    ORDER BY updated_at DESC
  `);
  const getPersona = db.query(`
    SELECT id, label, persona_json, created_at, updated_at
    FROM persona_profiles
    WHERE id = $id
  `);
  const upsertPersona = db.query(`
    INSERT INTO persona_profiles (id, label, persona_json, created_at, updated_at)
    VALUES ($id, $label, $personaJson, $createdAt, $updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      label = excluded.label,
      persona_json = excluded.persona_json,
      updated_at = excluded.updated_at
  `);

  const listCards = db.query(`
    SELECT id, name, source_file_name, source_metadata_json, character_json, created_at, updated_at
    FROM character_cards
    ORDER BY updated_at DESC
  `);
  const getCard = db.query(`
    SELECT id, name, source_file_name, source_metadata_json, character_json, created_at, updated_at
    FROM character_cards
    WHERE id = $id
  `);
  const upsertCard = db.query(`
    INSERT INTO character_cards (id, name, source_file_name, source_metadata_json, character_json, created_at, updated_at)
    VALUES ($id, $name, $sourceFileName, $sourceMetadataJson, $characterJson, $createdAt, $updatedAt)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      source_file_name = excluded.source_file_name,
      source_metadata_json = excluded.source_metadata_json,
      character_json = excluded.character_json,
      updated_at = excluded.updated_at
  `);

  return {
    listPersonaProfiles(): PersonaProfileRecord[] {
      return (listPersonas.all() as PersonaRow[]).map(rowToPersonaRecord);
    },

    getPersonaProfile(id: string): PersonaProfileRecord | null {
      const row = getPersona.get({ $id: id }) as PersonaRow | null;
      return row ? rowToPersonaRecord(row) : null;
    },

    savePersonaProfile(input: SavePersonaProfileRecordInput): PersonaProfileRecord {
      const now = new Date().toISOString();
      const id = input.id ?? crypto.randomUUID();
      const existingRow = getPersona.get({ $id: id }) as PersonaRow | null;
      const existing = existingRow ? rowToPersonaRecord(existingRow) : null;
      const record: PersonaProfileRecord = {
        id,
        label: input.label?.trim() || input.persona.name,
        persona: clonePersona(input.persona),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      upsertPersona.run({
        $id: record.id,
        $label: record.label,
        $personaJson: JSON.stringify(record.persona),
        $createdAt: record.createdAt,
        $updatedAt: record.updatedAt,
      });
      return clonePersonaRecord(record);
    },

    listCharacterCards(): CharacterCardRecord[] {
      return (listCards.all() as CharacterCardRow[]).map(rowToCharacterCardRecord);
    },

    getCharacterCard(id: string): CharacterCardRecord | null {
      const row = getCard.get({ $id: id }) as CharacterCardRow | null;
      return row ? rowToCharacterCardRecord(row) : null;
    },

    saveCharacterCard(input: SaveCharacterCardRecordInput): CharacterCardRecord {
      const now = new Date().toISOString();
      const id = input.id ?? crypto.randomUUID();
      const existingRow = getCard.get({ $id: id }) as CharacterCardRow | null;
      const existing = existingRow ? rowToCharacterCardRecord(existingRow) : null;
      const record: CharacterCardRecord = {
        id,
        name: input.name?.trim() || input.character.name,
        ...(input.sourceFileName ? { sourceFileName: input.sourceFileName } : {}),
        ...(input.sourceMetadata ? { sourceMetadata: cloneCharacterCardSourceMetadata(input.sourceMetadata) } : {}),
        character: cloneCharacterDefinition(input.character),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      upsertCard.run({
        $id: record.id,
        $name: record.name,
        $sourceFileName: record.sourceFileName ?? null,
        $sourceMetadataJson: record.sourceMetadata ? JSON.stringify(record.sourceMetadata) : null,
        $characterJson: JSON.stringify(record.character),
        $createdAt: record.createdAt,
        $updatedAt: record.updatedAt,
      });
      return cloneCharacterCardRecord(record);
    },

    close(): void {
      db.close();
    },
  };
}

interface PersonaRow {
  id: string;
  label: string;
  persona_json: string;
  created_at: string;
  updated_at: string;
}

interface CharacterCardRow {
  id: string;
  name: string;
  source_file_name: string | null;
  source_metadata_json: string | null;
  character_json: string;
  created_at: string;
  updated_at: string;
}

function rowToPersonaRecord(row: PersonaRow): PersonaProfileRecord {
  return {
    id: row.id,
    label: row.label,
    persona: JSON.parse(row.persona_json) as ReusablePersonaProfile,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToCharacterCardRecord(row: CharacterCardRow): CharacterCardRecord {
  const sourceMetadata = parseCharacterCardSourceMetadata(row.source_metadata_json);
  return {
    id: row.id,
    name: row.name,
    ...(row.source_file_name ? { sourceFileName: row.source_file_name } : {}),
    ...(sourceMetadata ? { sourceMetadata } : {}),
    character: JSON.parse(row.character_json) as CharacterDefinition,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function sortByUpdatedAtDesc<T extends { updatedAt: string }>(records: T[]): T[] {
  return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function clonePersonaRecord(record: PersonaProfileRecord): PersonaProfileRecord {
  return {
    ...record,
    persona: clonePersona(record.persona),
  };
}

function clonePersona(persona: ReusablePersonaProfile): ReusablePersonaProfile {
  return {
    ...persona,
    relationshipTags: [...persona.relationshipTags],
  };
}

function cloneCharacterCardRecord(record: CharacterCardRecord): CharacterCardRecord {
  return {
    ...record,
    ...(record.sourceMetadata ? { sourceMetadata: cloneCharacterCardSourceMetadata(record.sourceMetadata) } : {}),
    character: cloneCharacterDefinition(record.character),
  };
}

function cloneCharacterCardSourceMetadata(metadata: CharacterCardSourceMetadata): CharacterCardSourceMetadata {
  return {
    ...metadata,
    extensionKeys: [...metadata.extensionKeys],
  };
}

function cloneCharacterDefinition(character: CharacterDefinition): CharacterDefinition {
  const next: CharacterDefinition = {
    ...character,
    ocean: { ...character.ocean },
    handout: {
      ...character.handout,
      ...(character.handout.surfacePersonality ? { surfacePersonality: [...character.handout.surfacePersonality] } : {}),
      ...(character.handout.behaviorRules ? { behaviorRules: [...character.handout.behaviorRules] } : {}),
    },
    relationships: character.relationships.map((relationship) => ({ ...relationship })),
  };
  if (character.relationshipTags) {
    next.relationshipTags = [...character.relationshipTags];
  }
  return next;
}

function defaultDbPath(): string {
  return resolve(process.env.HUSHLINE_DB_PATH ?? "packages/server/data/hushline.db");
}

function ensureColumn(db: Database, table: string, column: string, definition: string): void {
  const columns = db.query(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((row) => row.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition};`);
  }
}

function parseCharacterCardSourceMetadata(json: string | null): CharacterCardSourceMetadata | undefined {
  if (!json) return undefined;
  try {
    const parsed = characterCardSourceMetadataSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
