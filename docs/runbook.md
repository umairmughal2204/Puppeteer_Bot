# Runbook: Puppeteer Collector/Action Project

## Overview

The system launches two classes of workers:

- **Collectors** (headless) crawl configured sites and persist browser state under `sessions/<run-id>/<profileId>`.
- **Visible Actions** (headful) load saved sessions, open tiled browser windows, and execute human-like interactions.

Scaling focuses on distributing workload while respecting host resource limits.

## Recommended Host Profiles

- **Small Demo (2 collectors / 1 visible)**  
  - 4 vCPU, 8 GB RAM  
  - 20 GB SSD  
  - Suitable for local testing and acceptance.

- **Medium (10 collectors / 5 visible)**  
  - 8 vCPU, 16 GB RAM  
  - 40 GB SSD  
  - Requires GPU acceleration disabled; ensure swap file/partition available.

- **Large (40 collectors / 10 visible)**  
  - 16+ vCPU, 32+ GB RAM  
  - 100 GB SSD  
  - Consider dedicated Chrome cache directory per worker to reduce thrashing.

## Operational Procedures

1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Warm-Up Run**
   ```bash
   node scripts/demo.js
   ```
   Confirms that collectors can save sessions and actions can replay them.
3. **Scale-Up**
   ```bash
   node src/controller.js start --collectors=40 --visible=10 --run-id prod-$(date +%s) --run-once=false
   ```
   - The controller derives swap cycles from `collectorSessionDurationSec` / `collectorSwapIntervalSec` and their action equivalents whenever `enableScheduling` is true and `--run-once=false`.
   - Use `--collector-cycles` / `--action-cycles` to cap cycles during tests.
   - Increase counts gradually and monitor CPU (target < 85%), RAM (target < 75%), and disk I/O.

4. **Status**
   ```bash
   node src/controller.js status
   ```

5. **Graceful Stop**
   ```bash
   node src/controller.js stop
   ```

## Troubleshooting

- **High CPU or Memory Usage**
  - Reduce `collectorsCount` or `visibleCount`.
  - Enable resource blocking (`blockResources`) for media-heavy sites or tighten `resourcePolicy` on individual site configs.
  - Increase `staggerDelayMs`.

- **Session Not Persisting**
  - Confirm domain navigations match cookie scope.
  - Ensure `sessionManager.saveSession` completes (check logs).
  - Verify permissions to write under `sessions/` and that `runId` is unique.

- **Action Windows Not Tiled**
  - OS window manager may override positions; adjust `windowSize` in `settings.json`.
  - On macOS, disable "Displays have separate Spaces" or run fewer simultaneous windows.

- **Anti-Bot Detection Triggers**
  - Rotate fingerprints (`fingerprint` section of `settings.json`).
  - Keep `blockResources.thirdParty` disabled for highly sensitive domains.
  - Adjust fingerprint pools for platform/vendor, media devices, permissions, and battery to match target demographics.
  - Add random per-run delays (`humanize.randomPause`) or vary `collectorIdleDelayRange`.

## Maintenance Tasks

- **Session Retention**
  - A background cleanup job prunes folders older than `sessionRetentionHours`.
  - Manual cleanup: `node src/controller.js prune`.

- **Config Refresh**
  - Updates to JSON configs are hot-loaded on each run; no restart needed.
  - `config/sites.json` can include per-site `resourcePolicy` directives to whitelist or block resource types.

- **Log Review**
  - Logs written to stdout. Redirect to file when running under a supervisor:
    ```bash
    node src/controller.js start >> logs/controller.log 2>&1
    ```

## Incident Response

- **Collector Crash Loop**
  - View recent logs.
  - Validate site availability manually.
  - Temporarily remove failing site entry from `sites.json`.
  - If a specific fingerprint is problematic, remove it from the pool or delete the affected `sessions/<run-id>/<profileId>` folder before retrying.

- **Chrome Launch Failures**
  - Ensure correct Puppeteer Chromium download (rerun `npm install`).
  - On Linux, install missing dependencies (`apt install -y libgtk-3-0 libasound2` etc.).
  - Use environment variable `PUPPETEER_EXECUTABLE_PATH` to point to system Chrome if necessary.

## Contact & Escalation

- **Primary Operator:** Automation Team
- **Escalation Path:** On-call engineer → Lead developer → Infra SRE

Keep this document alongside the repository. Update host recommendations and troubleshooting tips as the Project evolves.

