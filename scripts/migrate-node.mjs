import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { openNodeDatabase } from "../lib/server/node-database.ts";

process.umask(0o077);
if (!process.env.DMS_DATABASE_PATH) throw new Error("DMS_DATABASE_PATH is required.");
const database = openNodeDatabase(process.env.DMS_DATABASE_PATH);
try {
  database.connection.exec("CREATE TABLE IF NOT EXISTS _dms_migrations (name TEXT PRIMARY KEY NOT NULL, sha256 TEXT NOT NULL, applied_at TEXT NOT NULL)");
  const directory = fileURLToPath(new URL("../drizzle/", import.meta.url));
  const names = (await readdir(directory)).filter(name => /^\d{4}_[A-Za-z0-9_-]+\.sql$/.test(name)).sort();
  for (const name of names) {
    const sql = await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8");
    const hash = createHash("sha256").update(sql).digest("hex");
    const previous = await database.prepare("SELECT sha256 FROM _dms_migrations WHERE name = ?").bind(name).first();
    if (previous) { if (previous.sha256 !== hash) throw new Error(`Previously applied migration changed: ${name}`); continue; }
    database.connection.exec("BEGIN IMMEDIATE");
    try {
      database.connection.exec(sql);
      database.connection.prepare("INSERT INTO _dms_migrations(name,sha256,applied_at) VALUES(?,?,?)").run(name, hash, new Date().toISOString());
      database.connection.exec("COMMIT");
    } catch (error) { database.connection.exec("ROLLBACK"); throw error; }
    console.log(`Applied ${name}`);
  }
} finally { database.close(); }
