import { spawn } from "node:child_process";
import { evaluateAudit } from "./audit-policy.mjs";

try {
  // npm supplies its own executable path to run scripts, preserving the user's
  // registry/proxy configuration and avoiding a second npm installation.
  const npm = process.env.npm_execpath;
  if (!npm) throw new Error("Run this check with npm run audit:security.");
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [npm, "audit", "--json"], { stdio: ["ignore", "pipe", "pipe"], timeout: 60_000, windowsHide: true });
    let stdout = "";
    let size = 0;
    child.stdout.on("data", chunk => {
      size += chunk.length;
      if (size > 8 * 1024 * 1024) { child.kill(); reject(new Error("npm audit response exceeded its expected size.")); }
      else stdout += chunk;
    });
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal, stdout }));
  });
  if (result.signal || ![0, 1].includes(result.code)) throw new Error("npm audit could not complete; no security result is available.");
  const evaluation = evaluateAudit(JSON.parse(result.stdout));
  const raw = evaluation.raw;
  if (raw) console.log(`Raw npm audit: ${raw.total} affected packages (${raw.high} high, ${raw.critical} critical).`);
  for (const ignored of evaluation.ignored) console.log(`Withdrawn advisory exception: ${ignored.id}; review by ${ignored.exception.reviewBy}; ${ignored.exception.source}`);
  console.log(`Active high/critical advisory leaves: ${evaluation.blocking.length}. Other advisory severities remain reported by npm audit.`);
  for (const advisory of evaluation.blocking) console.error(`BLOCKED: ${advisory.name} (${advisory.severity}) ${advisory.url}`);
  process.exitCode = evaluation.pass ? 0 : 1;
} catch (error) {
  console.error(`Security audit failed: ${error instanceof Error ? error.message : "No complete audit report was returned."}`);
  process.exitCode = 1;
}
