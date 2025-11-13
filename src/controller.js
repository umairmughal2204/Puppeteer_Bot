import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runCollector } from "./collector.js";
import { runAction } from "./action.js";
import { ensureDirectory, pruneOldSessions, resolveRunDir } from "./sessionManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const configDir = path.join(rootDir, "config");
const stateDir = path.join(rootDir, "tmp");
const stateFile = path.join(stateDir, "controller-state.json");

async function loadJson(file) {
  return fs.readJson(path.join(configDir, file));
}

async function loadConfigs() {
  const [settings, sites, actions] = await Promise.all([
    loadJson("settings.json"),
    loadJson("sites.json"),
    loadJson("actions.json")
  ]);

  if (!settings.sessionsDir) {
    settings.sessionsDir = "./sessions";
  }

  return { settings, sites, actions };
}

async function saveState(state) {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeJson(stateFile, state, { spaces: 2 });
}

async function readState() {
  try {
    return await fs.readJson(stateFile);
  } catch {
    return { status: "idle", updatedAt: new Date().toISOString() };
  }
}

async function runWithConcurrency(items, limit, iterator) {
  const results = [];
  const queue = [...items];
  const active = [];

  async function runNext() {
    if (queue.length === 0) return;
    const item = queue.shift();
    const promise = iterator(item).then((result) => {
      results.push(result);
      active.splice(active.indexOf(promise), 1);
    });
    active.push(promise);
    if (active.length >= limit) {
      await Promise.race(active);
    }
    await runNext();
  }

  await runNext();
  await Promise.all(active);
  return results;
}

function buildCollectorPlan(count, sites, startSequence) {
  const plan = [];
  for (let i = 0; i < count; i += 1) {
    const site = sites[(startSequence + i) % sites.length];
    const profileId = String(startSequence + i + 1).padStart(4, "0");
    plan.push({ profileId, site });
  }
  return plan;
}

function computeCycleCount(durationSec, swapSec) {
  if (!durationSec || durationSec <= 0 || !swapSec || swapSec <= 0) {
    return 1;
  }
  return Math.max(1, Math.ceil(durationSec / swapSec));
}

function generateRunId() {
  const iso = new Date().toISOString().replace(/[-:]/g, "").replace("T", "-");
  return `run-${iso.slice(0, 15)}`;
}

