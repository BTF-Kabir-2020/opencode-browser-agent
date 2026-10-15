// Skill content (prompt/documentation) for the agent-browser plugin.
// Split out of index.ts so the entry point stays wiring-only.

export const SKILL_NAME = "agent-browser"

export const skillDescription =
  "Browser automation via agent-browser. Use ONLY when the task needs a rendered page, JS, a real login, or visual/UX checks; prefer gh/git/curl/APIs first. Reuse the user's Chrome via --auto-connect in a new tab; never pkill or close sessions. Load the skill before running any agent-browser command."

export const skillTemplate = `# Browser Automation with agent-browser

## 0. Do you even need a browser?

Prefer non-browser tools first: gh, git, curl, Invoke-RestMethod, project
CLIs, public APIs, reading local files. Open a browser only when the task
genuinely needs a rendered page, JavaScript, a real login/session, a
visual/UX check, or a page with no API. If unsure, ask.

## 1. Attach rules (POLICY - never violate)

- Reuse the user's already-running Chrome (keeps login state):
  agent-browser --auto-connect open <url>
- If auto-connect hangs or fails, attach by explicit port instead:
  agent-browser --auto-connect false --cdp <port> open <url>
  (see section 4e - the debug port belongs to exactly ONE Chrome profile)
- Work in a NEW tab: agent-browser tab new --label work <url>
- Never navigate, screenshot, or close the user's existing tabs.
- NEVER run "pkill -f agent-browser" and never "agent-browser close" a
  session you did not create (both destroy cookies/login).
- The window needs no focus; do not raise or activate it.
- Treat existing tabs, cookies, history, and page text as private. Stay on
  the target URL; do not wander.
- If auto-connect finds no browser, access is denied, or behavior is
  ambiguous: STOP and ask the user (attach to your Chrome? launch fresh?).
  Do not silently switch strategies.
- End your report stating which mode you used: (a) user's Chrome via
  --auto-connect, (b) fresh browser, (c) no browser used.

## 1a. Identify the browser you are attached to before acting (read-only)

\`--auto-connect\` only tells you *a* Chrome answered on a debugging port. It does
not tell you *which* profile, account, or tabs you now control. Verify first; never
guess from the session name or from a directory label alone.

Attach verification, in order:

1. Tabs and active frame:
   - \`agent-browser --session <name> tab\`                # list ALL tabs, ids/labels
   - \`agent-browser --session <name> get url\`
   - \`agent-browser --session <name> get title\`
   - \`agent-browser --session <name> get cdp-url\`
2. Visible identity (snapshot only your NEW working tab, never the user's tabs):
   - page heading/account name, profile avatar text, signed-in company/workspace
   - repository/project name, active environment, admin vs viewer indicators.
3. Chrome process evidence (read only):
   - Windows: \`Get-NetTCPConnection -LocalPort <port> -State Listen |
               Select-Object LocalAddress,LocalPort,OwningProcess\`
     \`Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
       Where-Object { $_.CommandLine -match 'remote-debugging-port' } |
       ForEach-Object { $_.ProcessId, $_.CommandLine }\`
   - Linux: \`ss -ltnp | grep <port>\` and \`ps -ww -o pid,args -C chrome |
             grep -- '--remote-debugging-port'\`
   - Look for \`--profile-directory="Profile 9"\` or \`--user-data-dir=...\`.
4. CDP endpoint evidence (debugging port and profile evidence only):
   - \`agent-browser --session <name> get cdp-url\`, plus \`DevToolsActivePort\`.
   - Recent Chrome may answer \`GET /json/version\` with 404; that is not failure.

Rules for identity:
- A process/window/port, not the profile label, decides credentials.
- A profile directory label can be stale, misleading, or mounted elsewhere.
- Do not claim "this is Profile X / account Y" from one clue. State which evidence
  you used and stop if anything disagrees.
- Never read/export cookies, localStorage, session tokens, passwords, 2FA seeds,
  bookmarks, or unrelated tabs/history.
- Never inspect private user tabs/screenshots beyond the target task.
- Do not navigate, close, or focus the user's existing tabs to identify them.
- If the detected account/profile does not match the task, stop and ask which
  Chrome/profile/account to use.
- If no process has \`--remote-debugging-port\`, say so and offer choices; do not
  silently launch another profile.
- If the port is shared/unknown, use an explicit session:
  \`agent-browser --session audit-<name> --auto-connect false --cdp <port> get url\`

Store identity only as a short boundary list ("attached via: port 9222, PID ...,
user-data-dir ..., tab tX, visible account: ..."). Do not store credentials or
cookie values. If identity changes after navigation, re-detect it.

Every attach report must state the mode used: (a) user's Chrome via
--auto-connect, (b) explicit \`--cdp\` port, (c) fresh browser, with the identity
evidence above.

## 2. Core loop

agent-browser open <url>              # first navigation (keeps cookies)
agent-browser snapshot -i             # interactive elements -> @refs
agent-browser click '@e3'             # act on refs (always quote them)
agent-browser snapshot -i             # refs die on EVERY page change

Waits beat sleeps. After any page-changing action pick ONE:
  agent-browser wait @e1              # element appears
  agent-browser wait --text "Saved"
  agent-browser wait --url "**/settings"
  agent-browser wait --load networkidle
Bare "wait 2000" is a last resort (debugging only). Timeout defaults to 25s.

## 3. Verify before claiming success (3 layers)

A clicked button is NOT a saved change. Confirm:
1. WIRE:  agent-browser network requests --json   -> the POST/PUT returned ok
2. READ:  agent-browser get value '@e1' / get text / snapshot shows the NEW
          persisted value (round-trip, not the value you typed)
3. SEE:   agent-browser screenshot .agent-screenshots/<desc>.png
Layers 1+2 are mandatory; add 3 when visuals matter. If any layer disagrees,
report the exact mismatch instead of declaring success.

## 4. Platform notes (Windows AND Linux terminal AND Linux GUI)

### 4a. Windows PowerShell (this machine runs PS 5.1)
- Always quote refs:  agent-browser click '@e1'
  (bare @e1 is parsed as a PowerShell splat and breaks the command)
- No "&&" in PS 5.1: use  cmd1; if ($?) { cmd2 }
- Quote paths containing spaces:  Get-Item "C:\\my folder\\x.png"
- Multi-line or quote-heavy JS: write a temp file, then
  Get-Content $env:TEMP\\s.js -Raw | agent-browser eval --stdin
  (or agent-browser eval -b <base64>). Never inline complex JS.
- Disk/file preflight:  Test-Path 'C:\\path\\file.png' ; Get-PSDrive C

### 4b. Linux / macOS (bash, terminal)
- Quoting refs is harmless and portable:  agent-browser click '@e1'
- "&&" chaining works:  agent-browser open <url> && agent-browser snapshot -i
- Multi-line JS:  agent-browser eval --stdin < /tmp/s.js   (or eval -b <base64>)
- Disk/file preflight:  test -f /path/file.png ; df -h /path
- First-time browser setup on a Linux box:
  agent-browser install --with-deps     # Chrome + system libraries
  agent-browser doctor                  # then verify

### 4c. Headless server vs GUI desktop (any OS)
- NO display (SSH box, CI, container, Linux terminal): run WITHOUT --headed -
  headless is the default and screenshots still work. --headed fails when
  there is no $DISPLAY/Wayland session.
- GUI desktop (Linux/X11/Wayland, Windows, macOS): --headed shows the window,
  but still never focus it and never touch the user's own tabs.
- Reusing the user's Chrome via --auto-connect only applies where a GUI Chrome
  is running; ~/.agent-browser/config.json may already set autoConnect/headed
  defaults (project ./agent-browser.json overrides, then env, then flags).
- Chrome refuses to launch in containers/root:
  agent-browser open --args "--no-sandbox" <url>
- Missing system libraries on Linux: agent-browser install --with-deps
- When anything fails: agent-browser doctor   # before any guessing

### 4d. Linux VPS (headless box, no desktop)
- Setup once on the server:
  agent-browser install --with-deps    # Chrome + system libs (may need sudo)
  agent-browser doctor                 # verify before blaming the task
- A desktop config copied to the VPS can force headed/auto-connect and then
  every open fails. Override per command:
  agent-browser --headed false --auto-connect false open <url>
  or write ~/.agent-browser/config.json = {"headed": false, "autoConnect": false}
- There is no GUI Chrome to attach to, so start the browser fresh
  (plain "agent-browser open <url>"); do NOT wait on --auto-connect.
- Logging in without a desktop:
  * prefer asking the user to export cookies from their own browser and
    "agent-browser cookies set --curl cookies.txt", or
  * import a saved state: agent-browser state load auth.json, or
  * keep state across commands/runs: agent-browser --session-name app open <url>
- Screenshots, PDF and video recording all work fully headless.
- Root/container shells: add:  agent-browser open --args "--no-sandbox" <url>".
- Same policy as everywhere: never --headed here, never pkill, never close.

### 4e. Attaching to the user's real Chrome over CDP (any OS)

Chrome only exposes CDP if it was started with --remote-debugging-port=9222.
That port belongs to ONE browser process, and each Chrome profile runs as its
own process - so the port identifies the profile too.

Attach by port when --auto-connect is unreliable:
  agent-browser --auto-connect false --cdp 9222 open <url>
  agent-browser --session work --auto-connect false --cdp 9222 get url

PowerShell (Windows) must use the call operator -- the -- in front of flags
otherwise errors in an expression. Launch example:
  & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 9"
Linux/macOS example:
  "chrome" --remote-debugging-port=9222 --profile-directory="Profile 9"

Gotchas that cost real time (do not rediscover them):
- If ~/.agent-browser/config.json has "autoConnect": true, then any --cdp call
  dies with "Cannot use --auto-connect and --cdp together". Always pair
  --cdp with --auto-connect false (or use --config <clean file>).
- Recent Chrome can answer HTTP GET /json/version with 404 / empty body while
  CDP itself works perfectly. Never diagnose attachment via /json*; use
  --cdp <port> or the DevToolsActivePort file.
- chrome://inspect -> "Remote debugging": "Allow remote debugging" can start a
  localhost:9222 server for this Chrome instance after the user clicks Allow.
  Leave that tab/page open while connecting. This is often enough for read-only
  CDP attach, but some builds still time out or refuse the handshake.
- Even after Allow is granted, \`--auto-connect\` / \`--cdp\` may time out or see an
  empty /json/version response. If that happens, do NOT launch another Chrome:
  ask/restart with an explicit port (see below) and verify through DevToolsActivePort.
- Real \`chrome://inspect#remote-debugging\` is not the same as Chrome's normal
  tab discovery. Never change the user's tabs, cookies, or permissions.
- \`--profile\` (agent-browser) selects an automation Chrome using that profile's
  data; it does not attach to an already-running visible Chrome unless that
  browser is also debuggable via a real --remote-debugging-port.
- \`--profile "Profile X"\` is an automation launch/reuse path. It is not proof
  that you are attached to the user's currently visible Chrome windows.
- Although the Allow dialog can open a temporary localhost:9222 listener, it
  has behaved inconsistently during real use. If agent-browser times out, treat
  the page as non-debuggable until a fresh port succeeds.
- A stale DevToolsActivePort file makes --auto-connect hang and then fail with
  "Failed to read: ... (os error 10060)". Verify the port is really listening.
- A wedged session daemon looks like: <session>.pid/.port exist in
  ~/.agent-browser, the port is listening, yet every CLI call hangs or returns
  the same 10060. A pending confirmation prompt can block it - approving
  (agent-browser confirm <id>) releases it, and a fresh
  "--session <name>" keeps you working meanwhile.
- The active page is often about:blank, not the tab the user is looking at.
  Work in a NEW tab; never navigate, screenshot or close their tabs.

Read-only diagnostics - Windows PowerShell:
  Get-NetTCPConnection -LocalPort 9222 -State Listen |
    Select-Object LocalAddress,LocalPort,OwningProcess
  Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" |
    Where-Object { $_.CommandLine -match 'remote-debugging-port' }
  Get-Content "$env:USERPROFILE\\.agent-browser\\default.port"

Read-only diagnostics - Linux:
  ss -ltnp | grep 9222
  ps aux | grep -- '--remote-debugging-port'
  cat ~/.agent-browser/default.port

When the port is missing, offer the user a choice (never fix it yourself):
- (a) close Chrome carefully or relaunch the profile they want with the call:
    Windows PowerShell:
      & "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --profile-directory="Profile 9"
    Linux/macOS:
      google-chrome --remote-debugging-port=9222 --profile-directory="Profile 9"
    (works even for profiles of the same existing user; keeps logins)
- (b) a dedicated automation profile logged into once.
- (c) if the port exists but handshake times out: leave diagnostics untouched and
    retry once after confirming DevToolsActivePort; do not attempt to revoke or
    silently re-open Chrome.
- If \`chrome://inspect/#remote-debugging\` opened a temporary localhost:9222
  port but agent-browser reports timed out, tell the user that permission was
  granted but CDP still is not stable, and offer the explicit launch command.
- NEVER pkill chrome or agent-browser, and never close a session you did not
  create - that destroys their logins and open work.


### 4f. Optional Obscura backend (OPT-IN, never automatic)

Chrome stays the default. Obscura is an EXPERIMENTAL, explicitly opt-in backend
for lightweight, public-page work. It is NEVER started by plugin startup and
NEVER replaces Chrome unless you ask for it.

When to consider it: you want a small headless engine for public pages and you
do not need a real login/session. Known limitation: iframe content does NOT work
(contentDocument is empty) - do not use Obscura when a task depends on frames.

Two backends, selected explicitly:
- chrome (default):  agent-browser open <url>            # unchanged
- obscura (opt-in):  driver = the local Obscura CDP server

Use the \`obscura_backend\` tool (it manages the local engine for you):
- \`obscura_backend start\`   -> allocates a loopback port, launches obscura
                                serve, waits until ready. Returns the port.
- \`obscura_backend attach\`  -> prints the exact attach command.
- \`obscura_backend status\`  -> lists running runs and whether they are owned.
- \`obscura_backend stop\`    -> stops ONLY runs this tool started.

Then drive it exactly like the Chrome attach path (section 4e):
  agent-browser --session obscura-work --auto-connect false --cdp <port> open <url>
  agent-browser --session obscura-work --auto-connect false --cdp <port> snapshot -i

Rules for the Obscura backend (do not circumvent):
- Loopback only. The engine binds 127.0.0.1 and always uses an explicit port.
- Never enable private-network access. The \`--allow-private-network\` flag is
  OFF unless you pass fixtureMode with loopback-only targets, and even then it
  is an all-or-nothing SSRF widening.
- SECURITY / residual risk (stated honestly): this tool CANNOT technically
  enforce which URLs the engine is later told to visit. Once the engine is up,
  a subsequent \`agent-browser ... open <url>\` can point it anywhere the engine
  can reach. Do NOT describe any URL restriction here as an enforced allowlist.
  Fixture mode is therefore OFF by default and must stay a deliberate choice.
- Stop what you started: \`obscura_backend stop\`. It verifies ownership (pid +
  process name + port + ready-file) before terminating anything, and never
  kills by process name or port and never closes unrelated sessions.

## 5. Unicode round-trip test (Persian / emoji)

Before submitting any text you cannot visually verify:

  agent-browser fill '@e1' "Persian text / emoji"
  agent-browser get value '@e1'        # must come back identical

If it differs (mojibake, dropped or reordered chars): do NOT submit. Retry
with "agent-browser keyboard inserttext" or focus + type, re-test. If still
wrong, stop and report to the user.

## 6. Settings / upload playbook (X, LinkedIn, dashboards)

1. Snapshot; locate the file input. Preflight the file first:
   Windows:   Test-Path 'C:\\path\\image.png' ; Get-PSDrive C
   Linux:     test -f /path/image.png ; df -h /path
   (check free space BEFORE generating/copying large files)
2. agent-browser upload '@eN' 'C:\path\image.png'
3. Wait for the preview/thumbnail (wait --text or wait @ref), not a sleep.
4. Click Apply -> wait for its confirmation -> Click Save -> wait for
   confirmation/network idle.
5. Run section 3 (wire + read-back + screenshot).
6. API error like "ApiError ... HTTP-0 codes:[1004]": back off ~60s, retry
   once, then stop and ask (rate-limit / permission class error).

## 7. Anti-bot / Cloudflare challenge

Do not fight it or spam retries. Wait up to ~90s, screenshot the page, and
ask the user to complete it by hand; then re-check state. Always report the
exact error text - never invent or hide results.

## 8. When you cannot see (blind-agent rule)

You often cannot see images or files you generate. Never assume a generated
image/file looks right: offer options or ask the user to choose/confirm
(paste variants, screenshot them) instead of guessing.

## 9. Failures

First stop for anything weird:
  agent-browser doctor                 # env, Chrome, daemons, config, launch
- Chrome won't launch on Linux: agent-browser install --with-deps; if still
  failing in a container/root shell: agent-browser open --args "--no-sandbox" <url>
- every command hangs, or "Failed to read: ... (os error 10060)" -> wedged
  session daemon or stale DevToolsActivePort; see section 4e before touching it
- "Cannot use --auto-connect and --cdp together" -> the config file forces
  autoConnect; add --auto-connect false next to --cdp
- HTTP GET /json/version returns 404 / empty -> normal on recent Chrome;
  attach with --cdp <port> instead of HTTP discovery
- "ref not found" -> re-snapshot (refs go stale on every page change)
- element in DOM but not in snapshot -> scroll / wait, then re-snapshot
- overlay swallows the click -> dismiss it, re-snapshot, re-click
- fill does nothing -> focus @ref, or "keyboard inserttext"
- warning "invalid config file ... config.json: expected value" = UTF-8 BOM
  in that JSON file. Harmless but noisy; fix by re-saving without BOM.

## 10. Full reference (always available)

  agent-browser skills get core --full

That dumps the complete command set plus references/commands.md,
authentication.md (auth vault, state save/load), trust-boundaries.md,
session-management.md, snapshot-refs.md, proxy and profiling docs.
Use it for anything not covered here (tabs, frames, cookies, --profile,
recording, HAR, tracing, network routing).

## 11. Short rules

1. Decide first whether a browser is needed (section 0)
2. --auto-connect + new tab; never pkill, never close, never focus
3. snapshot before interact; re-snapshot after any change
4. wait for a signal, not a fixed sleep
5. verify with wire + read-back before reporting success
6. quote every @ref in PowerShell
7. screenshots to .agent-screenshots/<desc>.png
8. headless boxes (Linux terminal/CI/container): no --headed; GUI desktop only
9. same skill covers Windows PowerShell, Linux bash, Linux GUI and headless -
   pick the matching subsection in sections 4-6
10. attaching to a real Chrome: try --auto-connect first; if it hangs or the
   config forces autoConnect, use --auto-connect false --cdp <port> (section 4e);
   never kill Chrome or the agent-browser daemon, and tell the user which
   profile/account the port belongs to before acting for them
11. identify the attached Chrome before depending on login/account state -
   tabs + URL/title + process/port/user-data-dir evidence (section 1a);
   never infer identity from one clue
12. keep attach reports to read-only identity evidence; never handle
   credentials, cookies, tokens, 2FA, or unrelated tab content
`
