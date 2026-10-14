# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
