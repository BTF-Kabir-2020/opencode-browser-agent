// Opt-in E2E smoke test for the real Obscura binary.
// Skips (exit 0) when no binary is resolvable, so it never breaks CI-less runs.
//
// Run: npm run test:e2e
// (requires OBSCURA_BIN or `obscura` on PATH)

import { spawnSync } from "node:child_process"
import { closeSync, existsSync, openSync, readFileSync, rmSync } from "node:fs"
import { delimiter, join } from "node:path"
import { tmpdir } from "node:os"
import { createRealDeps, resolveBinary } from "../src/obscura/runtime.ts"
import { attachArgsFor, listBackend, startBackend, stopBackend } from "../src/obscura/manager.ts"

const deps = createRealDeps()

if (!resolveBinary()) {
  console.log("E2E_SKIPPED: no obscura binary resolvable")
  process.exit(0)
}

const results: string[] = []
const record = (step: string, ok: boolean, detail: string) => results.push(`${ok ? "PASS" : "FAIL"} ${step} :: ${detail}`)

/**
 * Locate the agent-browser CLI executable itself.
 *
 * On Windows the PATH entry is an npm `.cmd` shim; passing a command string
 * through cmd.exe re-introduces quoting bugs, and the detached session daemon
 * inherits pipe stdout so a normal pipe never reaches EOF. Spawning the exe
 * directly with a FILE as stdout avoids both problems.
 */
function resolveAgentBrowser(): string | null {
  const explicit = process.env.AGENT_BROWSER_BIN
  if (explicit && existsSync(explicit)) return explicit
  const names = process.platform === "win32" ? ["agent-browser.cmd"] : ["agent-browser"]
  for (const dir of (process.env.PATH ?? "").split(delimiter)) {
    if (!dir) continue
    for (const name of names) {
      const shim = join(dir, name)
      if (!existsSync(shim)) continue
      if (process.platform !== "win32") return shim
      // Follow the %~dp0 indirection in the npm shim to the real binary.
      try {
        const content = readFileSync(shim, "utf8")
        const exe = /"(.+?agent-browser-win32-x64\.exe)"/i.exec(content)
        if (exe) {
          const resolved = exe[1].replace(/%~dp0/gi, dir + "\\")
          if (existsSync(resolved)) return resolved
        }
        const candidate = join(dir, "node_modules", "agent-browser", "bin", "agent-browser-win32-x64.exe")
        if (existsSync(candidate)) return candidate
      } catch {
        // try next
      }
    }
  }
  return null
}

const AB_BIN = resolveAgentBrowser()

/**
 * Run an agent-browser client command and capture its output into a file.
 * FILE stdout (not a pipe): agent-browser's detached daemon inherits stdout,
 * so a pipe never reaches EOF and the call appears to hang.
 */
function runAb(argv: string[], timeoutMs: number): { code: number; out: string } {
  if (!AB_BIN) return { code: -1, out: "agent-browser executable not resolvable" }
  const log = join(tmpdir(), `opencode-ab-${process.pid}-${Date.now()}.txt`)
  const fd = openSync(log, "w")
  let code = -1
  try {
    const res = spawnSync(AB_BIN, argv, {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", fd, fd],
      windowsHide: true,
    })
    code = res.status ?? -1
    let out = ""
    try {
      if (existsSync(log)) out = readFileSync(log, "utf8")
    } catch {
      out = ""
    }
    return { code, out: out.trim() }
  } finally {
    closeSync(fd)
    try {
      rmSync(log, { force: true })
    } catch {
      // ignore
    }
  }
}

let started: Awaited<ReturnType<typeof startBackend>> | null = null
try {
  started = await startBackend(deps, {})
  record("start", true, `pid=${started.pid} port=${started.port} fixtureMode=${started.fixtureMode}`)

  const ledger = JSON.parse(
    (deps.fs.readFileSync as (p: string) => string)(`${started.runDir}/ledger.json`),
  ) as { commandLine: string }
  record(
    "no-private-network-by-default",
    !ledger.commandLine.includes("--allow-private-network"),
    ledger.commandLine,
  )
  record("explicit-port", ledger.commandLine.includes(`--port ${started.port}`), ledger.commandLine)
  record("loopback-host", ledger.commandLine.includes("--host 127.0.0.1"), ledger.commandLine)
  record("no-file-access", !ledger.commandLine.includes("--allow-file-access"), ledger.commandLine)

  const sessionName = `obscura-e2e-${started.pid}`
  const attach = attachArgsFor(deps, started.port, sessionName)
  record(
    "attach-args",
    attach.join(" ") === `--session ${sessionName} --auto-connect false --cdp ${started.port}`,
    attach.join(" "),
  )

  const runs = listBackend(deps)
  record("status-owned", runs.some((r) => r.runId === started!.runId && r.alive && r.owned), JSON.stringify(runs))

  // The generic CDP attach path must actually work end to end: attach, navigate, read back.
  const opened = runAb([...attach, "open", "https://example.com"], 60_000)
  const title = runAb([...attach, "get", "title"], 30_000)
  record(
    "agent-browser-cdp-attach",
    opened.code === 0 && title.code === 0 && title.out.includes("Example Domain"),
    `open(code=${opened.code}) out=${JSON.stringify(opened.out)} | title(code=${title.code}) out=${JSON.stringify(title.out)}`,
  )
  // Cleanup our own session only (we created it).
  runAb([...attach, "close"], 30_000)

  const verdicts = stopBackend(deps, started.runId)
  record("stop-owned", verdicts.some((v) => v.owned), JSON.stringify(verdicts))

  const after = listBackend(deps).filter((r) => r.runId === started!.runId)
  record("not-alive-after-stop", after.every((r) => !r.alive), JSON.stringify(after))
} catch (err) {
  record("lifecycle", false, String(err))
  if (started) stopBackend(deps, started.runId)
}

console.log(results.join("\n"))
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0)
