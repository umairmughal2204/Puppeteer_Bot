#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const sessionsDir = join(rootDir, "sessions");
const runId = `demo-${Date.now()}`;

async function runControllerStart() {
  console.log("[demo] starting controller (3 collectors / 1 visible)...");
  await spawnCommand(
    "node",
    [
      "src/controller.js",
      "start",
      "--collectors=4",
      "--visible=4",
      "--collector-cycles=1",
      "--action-cycles=1",
      "--run-id",
      runId,
      "--run-once"
    ],
    {
      cwd: rootDir
    }
  );
}

async function spawnCommand(cmd, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      stdio: "inherit",
      ...options
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
      }
    });
  });
}

async function listSessions() {
  try {
    const runPath = join(sessionsDir, runId);
    const entries = await fs.readdir(runPath, { withFileTypes: true });
    const sessionFolders = entries.filter((entry) => entry.isDirectory());
    console.log(`[demo] run ${runId} produced ${sessionFolders.length} session folder(s).`);
    let successCount = 0;
    for (const folder of sessionFolders) {
      const folderPath = join(runPath, folder.name);
      const files = await fs.readdir(folderPath);
      console.log(` - ${folder.name}: ${files.join(", ")}`);
      if (files.includes("cookies.json") && files.includes("localStorage.json")) {
        successCount += 1;
      }
    }
    if (successCount >= 2) {
      console.log("[demo] acceptance check passed: at least two sessions contain cookies and localStorage.");
    } else {
      console.warn("[demo] acceptance check WARNING: expected two populated sessions.");
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`[demo] run directory ${runId} not created yet.`);
    } else {
      console.error("[demo] error listing sessions", err);
    }
  }
}

async function main() {
  await fs.mkdir(sessionsDir, { recursive: true });
  await runControllerStart();
  console.log("[demo] waiting for collectors/actions to finish...");
  await delay(5000);
  await listSessions();
  await spawnCommand("node", ["src/controller.js", "status"], { cwd: rootDir });
  console.log("[demo] demo workflow complete.");
}

main().catch((err) => {
  console.error("[demo] demo failed:", err);
  process.exitCode = 1;
});

