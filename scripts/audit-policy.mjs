export const WITHDRAWN_ADVISORIES = Object.freeze({
  "GHSA-fc5q-39xc-vjpf": Object.freeze({
    package: "picomatch",
    source: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
    withdrawnAt: "2026-11-18",
    reviewBy: "2026-12-18",
    expiresAt: "2026-12-19T00:00:00.000Z",
    reason: "GitHub withdrew this specific advisory on 2026-11-18. npm still reports it and propagates its severity to parent packages; no patched release is published.",
  }),
});

const levels = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function evaluateAudit(report, now = Date.now()) {
  if (!report || report.auditReportVersion !== 2 || report.error || !report.vulnerabilities || typeof report.vulnerabilities !== "object" || Array.isArray(report.vulnerabilities) || !Number.isFinite(now)) throw new Error("Incomplete npm audit report.");
  const counts = report.metadata?.vulnerabilities;
  if (!counts || ![...Object.keys(levels), "total"].every(key => Number.isSafeInteger(counts[key]) && counts[key] >= 0) || Object.keys(levels).reduce((sum, key) => sum + counts[key], 0) !== counts.total) throw new Error("Incomplete npm audit summary.");
  const vulnerabilities = report.vulnerabilities;
  const leaves = new Map();
  const visited = new Set();
  const visiting = new Set();
  function inspect(name) {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Unresolved audit dependency cycle at ${name}.`);
    const entry = vulnerabilities[name];
    if (!entry || !Array.isArray(entry.via) || !Object.hasOwn(levels, entry.severity) || (levels[entry.severity] >= levels.high && entry.via.length === 0)) throw new Error(`Incomplete advisory details for ${name}.`);
    visiting.add(name);
    for (const item of entry.via) {
      if (typeof item === "string") { inspect(item); continue; }
      if (!item || typeof item !== "object" || !Object.hasOwn(levels, item.severity) || typeof item.url !== "string" || typeof item.name !== "string") throw new Error(`Unrecognized advisory details for ${name}.`);
      const id = /^https:\/\/github\.com\/advisories\/(GHSA-[a-z0-9-]+)$/.exec(item.url)?.[1] ?? item.url;
      const key = `${item.name}:${id}`;
      const previous = leaves.get(key);
      // Keep the stricter result if the same advisory appears in several paths.
      if (!previous || levels[item.severity] > levels[previous.severity]) leaves.set(key, { ...item, id });
    }
    visiting.delete(name);
    visited.add(name);
  }
  for (const name of Object.keys(vulnerabilities)) inspect(name);
  const ignored = [];
  const active = [];
  for (const advisory of leaves.values()) {
    const exception = WITHDRAWN_ADVISORIES[advisory.id];
    if (exception && advisory.name === exception.package && advisory.url === exception.source && now < Date.parse(exception.expiresAt)) ignored.push({ ...advisory, exception });
    else active.push(advisory);
  }
  const blocking = active.filter(advisory => levels[advisory.severity] >= levels.high);
  return { pass: blocking.length === 0, blocking, ignored, active, raw: counts };
}
