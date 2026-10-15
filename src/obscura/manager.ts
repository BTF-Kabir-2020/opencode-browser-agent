// High-level operations used by the plugin tool. Keeps index.ts thin and
// gives tests a single entry point for lifecycle behaviour.

import { buildAttachArgs } from "./backend.ts"
import {
  LOOPBACK_HOST,
  LauncherError,
  ObscuraLauncher,
  classifyOwnership,
  type LauncherDeps,
  type Ledger,
  type OwnershipVerdict,
  type StartOptions,
  type StartResult,
} from "./launcher.ts"

export interface RunStatus {
  runId: string
  pid: number
  port: number
  host: string
  fixtureMode: boolean
  alive: boolean
  owned: boolean
  reason: string
  runDir: string
}

function allLedgers(deps: LauncherDeps): Ledger[] {
  const out: Ledger[] = []
  const launcher = new ObscuraLauncher(deps)
  for (const runDir of deps.listRunDirs(deps.runsRoot())) {
    const ledger = launcher.loadLedger(runDir)
    if (ledger) out.push(ledger)
  }
  return out
}

export async function startBackend(deps: LauncherDeps, opts: StartOptions = {}): Promise<StartResult> {
  const launcher = new ObscuraLauncher(deps)
  return launcher.start(opts)
}

export function listBackend(deps: LauncherDeps): RunStatus[] {
  return allLedgers(deps).map((ledger) => {
    const snap = deps.processInfo(ledger.pid)
    const verdict = classifyOwnership(ledger, snap)
    return {
      runId: ledger.runId,
      pid: ledger.pid,
      port: ledger.port,
      host: ledger.host,
      fixtureMode: ledger.fixtureMode,
      alive: snap !== null,
      owned: verdict.owned,
      reason: verdict.reason,
      runDir: ledger.runDir,
    }
  })
}

/**
 * Stop owned runs only. When `runId` is given, only that run is considered.
 * Returns one verdict per considered run; non-owned runs are left untouched.
 */
export function stopBackend(deps: LauncherDeps, runId?: string): OwnershipVerdict[] {
  const launcher = new ObscuraLauncher(deps)
  const verdicts: OwnershipVerdict[] = []
  for (const ledger of allLedgers(deps)) {
    if (runId && ledger.runId !== runId) continue
    verdicts.push(launcher.stopLedger(ledger))
  }
  return verdicts
}

/** Pure backend selection: the agent-browser argv an operator should run. */
export function attachArgsFor(deps: LauncherDeps, port?: number, sessionName?: string): string[] {
  if (!Number.isInteger(port)) {
    const owned = listBackend(deps).filter((r) => r.owned && r.alive)
    if (owned.length === 1) port = owned[0].port
    else if (owned.length === 0) throw new LauncherError("No running Obscura run to attach to.")
    else throw new LauncherError(`Multiple Obscura runs are active; specify a port explicitly.`)
  }
  return buildAttachArgs({ backend: "obscura", port, sessionName })
}

export { LOOPBACK_HOST }
