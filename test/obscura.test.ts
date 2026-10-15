// Focused tests for the Obscura opt-in backend.
// Run: node --experimental-strip-types --test test/obscura.test.ts
//
// Coverage: backend selection, launcher lifecycle, port conflicts, readiness
// failure, cleanup ownership, serve-arg safety, fixture-mode policy and
// ready-file parsing. No real processes are started.

import test from "node:test"
import assert from "node:assert/strict"

import {
  DEFAULT_BACKEND,
  buildAttachArgs,
  evaluateFixtureMode,
  isLoopbackHost,
  isLoopbackTarget,
  requireExplicitPort,
  resolveBackend,
} from "../src/obscura/backend.ts"
import {
  RESERVED_PORTS,
  allocatePort,
  assertPortAllocatable,
  buildServeArgs,
  classifyOwnership,
  parseReadyFile,
  type LauncherDeps,
  type Ledger,
  type ProcessSnapshot,
} from "../src/obscura/launcher.ts"
import { listBackend, startBackend, stopBackend } from "../src/obscura/manager.ts"

// ---------------------------------------------------------------------------
// Test harness: virtual fs + process table, no real I/O.
// ---------------------------------------------------------------------------

interface HarnessOptions {
  binary?: string | null
  busyPorts?: number[]
  listeningPorts?: number[]
  writeReadyOnSpawn?: boolean
  httpVersion?: unknown
  spawnPid?: number
}

function harness(opts: HarnessOptions = {}) {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  const procs = new Map<number, ProcessSnapshot>()
  const killed: number[] = []
  const busy = new Set<number>(opts.busyPorts ?? [])
  const listening = new Set<number>(opts.listeningPorts ?? [])
  const runsRoot = "/runs"
  const state = { now: 1_000_000, nextPid: 4000 }

  const deps: LauncherDeps = {
    fs: {
      existsSync: (p) => files.has(p) || dirs.has(p),
      readFileSync: (p) => {
        if (!files.has(p)) throw new Error(`ENOENT ${p}`)
        return files.get(p) as string
      },
      writeFileSync: (p, data) => {
        files.set(p, data)
      },
      mkdirSync: (p) => {
        dirs.add(p)
      },
      rmSync: (p) => {
        dirs.delete(p)
        files.delete(p)
      },
    },
    spawn: (binary, args) => {
      const pid = opts.spawnPid ?? state.nextPid++
      const commandLine = [binary, ...args].join(" ")
      procs.set(pid, {
        pid,
        name: binary.toLowerCase().includes("obscura") ? "obscura.exe" : "obscura",
        commandLine,
        creationTimeMs: state.now,
      })
      if (opts.writeReadyOnSpawn) {
        const rf = args[args.indexOf("--ready-file") + 1]
        files.set(rf, JSON.stringify({ address: "127.0.0.1:9600", port: Number(args[args.indexOf("--port") + 1]) }))
      }
      return { pid, commandLine, unref: () => {} }
    },
    isPortFree: async (port) => !busy.has(port),
    isPortListening: async (port) => listening.has(port) || opts.writeReadyOnSpawn === true,
    httpJsonVersion: async () => opts.httpVersion ?? null,
    processInfo: (pid) => procs.get(pid) ?? null,
    kill: (pid) => {
      killed.push(pid)
      procs.delete(pid)
    },
    now: () => state.now,
    sleep: async () => {
      state.now += 100
    },
    randomId: () => "abc12345",
    listRunDirs: (root) => [...dirs].filter((d) => d.startsWith(root + "/") && !d.slice(root.length + 1).includes("/")),
    baseEnv: {},
    resolveBinary: () => (opts.binary === undefined ? "/bin/obscura.exe" : opts.binary),
    runsRoot: () => runsRoot,
  }

  return { deps, files, dirs, procs, killed, busy, listening, runsRoot, state }
}

// ---------------------------------------------------------------------------
// Backend selection
// ---------------------------------------------------------------------------

test("backend: chrome is the default when absent/empty", () => {
  assert.equal(DEFAULT_BACKEND, "chrome")
  assert.equal(resolveBackend(undefined), "chrome")
  assert.equal(resolveBackend(null), "chrome")
  assert.equal(resolveBackend(""), "chrome")
  assert.equal(resolveBackend("chrome"), "chrome")
  assert.equal(resolveBackend("  CHROME "), "chrome")
})

test("backend: obscura only when explicitly requested", () => {
  assert.equal(resolveBackend("obscura"), "obscura")
})

test("backend: unknown backend fails loudly instead of guessing", () => {
  assert.throws(() => resolveBackend("firefox"), /Unknown backend/)
})

test("backend: chrome attach args do not alter default transport", () => {
  assert.deepEqual(buildAttachArgs({ backend: undefined }), [])
  assert.deepEqual(buildAttachArgs({ backend: "chrome" }), [])
  assert.deepEqual(buildAttachArgs({ backend: "chrome", sessionName: "work" }), ["--session", "work"])
})

