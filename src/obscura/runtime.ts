// Real (non-injected) implementations for the Obscura launcher.
// Everything here uses Node built-ins only — no new dependencies.

import { spawn as nodeSpawn, spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { createServer, connect } from "node:net"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import type { LauncherDeps, ProcessSnapshot } from "./launcher.ts"
import { LOOPBACK_HOST } from "./launcher.ts"

const BINARY_NAMES = process.platform === "win32" ? ["obscura.exe"] : ["obscura"]

function whichBinary(name: string): string | null {
  const pathVar = process.env.PATH ?? ""
  for (const dir of pathVar.split(delimiter)) {
    if (!dir) continue
    const full = join(dir, name)
    try {
      if (existsSync(full) && statSync(full).isFile()) return full
    } catch {
      // ignore
    }
  }
  return null
}

export function resolveBinary(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.OBSCURA_BIN
  if (explicit && existsSync(explicit)) return explicit
  for (const name of BINARY_NAMES) {
    const found = whichBinary(name)
    if (found) return found
  }
  return null
}

function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer()
    server.once("error", () => resolve(false))
    server.once("listening", () => server.close(() => resolve(true)))
    try {
      server.listen(port, host)
    } catch {
      resolve(false)
    }
  })
}

function isPortListening(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    const done = (ok: boolean) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.once("connect", () => done(true))
    socket.once("error", () => done(false))
    socket.setTimeout(1500, () => done(false))
  })
}

async function httpJsonVersion(port: number, host: string): Promise<unknown | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 1500)
  try {
    const res = await fetch(`http://${host}:${port}/json/version`, { signal: controller.signal })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

function parseCimDate(value: unknown): number {
  if (typeof value !== "string") return 0
  const m = /\/Date\((\d+)/.exec(value)
  if (m) return Number(m[1])
  const t = Date.parse(value)
  return Number.isFinite(t) ? t : 0
}

function processInfo(pid: number): ProcessSnapshot | null {
  try {
    if (process.platform === "win32") {
      const script = [
        `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"`,
        `if ($p) { $p | Select-Object ProcessId,Name,CommandLine,CreationDate | ConvertTo-Json -Compress }`,
      ].join("; ")
      const out = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], {
        encoding: "utf8",
        timeout: 8000,
        windowsHide: true,
      })
      const text = (out.stdout ?? "").trim()
      if (!text) return null
      const obj = JSON.parse(text) as Record<string, unknown>
      return {
        pid: Number(obj.ProcessId),
        name: String(obj.Name ?? ""),
        commandLine: String(obj.CommandLine ?? ""),
        creationTimeMs: parseCimDate(obj.CreationDate),
      }
    }
    const out = spawnSync("ps", ["-o", "pid=,comm=,lstart=,args=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 8000,
    })
    const line = (out.stdout ?? "").trim()
    if (!line) return null
    const m = /^(\d+)\s+(\S+)\s+(\w{3}\s+\w{3}\s+\d+\s+\d{2}:\d{2}:\d{2}\s+\d{4})\s+(.*)$/.exec(line)
    if (!m) return null
    return {
      pid: Number(m[1]),
      name: m[2],
      commandLine: m[4],
      creationTimeMs: Number.isFinite(Date.parse(m[3])) ? Date.parse(m[3]) : 0,
    }
  } catch {
    return null
  }
}

function killProcess(pid: number): void {
  // Only ever called after classifyOwnership() verified the pid belongs to us.
  try {
    process.kill(pid)
  } catch {
    // already gone
  }
}

export function runsRoot(): string {
  return join(tmpdir(), "opencode", "obscura")
}

export function createRealDeps(): LauncherDeps {
  return {
    fs: {
      existsSync: (p) => existsSync(p),
      readFileSync: (p) => readFileSync(p, "utf8"),
      writeFileSync: (p, data) => writeFileSync(p, data, "utf8"),
      mkdirSync: (p) => {
        mkdirSync(p, { recursive: true })
      },
      rmSync: (p, opts) => {
        rmSync(p, { recursive: true, force: true, ...opts })
      },
    },
    spawn: (binary, args, opts) => {
      const out = openSync(opts.logFile, "a")
      const child = nodeSpawn(binary, args, {
        detached: true,
        windowsHide: true,
        stdio: ["ignore", out, out],
        env: opts.env as NodeJS.ProcessEnv,
      })
      const commandLine = [binary, ...args].join(" ")
      return {
        pid: child.pid,
        commandLine,
        unref: () => child.unref(),
      }
    },
    isPortFree,
    isPortListening,
    httpJsonVersion,
    processInfo,
    kill: killProcess,
    now: () => Date.now(),
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    randomId: () => randomUUID().slice(0, 8),
    listRunDirs: (root) => {
      try {
        if (!existsSync(root)) return []
        return readdirSync(root)
          .map((name) => join(root, name))
          .filter((p) => {
            try {
              return statSync(p).isDirectory()
            } catch {
              return false
            }
          })
      } catch {
        return []
      }
    },
    baseEnv: process.env as Record<string, string | undefined>,
    resolveBinary: () => resolveBinary(),
    runsRoot,
  }
}
