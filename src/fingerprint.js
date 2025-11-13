import { randomInt } from "node:crypto";

function deepClone(data) {
  return data === undefined ? undefined : JSON.parse(JSON.stringify(data));
}

function chooseRandom(list, fallback) {
  if (Array.isArray(list) && list.length > 0) {
    const index = randomInt(list.length);
    const value = list[index];
    return typeof value === "object" ? deepClone(value) : value;
  }
  if (fallback !== undefined) {
    return typeof fallback === "object" ? deepClone(fallback) : fallback;
  }
  throw new Error("Fingerprint list cannot be empty.");
}

function randomInRange(range, fallback) {
  if (!Array.isArray(range) || range.length !== 2) {
    return fallback;
  }
  const [min, max] = range;
  if (typeof min !== "number" || typeof max !== "number" || min > max) {
    return fallback;
  }
  return min + randomInt(max - min + 1);
}

export function buildFingerprint(settings, existingFingerprint = null) {
  if (existingFingerprint) {
    return existingFingerprint;
  }

  const fpConfig = settings.fingerprint ?? {};

  const userAgent = chooseRandom(fpConfig.userAgents ?? [settings.defaultUserAgent ?? "Mozilla/5.0"]);
  const languages = chooseRandom(fpConfig.languages ?? [["en-US", "en"]]);
  const timezoneId = chooseRandom(fpConfig.timezoneIds ?? ["UTC"]);
  const platform = chooseRandom(fpConfig.platforms ?? ["Win32"]);
  const vendor = chooseRandom(fpConfig.vendors ?? ["Google Inc."]);
  const doNotTrack = chooseRandom(fpConfig.doNotTrackOptions ?? ["1", "0", null], null);
  const screenResolution = chooseRandom(fpConfig.screenResolutions ?? [{ width: 1920, height: 1080 }]);
  const windowBounds = chooseRandom(
    fpConfig.windowBounds ?? [
      { outerWidth: screenResolution.width, outerHeight: screenResolution.height, innerWidth: screenResolution.width - 120, innerHeight: screenResolution.height - 200 }
    ]
  );
  const devicePixelRatio = chooseRandom(fpConfig.devicePixelRatios ?? [1]);
  const hardwareConcurrency = randomInRange(fpConfig.hardwareConcurrencyRange ?? [4, 8], 4);
  const deviceMemory = randomInRange(fpConfig.deviceMemoryRange ?? [4, 8], 8);
  const canvasConfig = chooseRandom(fpConfig.canvasFingerprints ?? [{ vendor: "Intel Inc.", renderer: "Intel Iris OpenGL Engine", seed: "a1b2c3" }]);
  const plugins = chooseRandom(fpConfig.plugins ?? [[]]);
  const mimeTypes = chooseRandom(fpConfig.mimeTypes ?? [[]]);
  const mediaDevices = chooseRandom(fpConfig.mediaDevices ?? [[]]);
  const permissions = chooseRandom(fpConfig.permissions ?? [{}], {});
  const batteryProfile = chooseRandom(
    fpConfig.batteryProfiles ?? [{ charging: true, level: 0.85, chargingTime: 1200, dischargingTime: null }]
  );
  const maxTouchPoints = chooseRandom(fpConfig.maxTouchPoints ?? [0, 1, 5], 0);

  const viewport = {
    width: windowBounds.innerWidth ?? Math.max(800, screenResolution.width - 120),
    height: windowBounds.innerHeight ?? Math.max(600, screenResolution.height - 200),
    deviceScaleFactor: devicePixelRatio,
    isMobile: false,
    hasTouch: maxTouchPoints > 0,
    isLandscape: true
  };

  return {
    userAgent,
    languages,
    timezoneId,
    platform,
    vendor,
    doNotTrack,
    screenResolution,
    windowBounds,
    devicePixelRatio,
    hardwareConcurrency,
    deviceMemory,
    canvas: canvasConfig,
    plugins,
    mimeTypes,
    mediaDevices,
    permissions,
    batteryProfile,
    maxTouchPoints,
    viewport
  };
}

