import { randomInt } from "node:crypto";

function chooseRandom(list) {
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("Fingerprint list cannot be empty.");
  }
  const index = randomInt(0, list.length);
  return list[index];
}

function randomInRange([min, max]) {
  if (typeof min !== "number" || typeof max !== "number" || min > max) {
    throw new Error("Invalid numeric range for fingerprint.");
  }
  return min + randomInt(max - min + 1);
}

export function buildFingerprint(settings) {
  const fpConfig = settings.fingerprint ?? {};
  const viewport =
    settings.defaultViewport ?? {
      width: 1280,
      height: 720
    };

  const userAgent = chooseRandom(fpConfig.userAgents ?? [settings.defaultUserAgent ?? "Mozilla/5.0"]);
  const languages = chooseRandom(fpConfig.languages ?? [["en-US", "en"]]);
  const timezoneId = chooseRandom(fpConfig.timezoneIds ?? ["UTC"]);
  const hardwareConcurrency = randomInRange(fpConfig.hardwareConcurrencyRange ?? [4, 8]);
  const deviceMemory = randomInRange(fpConfig.deviceMemoryRange ?? [4, 8]);

  return {
    userAgent,
    viewport,
    languages,
    timezoneId,
    hardwareConcurrency,
    deviceMemory
  };
}

export async function applyFingerprint(page, fingerprint) {
  if (!fingerprint) return;

  const { userAgent, viewport, languages, timezoneId, hardwareConcurrency, deviceMemory } = fingerprint;

  if (userAgent) {
    await page.setUserAgent(userAgent);
  }

  if (viewport) {
    await page.setViewport(viewport);
  }

  if (timezoneId) {
    await page.emulateTimezone(timezoneId);
  }

  if (languages) {
    await page.setExtraHTTPHeaders({
      "Accept-Language": languages.join(",")
    });
  }

  await page.evaluateOnNewDocument((opts) => {
    Object.defineProperty(navigator, "webdriver", {
      get: () => undefined
    });

    Object.defineProperty(navigator, "languages", {
      get: () => opts.languages
    });

    Object.defineProperty(navigator, "language", {
      get: () => opts.languages[0]
    });

    Object.defineProperty(navigator, "hardwareConcurrency", {
      get: () => opts.hardwareConcurrency
    });

    Object.defineProperty(navigator, "deviceMemory", {
      get: () => opts.deviceMemory
    });

    if (!window.chrome) {
      window.chrome = {
        runtime: {}
      };
    }

    const originalQuery = window.navigator.permissions?.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) => {
        return parameters && parameters.name === "notifications"
          ? Promise.resolve({ state: "denied" })
          : originalQuery(parameters);
      };
    }

    const originalPlatform = navigator.platform;
    Object.defineProperty(navigator, "platform", {
      get: () => originalPlatform
    });

    if (window.WebGLRenderingContext) {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return "Intel Inc.";
        }
        if (parameter === 37446) {
          return "Intel Iris OpenGL Engine";
        }
        return getParameter.apply(this, [parameter]);
      };
    }

    const elementDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLDivElement.prototype, "offsetHeight", {
      get() {
        const height = elementDescriptor && elementDescriptor.get ? elementDescriptor.get.apply(this) : 0;
        return Math.round(height * (1 + Math.random() * 0.01));
      }
    });
  }, fingerprint);

  page._fingerprint = fingerprint;
}