test("backend: obscura attach args use the generic --cdp path with explicit port", () => {
  assert.deepEqual(buildAttachArgs({ backend: "obscura", port: 9601 }), [
    "--auto-connect",
    "false",
    "--cdp",
    "9601",
  ])
  assert.deepEqual(buildAttachArgs({ backend: "obscura", port: "9602", sessionName: "s" }), [
    "--session",
    "s",
    "--auto-connect",
    "false",
    "--cdp",
    "9602",
  ])
})

test("backend: obscura requires an explicit, valid port", () => {
  assert.throws(() => buildAttachArgs({ backend: "obscura" }), /explicit CDP port/)
  assert.throws(() => requireExplicitPort(0), /Invalid CDP port/)
  assert.throws(() => requireExplicitPort(70000), /Invalid CDP port/)
  assert.equal(requireExplicitPort("9603"), 9603)
})

// ---------------------------------------------------------------------------
// Fixture-mode / private-network policy
// ---------------------------------------------------------------------------

test("fixture: disabled by default", () => {
  const d = evaluateFixtureMode(undefined, undefined)
  assert.equal(d.allowed, false)
})

test("fixture: enabled only with explicit loopback-only targets", () => {
  assert.equal(evaluateFixtureMode(true, ["http://127.0.0.1:8377/page.html"]).allowed, true)
  assert.equal(evaluateFixtureMode(true, ["http://localhost:8377/page.html"]).allowed, true)
})

test("fixture: refuses non-loopback or missing targets (no widening)", () => {
  assert.equal(evaluateFixtureMode(true, ["http://192.168.1.10/x"]).allowed, false)
  assert.equal(evaluateFixtureMode(true, ["https://example.com"]).allowed, false)
  assert.equal(evaluateFixtureMode(true, []).allowed, false)
  assert.equal(evaluateFixtureMode(true, undefined).allowed, false)
  assert.equal(evaluateFixtureMode(false, ["http://127.0.0.1:1/x"]).allowed, false)
})

test("fixture: loopback host/target detection", () => {
  assert.equal(isLoopbackHost("localhost"), true)
  assert.equal(isLoopbackHost("127.0.0.1"), true)
  assert.equal(isLoopbackHost("127.5.5.5"), true)
  assert.equal(isLoopbackHost("::1"), true)
  assert.equal(isLoopbackHost("10.0.0.1"), false)
  assert.equal(isLoopbackTarget("http://127.0.0.1:8377/a"), true)
  assert.equal(isLoopbackTarget("file:///etc/passwd"), false)
  assert.equal(isLoopbackTarget("not a url"), false)
})

// ---------------------------------------------------------------------------
// Serve-arg safety
// ---------------------------------------------------------------------------

test("serve args: explicit loopback port, no file access, fixture flag only when allowed", () => {
  const base = buildServeArgs({ port: 9604, readyFile: "/r/ready.json", fixtureMode: false })
  assert.deepEqual(base, ["serve", "--host", "127.0.0.1", "--port", "9604", "--ready-file", "/r/ready.json"])
  assert.equal(base.includes("--allow-file-access"), false)
  assert.equal(base.includes("--allow-private-network"), false)

  const fixture = buildServeArgs({ port: 9604, readyFile: "/r/ready.json", fixtureMode: true })
  assert.equal(fixture.includes("--allow-private-network"), true)
  assert.equal(fixture.includes("--allow-file-access"), false)
})

test("ports: reserved ports are refused", () => {
  for (const p of [9222, 8377, 9333]) {
    assert.equal(RESERVED_PORTS.has(p), true)
    assert.throws(() => assertPortAllocatable(p), /reserved port/)
  }
  assert.doesNotThrow(() => assertPortAllocatable(9605))
})

test("ports: allocation skips busy and reserved ports", async () => {
  const isFree = async (p: number) => !new Set([9600, 9601, 9222]).has(p)
  const port = await allocatePort(isFree, { start: 9600, end: 9603 })
  assert.equal(port, 9602)
})

test("ports: allocation fails when the pool is exhausted", async () => {
  await assert.rejects(() => allocatePort(async () => false, { start: 9600, end: 9601 }), /No free port/)
})

test("ready-file: parses json and bare forms", () => {
  assert.deepEqual(parseReadyFile('{"address":"127.0.0.1:9600","port":9600}'), { address: "127.0.0.1:9600", port: 9600 })
  assert.equal(parseReadyFile("127.0.0.1:9600")?.port, 9600)
  assert.equal(parseReadyFile(""), null)
})

// ---------------------------------------------------------------------------
// Port conflict: start refuses a busy explicit port
// ---------------------------------------------------------------------------

test("start: refuses an already-busy explicit port", async () => {
  const h = harness({ busyPorts: [9607], writeReadyOnSpawn: true })
  await assert.rejects(() => startBackend(h.deps, { port: 9607 }), /already in use/)
  assert.equal(h.killed.length, 0)
})

test("start: refuses a reserved explicit port", async () => {
  const h = harness({ writeReadyOnSpawn: true })
  await assert.rejects(() => startBackend(h.deps, { port: 9222 }), /reserved port/)
})

