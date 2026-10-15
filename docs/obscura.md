# Experimental opt-in: Obscura backend

> **Status: experimental, opt-in, never automatic.** Chrome remains the default
> and is behaviourally unchanged. Nothing here runs unless you explicitly ask for
> it. Do not treat Obscura as a drop-in replacement for Chrome.

This document describes the optional [Obscura](https://github.com/h4ckf0r0day/obscura)
CDP backend and, honestly, what it does **not** do.

## What it is

Obscura is a lightweight local CDP engine. The plugin can launch it and attach
`agent-browser` to it through the **generic, already-verified `--cdp <port>`
path** — the same transport used to attach to a real Chrome over CDP. Choosing
Obscura is explicit and per-run; there is no configuration flag that silently
switches the default.

## How to use it

The `obscura_backend` tool has five actions: `start` · `attach` · `status` ·
`doctor` · `stop`.

```text
# 1) start a local engine on an explicit port (fixture mode stays OFF)
obscura_backend { "action": "start", "port": 9600 }

# 2) it returns the attach args; use them with agent-browser, e.g.:
agent-browser --session obscura-work --auto-connect false --cdp 9600 open https://example.com

# 3) inspect and clean up
obscura_backend { "action": "status" }
obscura_backend { "action": "stop" }          # stops owned runs only
```

Requirements:

- The `obscura` binary must be discoverable — set **`OBSCURA_BIN`** to the
  executable, or place `obscura(.exe)` on `PATH`. If it is missing, `start`
  returns a clear error and **Chrome is unaffected**.
- A **port is always explicit** (never a default), from the safe pool `9600–9699`.
  Reserved ports (`9222`, `8377`, `9333`, `9444`, `9555`, …) are refused so we can
  never collide with your Chrome or other tooling.

## Security posture

What is enforced:

- Binds **`127.0.0.1`** only.
- Always an **explicit port** from the pool; reserved ports refused.
- **Never** passes `--allow-file-access`.
- `--allow-private-network` is added **only** in explicit fixture mode **and only
  when every declared target is a loopback `http(s)` URL**; otherwise the start is
  refused.
- Stop/cleanup kills a process **only after positively verifying ownership**
  (`pid + name + port + ready-file + start time`, plus a live command-line match).
  It never kills by name or port, and never closes a session it did not create.

Honest residual risk:

- The plugin **cannot technically enforce which URLs the engine later visits.**
  Guidance in this repo is policy, **not** a hard allowlist.
- **Fixture mode** is a deliberate, opt-in widening of the network boundary
  (loopback only). It is **off by default** and never enabled implicitly.

## Compatibility (as measured against agent-browser 0.27.0, headless)

A 22-case matrix (Chrome-baseline gate first) was run. Final result:

- **19 / 22 valid PASS**
- 1 EXPECTED-FAIL — `iframe srcdoc` content (confirmed: Obscura 0.2.4 does not load
  `srcdoc`; the iframe resolves to an empty `about:blank`)
- 1 DOCUMENTED — cross-origin iframe (same-origin policy applies to every engine)
- **0 quarantined, 0 fail**

Representative areas exercised: navigation, history (`back`), forms, cookies
(write + persistence), dynamic JS, async timers, tabs (create/close/switch),
screenshots, large DOM, and session shape.

## Known limitations / not claimed

- **No Chrome-parity claim.** Features and fidelity differ; expect gaps.
- **No speed or cold-start claim.**
- **iframe `srcdoc`** is a confirmed limitation on Obscura 0.2.4 (the attribute is
  ignored; same-origin iframe content otherwise works).
- The matrix used a **fresh automation Chrome**, not your profile, so only public,
  login-free cases were exercised.
- Some behaviours are **agent-browser client** characteristics, not Obscura bugs,
  and affect Chrome equally:
  - `click` runs JS handlers but does **not** navigate `<a>` links / submit forms
    in this environment — use `open` (+ `back`) for history and `get value` for
    form state.
  - Tabs are addressed by **tabId** (`t1`/`t2`), not integers.
  - `viewport` is a sub-command: `agent-browser set viewport <w> <h>`.

## Rollback

1. `git checkout -- index.ts package.json tsconfig.json README.md CHANGELOG.md`
2. Delete `src/obscura/`, `src/skill.ts`, `docs/`, `test/obscura.test.ts`, `test/obscura.e2e.ts`
3. `npm run build`
4. Stop any owned run: `obscura_backend { "action": "stop" }`; remove `%TEMP%\opencode\obscura`

Chrome users are unaffected at every step — the feature is opt-in.
