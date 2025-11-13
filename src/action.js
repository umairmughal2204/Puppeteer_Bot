import path from "node:path";
import puppeteer from "puppeteer";
import { buildFingerprint, applyFingerprint } from "./fingerprint.js";
import { resolveSessionDir, restoreSession, applySavedStorage, saveSession, ensureDirectory } from "./sessionManager.js";
import { humanClick, humanHover, humanScroll, humanType, waitMs } from "./humanize.js";

function computeWindowArgs(index, settings, viewport) {
  const cols = Math.ceil(Math.sqrt(settings.visibleCount || 1));
  const rows = Math.ceil((settings.visibleCount || 1) / cols);
  const view = viewport ?? settings.defaultViewport ?? { width: 1280, height: 720 };
  const windowWidth = view.width + 16;
  const windowHeight = view.height + 88;

  const col = index % cols;
  const row = Math.floor(index / cols);
  const left = col * windowWidth;
  const top = row * windowHeight;

  return [`--window-size=${windowWidth},${windowHeight}`, `--window-position=${left},${top}`];
}

async function performActionStep(page, sessionDir, step) {
  switch (step.type) {
    case "wait":
      await waitMs(step.ms ?? 1000);
      break;
    case "scroll":
      await humanScroll(page, step.distance ?? 600, step.durationMs ?? 1000);
      break;
    case "click":
      if (!step.selector) throw new Error("click action requires selector");
      await humanClick(page, step.selector, { afterDelayMs: step.afterDelayMs });
      break;
    case "hover":
      if (!step.selector) throw new Error("hover action requires selector");
      await humanHover(page, step.selector, step.dwellMs ?? 600);
      break;
    case "type":
      if (!step.selector || typeof step.text !== "string") {
        throw new Error("type action requires selector and text");
      }
      await humanType(page, step.selector, step.text, { clear: step.clear });
      break;
    case "screenshot": {
      const filename = step.filename ?? `action-${Date.now()}.png`;
      const filePath = path.join(sessionDir, filename);
      await page.screenshot({ path: filePath, fullPage: true });
      break;
    }
    default:
      throw new Error(`Unsupported action type: ${step.type}`);
  }
}

export async function runAction({ profileId, site, settings, steps, index = 0, runId, headlessOverride = null }) {
  const sessionDir = resolveSessionDir(settings, runId, profileId);
  await ensureDirectory(sessionDir);

  const session = await restoreSession(sessionDir);
  const fingerprint = buildFingerprint(settings, session.meta?.fingerprint ?? null);

  const windowArgs = computeWindowArgs(index, settings, fingerprint.viewport);

  const launchOptions = {
    headless: headlessOverride ?? false,
    defaultViewport: fingerprint.viewport,
    ignoreHTTPSErrors: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--use-fake-ui-for-media-stream",
      "--no-default-browser-check",
      "--no-first-run",
      ...windowArgs
    ]
  };

  if (settings.userDataDirBase) {
    launchOptions.userDataDir = path.resolve(settings.userDataDirBase, `${runId}-action-${profileId}`);
  }

  let browser;
  try {
    console.log(`[action:${profileId}] launching visible browser`);
    browser = await puppeteer.launch(launchOptions);
    const [page] = await browser.pages();

    await applyFingerprint(page, fingerprint);

    console.log(`[action:${profileId}] initial navigation to ${site.startUrl}`);
    await page.goto(site.startUrl, {
      waitUntil: "domcontentloaded",
      timeout: settings.actionTimeoutSec * 1000
    });

    await applySavedStorage(page, session, site.startUrl);
    await page.reload({ waitUntil: "networkidle2" });

    console.log(`[action:${profileId}] executing ${steps.length} step(s)`);
    for (const step of steps) {
      try {
        await performActionStep(page, sessionDir, step);
      } catch (stepErr) {
        console.error(`[action:${profileId}] step failed`, step, stepErr);
      }
    }

    await saveSession(page, sessionDir, { includeHar: false });
    console.log(`[action:${profileId}] session updated.`);
    return { status: "ok", sessionDir };
  } catch (err) {
    console.error(`[action:${profileId}] failed:`, err);
    return { status: "error", error: err };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

