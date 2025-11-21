#!/usr/bin/env node
/**
 * Grid View Demo
 * 
 * This script demonstrates the dynamic grid layout feature.
 * It opens multiple browser windows that automatically arrange themselves
 * in a grid based on your screen size.
 * 
 * Usage:
 *   node scripts/grid-demo.js [number-of-windows]
 * 
 * Examples:
 *   node scripts/grid-demo.js 4    # Opens 4 windows in a 2x2 grid
 *   node scripts/grid-demo.js 6    # Opens 6 windows in a 3x2 grid
 *   node scripts/grid-demo.js 9     # Opens 9 windows in a 3x3 grid
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");

// Get number of windows from command line argument, default to 6
const windowCount = parseInt(process.argv[2] || "6", 10);

if (isNaN(windowCount) || windowCount < 1) {
  console.error("Error: Please provide a valid number of windows (1 or more)");
  console.log("\nUsage: node scripts/grid-demo.js [number-of-windows]");
  console.log("Example: node scripts/grid-demo.js 6");
  process.exit(1);
}

console.log("=".repeat(60));
console.log("  GRID VIEW DEMO");
console.log("=".repeat(60));
console.log(`\nOpening ${windowCount} browser window(s) in a dynamic grid layout...`);
console.log("\nThe windows will automatically arrange themselves based on:");
console.log("  • Your screen resolution");
console.log("  • The number of windows");
console.log("  • Optimal grid layout (rows × columns)");
console.log("\nWatch as the browsers open and position themselves!");
console.log("=".repeat(60));
console.log("");

// Run the controller with visible browsers
// We need at least as many collectors as visible windows to have sessions to display
const collectorCount = Math.max(windowCount, 3); // At least 3 collectors to ensure we have sessions

const child = spawn(
  "node",
  [
    "src/controller.js",
    "start",
    `--collectors=${collectorCount}`, // Need collectors to create sessions
    `--visible=${windowCount}`,       // Number of visible windows in grid
    "--collector-cycles=1",           // Run collectors once
    "--action-cycles=1",              // Run actions once
    "--run-once",                     // Exit after one run
    "--run-id", `grid-demo-${Date.now()}`
  ],
  {
    cwd: rootDir,
    stdio: "inherit"
  }
);

child.on("error", (err) => {
  console.error("\n[grid-demo] Failed to start:", err.message);
  process.exit(1);
});

child.on("exit", (code) => {
  if (code === 0) {
    console.log("\n" + "=".repeat(60));
    console.log("  Demo complete!");
    console.log("=".repeat(60));
    console.log("\nThe browser windows should now be arranged in a grid.");
    console.log("Try running with different numbers to see how the grid adapts:");
    console.log("  • node scripts/grid-demo.js 4   (2x2 grid)");
    console.log("  • node scripts/grid-demo.js 6   (3x2 or 2x3 grid)");
    console.log("  • node scripts/grid-demo.js 9   (3x3 grid)");
    console.log("  • node scripts/grid-demo.js 12  (4x3 or 3x4 grid)");
  } else {
    console.error(`\n[grid-demo] Exited with code ${code}`);
    process.exit(code);
  }
});

