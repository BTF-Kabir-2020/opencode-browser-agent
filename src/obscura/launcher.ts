// Obscura launcher / supervisor.
//
// Responsibilities (spec: reports/obscura-optin-plan.md sections 1.3-1.6):
//  - allocate a non-conflicting explicit port from a safe pool;
//  - start `obscura serve` bound to 127.0.0.1 with an explicit --port and a
//    --ready-file used as the readiness primitive (never a fixed sleep);
//  - record a ledger that proves ownership of exactly one process;
//  - stop ONLY a process positively verified as belonging to this run
//    (never kill by name or port, never touch unrelated sessions/processes).
//
// All effects go through an injected `LauncherDeps` so the lifecycle can be
// tested deterministically without spawning real processes.

import { isLoopbackTarget, type FixtureDecision, evaluateFixtureMode } from "./backend.ts"

export const LOOPBACK_HOST = "127.0.0.1"
export const PORT_POOL_START = 9600
export const PORT_POOL_END = 9699
export const READY_TIMEOUT_MS = 15_000
export const READY_POLL_MS = 100
export const SESSION_PREFIX = "obscura-"
export const LEDGER_FILE = "ledger.json"
export const READY_FILE = "ready.json"
export const LOG_FILE = "obscura.log"

/**
 * Ports this project must never allocate: the fixture server, the user's
 * Chrome debug port, the Lightpanda eval port, prior eval ports, the vosy
 * proxy ports and the container dashboard. A stray allocation here would
 * collide with a live service.
 */
export const RESERVED_PORTS: ReadonlySet<number> = new Set([
  4848, 8377, 9222, 9333, 9444, 9555, 10808, 10814, 27890, 28000, 37890,
])

export class LauncherError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LauncherError"
  }
}

// ---------------------------------------------------------------------------
// Ledger + ownership (pure)
// ---------------------------------------------------------------------------

export interface Ledger {
  runId: string
  pid: number
  port: number
  host: string
  runDir: string
  readyFile: string
  binaryPath: string
  commandLine: string
  startUtcMs: number
  fixtureMode: boolean
  createdAtMs: number
}

export interface ProcessSnapshot {
  pid: number
  name: string
  commandLine: string
  creationTimeMs: number
}

export interface OwnershipVerdict {
  owned: boolean
  reason: string
}

/**
 * Decide whether a live process positively belongs to this launcher run.
 * ALL checks must pass; any mismatch means "not owned" and the caller must
 * leave the process alone. This is the safeguard that prevents killing a
 * pre-existing Obscura instance or a PID that was reused by another process.
 */
export function classifyOwnership(ledger: Ledger, snap: ProcessSnapshot | null): OwnershipVerdict {
  if (!snap) return { owned: false, reason: "process not found" }
  if (snap.pid !== ledger.pid) {
    return { owned: false, reason: `pid mismatch (expected ${ledger.pid}, saw ${snap.pid})` }
  }
  if (!/obscura/i.test(snap.name)) {
    return { owned: false, reason: `process name is not obscura (${snap.name})` }
  }
  const cl = snap.commandLine ?? ""
  if (!/\bserve\b/.test(cl)) {
    return { owned: false, reason: "command line is not `obscura serve`" }
  }
  if (!cl.includes("--port") || !new RegExp(`--port\\s+${ledger.port}(\\s|$)`).test(cl)) {
    return { owned: false, reason: `command line does not carry --port ${ledger.port}` }
  }
  if (!cl.includes(ledger.readyFile)) {
    return { owned: false, reason: "command line does not carry this run's --ready-file" }
  }
  // Guard against PID reuse: the process must have started at/after the ledger.
  if (snap.creationTimeMs > 0 && snap.creationTimeMs < ledger.startUtcMs - 2000) {
    return { owned: false, reason: "process started before this run (pid reuse)" }
  }
  return { owned: true, reason: "pid, name, port and ready-file all match this run" }
}

// ---------------------------------------------------------------------------
// Argument construction (pure)
// ---------------------------------------------------------------------------

export interface ServeArgsInput {
  port: number
  readyFile: string
  fixtureMode: boolean
}

/** Build the `obscura serve` argument vector. Explicit port, loopback, no file access. */
export function buildServeArgs(input: ServeArgsInput): string[] {
  const { port, readyFile, fixtureMode } = input
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new LauncherError(`Invalid port for serve args: ${String(port)}`)
  }
  const args = ["serve", "--host", LOOPBACK_HOST, "--port", String(port), "--ready-file", readyFile]
  if (fixtureMode) args.push("--allow-private-network")
  // NOTE: --allow-file-access is intentionally never passed.
  return args
}

