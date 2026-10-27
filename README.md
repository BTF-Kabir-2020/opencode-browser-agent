# opencode-browser-agent

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/opencode-browser-agent.svg)](https://www.npmjs.com/package/opencode-browser-agent)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-blue)](#easy-install--easy-update-windows-linux-macos)
[![agent-browser](https://img.shields.io/badge/agent--browser-0.27%2B-informational)](https://github.com/vercel-labs/agent-browser)
[![OpenCode](https://img.shields.io/badge/OpenCode-Plugin%202.x-brightgreen?style=flat-square)](https://opencode.ai)
[![CI](https://github.com/BTF-Kabir-2020/opencode-browser-agent/actions/workflows/ci.yml/badge.svg)](https://github.com/BTF-Kabir-2020/opencode-browser-agent/actions/workflows/ci.yml)

OpenCode plugin for [agent-browser](https://github.com/vercel-labs/agent-browser) - browser automation for AI agents with persistent sessions, dev tools, cross-platform installers (Windows / Linux desktop / Linux VPS-headless) and a rewritten, policy-first skill.

Maintained by **Pouya Ghourchiani (BTF Kabir)**.

## Why this plugin?

- **Uses your real browser, not a throwaway one.** It attaches to your already-running Chrome with `--auto-connect` — your logins and tabs stay, and the skill forbids killing or closing your browser.
- **Policy-first.** A rewritten skill constrains how the agent drives the browser (no `pkill`, no hijacking unrelated tabs, privacy-respecting defaults), rather than leaving the model to improvise.
- **One-command install everywhere.** Windows PowerShell, Linux desktop, and headless VPS, with a matching one-command update path.
- **Optional, opt-in Obscura engine.** A lightweight local CDP backend you can switch on deliberately (Chrome stays the default); see [`docs/obscura.md`](docs/obscura.md).

## Demo

```bash
# Start from your already-running Chrome (your logins intact, no new profile)
agent-browser --auto-connect open https://example.com
agent-browser screenshot page.png

# Or let the opt-in Obscura backend manage a local CDP engine instead
# (tool: obscura_backend, actions: start / attach / status / doctor / stop)
```

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
- **Optional Obscura backend** - opt-in, never-automatic local CDP engine (Chrome stays default); see [`docs/obscura.md`](docs/obscura.md)
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

Rollback: set `"plugins": ["opencode-browser-agent"]` back in
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
# Tip: pin the agent-browser version you tested and re-audit the skill on upgrade.
```

### 2. Install this plugin

**From npm** (easiest) — add it by name; opencode fetches and loads it:

```json
{
  "plugins": ["opencode-browser-agent"]
}
```

**From a local build** (for development) — either run `install.ps1`
(recommended), or point `opencode.json` at the built file:

```json
{
  "plugins": ["file:///abs/path/to/opencode-browser-agent/dist/index.js"]
}
```

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

4. **Opt-in Obscura backend** - Registers the experimental `obscura_backend` tool
   (start/attach/status/doctor/stop). Chrome stays the default; nothing runs
   unless explicitly started. See [`docs/obscura.md`](docs/obscura.md).

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

Edit `src/skill.ts` (the skill template) or `index.ts` (the plugin entry/tools) to customize:

#### Change Default Viewport
```typescript
// Find this line in src/skill.ts:
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
  "plugins": ["file:///abs/path/to/opencode-browser-agent/dist/index.js"]
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

### Browser identity (before you act)

`--auto-connect` only tells you that *a* Chrome answered, not *which* profile,
account, or tabs you now control. Before any login/account-dependent action:

```bash
agent-browser tab                                          # list tab ids/labels
agent-browser get url
agent-browser get title
agent-browser get cdp-url
```

Use process/port evidence as read-only confirmation:

```powershell
# Windows
Get-NetTCPConnection -LocalPort 9222 -State Listen |
  Select-Object LocalAddress,LocalPort,OwningProcess
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
  Where-Object { $_.CommandLine -match 'remote-debugging-port' } |
  ForEach-Object { $_.ProcessId, $_.CommandLine }
```

```bash
# Linux
ss -ltnp | grep 9222
ps -ww -o pid,args -C chrome | grep -- '--remote-debugging-port'
```

Rules:
- Do not identify the browser from the profile label alone; compare tab URL, visible
  account context, PID/port, and `--profile-directory`/user-data-dir evidence.
- State the identity evidence in your report (port, PID, tabs, visible account).
- If anything disagrees, stop and ask which Chrome/profile/account to use.
- Never read or report credentials, cookies, tokens, 2FA, or unrelated tabs.
- Never navigate/close/focus the user's existing tabs just to identify them.

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

## Experimental opt-in: Obscura backend

Chrome is the default and is behaviourally unchanged. The plugin can **optionally**
launch a local [Obscura](https://github.com/h4ckf0r0day/obscura) CDP engine and
attach `agent-browser` to it via the generic `--cdp <port>` path. It is
**opt-in, per-run, and never starts automatically**.

```text
# start a local engine on an explicit port (requires OBSCURA_BIN or obscura on PATH)
obscura_backend { "action": "start", "port": 9600 }
# then use the returned args:
agent-browser --session obscura-work --auto-connect false --cdp 9600 open https://example.com
# inspect / clean up owned runs only:
obscura_backend { "action": "status" }
obscura_backend { "action": "stop" }
```

Safety is enforced: binds **`127.0.0.1`** only, always an **explicit port** from
the pool `9600–9699` (reserved ports refused), **never** `--allow-file-access`,
and fixture mode (`--allow-private-network`) is **off by default** and only
allowed with explicit loopback-only targets. Cleanup terminates a process only
after positively verifying ownership.

It is **not** a Chrome replacement and makes no speed/parity claim; `iframe
srcdoc` content is a confirmed limitation (Obscura 0.2.4). Full details, security
posture, the measured compatibility matrix, and rollback:
**[`docs/obscura.md`](docs/obscura.md)**.

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

- **OpenCode** >= 2.0.0
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
├── index.ts          # Plugin entry: tools + skill loader (thin)
├── src/
│   ├── skill.ts      # Skill template/description (single source)
│   └── obscura/      # Opt-in Obscura backend (launcher, manager, runtime)
├── test/
│   ├── obscura.test.ts   # Unit tests (24)
│   └── obscura.e2e.ts    # Real-binary E2E smoke test
├── docs/
│   └── obscura.md    # Opt-in backend: usage, security, matrix, rollback
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

Derived from [opencode-agent-browser](https://github.com/crottolo/opencode-agent-browser)
(MIT, Copyright (c) Nicola Crotti); see [NOTICE](NOTICE) for the upstream license text.

## Credits

- [opencode-agent-browser](https://github.com/crottolo/opencode-agent-browser) by Nicola Crotti - the project this plugin is derived from (MIT)
- [agent-browser](https://github.com/vercel-labs/agent-browser) by Vercel Labs
- [OpenCode](https://opencode.ai) plugin system
