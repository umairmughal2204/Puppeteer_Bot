import path from "node:path";
import { execSync } from "node:child_process";
import { platform } from "node:os";
import puppeteer from "puppeteer";
import { buildFingerprint, applyFingerprint } from "./fingerprint.js";
import { resolveSessionDir, restoreSession, applySavedStorage, saveSession, ensureDirectory } from "./sessionManager.js";
import { humanClick, humanHover, humanScroll, humanType, waitMs } from "./humanize.js";

// Cache screen dimensions to avoid repeated OS calls
let cachedScreenDimensions = null;

// Cache grid layout calculation to ensure all windows use the same grid
let cachedGridLayout = null;

function getScreenDimensions() {
  if (cachedScreenDimensions) {
    return cachedScreenDimensions;
  }

  try {
    const osPlatform = platform();
    let width = 1920;
    let height = 1080;

    if (osPlatform === "win32") {
      // Windows: Use PowerShell to get screen resolution
      try {
        // Use -EncodedCommand to avoid quote escaping issues completely
        // Convert script to UTF-16LE base64 encoded string
        const psScript = 'Add-Type -AssemblyName System.Windows.Forms; $s = [System.Windows.Forms.Screen]::PrimaryScreen; Write-Output ($s.Bounds.Width.ToString() + "x" + $s.Bounds.Height.ToString())';
        const psBytes = Buffer.from(psScript, 'utf16le');
        const encodedCommand = psBytes.toString('base64');
        const output = execSync(`powershell -NoProfile -EncodedCommand ${encodedCommand}`, { encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] }).trim();
        // Parse output like: 1920x1080
        const match = output.match(/(\d+)x(\d+)/);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
        }
      } catch (err) {
        console.warn("[action] Failed to get screen dimensions, using defaults:", err.message);
      }
    } else if (osPlatform === "darwin") {
      // macOS: Use system_profiler
      try {
        const output = execSync("system_profiler SPDisplaysDataType | grep Resolution", { encoding: "utf-8" });
        const match = output.match(/(\d+)\s*x\s*(\d+)/);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
        }
      } catch (err) {
        console.warn("[action] Failed to get screen dimensions, using defaults:", err.message);
      }
    } else {
      // Linux: Use xrandr
      try {
        const output = execSync("xrandr | grep '\\*' | head -1", { encoding: "utf-8" });
        const match = output.match(/(\d+)\s*x\s*(\d+)/);
        if (match) {
          width = parseInt(match[1], 10);
          height = parseInt(match[2], 10);
        }
      } catch (err) {
        console.warn("[action] Failed to get screen dimensions, using defaults:", err.message);
      }
    }

    cachedScreenDimensions = { width, height };
    return cachedScreenDimensions;
  } catch (err) {
    console.warn("[action] Error getting screen dimensions, using defaults:", err.message);
    return { width: 1920, height: 1080 };
  }
}

