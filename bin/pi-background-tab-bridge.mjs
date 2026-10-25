#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [command, ...args] = process.argv.slice(2);

if (command === "start") {
  process.chdir(projectRoot);
  process.env.PI_BRIDGE_HIDE_TOKEN = "1";
  await import("../bridge.mjs");
} else if (command === "health") {
  try {
    const response = await fetch("http://127.0.0.1:43127/health");
    process.stdout.write(`${await response.text()}\n`);
    if (!response.ok) process.exitCode = 1;
  } catch {
    process.stdout.write(JSON.stringify({ running: false }) + "\n");
    process.exitCode = 1;
  }
} else if (command === "token") {
  process.stdout.write(`${readFileSync(resolve(projectRoot, ".pi-bridge-token"), "utf8").trim()}\n`);
} else if (command === "status") {
  const result = spawnSync(process.execPath, [resolve(projectRoot, "client.mjs"), "status"], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} else if (command === "command" && args[0]) {
  const result = spawnSync(process.execPath, [resolve(projectRoot, "client.mjs"), args[0]], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} else {
  process.stderr.write("Usage: pi-background-tab-bridge <start|health|status|token|command '<json>'>\n");
  process.exitCode = 2;
}
