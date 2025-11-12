# Puppeteer Session Collector Prototype

Phase-1 prototype for a config-driven Puppeteer system that collects browser sessions and replays human-like actions.

## Requirements

- Node.js 18 or newer
- Internet access to configured demo sites (default: `https://example.com`)

## Install

```bash
npm install
```

## Repository Layout

```
config/          JSON configuration (settings, sites, actions)
docs/            Runbook and operational notes
scripts/         Helper scripts (demo run)
src/             Source modules (controller, collector, action, utilities)
sessions/        Output directory for collected browser sessions
```

## Quick Start

1. **Collect and Replay (demo)**
   ```bash
   node src/controller.js start --collectors=2 --visible=1
   ```
   - Collectors run headless and persist session artifacts under `sessions/{profileId}`.
   - A headful action worker tiles its window, loads a saved session, and executes configured actions.

2. **Check Status**
   ```bash
   node src/controller.js status
   ```

3. **Stop Workers**
   ```bash
   node src/controller.js stop
   ```

### Demo Script

```bash
node scripts/demo.js
```

Runs a short acceptance workflow: starts two collectors and one visible session, waits for completion, then prints session artifacts discovered.

## Configuration

- `config/settings.json` — concurrency, timeouts, resource blocking, fingerprint pools.
- `config/sites.json` — array of `{ id, startUrl }`.
- `config/actions.json` — mapping `{ siteId: [steps...] }`.

Examples are provided and safe for public use.

### Runtime Overrides

- `--collectors=<n>` — override number of collectors.
- `--visible=<m>` — override number of visible action workers.
- `--headless-actions` — run actions headless (local testing only).

## Session Artifacts

Each collector stores:

- `cookies.json`, `localStorage.json`, `sessionStorage.json`
- `meta.json` (start URL, timestamps, fingerprint info)
- `snapshot.png`
- Optional `network.har` (if enabled)

Action workers update the same folder with new artifacts (screenshots, updated storage).

## Anti-Bot Considerations

No stealth plugins are used. Instead, custom fingerprinting adjusts:

- `userAgent`, `viewport`, `languages`, `timezone`
- `hardwareConcurrency`, `deviceMemory`
- Removes `navigator.webdriver`, patches `chrome.runtime`, softens `permissions` API responses.

Adjust values in `config/settings.json` to rotate fingerprints safely.

## Troubleshooting

- Make sure Chromium can launch on your OS; install system dependencies if needed.
- Review logs printed to stdout; enable verbose logs with `DEBUG=pupeter:*`.
- Clean up sessions with `node src/controller.js prune`.

## Acceptance Criteria

- `scripts/demo.js` produces at least two populated session folders.
- `node src/controller.js start --visible=1` opens real browser windows in a grid arrangement.
- Editing `config/actions.json` changes the executed visible steps without code changes.

## License

Prototype for internal evaluation. No license granted.

