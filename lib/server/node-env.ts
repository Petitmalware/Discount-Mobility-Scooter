import { openNodeDatabase } from "./node-database";
import { createSmtpMailer } from "./node-mailer";

let db: ReturnType<typeof openNodeDatabase> | undefined;
export const env = {
  ...process.env,
  // Self-hosted requests never use the hosting service's identity headers.
  ADMIN_AUTH_MODE: "password",
  get DB() {
    if (!process.env.DMS_DATABASE_PATH) throw new Error("DMS_DATABASE_PATH is required.");
    return (db ??= openNodeDatabase(process.env.DMS_DATABASE_PATH)) as unknown as D1Database;
  },
  DMS_MAILER: createSmtpMailer(process.env),
};
