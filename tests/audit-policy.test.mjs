import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateAudit } from "../scripts/audit-policy.mjs";

const now = Date.parse("2026-11-18T12:00:00Z");
const withdrawn = { name: "picomatch", severity: "high", url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf", title: "Withdrawn advisory" };
const report = vulnerabilities => {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: Object.keys(vulnerabilities).length };
  for (const value of Object.values(vulnerabilities)) counts[value.severity]++;
  return { auditReportVersion: 2, vulnerabilities, metadata: { vulnerabilities: counts } };
};
const entry = (via, severity = "high") => ({ severity, via });

test("only the exact withdrawn GHSA and its dependency propagation are excluded", () => {
  const result = evaluateAudit(report({ picomatch: entry([withdrawn]), tinyglobby: entry(["picomatch"]), vite: entry(["tinyglobby", "picomatch"]), vinext: entry(["vite"]) }), now);
  assert.equal(result.pass, true);
  assert.equal(result.ignored.length, 1);
  assert.equal(result.blocking.length, 0);
});

test("other direct or propagated high/critical advisories still block", () => {
  for (const severity of ["high", "critical"]) {
    const different = { ...withdrawn, severity, url: "https://github.com/advisories/GHSA-new1-risk-test" };
    const result = evaluateAudit(report({ picomatch: entry([withdrawn, different]), vite: entry(["picomatch"]) }), now);
    assert.equal(result.pass, false);
    assert.equal(result.blocking.length, 1);
  }
  assert.equal(evaluateAudit(report({ other: entry([{ ...withdrawn, name: "other" }]) }), now).pass, false);
});

test("withdrawal exception expires and does not hide unrelated lower-severity findings", () => {
  const result = evaluateAudit(report({ picomatch: entry([withdrawn]) }), Date.parse("2026-12-19T00:00:00Z"));
  assert.equal(result.pass, false);
  assert.equal(result.ignored.length, 0);
  const moderate = { name: "tool", severity: "moderate", url: "https://example.test/advisory" };
  const mixed = evaluateAudit(report({ picomatch: entry([withdrawn]), tool: entry([moderate], "moderate"), parent: entry(["picomatch", "tool"]) }), now);
  assert.equal(mixed.pass, true);
  assert.deepEqual(mixed.active.map(item => item.name), ["tool"]);
});

test("missing, unknown, cyclic and failed audit reports fail closed", () => {
  for (const value of [null, {}, { auditReportVersion: 2, vulnerabilities: {} }, { auditReportVersion: 2, error: { code: "ENOTFOUND" }, vulnerabilities: {} }, report({ parent: entry(["missing"]) }), report({ unknown: entry([]) }), report({ a: entry(["b"]), b: entry(["a"]) }), report({ a: entry([{ name: "a", url: "https://example.test/no-severity" }]) })]) assert.throws(() => evaluateAudit(value, now));
});