/** Reserved ports are refused even if explicitly requested. */
export function assertPortAllocatable(port: number, reserved: ReadonlySet<number> = RESERVED_PORTS): void {
  if (reserved.has(port)) {
    throw new LauncherError(
      `Refusing reserved port ${port}: it collides with a known live service (Chrome debug / fixture / eval / proxy).`,
    )
  }
}

/** First free, non-reserved port from the pool. */
export async function allocatePort(
  isFree: (port: number) => Promise<boolean>,
  opts: { start?: number; end?: number; reserved?: ReadonlySet<number> } = {},
): Promise<number> {
  const start = opts.start ?? PORT_POOL_START
  const end = opts.end ?? PORT_POOL_END
  const reserved = opts.reserved ?? RESERVED_PORTS
  for (let port = start; port <= end; port++) {
    if (reserved.has(port)) continue
    if (await isFree(port)) return port
  }
  throw new LauncherError(`No free port in pool ${start}-${end} (excluding reserved ports).`)
}

export interface ReadyPayload {
  address: string
  port: number
}

/** Parse the ready-file contents published by `obscura serve --ready-file`. */
export function parseReadyFile(text: string): ReadyPayload | null {
  const trimmed = (text ?? "").trim()
  if (!trimmed) return null
  // Accept either JSON or a bare "host:port" / "port" string.
  try {
    const obj = JSON.parse(trimmed) as Record<string, unknown>
    const address =
      (obj.address as string) ??
      (obj.url as string) ??
      (obj.addr as string) ??
      ""
    const port = Number(obj.port ?? extractPort(address))
    if (address || Number.isFinite(port)) {
      return { address: address || `${LOOPBACK_HOST}:${port}`, port: Number.isFinite(port) ? port : extractPort(address) }
    }
  } catch {
    // fall through to bare-string parsing
  }
  const port = extractPort(trimmed)
  if (port > 0) return { address: trimmed, port }
  return null
}

function extractPort(text: string): number {
  const m = /:?(\d{2,5})\s*$/.exec(String(text).trim())
  if (!m) return 0
  const n = Number(m[1])
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : 0
}

// ---------------------------------------------------------------------------
// Dependency injection surface
// ---------------------------------------------------------------------------

export interface SpawnResult {
  pid: number | undefined
  commandLine: string
  unref(): void
}

export interface LauncherDeps {
  fs: {
    existsSync(p: string): boolean
    readFileSync(p: string): string
    writeFileSync(p: string, data: string): void
    mkdirSync(p: string): void
    rmSync(p: string, opts?: { recursive?: boolean; force?: boolean }): void
  }
  spawn(binary: string, args: string[], opts: { logFile: string; env: Record<string, string | undefined> }): SpawnResult
  isPortFree(port: number, host: string): Promise<boolean>
  isPortListening(port: number, host: string): Promise<boolean>
  httpJsonVersion(port: number, host: string): Promise<unknown | null>
  processInfo(pid: number): ProcessSnapshot | null
  kill(pid: number): void
  now(): number
  sleep(ms: number): Promise<void>
  randomId(): string
  listRunDirs(root: string): string[]
  baseEnv: Record<string, string | undefined>
  resolveBinary(): string | null
  runsRoot(): string
}

// ---------------------------------------------------------------------------
// Launcher
// ---------------------------------------------------------------------------

export interface StartOptions {
  port?: number
  fixtureMode?: boolean
  targets?: string[]
  binaryPath?: string
}

export interface StartResult {
  runId: string
  pid: number
  port: number
  host: string
  runDir: string
  readyFile: string
  fixtureMode: boolean
  attachArgs: string[]
}

export class ObscuraLauncher {
  private readonly deps: LauncherDeps
  constructor(deps: LauncherDeps) {
    this.deps = deps
  }

