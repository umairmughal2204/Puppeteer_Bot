# Website Automation Guide

Complete guide to automate any website using Puppeteer Bot.

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Understanding the System](#understanding-the-system)
3. [Step-by-Step Setup](#step-by-step-setup)
4. [Action Types Reference](#action-types-reference)
5. [Common Patterns](#common-patterns)
6. [Troubleshooting](#troubleshooting)
7. [Advanced Tips](#advanced-tips)

---

## Quick Start

### 1. Add Website to `config/sites.json`

```json
{
  "id": "your-website-id",
  "startUrl": "https://example.com/login",
  "resourcePolicy": {
    "allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch"]
  }
}
```

### 2. Add Actions to `config/actions.json`

```json
{
  "your-website-id": [
    { "type": "wait", "ms": 2000 },
    { "type": "click", "selector": "#login-button" },
    { "type": "screenshot", "filename": "01-login-page.png" }
  ]
}
```

### 3. Run the automation

```powershell
node src/controller.js start --sites=your-website-id --visible=1
```

---

## Understanding the System

### File Structure

```
config/
  ├── sites.json          # Define websites to automate
  ├── actions.json        # Define automation workflows
  └── settings.json       # Global settings

src/
  ├── action.js           # Executes visible browser actions
  ├── collector.js        # Collects headless browser data
  ├── sessionManager.js   # Manages cookies, storage, sessions
  └── humanize.js         # Natural user behavior simulation
```

### How It Works

1. **Sites** define WHERE to automate (URL + resource policy)
2. **Actions** define WHAT to do (click, type, wait, screenshot)
3. **Sessions** store cookies/storage for persistence
4. **Collectors** gather data in headless mode
5. **Actions** perform visible automation

---

## Step-by-Step Setup

### Step 1: Find Website Selectors

Open the website in browser and use Developer Tools (F12):

```
1. Right-click on element → Inspect
2. Copy the CSS selector
3. Use in your action steps
```

**Common selectors:**
```
Button:        button, button.login, [role="button"]
Input field:   input, input[type="email"], input#email
Text area:     textarea, textarea.message
Link:          a, a.login-link
Container:     div.container, section#content
```

### Step 2: Add Site Configuration

Edit `config/sites.json`:

```json
{
  "id": "linkedin-profile",
  "startUrl": "https://www.linkedin.com/login",
  "resourcePolicy": {
    "allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch"]
  }
}
```

**Resource Policy Options:**

```json
// Allow specific resource types
"allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch"]

// Block specific resource types
"blockedResourceTypes": ["image", "media", "font"]

// Combination
"allowedResourceTypes": ["document", "script", "xhr"],
"blockedResourceTypes": ["media"]
```

### Step 3: Create Action Workflow

Edit `config/actions.json`:

```json
{
  "linkedin-profile": [
    { "type": "wait", "ms": 3000 },
    { "type": "screenshot", "filename": "01-login-page.png" },
    
    { "type": "click", "selector": "input[name='session_key']" },
    { "type": "type", "selector": "input[name='session_key']", "text": "your@email.com", "clear": true },
    
    { "type": "click", "selector": "input[name='session_password']" },
    { "type": "type", "selector": "input[name='session_password']", "text": "your-password", "clear": true },
    
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "ms": 5000 },
    { "type": "screenshot", "filename": "02-dashboard.png" },
    
    { "type": "scroll", "distance": 1000, "durationMs": 2000 },
    { "type": "screenshot", "filename": "03-scrolled.png" }
  ]
}
```

### Step 4: Run Automation

```powershell
# Run with visible browser (see it working)
node src/controller.js start --sites=linkedin-profile --visible=1

# Run headless (background)
node src/controller.js start --sites=linkedin-profile

# Run with collectors
node src/controller.js start --sites=linkedin-profile --collectors=1

# Run once (single cycle)
node src/controller.js start --sites=linkedin-profile --visible=1 --run-once
```

---

## Action Types Reference

### 1. Wait (Pause Execution)

```json
{ "type": "wait", "ms": 2000 }
```

**Usage:** Wait for page to load, animations to complete
- `ms`: milliseconds to wait

---

### 2. Click (Interact with Elements)

```json
{ "type": "click", "selector": "button.login", "human": true }
```

**Options:**
- `selector`: CSS selector of element to click
- `human`: true/false - simulate human-like click (with random delay)
- `afterDelayMs`: delay after clicking (optional)

**Examples:**
```json
{ "type": "click", "selector": "button" }
{ "type": "click", "selector": "#submit-btn", "human": true }
{ "type": "click", "selector": "a.next-page", "afterDelayMs": 500 }
```

---

### 3. Type (Enter Text)

```json
{ "type": "type", "selector": "input#email", "text": "user@email.com", "clear": true }
```

**Options:**
- `selector`: CSS selector of input field
- `text`: text to type
- `clear`: true/false - clear field before typing

**Examples:**
```json
{ "type": "type", "selector": "input[name='email']", "text": "test@example.com" }
{ "type": "type", "selector": "textarea", "text": "Message body", "clear": true }
```

---

### 4. Key (Keyboard Shortcuts)

```json
{ "type": "key", "key": "Control+Enter" }
```

**Supported Keys:**
- Single keys: `Enter`, `Tab`, `Escape`, `Backspace`, `Delete`
- Modifiers: `Control+Enter`, `Shift+Tab`, `Alt+F4`
- Arrow keys: `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`

**Examples:**
```json
{ "type": "key", "key": "Enter" }
{ "type": "key", "key": "Control+Enter" }
{ "type": "key", "key": "Escape" }
```

---

### 5. Scroll (Scroll Page)

```json
{ "type": "scroll", "distance": 500, "durationMs": 1000 }
```

**Options:**
- `distance`: pixels to scroll
- `durationMs`: duration of scroll animation

**Examples:**
```json
{ "type": "scroll", "distance": 300 }
{ "type": "scroll", "distance": 1000, "durationMs": 2000 }
```

---

### 6. Hover (Hover over Element)

```json
{ "type": "hover", "selector": ".menu-item", "dwellMs": 500 }
```

**Options:**
- `selector`: CSS selector
- `dwellMs`: how long to hover (milliseconds)

**Examples:**
```json
{ "type": "hover", "selector": ".dropdown" }
{ "type": "hover", "selector": "#profile-icon", "dwellMs": 1000 }
```

---

### 7. Screenshot (Capture Page)

```json
{ "type": "screenshot", "filename": "page-01.png" }
```

**Options:**
- `filename`: name of screenshot file

**Examples:**
```json
{ "type": "screenshot" }
{ "type": "screenshot", "filename": "dashboard.png" }
{ "type": "screenshot", "filename": "01-login.png" }
```

Screenshots are saved in: `sessions/run-{timestamp}/{profileId}/`

---

## Common Patterns

### Pattern 1: Login with Email & Password

```json
{
  "login-site": [
    { "type": "wait", "ms": 2000 },
    
    { "type": "click", "selector": "input[type='email']" },
    { "type": "type", "selector": "input[type='email']", "text": "user@example.com" },
    
    { "type": "click", "selector": "input[type='password']" },
    { "type": "type", "selector": "input[type='password']", "text": "password123" },
    
    { "type": "click", "selector": "button[type='submit']" },
    { "type": "wait", "ms": 3000 },
    
    { "type": "screenshot", "filename": "logged-in.png" }
  ]
}
```

### Pattern 2: Form Filling

```json
{
  "contact-form": [
    { "type": "type", "selector": "input[name='name']", "text": "John Doe" },
    { "type": "type", "selector": "input[name='email']", "text": "john@example.com" },
    { "type": "type", "selector": "textarea[name='message']", "text": "Hello, this is a message" },
    { "type": "click", "selector": "button.submit" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "filename": "form-submitted.png" }
  ]
}
```

### Pattern 3: Multi-Step Interaction

```json
{
  "multi-step": [
    { "type": "wait", "ms": 1000 },
    { "type": "click", "selector": "button.start" },
    
    { "type": "wait", "ms": 2000 },
    { "type": "type", "selector": "input", "text": "answer1" },
    { "type": "click", "selector": "button.next" },
    
    { "type": "wait", "ms": 2000 },
    { "type": "type", "selector": "input", "text": "answer2" },
    { "type": "click", "selector": "button.submit" },
    
    { "type": "wait", "ms": 3000 },
    { "type": "screenshot", "filename": "completed.png" }
  ]
}
```

### Pattern 4: Search & Navigate

```json
{
  "search-site": [
    { "type": "click", "selector": "input.search" },
    { "type": "type", "selector": "input.search", "text": "puppeteer" },
    { "type": "key", "key": "Enter" },
    
    { "type": "wait", "ms": 3000 },
    { "type": "screenshot", "filename": "search-results.png" },
    
    { "type": "click", "selector": "a.first-result" },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "filename": "result-page.png" }
  ]
}
```

### Pattern 5: Keyboard Navigation (like ChatGPT)

```json
{
  "chat-app": [
    { "type": "click", "selector": "textarea" },
    { "type": "type", "selector": "textarea", "text": "What is AI?" },
    { "type": "key", "key": "Control+Enter" },
    
    { "type": "wait", "ms": 5000 },
    { "type": "screenshot", "filename": "response.png" },
    
    { "type": "click", "selector": "textarea" },
    { "type": "type", "selector": "textarea", "text": "Explain machine learning" },
    { "type": "key", "key": "Control+Enter" },
    
    { "type": "wait", "ms": 5000 },
    { "type": "screenshot", "filename": "response2.png" }
  ]
}
```

### Pattern 6: Pagination/Infinite Scroll

```json
{
  "paginated-site": [
    { "type": "screenshot", "filename": "01-page.png" },
    
    { "type": "scroll", "distance": 1000, "durationMs": 2000 },
    { "type": "wait", "ms": 2000 },
    { "type": "screenshot", "filename": "02-page.png" },
    
    { "type": "click", "selector": "a.next-page" },
    { "type": "wait", "ms": 3000 },
    { "type": "screenshot", "filename": "03-next-page.png" }
  ]
}
```

---

## Troubleshooting

### Issue: "Selector not found"

**Solution:**
```
1. Inspect element (F12)
2. Verify CSS selector exists
3. Add wait before clicking: { "type": "wait", "ms": 2000 }
4. Try alternative selector:
   - input[name='email'] → input.email → input#user-email
```

### Issue: "CloudFlare verification appearing"

**Solution:** Already handled! Bot has built-in CloudFlare bypass.
- Request interception blocks challenge resources
- JavaScript disabled during load
- Prevents detection

### Issue: "Text not typing correctly"

**Solution:**
```json
// Add clear flag
{ "type": "type", "selector": "input", "text": "email@test.com", "clear": true }

// Add click before typing
{ "type": "click", "selector": "input" },
{ "type": "type", "selector": "input", "text": "email@test.com" }

// Add wait between actions
{ "type": "wait", "ms": 500 },
{ "type": "type", "selector": "input", "text": "text here" }
```

### Issue: "Page loads incomplete"

**Solution:**
```json
// Increase wait time
{ "type": "wait", "ms": 5000 }

// Wait for specific element
{ "type": "wait", "ms": 3000 },
{ "type": "click", "selector": ".loaded-element" }
```

### Issue: "Login not persisting"

**Solution:** Sessions are auto-saved with cookies:
```
1. First run creates cookies in sessions/
2. Next runs auto-restore cookies
3. Check sessions/{run-id}/{profileId}/cookies.json
```

### Issue: "Element clicked but nothing happens"

**Solution:**
```json
// Add human click option
{ "type": "click", "selector": "button", "human": true }

// Add wait after click
{ "type": "click", "selector": "button" },
{ "type": "wait", "ms": 2000 }

// Try scrolling to element first
{ "type": "scroll", "distance": 300 },
{ "type": "click", "selector": "button" }
```

---

## Advanced Tips

### Tip 1: Find Right Selectors

**Try multiple approaches:**
```
CSS class:     .login-button
CSS ID:        #submit
Attribute:     input[name='email']
Attribute val: button[type='submit']
Text content:  button:has-text("Login")
Role:          [role="button"]
Combo:         div.form input[type='email']
```

**Use in browser console:**
```javascript
document.querySelector("input[name='email']")  // Find element
document.querySelectorAll(".item")              // Find multiple
```

### Tip 2: Detect Page Loading

Common strategies:
```json
// Strategy 1: Fixed wait
{ "type": "wait", "ms": 3000 }

// Strategy 2: Wait then interact
{ "type": "wait", "ms": 2000 },
{ "type": "click", "selector": ".element" }

// Strategy 3: Multiple screenshots to verify
{ "type": "screenshot", "filename": "01-loading.png" },
{ "type": "wait", "ms": 2000 },
{ "type": "screenshot", "filename": "02-loaded.png" }
```

### Tip 3: Resource Policy Optimization

```json
// Minimal (fastest)
"allowedResourceTypes": ["document", "script"]

// Standard
"allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch"]

// Full
"allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch", "image", "font"]
```

### Tip 4: Session Persistence

Sessions auto-save to: `sessions/{run-id}/{profileId}/`

Files stored:
- `cookies.json` - Browser cookies
- `localStorage.json` - Local storage
- `sessionStorage.json` - Session storage
- `meta.json` - Metadata
- `snapshot.png` - Screenshot
- `network.har` - Network recording (if enabled)

### Tip 5: Multiple Profiles

Run multiple automations in parallel:
```powershell
# Run 3 parallel automations (different sites)
node src/controller.js start --sites=site1 --sites=site2 --sites=site3 --visible=1

# Run 10 collectors + 5 visible actions
node src/controller.js start --collectors=10 --visible=5
```

### Tip 6: Debugging

```powershell
# Check recent sessions
Get-ChildItem sessions -Recurse -Directory | Sort-Object LastWriteTime -Desc | Select-Object -First 5

# View latest screenshots
Get-ChildItem sessions -Recurse -Filter "*.png" | Sort-Object LastWriteTime -Desc | Select-Object -First 10

# Check errors in sessions
Get-ChildItem sessions -Recurse -Filter "*.json" | Select-String "error"
```

### Tip 7: Running Specific Workflows

```powershell
# Run single site
node src/controller.js start --sites=linkedin-profile --visible=1 --run-once

# Run multiple sites
node src/controller.js start --sites=linkedin-profile --sites=facebook-profile --visible=1

# Run with custom settings
node src/controller.js start --sites=site1 --collectors=5 --visible=3 --collector-cycles=2
```

---

## Example: Complete LinkedIn Automation

`config/sites.json`:
```json
{
  "id": "linkedin-login",
  "startUrl": "https://www.linkedin.com/login",
  "resourcePolicy": {
    "allowedResourceTypes": ["document", "script", "stylesheet", "xhr", "fetch"]
  }
}
```

`config/actions.json`:
```json
{
  "linkedin-login": [
    { "type": "wait", "ms": 3000 },
    { "type": "screenshot", "filename": "01-login-page.png" },
    
    { "type": "type", "selector": "input#username", "text": "your-email@gmail.com", "clear": true },
    { "type": "type", "selector": "input#password", "text": "your-password", "clear": true },
    
    { "type": "click", "selector": "button[aria-label='Sign in']" },
    { "type": "wait", "ms": 5000 },
    
    { "type": "screenshot", "filename": "02-dashboard.png" },
    { "type": "scroll", "distance": 800, "durationMs": 2000 },
    { "type": "screenshot", "filename": "03-scrolled.png" }
  ]
}
```

Run:
```powershell
node src/controller.js start --sites=linkedin-login --visible=1 --run-once
```

---

## Next Steps

1. **Choose a website** to automate
2. **Inspect elements** using Developer Tools (F12)
3. **Add site** to `config/sites.json`
4. **Create actions** in `config/actions.json`
5. **Test** with `--visible=1` flag
6. **Verify screenshots** in `sessions/` folder
7. **Adjust selectors** if needed
8. **Run production** mode

Happy automating!