// ---------------------------------------------------------------------------
// Launcher lifecycle
// ---------------------------------------------------------------------------

test("lifecycle: start writes a ledger, returns attach args, stop kills the owned pid", async () => {
  const h = harness({ writeReadyOnSpawn: true })
  const res = await startBackend(h.deps, { port: 9610 })

  assert.equal(res.port, 9610)
  assert.equal(res.host, "127.0.0.1")
  assert.equal(res.fixtureMode, false)
  assert.deepEqual(res.attachArgs, ["--auto-connect", "false", "--cdp", "9610"])

  const ledger = h.files.get(`${res.runDir}/ledger.json`)
  assert.ok(ledger, "ledger.json written")
  assert.equal(JSON.parse(ledger as string).pid, res.pid)

  const running = listBackend(h.deps)
  assert.equal(running.length, 1)
  assert.equal(running[0].alive, true)
  assert.equal(running[0].owned, true)

  const verdicts = stopBackend(h.deps)
  assert.equal(verdicts.length, 1)
  assert.equal(verdicts[0].owned, true)
  assert.deepEqual(h.killed, [res.pid])

  assert.equal(listBackend(h.deps)[0].alive, false)
})

test("lifecycle: missing binary is refused and nothing is spawned", async () => {
  const h = harness({ binary: null, writeReadyOnSpawn: true })
  await assert.rejects(() => startBackend(h.deps, { port: 9611 }), /binary not found/)
  assert.equal(h.killed.length, 0)
})

test("lifecycle: fixture mode refusal blocks launch", async () => {
  const h = harness({ writeReadyOnSpawn: true })
  await assert.rejects(
    () => startBackend(h.deps, { port: 9612, fixtureMode: true, targets: ["http://192.168.0.5/x"] }),
    /fixture mode refused/,
  )
  assert.equal(h.killed.length, 0)
})

// ---------------------------------------------------------------------------
// Readiness failure
// ---------------------------------------------------------------------------

test("readiness: failure rejects and cleans up the owned process", async () => {
  const h = harness({ writeReadyOnSpawn: false, httpVersion: null })
  await assert.rejects(() => startBackend(h.deps, { port: 9613 }), /did not become ready/)
  assert.equal(h.killed.length, 1, "owned process was cleaned up")
})

// ---------------------------------------------------------------------------
// Cleanup ownership
// ---------------------------------------------------------------------------

test("ownership: requires pid, name, port, ready-file and start time to all match", () => {
  const ledger: Ledger = {
    runId: "r",
    pid: 5000,
    port: 9620,
    host: "127.0.0.1",
    runDir: "/runs/r",
    readyFile: "/runs/r/ready.json",
    binaryPath: "/bin/obscura.exe",
    commandLine: "obscura serve",
    startUtcMs: 1_000_000,
    fixtureMode: false,
    createdAtMs: 1_000_000,
  }
  const good: ProcessSnapshot = {
    pid: 5000,
    name: "obscura.exe",
    commandLine: "obscura.exe serve --host 127.0.0.1 --port 9620 --ready-file /runs/r/ready.json",
    creationTimeMs: 1_000_100,
  }
  assert.equal(classifyOwnership(ledger, good).owned, true)
  assert.equal(classifyOwnership(ledger, null).owned, false)
  assert.equal(classifyOwnership(ledger, { ...good, pid: 5001 }).owned, false)
  assert.equal(classifyOwnership(ledger, { ...good, name: "chrome.exe" }).owned, false)
  assert.equal(classifyOwnership(ledger, { ...good, commandLine: "obscura.exe serve --port 9999" }).owned, false)
  assert.equal(classifyOwnership(ledger, { ...good, commandLine: "obscura.exe fetch --port 9620" }).owned, false)
  assert.equal(
    classifyOwnership(ledger, { ...good, commandLine: "obscura.exe serve --port 9620 --ready-file /other/ready" }).owned,
    false,
  )
  // pid reuse: process started well before this run
  assert.equal(classifyOwnership(ledger, { ...good, creationTimeMs: 900_000 }).owned, false)
})

test("cleanup: a non-owned process is never killed", async () => {
  const h = harness({ writeReadyOnSpawn: true })
  const res = await startBackend(h.deps, { port: 9621 })
  // Simulate PID reuse: the pid now belongs to a different process.
  h.procs.set(res.pid, {
    pid: res.pid,
    name: "chrome.exe",
    commandLine: "chrome.exe --remote-debugging-port=9222",
    creationTimeMs: h.state.now,
  })
  const verdicts = stopBackend(h.deps)
  assert.equal(verdicts[0].owned, false)
  assert.equal(h.killed.length, 0, "foreign process must not be killed")
})

test("cleanup: stop with an unknown runId is a no-op", async () => {
  const h = harness({ writeReadyOnSpawn: true })
  await startBackend(h.deps, { port: 9622 })
  const verdicts = stopBackend(h.deps, "does-not-exist")
  assert.equal(verdicts.length, 0)
  assert.equal(h.killed.length, 0)
})