  async start(opts: StartOptions = {}): Promise<StartResult> {
    const fixture = evaluateFixtureMode(opts.fixtureMode, opts.targets)
    if (opts.fixtureMode && !fixture.allowed) {
      throw new LauncherError(`fixture mode refused: ${fixture.reason}`)
    }

    const binary = opts.binaryPath ?? this.deps.resolveBinary()
    if (!binary) {
      throw new LauncherError(
        "Obscura binary not found. Set OBSCURA_BIN to obscura(.exe), or place it on PATH.",
      )
    }

    const port =
      opts.port !== undefined
        ? (assertPortAllocatable(opts.port), opts.port)
        : await allocatePort((p) => this.deps.isPortFree(p, LOOPBACK_HOST))
    if (!(await this.deps.isPortFree(port, LOOPBACK_HOST))) {
      throw new LauncherError(`Port ${port} is already in use.`)
    }

    const runId = `${this.deps.now()}-${this.deps.randomId()}`
    const runDir = `${this.deps.runsRoot()}/${runId}`
    this.deps.fs.mkdirSync(runDir)
    const readyFile = `${runDir}/${READY_FILE}`
    const logFile = `${runDir}/${LOG_FILE}`

    const args = buildServeArgs({ port, readyFile, fixtureMode: fixture.allowed })
    const env: Record<string, string | undefined> = { ...this.deps.baseEnv }
    if (!fixture.allowed) {
      // Defensive: a stray global env var must not silently widen the SSRF scope.
      delete env.OBSCURA_ALLOW_PRIVATE_NETWORK
    }

    const spawned = this.deps.spawn(binary, args, { logFile, env })
    if (!spawned.pid) {
      throw new LauncherError("Failed to spawn obscura serve (no pid returned).")
    }
    spawned.unref()

    const ledger: Ledger = {
      runId,
      pid: spawned.pid,
      port,
      host: LOOPBACK_HOST,
      runDir,
      readyFile,
      binaryPath: binary,
      commandLine: spawned.commandLine,
      startUtcMs: this.deps.now(),
      fixtureMode: fixture.allowed,
      createdAtMs: this.deps.now(),
    }
    this.writeLedger(ledger)

    try {
      await this.waitReady(ledger)
    } catch (err) {
      // Best-effort cleanup, ownership-verified only.
      this.stopLedger(ledger)
      throw err
    }

    return {
      runId,
      pid: ledger.pid,
      port,
      host: LOOPBACK_HOST,
      runDir,
      readyFile,
      fixtureMode: fixture.allowed,
      attachArgs: ["--auto-connect", "false", "--cdp", String(port)],
    }
  }

  private async waitReady(ledger: Ledger): Promise<void> {
    const deadline = this.deps.now() + READY_TIMEOUT_MS
    while (this.deps.now() < deadline) {
      if (this.deps.fs.existsSync(ledger.readyFile)) {
        const payload = parseReadyFile(this.deps.fs.readFileSync(ledger.readyFile))
        if (payload && payload.port > 0) {
          if (await this.deps.isPortListening(ledger.port, LOOPBACK_HOST)) return
        }
      }
      // Secondary: the CDP HTTP endpoint (some builds publish late).
      const version = await this.deps.httpJsonVersion(ledger.port, LOOPBACK_HOST)
      if (version && await this.deps.isPortListening(ledger.port, LOOPBACK_HOST)) return
      await this.deps.sleep(READY_POLL_MS)
    }
    throw new LauncherError(
      `Obscura did not become ready within ${READY_TIMEOUT_MS}ms on ${LOOPBACK_HOST}:${ledger.port}.`,
    )
  }

  loadLedger(runDir: string): Ledger | null {
    const p = `${runDir}/${LEDGER_FILE}`
    if (!this.deps.fs.existsSync(p)) return null
    try {
      return JSON.parse(this.deps.fs.readFileSync(p)) as Ledger
    } catch {
      return null
    }
  }

  private writeLedger(ledger: Ledger): void {
    this.deps.fs.writeFileSync(`${ledger.runDir}/${LEDGER_FILE}`, JSON.stringify(ledger, null, 2))
  }

  /** Stop one run only if ownership is positively verified. */
  stopLedger(ledger: Ledger): OwnershipVerdict {
    const snap = this.deps.processInfo(ledger.pid)
    const verdict = classifyOwnership(ledger, snap)
    if (!verdict.owned) return verdict
    this.deps.kill(ledger.pid)
    return { owned: true, reason: `stopped owned process ${ledger.pid}` }
  }

  async status(summary: (r: Record<string, unknown>) => void): Promise<void> {
    for (const runDir of this.deps.listRunDirs(this.deps.runsRoot())) {
      const ledger = this.loadLedger(runDir)
      if (!ledger) continue
      const snap = this.deps.processInfo(ledger.pid)
      const verdict = classifyOwnership(ledger, snap)
      summary({
        runId: ledger.runId,
        pid: ledger.pid,
        port: ledger.port,
        fixtureMode: ledger.fixtureMode,
        alive: snap !== null,
        owned: verdict.owned,
        reason: verdict.reason,
        runDir: ledger.runDir,
      })
    }
  }

  /** Sweep ledger-known runs. Never scans or kills by process name/port. */
  async doctor(summary: (r: Record<string, unknown>) => void): Promise<void> {
    await this.status(summary)
  }
}
