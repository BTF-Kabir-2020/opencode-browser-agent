# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.3] - 2026-10-27

### Fixed

- Escaped stray backtick in skill template that broke TypeScript build.

## [2.0.2] - 2026-10-27

### Added

- Skill sections 4h (multi-tab targeting) and 4i (remote/proxied CDP endpoints),
  inspired by different-ai/opencode-browser.

## [2.0.1] - 2026-10-27

### Added

- Security hardening in skill (upstream PR #2 inspired): SECURITY section
  (prompt injection, session trust, screencast port, profile isolation,
  disposable credentials), (SECRET) markers on cookie/storage/network dumps,
  cookie-banner softer policy, screencast port warning.
- Pinned `@types/bun` to `^1.4.3`.

## [2.0.0] - 2026-10-27

### Changed

- Migrated plugin to the OpenCode V2 plugin API (`@opencode/plugin`,
  `Plugin.define`, `ctx.tool.transform`, `ctx.session.synthetic`,
  `ctx.session.hook("context")`). Required for OpenCode >= 2.0.0.
- Installers now wire `plugins` (plural) and depend on `@opencode/plugin`.
- README requirements updated to OpenCode >= 2.0.0.

### Added

- Video streaming (WebSocket) and network mocking examples in the skill.
- Dev-tools/network-mocking/video-streaming subsection (4g) in skill.

### Kept

- `agent-browser >= 0.27.0` dependency and policy-first skill (supports all
  agent-browser versions; never pkill/close the user's browser).

## [1.4.3] - 2026-10-15

### Added

- GitHub Actions release workflow (`.github/workflows/publish.yml`) that
  publishes to npm via OIDC Trusted Publishing (no long-lived token).

### Changed

- README: added the npm badge and npm-based install instructions.

## [1.4.2] - 2026-10-15

### Changed

- Include `NOTICE` in the published npm package so upstream attribution ships
  with the bundle (MIT compliance). First npm release.

## [1.4.1] - 2026-10-15

### Changed

- `LICENSE` is now the standard, unmodified MIT text so GitHub detects the
  license (previously reported as "NOASSERTION"). Upstream attribution for
  `opencode-agent-browser` moved to a new `NOTICE` file.

### Added

- GitHub Actions CI (`.github/workflows/ci.yml`) — typecheck, build, and unit
  tests on Ubuntu and Windows — plus a CI badge in the README.
- Issue templates and a "Why this plugin?" / "Demo" section in the README.

## [1.4.0] - 2026-10-15

### Added

- Optional, **opt-in** Obscura CDP backend via the `obscura_backend` tool
  (`start` / `attach` / `status` / `doctor` / `stop`). Chrome remains the default
  and is unchanged; nothing starts automatically. Requires `OBSCURA_BIN` or
  `obscura` on `PATH`.
- Enforced safety: `127.0.0.1`-only bind, explicit port from the `9600-9699`
  pool (reserved ports refused), never `--allow-file-access`; fixture mode
  (`--allow-private-network`) is off by default and only allowed with explicit
  loopback-only targets; cleanup terminates a process only after positively
  verifying ownership.
- Unit tests (24) and a real-binary E2E smoke test (10 assertions) — `npm test`,
  `npm run test:e2e`.
- `docs/obscura.md` — usage, security posture, measured compatibility matrix,
  honest limitations, and rollback.

### Notes

- Experimental; not a Chrome replacement. No speed/parity claim. `iframe srcdoc`
  is a confirmed limitation (Obscura 0.2.4 does not load it).

## [1.3.0] - 2026-10-14

### Added

- Section 1a: browser identity verification before acting. Includes read-only
  tab/URL/title/CDP diagnostics and Windows/Linux process/port checks.
- Skill and README make clear that `--auto-connect` identifies only *a* Chrome
  process, not a profile/account; identity must be verified from tabs, visible
  account context, PID/port, and profile/process evidence.
- Short rules now require identifying the attached Chrome before depending on
  login/account state and reporting that evidence read only.

### Changed

- Renumbered short rules to include browser identity as a first-class safety rule.
- Plugin/skill messaging now emphasizes read-only browser identity evidence
  and never handling credentials, cookies, tokens, 2FA, or unrelated tabs.

## [1.2.0] - 2026-10-14

### Added

- Skill section 4e: attaching to a real Chrome over CDP - explicit
  `--auto-connect false --cdp <port>` usage, the `autoConnect` config conflict,
  404 `/json/version` on recent Chrome, stale `DevToolsActivePort`, wedged
  session daemons, per-profile browser processes, and read-only diagnostics for
  Windows and Linux.
- README troubleshooting: "Attaching to your Chrome (CDP)" with the same steps.
- Short rule 10: how to attach, and never to kill Chrome or the daemon.

### Changed

- Section 1 (attach rules) and section 9 (failures) now point at the CDP path
  and the exact `10060` / "Cannot use --auto-connect and --cdp together"
  symptoms.

## [1.1.0] - 2026-10-14

### Added

- Policy-first plugin skill: browser attach rules, core loop with waits,
  three-layer verification, unicode round-trip checks, settings/upload
  playbooks, anti-bot handling, blind-agent rule, doctor-first troubleshooting.
- Platform coverage: Windows PowerShell 5.1, Linux/macOS bash, Linux GUI and
  Linux VPS (headless).
- One-command installers: `install.ps1`, `update.ps1`, `install.sh`,
  `update.sh` - build with esbuild, sanity-check the bundle, deploy to every
  installed plugin location, wire `opencode.json` to the local build and strip
  the agent-browser config BOM.
- `.gitattributes` enforcing LF for shell scripts and CRLF for PowerShell.

### Changed

- `index.ts` is the single source of truth; the old `src/` tree was removed.
- README rewritten around install/update, platform notes and troubleshooting.
- Package renamed to `opencode-browser-agent`.

### Fixed

- The bundled plugin no longer contains guidance to kill the user's browser.
- The agent-browser config BOM no longer triggers a config parse warning.

## [1.0.0]

Initial public release.
