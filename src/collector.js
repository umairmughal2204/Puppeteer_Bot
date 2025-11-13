import path from "node:path";
import puppeteer from "puppeteer";
import { setTimeout as delay } from "node:timers/promises";
import { buildFingerprint, applyFingerprint } from "./fingerprint.js";
import { ensureDirectory, resolveSessionDir, saveSession } from "./sessionManager.js";

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

async function randomIdleDelay(settings) {
  const range = settings.collectorIdleDelayRange ?? [1200, 2600];
  const extra = randomBetween(range[0], range[1]);
  await delay(extra);
}

function buildLaunchArgs({ headless = true, windowBounds }) {
  const args = [
    "--no-sandbox",
    "--disable-setuid-sandbox",
    "--disable-blink-features=AutomationControlled",
    "--disable-gpu",
    "--disable-infobars",
    "--disable-extensions",
    "--disable-features=IsolateOrigins,site-per-process"
  ];

  if (!headless && windowBounds) {
    args.push(`--window-size=${windowBounds.innerWidth},${windowBounds.innerHeight}`);
  }
  return args;
}

async function applyResourcePolicy(page, site, settings) {
  const globalPolicy = settings.blockResources ?? {};
  const sitePolicy = site.resourcePolicy ?? {};
  const allowedTypes = sitePolicy.allowedResourceTypes;
  const blockedTypes = sitePolicy.blockedResourceTypes ?? [];

  if (
    (!globalPolicy || Object.values(globalPolicy).every((value) => !value)) &&
    (!sitePolicy || (!allowedTypes || allowedTypes.length === 0) && blockedTypes.length === 0)
  ) {
    return;
  }

  await page.setRequestInterception(true).catch(() => {});

  page.on("request", (request) => {
    const type = request.resourceType();
    const url = request.url();

    let frameHostname;
    try {
      const frameUrl = new URL(request.frame()?.url() ?? "");
      frameHostname = frameUrl.hostname;
    } catch {
      frameHostname = undefined;
    }

    let shouldBlock = false;

    if (Array.isArray(allowedTypes) && allowedTypes.length > 0 && !allowedTypes.includes(type)) {
      shouldBlock = true;
    }

    if (!shouldBlock && blockedTypes.includes(type)) {
      shouldBlock = true;
    }

    if (!shouldBlock && globalPolicy) {
      if (globalPolicy.images && type === "image") {
        shouldBlock = true;
      }
      if (globalPolicy.media && (type === "media" || type === "font")) {
        shouldBlock = true;
      }
      if (globalPolicy.thirdParty) {
        try {
          const requestHost = new URL(url).hostname;
          if (frameHostname && requestHost && requestHost !== frameHostname) {
            shouldBlock = true;
          }
        } catch {
          shouldBlock = false;
        }
      }
    }

    if (shouldBlock) {
      request.abort().catch(() => {});
    } else {
      request.continue().catch(() => {});
    }
  });
}

export async function runCollector({ profileId, site, settings, runId }) {
  const sessionDir = resolveSessionDir(settings, runId, profileId);
  await ensureDirectory(sessionDir);

  const fingerprint = buildFingerprint(settings);

  const launchOptions = {
    headless: settings.collectorHeadless ?? true,
    ignoreHTTPSErrors: true,
    defaultViewport: fingerprint.viewport,
    args: buildLaunchArgs({ headless: settings.collectorHeadless ?? true, windowBounds: fingerprint.windowBounds }),
    handleSIGINT: false,
    handleSIGTERM: false,
    handleSIGHUP: false
  };

  if (settings.userDataDirBase) {
    launchOptions.userDataDir = path.resolve(settings.userDataDirBase, `${runId}-collector-${profileId}`);
  }

  let browser;
  try {
    console.log(`[collector:${profileId}] launching browser`);
    browser = await puppeteer.launch(launchOptions);
    const [page] = await browser.pages();

    await applyFingerprint(page, fingerprint);
    await applyResourcePolicy(page, site, settings);

    console.log(`[collector:${profileId}] navigating to ${site.startUrl}`);
    await page.goto(site.startUrl, {
      waitUntil: "networkidle2",
      timeout: settings.collectorTimeoutSec * 1000
    });

    await randomIdleDelay(settings);

    await saveSession(page, sessionDir, { includeHar: Boolean(settings.collectorHarEnabled) });

    console.log(`[collector:${profileId}] session saved to ${sessionDir}`);
    return { status: "ok", sessionDir, fingerprint };
  } catch (err) {
    console.error(`[collector:${profileId}] failed:`, err);
    return { status: "error", error: err, profileId, site };
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
}

