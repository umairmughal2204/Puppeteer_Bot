import path from "node:path";
import puppeteer from "puppeteer";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { buildFingerprint, applyFingerprint } from "./fingerprint.js";
import { ensureSessionDir, saveSession } from "./sessionManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");

function getSessionsBaseDir(settings) {
  return path.resolve(rootDir, settings.sessionsDir ?? "sessions");
}

async function setupRequestBlocking(page, blockResources = {}) {
  if (!blockResources || Object.values(blockResources).every((value) => !value)) {
    return;
  }
  try {
    await page.setRequestInterception(true);
  } catch {
    return;
  }
  page.on("request", (request) => {
    const type = request.resourceType();
    const url = request.url();
    let isThirdParty = false;
    try {
      const frame = request.frame();
      if (frame) {
        const frameUrl = new URL(frame.url());
        const requestUrl = new URL(url);
        isThirdParty = requestUrl.hostname !== frameUrl.hostname;
      }
    } catch {
      isThirdParty = false;
    }
    if (
      (blockResources.images && type === "image") ||
      (blockResources.media && (type === "media" || type === "font")) ||
      (blockResources.thirdParty && isThirdParty)
    ) {
      request.abort().catch(() => {});
    } else {
      request.continue().catch(() => {});
    }
  });
}

async function randomIdleDelay() {
  const extra = 1000 + Math.random() * 2000;
  await delay(extra);
}

export async function runCollector(profileId, site, settings) {
  const sessionsDir = getSessionsBaseDir(settings);
  const sessionDir = path.join(sessionsDir, profileId);
  await ensureSessionDir(sessionDir);

  const fingerprint = buildFingerprint(settings);

  const launchOptions = {
    headless: settings.collectorHeadless ?? true,
    defaultViewport: fingerprint.viewport,
    ignoreHTTPSErrors: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-blink-features=AutomationControlled",
      "--disable-gpu",
      "--disable-infobars",
      "--disable-extensions",
      "--disable-features=IsolateOrigins,site-per-process"
    ]
  };

  if (settings.userDataDirBase) {
    launchOptions.userDataDir = path.resolve(settings.userDataDirBase, `collector-${profileId}`);
  }

  let browser;
  try {
    console.log(`[collector:${profileId}] launching browser`);
    browser = await puppeteer.launch(launchOptions);
    const [page] = await browser.pages();

    await applyFingerprint(page, fingerprint);
    await setupRequestBlocking(page, settings.blockResources);

    console.log(`[collector:${profileId}] navigating to ${site.startUrl}`);
    await page.goto(site.startUrl, {
      waitUntil: "networkidle2",
      timeout: settings.collectorTimeoutSec * 1000
    });

    await randomIdleDelay();

    await saveSession(page, sessionDir, { includeHar: false });

    console.log(`[collector:${profileId}] session saved to ${sessionDir}`);
    return { status: "ok", sessionDir };
  } catch (err) {
    console.error(`[collector:${profileId}] failed:`, err);
    return { status: "error", error: err };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

