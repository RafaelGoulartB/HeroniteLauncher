import { spawn } from 'child_process'
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  statSync,
  watch,
  type FSWatcher
} from 'graceful-fs'
import { logInfo, LogPrefix, logWarning } from 'backend/logger'

const START_TIMEOUT_MS = 90_000
const ALIVE_CHECK_MS = 10_000
const LOG_TAIL_BYTES = 64 * 1024
const STEAM_HELPER_COMM = /^(steam|steamwebhelper|steam-runtime)$/i

let useTailWait = process.platform === 'linux'

type SessionWatch = {
  abort: AbortController
  pids: Set<number>
}

const sessions = new Map<string, SessionWatch>()

function isPidAlive(pid: number): boolean {
  if (!pid || pid <= 1) return false
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function pidCommand(pid: number): string {
  if (process.platform !== 'linux') return ''
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim()
  } catch {
    return ''
  }
}

function isIgnorablePid(pid: number): boolean {
  if (pid === process.pid || !isPidAlive(pid)) return true
  return STEAM_HELPER_COMM.test(pidCommand(pid))
}

function matchesSteamAppId(captured: string, steamAppId: string): boolean {
  if (captured === steamAppId) return true
  const asNumber = Number(captured)
  if (!Number.isFinite(asNumber)) return false
  return String(asNumber % 4294967296) === steamAppId
}

export function parseSteamLogPids(
  chunk: string,
  steamAppId: string
): { added: number[]; removed: number[] } {
  const added: number[] = []
  const removed: number[] = []

  const addedRe =
    /Game process (?:added|updated)\s*:\s*AppID\s+(\d+).*ProcID\s+(\d+)/gi
  const removedRe = /Game process removed:\s*AppID\s+(\d+).*ProcID\s+(\d+)/gi
  const removingRe = /Removing process (\d+) for gameID (\d+)/gi

  let match: RegExpExecArray | null
  while ((match = addedRe.exec(chunk))) {
    if (matchesSteamAppId(match[1], steamAppId)) added.push(Number(match[2]))
  }
  while ((match = removedRe.exec(chunk))) {
    if (matchesSteamAppId(match[1], steamAppId)) removed.push(Number(match[2]))
  }
  while ((match = removingRe.exec(chunk))) {
    if (matchesSteamAppId(match[2], steamAppId)) removed.push(Number(match[1]))
  }

  return { added, removed }
}

function abortableDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true }
    )
  })
}