export async function applyFingerprint(page, fingerprint, { reuseViewport = true } = {}) {
  if (!fingerprint) return;

  const {
    userAgent,
    languages,
    timezoneId,
    hardwareConcurrency,
    deviceMemory,
    platform,
    vendor,
    doNotTrack,
    screenResolution,
    windowBounds,
    devicePixelRatio,
    canvas,
    plugins,
    mimeTypes,
    mediaDevices,
    permissions,
    batteryProfile,
    maxTouchPoints,
    viewport
  } = fingerprint;

  if (userAgent) {
    await page.setUserAgent(userAgent);
  }

  if (timezoneId) {
    await page.emulateTimezone(timezoneId);
  }

  if (languages) {
    await page.setExtraHTTPHeaders({
      "Accept-Language": languages.join(",")
    });
  }

  if (viewport && reuseViewport) {
    const viewportSettings = {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: devicePixelRatio ?? viewport.deviceScaleFactor ?? 1,
      isMobile: viewport.isMobile ?? false,
      hasTouch: viewport.hasTouch ?? maxTouchPoints > 0,
      isLandscape: viewport.isLandscape ?? true
    };
    await page.setViewport(viewportSettings);
  }

  await page.evaluateOnNewDocument((opts) => {
    const overrideProperty = (object, propertyName, value) => {
      Object.defineProperty(object, propertyName, {
        get: () => value,
        configurable: true
      });
    };

    const makeNavigatorArray = (items) => {
      const arr = items.map((item, index) => ({
        ...item,
        length: item.mimeTypes ? item.mimeTypes.length : undefined,
        item: function (idx) {
          return this[idx] ?? null;
        },
        namedItem: function (name) {
          return this.find((entry) => entry && entry.name === name) ?? null;
        },
        toString: () => "[object Plugin]"
      }));
      arr.length = items.length;
      arr.item = function (idx) {
        return this[idx] ?? null;
      };
      arr.namedItem = function (name) {
        return this.find((entry) => entry && entry.name === name) ?? null;
      };
      Object.defineProperty(arr, "toString", {
        value: () => "[object PluginArray]"
      });
      return arr;
    };

    const makeMimeTypeArray = (items) => {
      const arr = items.map((item) => ({
        ...item,
        enabledPlugin: null,
        toString: () => "[object MimeType]"
      }));
      arr.length = items.length;
      arr.item = function (idx) {
        return this[idx] ?? null;
      };
      arr.namedItem = function (name) {
        return this.find((entry) => entry && entry.type === name) ?? null;
      };
      Object.defineProperty(arr, "toString", {
        value: () => "[object MimeTypeArray]"
      });
      return arr;
    };

    overrideProperty(navigator, "webdriver", undefined);
    overrideProperty(navigator, "languages", opts.languages);
    overrideProperty(navigator, "language", opts.languages[0]);
    overrideProperty(navigator, "hardwareConcurrency", opts.hardwareConcurrency);
    overrideProperty(navigator, "deviceMemory", opts.deviceMemory);
    overrideProperty(navigator, "platform", opts.platform);
    overrideProperty(navigator, "vendor", opts.vendor);
    overrideProperty(navigator, "doNotTrack", opts.doNotTrack);
    overrideProperty(navigator, "maxTouchPoints", opts.maxTouchPoints);

    if (!window.chrome) {
      window.chrome = {};
    }
    if (!window.chrome.runtime) {
      window.chrome.runtime = {};
    }

    const pluginArray = makeNavigatorArray(opts.plugins || []);
    overrideProperty(navigator, "plugins", pluginArray);

    const mimeTypeArray = makeMimeTypeArray(opts.mimeTypes || []);
    overrideProperty(navigator, "mimeTypes", mimeTypeArray);

    const screenObj = window.screen || {};
    overrideProperty(screenObj, "width", opts.screenResolution.width);
    overrideProperty(screenObj, "height", opts.screenResolution.height);
    overrideProperty(screenObj, "availWidth", opts.screenResolution.width);
    overrideProperty(screenObj, "availHeight", opts.screenResolution.height - 40);
    overrideProperty(screenObj, "colorDepth", 24);
    overrideProperty(screenObj, "pixelDepth", 24);
    overrideProperty(window, "screen", screenObj);

    overrideProperty(window, "devicePixelRatio", opts.devicePixelRatio);
    overrideProperty(window, "outerWidth", opts.windowBounds.outerWidth);
    overrideProperty(window, "outerHeight", opts.windowBounds.outerHeight);
    overrideProperty(window, "innerWidth", opts.windowBounds.innerWidth);
    overrideProperty(window, "innerHeight", opts.windowBounds.innerHeight);

    if (!navigator.mediaDevices) {
      navigator.mediaDevices = {};
    }
    navigator.mediaDevices.enumerateDevices = async () => opts.mediaDevices;

    const permissionMap = opts.permissions || {};

    const originalPermissions = navigator.permissions && navigator.permissions.query
      ? navigator.permissions.query.bind(navigator.permissions)
      : null;
    if (navigator.permissions) {
      navigator.permissions.query = (parameters) => {
        const name = parameters && parameters.name;
        if (name && Object.prototype.hasOwnProperty.call(permissionMap, name)) {
          return Promise.resolve({ state: permissionMap[name] });
        }
        return originalPermissions ? originalPermissions(parameters) : Promise.resolve({ state: "prompt" });
      };
    }

    navigator.getBattery = async () => ({
      charging: opts.batteryProfile.charging,
      chargingTime: opts.batteryProfile.chargingTime,
      dischargingTime: opts.batteryProfile.dischargingTime,
      level: opts.batteryProfile.level,
      onchargingchange: null,
      onchargingtimechange: null,
      ondischargingtimechange: null,
      onlevelchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false
    });

    if (typeof Notification !== "undefined") {
      overrideProperty(Notification, "permission", (opts.permissions && opts.permissions.notifications) ?? "default");
    }

    if (!navigator.connection) {
      navigator.connection = {};
    }
    overrideProperty(navigator.connection, "effectiveType", "4g");
    overrideProperty(navigator.connection, "downlink", 10);
    overrideProperty(navigator.connection, "rtt", 50);

    const patchCanvas = (seed) => {
      const toDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const context = this.getContext("2d");
        if (context) {
          context.save();
          context.fillStyle = "#000000";
          context.globalAlpha = 0.01;
          context.fillRect(0, 0, this.width, this.height);
          context.restore();
          context.fillText(seed, 0, 0);
        }
        return toDataURL.apply(this, args);
      };

      if (window.CanvasRenderingContext2D) {
        const getImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function (...args) {
          const imageData = getImageData.apply(this, args);
          const seedCode = seed
            .split("")
            .reduce((acc, char) => acc + char.charCodeAt(0), 0);
          for (let i = 0; i < imageData.data.length; i += 4) {
            imageData.data[i] = imageData.data[i] ^ (seedCode & 0xff);
          }
          return imageData;
        };
      }
    };

    patchCanvas(opts.canvasSeed);

    if (window.WebGLRenderingContext) {
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function (parameter) {
        if (parameter === 37445) {
          return opts.canvasVendor;
        }
        if (parameter === 37446) {
          return opts.canvasRenderer;
        }
        return getParameter.apply(this, [parameter]);
      };
    }

    const originalEval = window.eval;
    window.eval = function (src) {
      if (src === "navigator.webdriver") {
        return undefined;
      }
      return originalEval.call(this, src);
    };

    overrideProperty(navigator, "userAgentData", undefined);
  }, {
    languages,
    hardwareConcurrency,
    deviceMemory,
    platform,
    vendor,
    doNotTrack,
    maxTouchPoints,
    plugins,
    mimeTypes,
    screenResolution,
    windowBounds,
    devicePixelRatio,
    mediaDevices,
    permissions,
    batteryProfile,
    canvasVendor: canvas.vendor,
    canvasRenderer: canvas.renderer,
    canvasSeed: canvas.seed
  });

  page._fingerprint = fingerprint;
}