function calculateGridLayout(visibleCount, screenDims) {
  // Check cache first
  const cacheKey = `${visibleCount}-${screenDims.width}-${screenDims.height}`;
  if (cachedGridLayout && cachedGridLayout.cacheKey === cacheKey) {
    return cachedGridLayout;
  }

  // Account for Chrome window chrome (borders, title bar, etc.)
  // On Windows, Chrome has minimal borders but significant title bar
  const osPlatform = platform();
  const chromeBorder = osPlatform === "win32" ? 0 : 16; // Windows has no visible border
  const chromeTopBar = osPlatform === "win32" ? 80 : 88; // Title bar height

  // Use full screen with minimal margins (just taskbar/OS UI)
  const margin = 20; // Small margin to avoid OS UI overlap
  const availableWidth = screenDims.width - (margin * 2);
  const availableHeight = screenDims.height - (margin * 2);

  // Calculate optimal grid dimensions to fill the screen
  // For 2 windows, prefer vertical layout (1 column, 2 rows)
  let bestCols = 1;
  let bestRows = 1;
  let bestScore = -1;

  // Try different grid configurations
  for (let testCols = 1; testCols <= visibleCount; testCols++) {
    const testRows = Math.ceil(visibleCount / testCols);
    if (testCols * testRows < visibleCount) continue;

    // Calculate window size for this grid (fill available space)
    const testWindowWidth = Math.floor(availableWidth / testCols);
    const testWindowHeight = Math.floor(availableHeight / testRows);
    
    // Calculate viewport size (window minus chrome)
    const testViewportWidth = testWindowWidth - chromeBorder;
    const testViewportHeight = testWindowHeight - chromeTopBar;

    // Skip if viewport would be too small
    if (testViewportWidth < 300 || testViewportHeight < 200) continue;

    // Calculate how much of the screen this grid uses
    const totalGridWidth = testCols * testWindowWidth;
    const totalGridHeight = testRows * testWindowHeight;
    const widthUsage = totalGridWidth / availableWidth;
    const heightUsage = totalGridHeight / availableHeight;
    
    // Prefer grids that fill more of the screen (higher score is better)
    // For 2 windows, strongly prefer vertical layout (1 col, 2 rows)
    let score = (widthUsage + heightUsage) / 2;
    
    // Boost score for vertical layout when count is 2
    if (visibleCount === 2 && testCols === 1 && testRows === 2) {
      score += 0.5; // Strong preference for vertical
    }
    
    // Slight preference for vertical layouts in general (taller windows)
    if (testCols <= testRows) {
      score += 0.1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestCols = testCols;
      bestRows = testRows;
    }
  }

  const cols = bestCols;
  const rows = bestRows;

  // Calculate base window sizes
  const baseWindowWidth = Math.floor(availableWidth / cols);
  const baseWindowHeight = Math.floor(availableHeight / rows);

  const layout = {
    cacheKey,
    cols,
    rows,
    margin,
    availableWidth,
    availableHeight,
    baseWindowWidth,
    baseWindowHeight,
    chromeBorder,
    chromeTopBar
  };

  cachedGridLayout = layout;
  return layout;
}