function waitForPidExit(pid: number, signal: AbortSignal): Promise<void> {
  if (signal.aborted || !isPidAlive(pid)) {
    return Promise.resolve()
  }

  if (!useTailWait) {
    return abortableDelay(ALIVE_CHECK_MS, signal)
  }

  return new Promise((resolve) => {
    const child = spawn('tail', ['--pid', String(pid), '-f', '/dev/null'], {
      stdio: 'ignore'
    })

    const finish = () => {
      signal.removeEventListener('abort', onAbort)
      if (!child.killed) {
        try {
          child.kill('SIGTERM')
        } catch {
          // already gone
        }
      }
      resolve()
    }

    const onAbort = () => finish()
    child.once('exit', finish)
    child.once('error', () => {
      useTailWait = false
      finish()
    })
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function readFileTail(file: string, bytes = LOG_TAIL_BYTES): string {
  const size = statSync(file).size
  const start = Math.max(0, size - bytes)
  const length = size - start
  if (length <= 0) return ''
  const fd = openSync(file, 'r')
  try {
    const buffer = Buffer.alloc(length)
    readSync(fd, buffer, 0, length, start)
    return buffer.toString('utf8')
  } finally {
    closeSync(fd)
  }
}

function watchLogFile(
  file: string,
  onChunk: (chunk: string) => void
): () => void {
  let offset = existsSync(file) ? statSync(file).size : 0
  let watcher: FSWatcher | undefined

  const readNew = () => {
    if (!existsSync(file)) return
    const size = statSync(file).size
    if (size < offset) offset = 0
    if (size === offset) return
    const fd = openSync(file, 'r')
    try {
      const length = size - offset
      const buffer = Buffer.alloc(length)
      readSync(fd, buffer, 0, length, offset)
      offset = size
      onChunk(buffer.toString('utf8'))
    } finally {
      closeSync(fd)
    }
  }

  try {
    watcher = watch(file, () => readNew())
  } catch {
    return () => undefined
  }

  return () => {
    watcher?.close()
  }
}

export function stopLocalPlaytimeWatch(
  appName: string,
  options?: { killProcess?: boolean }
): boolean {
  const session = sessions.get(appName)
  if (!session) return false

  if (!session.abort.signal.aborted) {
    session.abort.abort()
  }

  if (options?.killProcess) {
    for (const pid of session.pids) {
      if (!isPidAlive(pid)) continue
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        // process already gone
      }
    }
  }

  return true
}

export async function forceClearLocalPlaying(
  appName: string,
  runner: import('common/types').Runner
): Promise<void> {
  stopLocalPlaytimeWatch(appName, { killProcess: false })

  const { callAbortController } =
    await import('backend/utils/aborthandler/aborthandler')
  callAbortController(appName)

  const { sendGameStatusUpdate } = await import('backend/utils')
  sendGameStatusUpdate({
    appName,
    runner,
    status: 'done'
  })
}

export function clearLocalPlaytimeWatch(appName: string) {
  sessions.delete(appName)
}

export async function waitForSteamSession(params: {
  appName: string
  steamAppId: string
  signal: AbortSignal
  title: string
  logFiles: string[]
  resolveLogFiles?: () => Promise<string[]>
}): Promise<void> {
  const { appName, steamAppId, signal, title, resolveLogFiles } = params
  const session: SessionWatch = {
    abort: new AbortController(),
    pids: new Set()
  }
  sessions.set(appName, session)

  const onAbort = () => session.abort.abort()
  if (signal.aborted) onAbort()
  else signal.addEventListener('abort', onAbort, { once: true })

  const localSignal = session.abort.signal
  let started = false
  const waiters: Array<() => void> = []
  const changed = () => {
    const pending = waiters.splice(0, waiters.length)
    pending.forEach((resolve) => resolve())
  }

  const applyChunk = (chunk: string) => {
    const { added, removed } = parseSteamLogPids(chunk, steamAppId)
    for (const pid of added) {
      if (isIgnorablePid(pid)) continue
      session.pids.add(pid)
      started = true
    }
    for (const pid of removed) {
      session.pids.delete(pid)
    }
    if (added.length || removed.length) changed()
  }

  const stopWatchers: Array<() => void> = []
  const watchedFiles = new Set<string>()
  const attachLogs = (files: string[]) => {
    for (const file of files) {
      if (watchedFiles.has(file)) continue
      watchedFiles.add(file)
      applyChunk(readFileTail(file))
      stopWatchers.push(watchLogFile(file, applyChunk))
    }
  }
  attachLogs(params.logFiles)

  logInfo(
    `Waiting for ${title} (Steam ${steamAppId}) to start/exit`,
    LogPrefix.Backend
  )

  const waitForChange = () =>
    new Promise<void>((resolve) => {
      if (localSignal.aborted) {
        resolve()
        return
      }
      waiters.push(resolve)
      localSignal.addEventListener('abort', () => resolve(), { once: true })
    })

  try {
    const deadline = Date.now() + START_TIMEOUT_MS
    while (!localSignal.aborted && !started) {
      if (Date.now() >= deadline) {
        logWarning(
          `Steam process for ${title} was not seen; not waiting further`,
          LogPrefix.Backend
        )
        return
      }
      await Promise.race([waitForChange(), abortableDelay(2_000, localSignal)])
      if (resolveLogFiles) {
        attachLogs(await resolveLogFiles())
      }
    }

    while (!localSignal.aborted) {
      for (const pid of [...session.pids]) {
        if (!isPidAlive(pid)) session.pids.delete(pid)
      }
      if (started && session.pids.size === 0) break

      const pidWaits = [...session.pids].map((pid) =>
        waitForPidExit(pid, localSignal)
      )
      await Promise.race([
        waitForChange(),
        abortableDelay(ALIVE_CHECK_MS, localSignal),
        ...pidWaits
      ])
    }
  } finally {
    signal.removeEventListener('abort', onAbort)
    stopWatchers.forEach((stop) => stop())
    clearLocalPlaytimeWatch(appName)
    logInfo(`Stopped waiting for ${title}`, LogPrefix.Backend)
  }
}
