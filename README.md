# opencode-browser-agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)](#easy-install--easy-update-windows-linux-macos)
[![agent-browser](https://img.shields.io/badge/agent--browser-0.27%2B-informational)](https://github.com/vercel-labs/agent-browser)
[![OpenCode](https://img.shields.io/badge/opencode-plugin-1.x-brightgreen)](https://opencode.ai)

OpenCode plugin for [agent-browser](https://github.com/vercel-labs/agent-browser) - browser automation for AI agents with persistent sessions, dev tools, cross-platform installers (Windows / Linux desktop / Linux VPS-headless) and a rewritten, policy-first skill.

Maintained by **Pouya Ghourchiani (BTF Kabir)**.

## Features

- **Viewport guidance** - open at a consistent 1920x1080 (`agent-browser set viewport`)
- **Cookie Banner Handling** - the skill tells the agent to dismiss cookie consent popups
- **Cross-platform** - Windows PowerShell, Linux terminal (headless) and Linux GUI desktops
- **Never kills your browser** - reuse your running Chrome via `--auto-connect`; the skill forbids `pkill`/`close`
- **Persistent Sessions** - Cookies saved across navigations, login once and stay authenticated
- **Full Dev Tools** - Console logs, network requests, cookies, localStorage, sessionStorage
- **JavaScript Execution** - Run arbitrary JS in page context
- **Video Streaming** - Real-time WebSocket streaming for visual monitoring
- **Network Mocking** - Intercept and mock API responses
- **Zero Config** - Works out of the box

## Easy install / Easy update (Windows, Linux, macOS)

**Windows (PowerShell):**

```powershell
# install / first-time setup
powershell -ExecutionPolicy Bypass -File .\install.ps1
# update (git pull -> rebuild -> redeploy)
powershell -ExecutionPolicy Bypass -File .\update.ps1
# or: powershell -ExecutionPolicy Bypass -File .\install.ps1 -Update
```

**Linux / macOS (bash) — works in terminal-only (headless) and GUI desktops:**

```bash
# install / first-time setup
bash install.sh
# update (git pull -> rebuild -> redeploy)
bash update.sh            # or: bash install.sh --update
```

Then **restart opencode** — plugins load at startup.

What the scripts do (identical on both platforms):
1. `git pull --ff-only` (only with `-Update` / `--update`)
2. `npm install` if `node_modules` is missing
3. builds `dist/index.js` (esbuild via npx) + `dist/index.d.ts` (tsc)
4. sanity-checks the bundle (no `pkill` guidance, has the new policy)
5. copies `dist` to all installed plugin locations (`.config` + `.cache`)
6. points the global `opencode.json` at the local build via a `file:///` URL
7. strips the UTF-8 BOM from `~/.agent-browser/config.json`

Rollback: set `"plugin": ["opencode-browser-agent"]` back in
`~/.config/opencode/opencode.json` — the deployed npm copies are updated too.

### Linux VPS (headless, no desktop)

Everything works on a plain Linux VPS — opencode, the plugin, and
agent-browser. Setup once:

```bash
npm i -g agent-browser
agent-browser install --with-deps    # Chrome + system libraries (sudo may be needed)
agent-browser doctor                 # verify install before running tasks
bash install.sh                      # plugin: build + deploy + wire config
```

Notes for a GUI-less box:
- Run headless (default). A desktop `~/.agent-browser/config.json` that sets
  `"headed": true` / `"autoConnect": true` will fail here — override with
  `agent-browser --headed false --auto-connect false open <url>`, or set both
  to `false` in that config file.
- There is no GUI Chrome to attach to, so `--auto-connect` is pointless there;
  start a fresh browser instead.
- Login without a desktop: ask the user to export their cookies from their own
  browser and use `agent-browser cookies set --curl cookies.txt`, or restore a
  saved `agent-browser state load auth.json`, or keep state with
  `agent-browser --session-name app open <url>`.
- Screenshots, PDF and video recording all work headless.
- Root/container: `agent-browser open --args "--no-sandbox" <url>`.

## Manual installation

### 1. Install agent-browser CLI

```bash
npm install -g agent-browser
agent-browser install  # Download Chromium
```

### 2. Install this plugin

Either run `install.ps1` (recommended), or add the built plugin to your
`opencode.json`:

```json
{
  "plugin": ["file:///abs/path/to/opencode-browser-agent/dist/index.js"]
}
```

(the deployed package name `"opencode-browser-agent"` also works)

## Usage Examples

### Basic Navigation
```
"Go to amazon.it and accept the cookies"
"Navigate to github.com and take a screenshot"
```

### Web Scraping
```
"Scrape product prices from this Amazon search page"
"Get all the links from the homepage"
"Extract the main article text from this news page"
```

### Form Automation
```
"Fill the login form with username 'test' and password 'test123'"
"Submit the contact form with my details"
"Search for 'laptop' on Amazon"
```

### Debugging & Development
```
"Check the browser console for JavaScript errors"
"Show me all network requests to the API"
"What cookies does this site set?"
"Get the localStorage data"
```

### Testing
```
"Test if the checkout flow works correctly"
"Verify the login redirects to dashboard"
"Check if the form validation shows error messages"
```

## How It Works

### Architecture

```
OpenCode                    Plugin                      agent-browser
   |                          |                              |
   |-- loads plugin --------->|                              |
   |                          |-- injects skill awareness -->|
   |                          |                              |
   |-- "go to amazon" ------->|                              |
   |                          |-- load_agent_browser_skill ->|
   |                          |                              |
   |                          |<-- skill instructions -------|
   |                          |                              |
   |                          |-- bash: agent-browser ------>|
   |                          |                              |
   |<-- page opened ----------|<-- success -----------------|
```

### Plugin Components

1. **Skill Injection** - Adds `<available-skills>` to system prompt so the AI knows when to use browser automation

2. **Tool Registration** - Registers `load_agent_browser_skill` tool that injects detailed instructions into the conversation

3. **Skill Template** - Comprehensive documentation for agent-browser CLI including:
   - Opening browser with correct viewport
   - Cookie banner handling
   - Element interaction via @refs
   - Dev tools access
   - Troubleshooting

## Quick Reference

### Open Browser (reuse the user's Chrome, never kill the daemon)
```bash
agent-browser --auto-connect open <url>    # reuse already-running Chrome (keeps logins)
agent-browser tab new --label work <url>   # work in a NEW tab; leave user tabs alone
agent-browser set viewport 1920 1080
# NEVER pkill -f agent-browser, NEVER close a session you didn't create.
```

### Handle Cookie Banner
```bash
agent-browser snapshot -i              # Check for cookie banner
agent-browser click @eX                # Click "Accept" button
```

### Interact with Elements
```bash
agent-browser snapshot -i              # Get interactive elements with @refs
agent-browser click @e1                # Click element
agent-browser fill @e2 "text"          # Fill input field
agent-browser press Enter              # Press key
agent-browser select @e1 "value"       # Select dropdown option
agent-browser scroll down 500          # Scroll page
```

### Screenshots
```bash
agent-browser screenshot ./screenshot.png        # Viewport
agent-browser screenshot ./screenshot.png --full # Full page
```

### Dev Tools (ALWAYS use --json!)
```bash
agent-browser console --json           # Console logs
agent-browser errors --json            # Page errors only
agent-browser cookies get --json       # Get all cookies
agent-browser storage local --json     # Get localStorage
agent-browser storage session --json   # Get sessionStorage
agent-browser eval "document.title"    # Execute JavaScript
```

### Network
```bash
agent-browser network requests --json              # View requests
agent-browser network route "*/api/*" --abort      # Block requests
agent-browser network route "*/api/*" --body '{}'  # Mock response
```

### Video Streaming
```bash
AGENT_BROWSER_STREAM_PORT=9223 agent-browser open <url> --headed
# Connect via WebSocket at ws://localhost:9223
```

## Customization

### Modify the Plugin

Clone and customize:

```bash
git clone https://github.com/BTF-Kabir-2020/opencode-browser-agent.git
cd opencode-browser-agent
```

Edit `index.ts` to customize:

#### Change Default Viewport
```typescript
// Find this line in skillTemplate:
agent-browser set viewport 1920 1080

// Change to your preferred size:
agent-browser set viewport 1440 900
```

#### Add Custom Headers
```typescript
// Add to the open command:
agent-browser open <url> --headed --headers '{"Accept-Language": "en-US"}'
```

#### Modify Cookie Banner Behavior
```typescript
// In the RULES section, change:
2. **Cookie banner**: ALWAYS dismiss cookie banners...

// To:
2. **Cookie banner**: ASK user before dismissing...
```

### Build and Use Locally

```bash
npm install
npm run build

# In opencode.json, point at the built bundle (absolute file URL):
{
  "plugin": ["file:///abs/path/to/opencode-browser-agent/dist/index.js"]
}
```

The `install.ps1` / `install.sh` scripts do exactly this for you and also
refresh the npm-installed copies.

## Troubleshooting

### "Browser not launched" Error
```bash
agent-browser doctor                          # diagnose first (env, Chrome, daemons)
agent-browser --auto-connect open <url>       # reuse the user's running Chrome
# Headless Linux / container / root shell:
agent-browser install --with-deps             # Chrome + system libraries
agent-browser open --args "--no-sandbox" <url>
# NEVER pkill -f agent-browser; never close a session you didn't create.
```

### Browser Window Not Visible
```bash
# GUI desktop (Windows/macOS/Linux X11 or Wayland):
agent-browser open <url> --headed   # show the window

# Headless box (SSH, CI, container, Linux terminal): leave it headless -
# that is the default, screenshots still work. --headed fails with no
# $DISPLAY/Wayland session.
```

### Console/Cookies Show Empty
```bash
# Always use --json flag for dev tools:
agent-browser console --json       # Correct
agent-browser console              # Wrong - may show empty
```

### Cookie Banner Not Detected
```bash
# Run snapshot to see all interactive elements:
agent-browser snapshot -i

# Look for buttons with text like "Accept", "Accetta", "OK", "Agree"
# Then click the correct @ref
```

### Session Lost / Need to Re-login
```bash
# DON'T run 'agent-browser close' - it deletes all cookies!
# Instead, just navigate to new URLs (keeps cookies), or use:
agent-browser --auto-connect open <new-url>   # reuse running Chrome
```

### Element Not Found
```bash
# Always re-snapshot after navigation or page changes:
agent-browser open <url>
agent-browser snapshot -i         # Get fresh @refs
agent-browser click @e1           # Use new refs
```

## Attaching to your Chrome (CDP)

Chrome only exposes CDP if it was launched with `--remote-debugging-port=9222`,
and that port belongs to **one** browser process - each Chrome profile is its
own process, so the port identifies the profile too.

```bash
# preferred: reuse the running Chrome
agent-browser --auto-connect open <url>

# fallback: attach by explicit port
agent-browser --auto-connect false --cdp 9222 open <url>
agent-browser --session work --auto-connect false --cdp 9222 get url
```

Known gotchas:

- If `~/.agent-browser/config.json` sets `"autoConnect": true`, every `--cdp`
  call fails with `Cannot use --auto-connect and --cdp together`. Pair it with
  `--auto-connect false` (or use `--config <clean file>`).
- Recent Chrome can answer `GET /json/version` with 404/empty while CDP works
  fine - never diagnose attachment with `/json*`, use `--cdp <port>`.
- `chrome://inspect` -> *Target discovery settings* / *Enable port forwarding*
  does **not** open a debugging port on the local Chrome.
- A stale `DevToolsActivePort` makes `--auto-connect` hang, then fail with
  `Failed to read: ... (os error 10060)`. Check the port is really listening.
- A wedged session daemon (`~/.agent-browser/<session>.pid|.port` exist and the
  port listens, yet every call hangs with `10060`): approve the pending
  confirmation (`agent-browser confirm <id>`), work in a fresh
  `--session <name>`, and never `pkill` Chrome or the daemon.

Read-only diagnostics:

```powershell
# Windows
Get-NetTCPConnection -LocalPort 9222 -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'remote-debugging-port' }
Get-Content "$env:USERPROFILE\.agent-browser\default.port"
```

```bash
# Linux
ss -ltnp | grep 9222
ps aux | grep -- '--remote-debugging-port'
cat ~/.agent-browser/default.port
```

If no Chrome has the flag, ask the user to relaunch the profile they want:

```powershell
# closes nothing by itself - the user quits Chrome first, logins are kept
chrome.exe --remote-debugging-port=9222 --profile-directory="Profile 3"
```

## Auto-Trigger Prompts

The plugin automatically suggests loading the skill when your prompt contains:

| Category | Trigger Words |
|----------|---------------|
| Screenshots | screenshot, capture, snapshot |
| Scraping | scrape, extract, get data from |
| Navigation | go to, navigate, open website, browse |
| Forms | fill form, submit, login, signup |
| Testing | test website, verify, check page |
| Debugging | console log, network request, cookies |

### Examples That Auto-Trigger
- "Take a screenshot of google.com"
- "Scrape the prices from Amazon"
- "Fill the contact form on the website"
- "Check if there are any JavaScript errors"
- "Navigate to the login page and sign in"

## Requirements

- **OpenCode** >= 1.0.0
- **agent-browser** CLI installed globally (`npm i -g agent-browser`,
  or `brew install agent-browser`, or `cargo install agent-browser`)
- **Chromium** (installed via `agent-browser install`; on Linux add
  `agent-browser install --with-deps` for system libraries)
- **Fully supported platforms**: Windows (PowerShell 5.1+), Linux server /
  terminal (headless), Linux GUI desktop (X11 / Wayland), macOS

## Development

```bash
# Clone
git clone https://github.com/BTF-Kabir-2020/opencode-browser-agent.git
cd opencode-browser-agent

# Install dependencies (npm - works on Windows, Linux, macOS)
npm install

# Build (esbuild + tsc - identical on every platform)
npm run build
# equivalent one-shot: bash install.sh  /  powershell -File install.ps1

# The build creates:
# - dist/index.js (bundled plugin)
# - dist/index.d.ts (TypeScript types)
```

### Project Structure
```
opencode-browser-agent/
├── index.ts          # Main plugin code with skill template (single source)
├── package.json      # npm package config (build = esbuild + tsc)
├── tsconfig.json     # TypeScript config
├── install.ps1       # Easy install/update - Windows
├── install.sh        # Easy install/update - Linux/macOS
├── update.ps1        # Windows update wrapper
├── update.sh         # Linux/macOS update wrapper
├── dist/             # Built output (gitignored; created by the scripts)
│   ├── index.js
│   └── index.d.ts
└── README.md
```

## Contributing

This is an independent project (not upstream's tracker):

1. Clone `https://github.com/BTF-Kabir-2020/opencode-browser-agent.git`
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request on **BTF-Kabir-2020/opencode-browser-agent**

## License

MIT - see [LICENSE](LICENSE).

Copyright (c) 2026 Pouya Ghourchiani (BTF Kabir).

## Credits

- [agent-browser](https://github.com/vercel-labs/agent-browser) by Vercel Labs
- [OpenCode](https://opencode.ai) plugin system
