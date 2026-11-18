import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

process.env.DMS_BUILD_TARGET = "node";
process.env.NODE_ENV = "production";
const child = spawn(process.execPath, [fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)), "build"], { stdio: "inherit", env: process.env, windowsHide: true });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("error", () => { console.error("Node production build could not start."); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });
