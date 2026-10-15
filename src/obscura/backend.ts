// Obscura opt-in backend: selection + transport argument construction.
//
// This module is PURE (no I/O, no spawning). It decides which browser backend a
// request targets and builds the `agent-browser` argument vector for it. Chrome
// remains the default; Obscura is only ever selected by an explicit request.
//
// Security contract enforced here:
//  - Chrome is the default whenever a backend is absent/empty/"chrome".
//  - Obscura attaches through the generic, already-verified `--cdp <port>` path.
//  - Obscura selection requires an EXPLICIT port (never a default).
//  - `--allow-private-network` is decided solely by explicit fixture mode whose
//    declared targets are all loopback. It is never enabled otherwise.

export type BackendName = "chrome" | "obscura"

/** Chrome is the default backend. Absence of a request means Chrome. */
export const DEFAULT_BACKEND: BackendName = "chrome"

export class BackendError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackendError"
  }
}

/**
 * Resolve a requested backend name to a concrete backend.
 * Absent / null / empty / "chrome" -> chrome (default preserved).
 * "obscura" -> obscura. Anything else fails loudly rather than guessing.
 */
export function resolveBackend(requested?: string | null): BackendName {
  if (requested === undefined || requested === null) return DEFAULT_BACKEND
  const value = String(requested).trim().toLowerCase()
  if (value === "") return DEFAULT_BACKEND
  if (value === "chrome") return "chrome"
  if (value === "obscura") return "obscura"
  throw new BackendError(
    `Unknown backend "${requested}". Supported backends: chrome (default), obscura.`,
  )
}

/** Obscura binds loopback only, so the port must be explicit and in range. */
export function requireExplicitPort(port: unknown): number {
  if (port === undefined || port === null || port === "") {
    throw new BackendError("Obscura requires an explicit CDP port (never a default).")
  }
  const n = typeof port === "number" ? port : Number(String(port).trim())
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new BackendError(`Invalid CDP port "${String(port)}". Expected an integer 1-65535.`)
  }
  return n
}

export interface AttachRequest {
  /** Requested backend; absent means chrome. */
  backend?: string | null
  /** Obscura CDP port (required when backend is obscura). */
  port?: number | string | null
  /** Optional agent-browser session name. */
  sessionName?: string | null
}

/**
 * Build the `agent-browser` transport arguments for a backend.
 *
 * chrome  -> [] (or just a --session flag): the unchanged default path.
 * obscura -> ["--auto-connect","false","--cdp",<port>]: the verified generic
 *            CDP attach path. `--auto-connect false` is mandatory, because a
 *            user config with autoConnect:true makes --cdp fail.
 */
export function buildAttachArgs(req: AttachRequest): string[] {
  const backend = resolveBackend(req.backend)
  const args: string[] = []
  if (req.sessionName) {
    const name = String(req.sessionName).trim()
    if (name) args.push("--session", name)
  }
  if (backend === "obscura") {
    const port = requireExplicitPort(req.port)
    args.push("--auto-connect", "false", "--cdp", String(port))
  }
  return args
}

// ---------------------------------------------------------------------------
// Target / fixture-mode policy
// ---------------------------------------------------------------------------

/** True for loopback hosts only (localhost, 127.0.0.0/8, ::1). */
export function isLoopbackHost(host: string): boolean {
  const h = String(host).trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "")
  if (h === "localhost" || h === "::1") return true
  if (h === "127.0.0.1") return true
  // any 127.0.0.0/8 address
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  return !!m
}

export type FixtureDecision =
  | { allowed: true; reason: string }
  | { allowed: false; reason: string }

/**
 * Decide whether `--allow-private-network` may be enabled.
 *
 * It is an all-or-nothing SSRF widening (loopback + RFC1918 + link-local) with
 * no host-scoped allowlist, so it is permitted ONLY when:
 *   1. fixture mode is explicitly requested, AND
 *   2. every declared target really is loopback.
 *
 * Residual risk (documented, not hidden): once enabled, the engine process can
 * in principle reach RFC1918/link-local hosts, and this plugin cannot intercept
 * later navigations the agent issues directly to agent-browser. We narrow the
 * exposure (explicit port, loopback bind, short-lived, opt-in) but do NOT claim
 * a technically enforced navigation allowlist.
 */
export function evaluateFixtureMode(
  fixtureMode: boolean | undefined,
  targets: readonly string[] | undefined,
): FixtureDecision {
  if (!fixtureMode) {
    return { allowed: false, reason: "fixture mode is not enabled (default off)" }
  }
  const list = (targets ?? []).map((t) => String(t).trim()).filter((t) => t.length > 0)
  if (list.length === 0) {
    return {
      allowed: false,
      reason:
        "fixture mode requires at least one declared loopback target; refusing to enable --allow-private-network without verifiable targets",
    }
  }
  for (const target of list) {
    if (!isLoopbackTarget(target)) {
      return {
        allowed: false,
        reason: `fixture mode target is not loopback: ${target}`,
      }
    }
  }
  return { allowed: true, reason: "explicit fixture mode with loopback-only targets" }
}

/** A declared fixture target is allowed only if it is an http(s) loopback URL. */
export function isLoopbackTarget(target: string): boolean {
  let url: URL
  try {
    url = new URL(target)
  } catch {
    return false
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false
  return isLoopbackHost(url.hostname)
}