function computeWindowArgs(index, settings, viewport) {
  const screenDims = getScreenDimensions();
  const visibleCount = settings.visibleCount || 1;
  
  // Validate index is within bounds
  if (index >= visibleCount) {
    console.warn(`[action:grid] Warning: Index ${index} is >= visibleCount ${visibleCount}, using index 0`);
    index = 0;
  }
  
  // Calculate grid layout (cached, so all windows use same grid)
  const grid = calculateGridLayout(visibleCount, screenDims);
  
  const { cols, rows, margin, availableWidth, availableHeight, baseWindowWidth, baseWindowHeight, chromeBorder, chromeTopBar } = grid;

  // Calculate position in grid
  const col = index % cols;
  const row = Math.floor(index / cols);
  
  // Check if this is the last row (might be partial)
  const isLastRow = row === rows - 1;
  // Check if this is the last column in its row
  const isLastCol = col === cols - 1;
  
  // Position windows to fill the screen (start from margin, no gaps)
  const startX = margin;
  const startY = margin;
  const left = startX + (col * baseWindowWidth);
  const top = startY + (row * baseWindowHeight);

  // Calculate window width - last column fills remaining width
  let finalWindowWidth = isLastCol 
    ? availableWidth - (col * baseWindowWidth)  // Fill remaining width
    : baseWindowWidth;
    
  // Calculate window height - last row fills remaining height
  let finalWindowHeight = isLastRow
    ? availableHeight - (row * baseWindowHeight)  // Fill remaining height
    : baseWindowHeight;

  // Ensure windows stay completely within screen bounds
  // Calculate maximum position to keep window within screen
  const maxLeft = Math.max(0, screenDims.width - finalWindowWidth);
  const maxTop = Math.max(0, screenDims.height - finalWindowHeight);
  
  // Clamp position to ensure window stays within screen
  let finalLeft = Math.max(0, Math.min(left, maxLeft));
  let finalTop = Math.max(0, Math.min(top, maxTop));
  
  // If position was clamped, we might need to adjust size to fill remaining space
  // But ensure we don't exceed screen bounds
  const remainingWidth = screenDims.width - finalLeft;
  const remainingHeight = screenDims.height - finalTop;
  
  // Ensure window size doesn't exceed remaining space
  finalWindowWidth = Math.min(finalWindowWidth, remainingWidth);
  finalWindowHeight = Math.min(finalWindowHeight, remainingHeight);
  
  // Ensure minimum window size
  finalWindowWidth = Math.max(200, finalWindowWidth);
  finalWindowHeight = Math.max(150, finalWindowHeight);
  
  // Final safety check: recalculate position if window would still overflow
  const finalMaxLeft = Math.max(0, screenDims.width - finalWindowWidth);
  const finalMaxTop = Math.max(0, screenDims.height - finalWindowHeight);
  finalLeft = Math.max(0, Math.min(finalLeft, finalMaxLeft));
  finalTop = Math.max(0, Math.min(finalTop, finalMaxTop));
  
  // Ensure minimum window size
  if (finalWindowWidth < 200 || finalWindowHeight < 150) {
    console.warn(`[action:grid] Warning: Window ${index} (row ${row}, col ${col}) size is very small: ${finalWindowWidth}×${finalWindowHeight}`);
  }

  // Calculate viewport size (window minus chrome)
  // This must match the actual window size minus chrome, no minimums enforced
  const actualViewportWidth = Math.max(1, finalWindowWidth - chromeBorder);
  const actualViewportHeight = Math.max(1, finalWindowHeight - chromeTopBar);

  // Create adjusted viewport - MUST match window size minus chrome exactly
  // Do not enforce minimums that conflict with window size
  const adjustedViewport = {
    width: actualViewportWidth,
    height: actualViewportHeight,
    deviceScaleFactor: viewport?.deviceScaleFactor ?? 1,
    isMobile: viewport?.isMobile ?? false,
    hasTouch: viewport?.hasTouch ?? false,
    isLandscape: viewport?.isLandscape ?? true
  };

  // Debug logging for all windows to verify they're within bounds
  const rightEdge = finalLeft + finalWindowWidth;
  const bottomEdge = finalTop + finalWindowHeight;
  const isWithinBounds = rightEdge <= screenDims.width && bottomEdge <= screenDims.height;
  
  if (index === 0) {
    console.log(`[action:grid] Screen dimensions: ${screenDims.width}×${screenDims.height}`);
    console.log(`[action:grid] Grid layout: ${cols} columns × ${rows} rows`);
    console.log(`[action:grid] Available space: ${availableWidth}×${availableHeight} (with ${margin}px margin)`);
  }
  
  console.log(`[action:grid] Window ${index} (row ${row}, col ${col}): position (${finalLeft}, ${finalTop}), size ${finalWindowWidth}×${finalWindowHeight}, viewport ${actualViewportWidth}×${actualViewportHeight}`);
  console.log(`[action:grid] Window ${index} bounds check: right=${rightEdge}/${screenDims.width}, bottom=${bottomEdge}/${screenDims.height}, within=${isWithinBounds}`);
  
  if (!isWithinBounds) {
    console.error(`[action:grid] ERROR: Window ${index} exceeds screen bounds!`);
  }

  return {
    args: [
      `--window-size=${finalWindowWidth},${finalWindowHeight}`,
      `--window-position=${finalLeft},${finalTop}`
    ],
    adjustedViewport: adjustedViewport
  };
}

