import { readFile, stat } from "node:fs/promises";
import { isAbsolute } from "node:path";
import { openNodeDatabase } from "../lib/server/node-database.ts";

// Import a private JSON export made by the owner. Never accept SQL or a path
// through an HTTP endpoint; this command is an offline deployment operation.
process.umask(0o077);
const [source] = process.argv.slice(2);
if (!source || !isAbsolute(source) || !process.env.DMS_DATABASE_PATH) throw new Error("Supply an absolute private JSON export path and DMS_DATABASE_PATH.");
const metadata = await stat(source);
if (!metadata.isFile() || metadata.size > 25 * 1024 * 1024) throw new Error("Invalid data export.");
const payload = JSON.parse(await readFile(source, "utf8"));
const allowed = {
  inquiries: ["id", "reference", "data", "status", "created_at"],
  product_records: ["id", "slug", "data", "updated_at"],
  store_settings: ["id", "data", "updated_at"],
};
if (!payload || payload.format !== "dms-d1-export-v1" || !payload.tables || Object.keys(payload.tables).some(name => !Object.hasOwn(allowed, name))) throw new Error("Unrecognized data export.");
const database = openNodeDatabase(process.env.DMS_DATABASE_PATH);
let count = 0;
try {
  database.connection.exec("BEGIN IMMEDIATE");
  for (const [table, columns] of Object.entries(allowed)) {
    const rows = payload.tables[table] ?? [];
    if (!Array.isArray(rows) || rows.length > 10_000) throw new Error("Invalid exported rows.");
    const existing = Number(database.connection.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n);
    if (existing) throw new Error(`Import requires an empty destination table: ${table}`);
    const statement = database.connection.prepare(`INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`);
    for (const row of rows) {
      if (!row || Object.keys(row).some(column => !columns.includes(column)) || columns.some(column => typeof row[column] !== "string")) throw new Error("Invalid exported row.");
      if (JSON.stringify(row).length > 200_000) throw new Error("Exported row exceeds its expected size.");
      statement.run(...columns.map(column => row[column])); count++;
    }
  }
  database.connection.exec("COMMIT");
  console.log(`Imported ${count} records. No customer details were printed.`);
} catch (error) { database.connection.exec("ROLLBACK"); throw error; }
finally { database.close(); }
