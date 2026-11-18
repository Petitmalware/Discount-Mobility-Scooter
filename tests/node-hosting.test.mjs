import { test } from "node:test";
import assert from "node:assert/strict";
import { openNodeDatabase } from "../lib/server/node-database.ts";
import { allowedHosts, guardRequest } from "../scripts/node-security.mjs";
import { mailbox, smtpOptions } from "../lib/server/node-mailer.ts";

test("SQLite preserves bound values and atomic returning counters", async () => {
  const db = openNodeDatabase(":memory:");
  try {
    await db.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT); CREATE TABLE limits(key TEXT PRIMARY KEY, count INTEGER)");
    const dangerous = "x'); DROP TABLE records; --";
    const saved = await db.prepare("INSERT INTO records(id,value) VALUES(?,?)").bind("one", dangerous).run();
    assert.equal(saved.meta.changes, 1);
    assert.deepEqual(await db.prepare("SELECT * FROM records WHERE id=?").bind("one").first(), { id: "one", value: dangerous });
    assert.equal(await db.prepare("SELECT value FROM records WHERE id=?").bind("missing").first(), null);
    assert.equal(await db.prepare("SELECT value FROM records WHERE id=?").bind("one").first("value"), dangerous);
    const count = () => db.prepare("INSERT INTO limits(key,count) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count").bind("login").first();
    assert.equal((await count()).count, 1); assert.equal((await count()).count, 2);
    assert.equal((await db.prepare("SELECT * FROM records").all()).results.length, 1);
    assert.throws(() => db.prepare("SELECT ?").bind(undefined));
  } finally { db.close(); }
});

test("SQLite batches commit together, report changes, and roll back on failure", async () => {
  const db = openNodeDatabase(":memory:");
  try {
    await db.exec("CREATE TABLE records(id TEXT PRIMARY KEY, value TEXT)");
    const result = await db.batch([db.prepare("INSERT INTO records VALUES(?,?)").bind("a", "first"), db.prepare("INSERT INTO records VALUES(?,?)").bind("b", "second")]);
    assert.equal(result[0].meta.changes, 1); assert.equal(result[1].meta.changes, 1);
    await assert.rejects(db.batch([db.prepare("INSERT INTO records VALUES(?,?)").bind("c", "third"), db.prepare("INSERT INTO records VALUES(?,?)").bind("a", "duplicate")]));
    assert.equal(await db.prepare("SELECT * FROM records WHERE id=?").bind("c").first(), null);
    assert.equal((await db.prepare("SELECT COUNT(*) AS n FROM records").first()).n, 2);
  } finally { db.close(); }
});

test("Node ingress rejects host/protocol poisoning and removes forged identity", () => {
  const hosts = allowedHosts("discountmobilityscooter.com");
  const request = () => ({ headers: { host: "discountmobilityscooter.com", "x-forwarded-proto": "https", "x-forwarded-host": "attacker.test", "x-real-ip": "203.0.113.4", "cf-connecting-ip": "forged", "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "owner@example.test" }, socket: { remoteAddress: "127.0.0.1" } });
  const valid = request(); assert.equal(guardRequest(valid, hosts), true);
  assert.equal(valid.headers["x-forwarded-host"], "discountmobilityscooter.com");
  assert.equal(valid.headers["cf-connecting-ip"], "203.0.113.4");
  assert.equal(valid.headers["oai-authenticated-user-email"], undefined);
  const wrongHost = request(); wrongHost.headers.host = "attacker.test"; assert.equal(guardRequest(wrongHost, hosts), false);
  const wrongProtocol = request(); wrongProtocol.headers["x-forwarded-proto"] = "http"; assert.equal(guardRequest(wrongProtocol, hosts), false);
  assert.throws(() => allowedHosts("discountmobilityscooter.com,https://attacker.test"));
});

test("SMTP requires verified TLS, authentication and a valid sender", () => {
  const base = { SMTP_HOST: "mail.spacemail.com", SMTP_PORT: "465", SMTP_SECURE: "true", SMTP_USER: "store@example.test", SMTP_PASSWORD: "isolated-test-secret", MAIL_FROM: "Discount Mobility Scooters <store@example.test>" };
  const secure = smtpOptions(base); assert.equal(secure.secure, true); assert.equal(secure.tls.rejectUnauthorized, true);
  assert.equal(secure.disableFileAccess, true); assert.equal(secure.disableUrlAccess, true);
  const startTLS = smtpOptions({ ...base, SMTP_PORT: "587", SMTP_SECURE: "false" });
  assert.equal(startTLS.requireTLS, true); assert.equal(startTLS.ignoreTLS, false);
  assert.equal(smtpOptions({ ...base, SMTP_PASSWORD: "" }), null);
  assert.equal(smtpOptions({ ...base, SMTP_SECURE: "false" }), null);
  assert.equal(smtpOptions({ ...base, MAIL_FROM: "store@example.test\r\nBcc: victim@example.test" }), null);
  assert.equal(mailbox("store@example.test,second@example.test"), null);
});
