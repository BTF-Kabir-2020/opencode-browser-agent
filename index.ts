import type { Plugin } from "@opencode-ai/plugin"
import { tool } from "@opencode-ai/plugin"

const SKILL_NAME = "agent-browser"

const skillDescription =
  "Browser automation via agent-browser. Use ONLY when the task needs a rendered page, JS, a real login, or visual/UX checks; prefer gh/git/curl/APIs first. Reuse the user's Chrome via --auto-connect in a new tab; never pkill or close sessions. Load the skill before running any agent-browser command."

const skillTemplate = `# Browser Automation with agent-browser

## 0. Do you even need a browser?

Prefer non-browser tools first: gh, git, curl, Invoke-RestMethod, project
CLIs, public APIs, reading local files. Open a browser only when the task
genuinely needs a rendered page, JavaScript, a real login/session, a
visual/UX check, or a page with no API. If unsure, ask.

## 1. Attach rules (POLICY - never violate)

- Reuse the user's already-running Chrome (keeps login state):
  agent-browser --auto-connect open <url>
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
`

export const OpenCodeAgentBrowser: Plugin = async (ctx) => {
  return {
    tool: {
      load_agent_browser_skill: tool({
        description: `Load the agent-browser skill for browser automation. Use when tasks involve: screenshots, web scraping, form automation, browser navigation, visual testing, or webpage interaction. Trigger phrases: screenshot, scrape, browser, webpage, navigate, fill form, test website.`,
        args: {},
        async execute(args, toolCtx) {
          await ctx.client.session.prompt({
            path: { id: toolCtx.sessionID },
            body: {
              noReply: true,
              parts: [
                {
                  type: "text",
                  text: `# Skill Loaded: ${SKILL_NAME}\n\n${skillTemplate}`,
                },
              ],
            },
          })
          return `Skill "${SKILL_NAME}" loaded. Use bash to execute agent-browser commands. Run "agent-browser skills get core --full" for the complete reference.`
        },
      }),
    },

    "experimental.chat.system.transform": async (input, output) => {
      output.system.push(`
<available-skills>
## agent-browser
${skillDescription}
To use: Call the \`load_agent_browser_skill\` tool, then use bash to execute agent-browser commands.
</available-skills>
`)
    },
  }
}

export default OpenCodeAgentBrowser
