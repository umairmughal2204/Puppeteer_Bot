# Grid View Demo - Step by Step Guide

## How to Run the Demo

### Prerequisites
1. Make sure you have Node.js installed (version 18 or newer)
2. Make sure dependencies are installed:
   ```bash
   npm install
   ```

### Running the Demo

Open your terminal/PowerShell in the project directory and run:

```bash
node scripts/grid-demo.js 6
```

**Or specify a different number of windows:**
```bash
node scripts/grid-demo.js 4    # Opens 4 windows
node scripts/grid-demo.js 9    # Opens 9 windows
node scripts/grid-demo.js 12   # Opens 12 windows
```

## What the Demo Actually Does

### Step-by-Step Process

#### Phase 1: Setup (Automatic)
1. **Detects your screen size**
   - Uses PowerShell (Windows), system_profiler (macOS), or xrandr (Linux)
   - Gets your actual screen resolution (e.g., 1920×1080, 2560×1440, etc.)
   - Caches this information for performance

2. **Calculates grid layout**
   - Determines how many windows can fit horizontally and vertically
   - Calculates optimal rows × columns arrangement
   - Example: 6 windows might become a 3×2 or 2×3 grid depending on screen size

#### Phase 2: Collectors (Background - Headless Browsers)
3. **Launches collector browsers** (headless - you won't see these)
   - Opens browsers in the background
   - Visits websites from `config/sites.json` (like example.com, iana.org, etc.)
   - Saves session data: cookies, localStorage, screenshots
   - Creates session folders in `sessions/grid-demo-<timestamp>/<profileId>/`

   **What you'll see in console:**
   ```
   [controller] collector cycle 1/1: launching 6 worker(s) at concurrency 6
   [collector:0001] launching browser
   [collector:0001] navigating to https://example.com
   [collector:0002] launching browser
   ...
   ```

#### Phase 3: Grid View (Visible Browsers)
4. **Opens visible browser windows in a grid**
   - Takes the number you specified (e.g., 6)
   - For each window:
     - Calculates its position in the grid (row, column)
     - Determines window size (scales down if needed to fit)
     - Positions it on screen with proper spacing
     - Centers the entire grid on your display

5. **Loads saved sessions**
   - Each visible browser loads a session collected in Phase 2
   - Restores cookies, localStorage, and other session data
   - Navigates to the same URL the collector visited

6. **Executes actions** (from `config/actions.json`)
   - Performs configured actions like:
     - Waiting
     - Scrolling
     - Clicking elements
     - Typing text
     - Taking screenshots
   - Actions are human-like (with delays, smooth movements)

7. **Saves results**
   - Updates session folders with new screenshots
   - Saves any new cookies or localStorage changes

### Visual Example

When you run `node scripts/grid-demo.js 6`, here's what happens:

```
┌─────────────────────────────────────────────────┐
│  Your Screen (e.g., 1920×1080)                   │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Browser  │  │ Browser  │  │ Browser  │       │
│  │   #1     │  │   #2     │  │   #3     │       │
│  │          │  │          │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │ Browser  │  │ Browser  │  │ Browser  │       │
│  │   #4     │  │   #5     │  │   #6     │       │
│  │          │  │          │  │          │       │
│  └──────────┘  └──────────┘  └──────────┘       │
│                                                   │
│  (Grid is automatically centered)                │
└─────────────────────────────────────────────────┘
```

### What You'll See

1. **In the Terminal:**
   ```
   ============================================================
     GRID VIEW DEMO
   ============================================================
   
   Opening 6 browser window(s) in a dynamic grid layout...
   
   The windows will automatically arrange themselves based on:
     • Your screen resolution
     • The number of windows
     • Optimal grid layout (rows × columns)
   
   Watch as the browsers open and position themselves!
   ============================================================
   
   [controller] run grid-demo-1234567890 starting with 6 collectors...
   [collector:0001] launching browser
   [collector:0001] navigating to https://example.com
   ...
   [controller] action cycle 1/1: launching 6 window(s) at concurrency 6
   [action:0001] launching visible browser
   [action:0001] initial navigation to https://example.com
   ...
   ```

2. **On Your Screen:**
   - Browser windows will start appearing one by one
   - They'll position themselves in a grid automatically
   - Each window will load a website and perform actions
   - You can watch them scroll, click, and interact

3. **After Completion:**
   - Windows stay open so you can see the final state
   - Session data is saved in `sessions/grid-demo-<timestamp>/`
   - Console shows completion message

### Understanding the Grid Layout

The grid adapts based on:

- **Screen Size**: Larger screens can fit more windows side-by-side
- **Number of Windows**: More windows = more rows/columns
- **Window Size**: Default viewport is 1440×900, but scales down if needed

**Examples:**
- **4 windows** on 1920×1080 screen → 2×2 grid
- **6 windows** on 1920×1080 screen → 3×2 grid (3 columns, 2 rows)
- **9 windows** on 2560×1440 screen → 3×3 grid
- **12 windows** on 1920×1080 screen → 4×3 grid (windows might be smaller)

### Files Created

After running, check the `sessions/` folder:

```
sessions/
  └── grid-demo-<timestamp>/
      ├── 0001/
      │   ├── cookies.json
      │   ├── localStorage.json
      │   ├── snapshot.png
      │   └── after-scroll.png (if actions include screenshots)
      ├── 0002/
      ├── 0003/
      └── ...
```

### Troubleshooting

**Windows don't appear in a grid?**
- Make sure you're using `--visible` parameter, not just collectors
- Check that collectors completed successfully (they create the sessions)

**Windows are too small or cut off?**
- The grid automatically scales windows to fit
- Try fewer windows if they're too small: `node scripts/grid-demo.js 4`

**Error: "Failed to get screen dimensions"**
- The script falls back to 1920×1080
- Grid will still work, but might not be optimal for your screen

**Browsers close immediately?**
- This is normal - they close after completing actions
- Add `--action-cycles=2` to keep them open longer, or modify actions in `config/actions.json`

### Next Steps

1. **Try different numbers**: See how the grid changes with 4, 6, 9, or 12 windows
2. **Modify actions**: Edit `config/actions.json` to change what browsers do
3. **Change sites**: Edit `config/sites.json` to visit different websites
4. **Use in your code**: The grid layout works automatically when you use `--visible` parameter

### Direct Controller Usage

You can also use the grid view directly without the demo script:

```bash
# Open 5 browsers in a grid
node src/controller.js start --collectors=5 --visible=5 --run-once

# Open 10 browsers (will create a larger grid)
node src/controller.js start --collectors=10 --visible=10 --run-once
```

The grid layout is automatic - just specify how many visible windows you want!