async function startCommand(argv) {
  const { settings, sites, actions } = await loadConfigs();

  const collectorsCount = Number(argv.collectors ?? settings.collectorsCount ?? 1);
  const visibleCount = Number(argv.visible ?? settings.visibleCount ?? 0);
  const runOnce = Boolean(argv["run-once"]);
  const headlessActions = Boolean(argv["headless-actions"]);
  const overrideCollectorCycles =
    argv["collector-cycles"] !== undefined ? Number(argv["collector-cycles"]) : undefined;
  const overrideActionCycles = argv["action-cycles"] !== undefined ? Number(argv["action-cycles"]) : undefined;
  const runId = (typeof argv["run-id"] === "string" && argv["run-id"].trim().length > 0) ? argv["run-id"].trim() : generateRunId();

  await ensureDirectory(resolveRunDir(settings, runId));
  await pruneOldSessions(settings);

  settings.collectorsCount = collectorsCount;
  settings.visibleCount = visibleCount;

  const schedulingEnabled = settings.enableScheduling && !runOnce;
  const collectorCyclesDefault = schedulingEnabled
    ? computeCycleCount(settings.collectorSessionDurationSec, settings.collectorSwapIntervalSec)
    : 1;
  const actionCyclesDefault = schedulingEnabled
    ? computeCycleCount(settings.actionSessionDurationSec, settings.actionSwapIntervalSec)
    : 1;

  const collectorCycles =
    Number.isFinite(overrideCollectorCycles) && overrideCollectorCycles > 0
      ? overrideCollectorCycles
      : collectorCyclesDefault;
  const actionCycles =
    Number.isFinite(overrideActionCycles) && overrideActionCycles > 0
      ? overrideActionCycles
      : actionCyclesDefault;

  const maxCollectorConcurrency = Math.min(settings.maxCollectorConcurrency ?? 5, collectorsCount || 1);
  const maxActionConcurrency = Math.min(settings.maxActionConcurrency ?? 2, visibleCount || 1);

  const staggerDelayMs = settings.staggerDelayMs ?? 2000;

  await saveState({
    status: "starting",
    runId,
    collectorsCount,
    visibleCount,
    startedAt: new Date().toISOString()
  });

  console.log(
    `[controller] run ${runId} starting with ${collectorsCount} collectors (${collectorCycles} cycle(s)) and ${visibleCount} visible actions (${actionCycles} cycle(s))`
  );

  const collectorResults = [];
  const successfulSessions = [];
  let profileSequence = 0;

  for (let cycle = 0; cycle < collectorCycles; cycle += 1) {
    const plan = buildCollectorPlan(collectorsCount, sites, profileSequence);
    profileSequence += plan.length;
    const concurrency = Math.max(1, Math.min(maxCollectorConcurrency, plan.length));
    console.log(
      `[controller] collector cycle ${cycle + 1}/${collectorCycles}: launching ${plan.length} worker(s) at concurrency ${concurrency}`
    );

    const results = await runWithConcurrency(plan, concurrency, async (entry) => {
      const outcome = await runCollector({
        profileId: entry.profileId,
        site: entry.site,
        settings,
        runId
      });
      if (staggerDelayMs > 0) {
        await delay(staggerDelayMs);
      }
      return { cycle, ...entry, ...outcome };
    });

    collectorResults.push(...results);
    const successes = results.filter((result) => result.status === "ok");
    successfulSessions.push(
      ...successes.map((result) => ({
        profileId: result.profileId,
        site: result.site,
        sessionDir: result.sessionDir
      }))
    );
    console.log(
      `[controller] collector cycle ${cycle + 1} complete. success=${successes.length} error=${results.length - successes.length}`
    );

    if (cycle < collectorCycles - 1 && settings.collectorSwapIntervalSec) {
      await delay(settings.collectorSwapIntervalSec * 1000);
    }
  }

  const actionResults = [];
  if (visibleCount > 0 && successfulSessions.length > 0) {
    const windowsPerCycle = Math.min(visibleCount, successfulSessions.length);
    for (let cycle = 0; cycle < actionCycles; cycle += 1) {
      const actionPlan = [];
      for (let i = 0; i < windowsPerCycle; i += 1) {
        const session = successfulSessions[(cycle * windowsPerCycle + i) % successfulSessions.length];
        actionPlan.push({
          cycle,
          profileId: session.profileId,
          site: session.site,
          steps: actions[session.site.id] ?? [],
          index: i
        });
      }
      const actionConcurrency = Math.max(1, Math.min(maxActionConcurrency, actionPlan.length));
      console.log(
        `[controller] action cycle ${cycle + 1}/${actionCycles}: launching ${actionPlan.length} window(s) at concurrency ${actionConcurrency}`
      );

      const results = await runWithConcurrency(actionPlan, actionConcurrency, async (entry) => {
        const outcome = await runAction({
          profileId: entry.profileId,
          site: entry.site,
          settings,
          steps: entry.steps,
          index: entry.index,
          runId,
          headlessOverride: headlessActions
        });
        return { ...entry, ...outcome };
      });

      actionResults.push(...results);
      if (cycle < actionCycles - 1 && settings.actionSwapIntervalSec) {
        await delay(settings.actionSwapIntervalSec * 1000);
      }
    }
  } else {
    console.log("[controller] skipping action cycles (no sessions available or visibleCount set to 0).");
  }

  const serializeResult = (result) => {
    if (!result) return result;
    const serialized = { ...result };
    if (serialized.error instanceof Error) {
      serialized.error = serialized.error.message;
    } else if (serialized.error && typeof serialized.error !== "string") {
      serialized.error = String(serialized.error);
    }
    return serialized;
  };

  await saveState({
    status: "idle",
    runId,
    collectors: collectorResults.map(serializeResult),
    actions: actionResults.map(serializeResult),
    collectorsCount,
    visibleCount,
    completedAt: new Date().toISOString()
  });

  console.log(`[controller] run ${runId} complete.`);

  if (!runOnce && schedulingEnabled) {
    console.log("[controller] scheduling disabled for prototype after first run. Re-launch to continue cycles.");
  }
}

async function stopCommand() {
  const state = await readState();
  state.status = "stopped";
  state.stoppedAt = new Date().toISOString();
  await saveState(state);
  console.log("[controller] stop flag recorded. No long-running workers to terminate in prototype.");
}

async function statusCommand() {
  const state = await readState();
  console.log(JSON.stringify(state, null, 2));
}

async function pruneCommand() {
  const { settings } = await loadConfigs();
  await pruneOldSessions(settings);
  console.log("[controller] prune complete.");
}

const cli = yargs(hideBin(process.argv))
  .command(
    "start",
    "Start collectors and visible sessions",
    (y) =>
      y
        .option("collectors", {
          describe: "Number of collector workers",
          type: "number"
        })
        .option("visible", {
          describe: "Number of visible action workers",
          type: "number"
        })
        .option("run-once", {
          describe: "Run once then exit",
          type: "boolean",
          default: true
        })
        .option("headless-actions", {
          describe: "Run action workers headless (testing only)",
          type: "boolean",
          default: false
        })
        .option("run-id", {
          describe: "Custom identifier for the run (default uses timestamp)",
          type: "string"
        })
        .option("collector-cycles", {
          describe: "Override number of collector swap cycles",
          type: "number"
        })
        .option("action-cycles", {
          describe: "Override number of action swap cycles",
          type: "number"
        }),
    (argv) => {
      startCommand(argv).catch((err) => {
        console.error("[controller] start failed", err);
        process.exitCode = 1;
      });
    }
  )
  .command("stop", "Record stop state", () => {
    stopCommand().catch((err) => {
      console.error("[controller] stop failed", err);
      process.exitCode = 1;
    });
  })
  .command("status", "Show last recorded status", () => {
    statusCommand().catch((err) => {
      console.error("[controller] status failed", err);
      process.exitCode = 1;
    });
  })
  .command("prune", "Prune old session folders", () => {
    pruneCommand().catch((err) => {
      console.error("[controller] prune failed", err);
      process.exitCode = 1;
    });
  })
  .demandCommand(1)
  .help();

cli.parse();

