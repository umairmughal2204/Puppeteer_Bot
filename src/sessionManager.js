import fs from "fs-extra";
import path from "node:path";

export async function ensureSessionDir(sessionDir) {
  await fs.mkdir(sessionDir, { recursive: true });
}

export async function saveSession(page, sessionDir, { includeHar = false } = {}) {
  await ensureSessionDir(sessionDir);

  const client = await page.target().createCDPSession();
  const cookies = (await client.send("Network.getAllCookies")).cookies ?? [];
  await fs.writeJson(path.join(sessionDir, "cookies.json"), cookies, { spaces: 2 });

  const storage = await page.evaluate(() => {
    const readStorage = (storageObj) => {
      const data = {};
      for (let i = 0; i < storageObj.length; i += 1) {
        const key = storageObj.key(i);
        data[key] = storageObj.getItem(key);
      }
      return data;
    };
    return {
      localStorage: readStorage(window.localStorage),
      sessionStorage: readStorage(window.sessionStorage)
    };
  });

  await fs.writeJson(path.join(sessionDir, "localStorage.json"), storage.localStorage, { spaces: 2 });
  await fs.writeJson(path.join(sessionDir, "sessionStorage.json"), storage.sessionStorage, { spaces: 2 });

  const fingerprint = page._fingerprint ?? {};
  const meta = {
    startUrl: page.url(),
    timestamp: new Date().toISOString(),
    fingerprint
  };
  await fs.writeJson(path.join(sessionDir, "meta.json"), meta, { spaces: 2 });

  await page.screenshot({ path: path.join(sessionDir, "snapshot.png"), fullPage: true });

  if (includeHar && page._har && page._har.stop) {
    const har = await page._har.stop();
    await fs.writeJson(path.join(sessionDir, "network.har"), har, { spaces: 2 });
  }
}

export async function restoreSession(sessionDir) {
  const session = {
    cookies: [],
    localStorage: {},
    sessionStorage: {},
    meta: {}
  };

  async function safeReadJson(file, fallback) {
    try {
      return await fs.readJson(path.join(sessionDir, file));
    } catch {
      return fallback;
    }
  }

  session.cookies = await safeReadJson("cookies.json", []);
  session.localStorage = await safeReadJson("localStorage.json", {});
  session.sessionStorage = await safeReadJson("sessionStorage.json", {});
  session.meta = await safeReadJson("meta.json", {});
  return session;
}

export async function applySavedStorage(page, session, originUrl) {
  if (!session) return;

  if (session.cookies && session.cookies.length > 0) {
    const filtered = session.cookies.filter((cookie) => {
      if (!cookie.domain) return true;
      try {
        const url = new URL(originUrl ?? session.meta?.startUrl ?? page.url());
        return url.hostname.endsWith(cookie.domain.replace(/^\./, ""));
      } catch {
        return true;
      }
    });
    if (filtered.length) {
      await page.setCookie(...filtered);
    }
  }

  const localEntries = session.localStorage ?? {};
  const sessionEntries = session.sessionStorage ?? {};

  await page.evaluate(
    ({ localEntries, sessionEntries }) => {
      Object.entries(localEntries).forEach(([key, value]) => {
        window.localStorage.setItem(key, value);
      });
      Object.entries(sessionEntries).forEach(([key, value]) => {
        window.sessionStorage.setItem(key, value);
      });
    },
    { localEntries, sessionEntries }
  );
}

export async function pruneOldSessions(baseDir, maxAgeHours) {
  if (!maxAgeHours || maxAgeHours <= 0) return;
  const now = Date.now();
  const entries = await fs.readdir(baseDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const dirPath = path.join(baseDir, entry.name);
        const stat = await fs.stat(dirPath);
        const ageHours = (now - stat.mtimeMs) / 3600000;
        if (ageHours > maxAgeHours) {
          await fs.remove(dirPath);
        }
      })
  );
}