async function performActionStep(page, sessionDir, step) {
  // Helper function to check if element exists
  async function elementExists(selector) {
    try {
      const element = await page.$(selector);
      return element !== null;
    } catch {
      return false;
    }
  }

  switch (step.type) {
    case "wait":
      await waitMs(step.ms ?? 1000);
      break;
    case "scroll":
      await humanScroll(page, step.distance ?? 600, step.durationMs ?? 1000);
      break;
    case "click":
      if (!step.selector) throw new Error("click action requires selector");
      // Try multiple selectors (comma-separated) until one works
      const clickSelectors = step.selector.split(',').map(s => s.trim());
      let clickSuccess = false;
      for (const selector of clickSelectors) {
        try {
          const exists = await elementExists(selector);
          if (exists) {
            await humanClick(page, selector, { afterDelayMs: step.afterDelayMs });
            clickSuccess = true;
            break;
          }
        } catch (err) {
          // Try next selector
          continue;
        }
      }
      if (!clickSuccess) {
        if (step.optional) {
          console.log(`[action] Optional click skipped: no matching element found for selectors: ${clickSelectors.join(', ')}`);
        } else {
          throw new Error(`No matching element found for click action with selectors: ${clickSelectors.join(', ')}`);
        }
      }
      break;
    case "hover":
      if (!step.selector) throw new Error("hover action requires selector");
      // Check if element exists before hovering (for optional actions)
      if (step.optional) {
        const exists = await elementExists(step.selector);
        if (!exists) {
          console.log(`[action] Optional hover skipped: element not found for selector: ${step.selector}`);
          break;
        }
      }
      await humanHover(page, step.selector, step.dwellMs ?? 600);
      break;
    case "type":
      if (!step.selector || typeof step.text !== "string") {
        throw new Error("type action requires selector and text");
      }
      // Try multiple selectors (comma-separated) until one works
      const typeSelectors = step.selector.split(',').map(s => s.trim());
      let typeSuccess = false;
      for (const selector of typeSelectors) {
        try {
          const exists = await elementExists(selector);
          if (exists) {
            await humanType(page, selector, step.text, { clear: step.clear });
            typeSuccess = true;
            break;
          }
        } catch (err) {
          // Try next selector
          continue;
        }
      }
      if (!typeSuccess) {
        if (step.optional) {
          console.log(`[action] Optional type skipped: no matching element found for selectors: ${typeSelectors.join(', ')}`);
        } else {
          throw new Error(`No matching element found for type action with selectors: ${typeSelectors.join(', ')}`);
        }
      }
      break;
    case "key":
      if (!step.key) throw new Error("key action requires key property");
      // Handle modifier+key combinations like "Control+Enter"
      const keyParts = step.key.split("+");
      if (keyParts.length > 1) {
        // Press modifiers down
        for (let i = 0; i < keyParts.length - 1; i++) {
          await page.keyboard.down(keyParts[i]);
        }
        // Press the main key
        await page.keyboard.press(keyParts[keyParts.length - 1]);
        // Release modifiers
        for (let i = keyParts.length - 2; i >= 0; i--) {
          await page.keyboard.up(keyParts[i]);
        }
      } else {
        await page.keyboard.press(step.key);
      }
      await waitMs(50);
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

  const windowConfig = computeWindowArgs(index, settings, fingerprint.viewport);
  let viewport = windowConfig.adjustedViewport || fingerprint.viewport;
  
  // Ensure viewport is valid (has width and height)
  if (!viewport || !viewport.width || !viewport.height) {
    console.warn(`[action:${profileId}] Invalid viewport, using defaults`);
    viewport = { width: 1280, height: 720, deviceScaleFactor: 1, isMobile: false, hasTouch: false, isLandscape: true };
  }
  
  // Always update fingerprint with adjusted viewport for grid layout
  fingerprint.viewport = viewport;
  
  // Log grid info for debugging (only once, when first window is calculated)
  if (index === 0 && cachedGridLayout) {
    const screenDims = getScreenDimensions();
    console.log(`[action:grid] Screen: ${screenDims.width}x${screenDims.height}`);
    console.log(`[action:grid] Grid: ${cachedGridLayout.cols} columns × ${cachedGridLayout.rows} rows for ${settings.visibleCount || 1} windows`);
    console.log(`[action:grid] Window size: ${cachedGridLayout.baseWindowWidth}×${cachedGridLayout.baseWindowHeight} (base)`);
    console.log(`[action:grid] Available space: ${cachedGridLayout.availableWidth}×${cachedGridLayout.availableHeight}`);
  }

  const launchOptions = {
    headless: headlessOverride ?? false,
    defaultViewport: viewport,
    ignoreHTTPSErrors: true,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-infobars",
      "--use-fake-ui-for-media-stream",
      "--no-default-browser-check",
      "--no-first-run",
      ...windowConfig.args
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

    // Block CloudFlare challenge resources BEFORE navigation
    await page.setRequestInterception(true).catch(() => {});
    page.on("request", (request) => {
      const url = request.url();
      // Block CloudFlare challenge resources and detection scripts
      if (
        url.includes("/cdn-cgi/challenge-platform/") ||
        (url.includes("/cdn-cgi/") && url.includes("/js/")) ||
        url.includes("challenges.cloudflare.com")
      ) {
        request.abort().catch(() => {});
      } else {
        request.continue().catch(() => {});
      }
    });

    // Disable JavaScript temporarily to avoid CloudFlare detection
    await page.setJavaScriptEnabled(false);

    await applyFingerprint(page, fingerprint);

    console.log(`[action:${profileId}] initial navigation to ${site.startUrl}`);
    await page.goto(site.startUrl, {
      waitUntil: "networkidle2",
      timeout: settings.actionTimeoutSec * 1000
    });

    // Re-enable JavaScript after navigation
    await page.setJavaScriptEnabled(true);

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

