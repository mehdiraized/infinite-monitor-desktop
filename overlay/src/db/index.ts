import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as schema from "./schema";

const DB_PATH =
	process.env.DATABASE_PATH || path.join(process.cwd(), "data", "widgets.db");

const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
	fs.mkdirSync(dir, { recursive: true });
}

const sqlite = new Database(DB_PATH);

// Set busy_timeout FIRST — before any other operation.
// Makes SQLite retry for up to 5 s when another process holds the write lock.
sqlite.pragma("busy_timeout = 5000");
sqlite.pragma("journal_mode = WAL");

// Wrap ALL DDL in a single IMMEDIATE transaction so the write lock is
// acquired once (with busy_timeout retry) and all schema changes run
// atomically.  This prevents SQLITE_BUSY when multiple Next.js build
// workers evaluate this module simultaneously.
const initSchema = sqlite.transaction(() => {
	sqlite.exec(`CREATE TABLE IF NOT EXISTS dashboards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Dashboard',
  widget_ids_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

	sqlite.exec(`CREATE TABLE IF NOT EXISTS widgets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Widget',
  description TEXT NOT NULL DEFAULT '',
  code TEXT,
  files_json TEXT,
  layout_json TEXT,
  messages_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

	{
		const cols = sqlite.prepare("PRAGMA table_info(widgets)").all() as {
			name: string;
		}[];
		const colNames = new Set(cols.map((c) => c.name));
		if (!colNames.has("files_json")) {
			sqlite.exec("ALTER TABLE widgets ADD COLUMN files_json TEXT");
		}
	}

	sqlite.exec(`CREATE TABLE IF NOT EXISTS text_blocks (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL DEFAULT '',
  font_size INTEGER NOT NULL DEFAULT 24,
  layout_json TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
)`);

	{
		const dashCols = sqlite.prepare("PRAGMA table_info(dashboards)").all() as {
			name: string;
		}[];
		const dashColNames = new Set(dashCols.map((c) => c.name));
		if (!dashColNames.has("text_block_ids_json")) {
			sqlite.exec("ALTER TABLE dashboards ADD COLUMN text_block_ids_json TEXT");
		}
	}
});

initSchema.immediate();

export const db = drizzle(sqlite, { schema });

export { schema };
