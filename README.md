# Puppeteer Session Collector Project

Phase-1 Config-driven Puppeteer system that collects browser sessions and replays human-like actions.

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
   node src/controller.js start --collectors=3 --visible=1 --collector-cycles=1 --action-cycles=1 --run-once
   ```
   - Collectors run headless and persist session artifacts under `sessions/<run-id>/<profileId>`.
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
- Site entries support optional `resourcePolicy` with `allowedResourceTypes` / `blockedResourceTypes` per origin.
- Action steps support `wait`, `scroll`, `hover`, `click`, `type`, and `screenshot`.

Examples are provided and safe for public use.

### Runtime Overrides

- `--collectors=<n>` — override number of collectors.
- `--visible=<m>` — override number of visible action workers.
- `--headless-actions` — run actions headless (local testing only).
- `--collector-cycles`, `--action-cycles` — override swap cycles derived from scheduling config.
- `--run-id=<name>` — set explicit run directory name (`sessions/<run-id>/<profileId>`).

## Session Artifacts

Each collector stores:

- `cookies.json`, `localStorage.json`, `sessionStorage.json`
- `meta.json` (start URL, timestamps, fingerprint info)
- `snapshot.png`
- Optional `network.har` (if enabled)

Action workers update the same folder with new artifacts (screenshots, updated storage).

## Anti-Bot Considerations

No stealth plugins are used. Instead, custom fingerprinting adjusts:

- Identity: `userAgent`, `platform`, `vendor`, languages, `doNotTrack`, timezone.
- Hardware: `hardwareConcurrency`, `deviceMemory`, `maxTouchPoints`, battery and permissions states.
- Display: viewport, devicePixelRatio, screen and window bounds, `outerWidth/innerHeight`.
- Graphics: WebGL vendor/renderer, deterministic canvas perturbation.
- Browser APIs: plugins, mimeTypes, mediaDevices, permissions, connection, `navigator.webdriver` removal.

Adjust values in `config/settings.json` to rotate fingerprints safely.

## Troubleshooting

- Make sure Chromium can launch on your OS; install system dependencies if needed.
- Review logs printed to stdout; enable verbose logs with `DEBUG=pupeter:*`.
- Clean up sessions with `node src/controller.js prune`.

## Acceptance Criteria

- `scripts/demo.js` produces at least two populated session folders.
- `node src/controller.js start --visible=1` opens real browser windows in a grid arrangement.
- Editing `config/actions.json` changes the executed visible steps without code changes.
- Scheduling durations (`collectorSessionDurationSec`, `collectorSwapIntervalSec`, etc.) can be tuned without modifying code.
