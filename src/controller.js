import path from "node:path";
import fs from "fs-extra";
import { fileURLToPath } from "node:url";
import { v4 as uuidv4 } from "uuid";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { runCollector } from "./collector.js";
import { runAction } from "./action.js";
import { pruneOldSessions } from "./sessionManager.js";

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

function buildCollectorPlan(count, sites) {
  const plan = [];
  for (let i = 0; i < count; i += 1) {
    const site = sites[i % sites.length];
    const profileId = `${site.id}-${uuidv4()}`;
    plan.push({ profileId, site });
  }
  return plan;
}

async function startCommand(argv) {
  const { settings, sites, actions } = await loadConfigs();

  const collectorsCount = Number(argv.collectors ?? settings.collectorsCount ?? 1);
  const visibleCount = Number(argv.visible ?? settings.visibleCount ?? 0);
  const runOnce = Boolean(argv["run-once"]);
  const headlessActions = Boolean(argv["headless-actions"]);

  settings.collectorsCount = collectorsCount;
  settings.visibleCount = visibleCount;

  const plan = buildCollectorPlan(collectorsCount, sites);
  const maxCollectorConcurrency = Math.min(settings.maxCollectorConcurrency ?? 5, plan.length || 1);

  const staggerDelayMs = settings.staggerDelayMs ?? 2000;

  await saveState({
    status: "starting",
    collectorsCount,
    visibleCount,
    startedAt: new Date().toISOString()
  });

  console.log(`[controller] starting ${collectorsCount} collector(s) with concurrency ${maxCollectorConcurrency}`);

  let index = 0;
  const collectorResults = await runWithConcurrency(plan, maxCollectorConcurrency, async (entry) => {
    const result = await runCollector(entry.profileId, entry.site, settings);
    await new Promise((resolve) => setTimeout(resolve, staggerDelayMs));
    return { ...entry, ...result };
  });

  const successfulCollectors = collectorResults.filter((result) => result.status === "ok");
  console.log(`[controller] collectors complete. success=${successfulCollectors.length} error=${collectorResults.length - successfulCollectors.length}`);

  let actionResults = [];
  if (visibleCount > 0 && successfulCollectors.length > 0) {
    const actionPlan = successfulCollectors.slice(0, visibleCount).map((collector, idx) => ({
      profileId: collector.profileId,
      site: collector.site,
      steps: actions[collector.site.id] ?? [],
      index: idx
    }));

    const actionConcurrency = Math.min(settings.maxActionConcurrency ?? 2, actionPlan.length || 1);
    console.log(`[controller] starting ${actionPlan.length} action worker(s) with concurrency ${actionConcurrency}`);
    actionResults = await runWithConcurrency(actionPlan, actionConcurrency, async (entry) => {
      return runAction({
        profileId: entry.profileId,
        site: entry.site,
        settings,
        steps: entry.steps,
        index: entry.index,
        headlessOverride: headlessActions
      });
    });
  }

  await saveState({
    status: "idle",
    collectors: collectorResults,
    actions: actionResults,
    completedAt: new Date().toISOString()
  });

  console.log("[controller] run complete.");

  if (!runOnce) {
    console.log("[controller] exiting. Use --run-once=false with a supervisor to schedule repeated runs.");
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
  const sessionsDir = path.resolve(rootDir, settings.sessionsDir ?? "sessions");
  await pruneOldSessions(sessionsDir, settings.sessionRetentionHours ?? 0);
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

