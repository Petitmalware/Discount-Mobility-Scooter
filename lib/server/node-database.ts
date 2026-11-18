import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { mkdirSync, chmodSync } from "node:fs";
import { dirname, isAbsolute } from "node:path";

type Row = Record<string, unknown>;
type Operation = "all" | "first" | "run";

function parameters(values: unknown[]): SQLInputValue[] {
  return values.map(value => {
    if (value === null || typeof value === "string" || typeof value === "bigint" || value instanceof Uint8Array) return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    throw new Error("Unsupported database parameter.");
  });
}

export class NodePreparedStatement {
  readonly database: NodeDatabase;
  readonly sql: string;
  readonly values: SQLInputValue[];
  constructor(database: NodeDatabase, sql: string, values: SQLInputValue[] = []) {
    this.database = database; this.sql = sql; this.values = values;
  }
  bind(...values: unknown[]) { return new NodePreparedStatement(this.database, this.sql, parameters(values)); }
  execute(operation: Operation, column?: string): unknown {
    const started = performance.now();
    const statement = this.database.connection.prepare(this.sql);
    if (operation === "first") {
      const row = statement.get(...this.values);
      if (!row) return null;
      return column === undefined ? { ...row } : row[column] ?? null;
    }
    if (operation === "all") {
      const before = Number(this.database.connection.prepare("SELECT total_changes() AS n").get()!.n);
      const results = statement.all(...this.values).map(row => ({ ...row }));
      const changes = Number(this.database.connection.prepare("SELECT total_changes() AS n").get()!.n) - before;
      const last = Number(this.database.connection.prepare("SELECT last_insert_rowid() AS n").get()!.n);
      return { results, success: true, meta: { duration: performance.now() - started, changes, last_row_id: last, rows_read: results.length, rows_written: changes, changed_db: changes > 0, size_after: 0 } };
    }
    const result = statement.run(...this.values);
    return { results: [], success: true, meta: { duration: performance.now() - started, changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid), rows_read: 0, rows_written: Number(result.changes), changed_db: Number(result.changes) > 0, size_after: 0 } };
  }
  async first<T = Row>(column?: string): Promise<T | null> { return this.execute("first", column) as T | null; }
  async all<T = Row>() { return this.execute("all") as { results: T[]; success: true; meta: { changes: number } }; }
  async run() { return this.execute("run") as { results: never[]; success: true; meta: { changes: number; last_row_id: number } }; }
}

export class NodeDatabase {
  readonly connection: DatabaseSync;
  constructor(file: string) {
    if (file !== ":memory:" && !isAbsolute(file)) throw new Error("DMS_DATABASE_PATH must be an absolute path.");
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
    this.connection = new DatabaseSync(file, { enableForeignKeyConstraints: true, allowExtension: false });
    this.connection.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
    if (file !== ":memory:" && process.platform !== "win32") chmodSync(file, 0o600);
  }
  prepare(sql: string) { return new NodePreparedStatement(this, sql); }
  async batch<T = Row>(statements: NodePreparedStatement[]) {
    if (!Array.isArray(statements) || statements.some(statement => !(statement instanceof NodePreparedStatement) || statement.database !== this)) throw new Error("Invalid database batch.");
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const results = statements.map(statement => statement.execute("all") as { results: T[]; success: true });
      this.connection.exec("COMMIT");
      return results;
    } catch (error) { this.connection.exec("ROLLBACK"); throw error; }
  }
  async exec(sql: string) {
    const started = performance.now(); this.connection.exec(sql);
    return { count: 0, duration: performance.now() - started };
  }
  close() { this.connection.close(); }
}

export function openNodeDatabase(file: string) { return new NodeDatabase(file); }
