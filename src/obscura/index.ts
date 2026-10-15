// Public surface of the Obscura opt-in backend.
export {
  DEFAULT_BACKEND,
  BackendError,
  resolveBackend,
  requireExplicitPort,
  buildAttachArgs,
  isLoopbackHost,
  isLoopbackTarget,
  evaluateFixtureMode,
  type BackendName,
  type AttachRequest,
  type FixtureDecision,
} from "./backend.ts"

export {
  LOOPBACK_HOST,
  PORT_POOL_START,
  PORT_POOL_END,
  READY_TIMEOUT_MS,
  SESSION_PREFIX,
  RESERVED_PORTS,
  LauncherError,
  ObscuraLauncher,
  buildServeArgs,
  allocatePort,
  assertPortAllocatable,
  classifyOwnership,
  parseReadyFile,
  type Ledger,
  type ProcessSnapshot,
  type OwnershipVerdict,
  type LauncherDeps,
  type StartOptions,
  type StartResult,
} from "./launcher.ts"

export { createRealDeps, resolveBinary, runsRoot } from "./runtime.ts"

export {
  startBackend,
  listBackend,
  stopBackend,
  attachArgsFor,
  type RunStatus,
} from "./manager.ts"
