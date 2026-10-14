# Changelog

All notable changes to this project are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
