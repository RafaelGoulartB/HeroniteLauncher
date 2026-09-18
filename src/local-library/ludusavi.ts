import { execFile } from 'child_process'
import { existsSync, readFileSync } from 'graceful-fs'
import { homedir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { GameConfig } from 'backend/game_config'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { searchForExecutableOnPath } from 'backend/utils/os/path'
import type { Runner } from 'common/types'
import type {
  LudusaviBackupFormat,
  LudusaviBackupResult,
  LudusaviCompression,
  LudusaviDetectedConfig
} from 'common/types/local-library'
import { getCollectionSettings, recordLudusaviBackup } from './settings'
import { getLocalGameMeta } from './stores'

const execFileAsync = promisify(execFile)

const SKIP_SESSION_SECONDS = 5
const LUDUSAVI_TIMEOUT_MS = 180_000
let backupInFlight = false

let detectCache: {
  at: number
  preferred?: string
  value: LudusaviDetectedConfig | undefined
} | null = null

function yamlGet(text: string, keys: string[]): string | undefined {
  const lines = text.split(/\r?\n/)
  let from = 0
  let indent = 0
  for (let depth = 0; depth < keys.length; depth++) {
    const needle = `${keys[depth]}:`
    let nextFrom = -1
    let nextIndent = indent
    for (let i = from; i < lines.length; i++) {
      const raw = lines[i]
      if (!raw.trim() || raw.trimStart().startsWith('#')) continue
      const currentIndent = raw.match(/^ */)?.[0].length ?? 0
      if (i !== from && currentIndent < indent) return undefined
      if (currentIndent !== indent) continue
      if (!raw.trimStart().startsWith(needle)) continue
      const rest = raw.trimStart().slice(needle.length).trim()
      if (depth === keys.length - 1) {
        if (!rest || rest === '|' || rest === '>') return undefined
        return rest.replace(/^['"]|['"]$/g, '')
      }
      nextFrom = i + 1
      nextIndent = currentIndent + 2
      break
    }
    if (nextFrom < 0) return undefined
    from = nextFrom
    indent = nextIndent
  }
  return undefined
}

function expandHome(value?: string): string | undefined {
  if (!value) return undefined
  if (value === '~') return homedir()
  if (value.startsWith('~/')) return join(homedir(), value.slice(2))
  return value
}

function asFormat(value?: string): LudusaviBackupFormat | undefined {
  return value === 'zip' || value === 'simple' ? value : undefined
}

function asCompression(value?: string): LudusaviCompression | undefined {
  return value === 'none' ||
    value === 'deflate' ||
    value === 'bzip2' ||
    value === 'zstd'
    ? value
    : undefined
}

async function runLudusavi(
  binary: string,
  args: string[]
): Promise<{ stdout: string; stderr: string; code: number }> {
  try {
    const result = await execFileAsync(binary, args, {
      timeout: LUDUSAVI_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
      env: {
        ...process.env,
        PATH: `${process.env.PATH || ''}:/usr/bin:/usr/local/bin`
      }
    })
    return { stdout: result.stdout, stderr: result.stderr, code: 0 }
  } catch (error) {
    const err = error as {
      stdout?: string
      stderr?: string
      code?: number
      message?: string
    }
    if (typeof err.stdout === 'string' || typeof err.stderr === 'string') {
      return {
        stdout: err.stdout ?? '',
        stderr: err.stderr ?? '',
        code: typeof err.code === 'number' ? err.code : 1
      }
    }
    throw new Error(err.message || String(error))
  }
}

function parseJson(text: string): Record<string, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed) as Record<string, unknown>
  } catch {
    return {}
  }
}

function bestFindMatch(payload: Record<string, unknown>): string | undefined {
  const games = payload.games
  if (!games || typeof games !== 'object') return undefined
  let best: { name: string; score: number } | undefined
  for (const [name, info] of Object.entries(
    games as Record<string, { score?: number }>
  )) {
    const score = Number(info?.score ?? 0)
    if (!best || score > best.score) best = { name, score }
  }
  return best?.name
}

async function resolveBinary(preferred?: string): Promise<string | undefined> {
  const candidates = [
    preferred?.trim(),
    await searchForExecutableOnPath('ludusavi'),
    '/usr/bin/ludusavi',
    '/usr/local/bin/ludusavi',
    join(homedir(), '.local', 'bin', 'ludusavi')
  ]
  const paths = candidates.filter(
    (path): path is string => typeof path === 'string' && path.length > 0
  )
  return paths.find((path) => existsSync(path))
}

function winePrefixForLudusavi(prefix?: string): string | undefined {
  if (!prefix) return undefined
  if (existsSync(join(prefix, 'drive_c'))) return prefix
  if (existsSync(join(prefix, 'pfx', 'drive_c'))) return join(prefix, 'pfx')
  return undefined
}

async function extraWinePrefix(appName: string): Promise<string | undefined> {
  const meta = getLocalGameMeta(appName)
  if (meta?.launchKind === 'steam-uri') return undefined
  try {
    const settings = await GameConfig.get(appName).getSettings()
    return winePrefixForLudusavi(settings.winePrefix)
  } catch {
    return undefined
  }
}

export async function detectLudusavi(
  preferredBinary?: string
): Promise<LudusaviDetectedConfig | undefined> {
  if (
    detectCache &&
    detectCache.preferred === preferredBinary &&
    Date.now() - detectCache.at < 30_000
  ) {
    return detectCache.value
  }

  const binary = await resolveBinary(preferredBinary)
  if (!binary) {
    detectCache = {
      at: Date.now(),
      preferred: preferredBinary,
      value: undefined
    }
    return undefined
  }

  let version: string | undefined
  const versionResult = await runLudusavi(binary, ['--version']).catch(
    () => undefined
  )
  const versionText = versionResult?.stdout || versionResult?.stderr || ''
  const versionMatch = versionText.match(/ludusavi\s+([\w.-]+)/i)
  if (versionMatch) version = versionMatch[1]

  const pathResult = await runLudusavi(binary, ['config', 'path']).catch(
    () => undefined
  )
  const configPath =
    pathResult?.stdout.trim() ||
    join(homedir(), '.config', 'ludusavi', 'config.yaml')

  let backupPath: string | undefined
  let format: LudusaviBackupFormat | undefined
  let compression: LudusaviCompression | undefined
  if (existsSync(configPath)) {
    try {
      const yaml = readFileSync(configPath, 'utf-8')
      backupPath = expandHome(yamlGet(yaml, ['backup', 'path']))
      format = asFormat(yamlGet(yaml, ['backup', 'format', 'chosen']))
      compression = asCompression(
        yamlGet(yaml, ['backup', 'format', 'zip', 'compression'])
      )
    } catch (error) {
      logError(
        `Failed to read Ludusavi config: ${String(error)}`,
        LogPrefix.Backend
      )
    }
  }

  const detected: LudusaviDetectedConfig = {
    binary,
    configPath: existsSync(configPath) ? configPath : undefined,
    backupPath,
    format,
    compression,
    version
  }
  detectCache = { at: Date.now(), preferred: preferredBinary, value: detected }
  return detected
}

async function resolveLudusaviTitle(
  binary: string,
  args: {
    title: string
    steamAppId?: string
    storeGameId?: string
    runner: Runner
  }
): Promise<string> {
  const lookups: string[][] = []
  if (args.steamAppId) {
    lookups.push(['find', '--api', '--steam-id', args.steamAppId])
  }
  if (
    args.runner === 'gog' &&
    args.storeGameId &&
    /^\d+$/.test(args.storeGameId)
  ) {
    lookups.push(['find', '--api', '--gog-id', args.storeGameId])
  }
  lookups.push(['find', '--api', args.title])

  for (const lookup of lookups) {
    const result = await runLudusavi(binary, lookup)
    const match = bestFindMatch(parseJson(result.stdout))
    if (match) return match
  }
  return args.title
}

function gameNamesFromPayload(payload: Record<string, unknown>): string[] {
  const games = payload.games
  if (!games || typeof games !== 'object') return []
  return Object.keys(games as Record<string, unknown>)
}

export async function backupLudusaviForGame(args: {
  appName: string
  title: string
  runner: Runner
  steamAppId?: string
  storeGameId?: string
  reason: 'auto' | 'manual'
}): Promise<LudusaviBackupResult> {
  logInfo(
    `Ludusavi ${args.reason} backup requested for ${args.title}`,
    LogPrefix.Backend
  )

  if (backupInFlight) {
    logInfo(
      `Ludusavi backup already running; skipping ${args.title}`,
      LogPrefix.Backend
    )
    return { ran: false, skippedReason: 'already-running' }
  }
  backupInFlight = true

  try {
    const { ludusavi } = getCollectionSettings()
    if (args.reason === 'auto' && !ludusavi.enabled) {
      logInfo('Ludusavi auto backup is disabled', LogPrefix.Backend)
      return { ran: false, skippedReason: 'disabled' }
    }

    const detected = await detectLudusavi(ludusavi.binaryPath)
    const binary = ludusavi.binaryPath.trim() || detected?.binary
    if (!binary || !existsSync(binary)) {
      const error = 'Ludusavi was not found'
      recordLudusaviBackup({ error })
      return { ran: false, skippedReason: 'not-found', error }
    }

    const useInstalled =
      ludusavi.useInstalledConfig && Boolean(detected?.configPath)
    const configuredPath = ludusavi.backupPath.trim()
    const backupRoot = useInstalled
      ? detected?.backupPath
      : configuredPath || detected?.backupPath
    if (!useInstalled && !configuredPath) {
      const error = 'Set a Ludusavi backup folder in Collection settings'
      recordLudusaviBackup({ error })
      return { ran: false, error }
    }

    let gameName = args.title
    const winePrefix = await extraWinePrefix(args.appName)

    const runBackup = async (name: string) => {
      const command = ['backup', '--force', '--api', '--no-cloud-sync']
      if (!useInstalled) {
        command.push('--path', configuredPath)
        command.push('--format', ludusavi.format)
        if (ludusavi.format === 'zip') {
          command.push('--compression', ludusavi.compression)
        }
      }
      if (winePrefix) command.push('--wine-prefix', winePrefix)
      command.push(name)
      logInfo(`Running ${binary} ${command.join(' ')}`, LogPrefix.Backend)
      return runLudusavi(binary, command)
    }

    let result = await runBackup(gameName)
    let payload = parseJson(result.stdout)
    let overall = payload.overall as { totalGames?: number } | undefined
    let totalGames = Number(overall?.totalGames ?? 0)

    if (
      result.code !== 0 &&
      totalGames === 0 &&
      (args.steamAppId || args.runner === 'gog')
    ) {
      gameName = await resolveLudusaviTitle(binary, {
        title: args.title,
        steamAppId: args.steamAppId,
        storeGameId: args.storeGameId,
        runner: args.runner
      })
      if (gameName !== args.title) {
        result = await runBackup(gameName)
        payload = parseJson(result.stdout)
        overall = payload.overall as { totalGames?: number } | undefined
        totalGames = Number(overall?.totalGames ?? 0)
      }
    }

    const matchedNames = gameNamesFromPayload(payload)
    if (matchedNames[0]) gameName = matchedNames[0]
    const backupPath = backupRoot ? join(backupRoot, gameName) : undefined
    const stderr = result.stderr.trim()

    if (result.code !== 0 && totalGames === 0) {
      const error = stderr || `Ludusavi did not find saves for ${args.title}`
      recordLudusaviBackup({ error })
      logError(`Ludusavi backup failed: ${error}`, LogPrefix.Backend)
      return { ran: false, skippedReason: 'no-match', gameName, error }
    }

    recordLudusaviBackup({
      at: new Date().toISOString(),
      game: gameName,
      path: backupPath
    })
    logInfo(
      totalGames === 0
        ? `Ludusavi found no new saves for ${gameName}${
            backupPath ? ` in ${backupPath}` : ''
          }`
        : `Ludusavi backed up ${gameName}${
            backupPath ? ` to ${backupPath}` : ''
          }`,
      LogPrefix.Backend
    )
    return { ran: true, gameName, backupPath, totalGames }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    recordLudusaviBackup({ error: message })
    logError(`Ludusavi backup failed: ${message}`, LogPrefix.Backend)
    return { ran: false, error: message }
  } finally {
    backupInFlight = false
  }
}

export async function backupLudusaviAfterPlay(args: {
  appName: string
  title: string
  runner: Runner
  elapsedSeconds: number
}) {
  logInfo(
    `Ludusavi after-play for ${args.title} (${args.elapsedSeconds}s)`,
    LogPrefix.Backend
  )
  if (args.elapsedSeconds < SKIP_SESSION_SECONDS) {
    logInfo(
      `Skipping Ludusavi auto backup; session was only ${args.elapsedSeconds}s`,
      LogPrefix.Backend
    )
    return
  }
  const meta = getLocalGameMeta(args.appName)
  const result = await backupLudusaviForGame({
    appName: args.appName,
    title: args.title,
    runner: args.runner,
    steamAppId: meta?.steamAppId,
    storeGameId: meta?.storeGameId,
    reason: 'auto'
  })
  if (result.ran) {
    const { notify } = await import('backend/dialog/dialog')
    notify({
      title: 'Ludusavi',
      body: result.backupPath
        ? `Saved ${result.gameName || args.title} to ${result.backupPath}`
        : `Saved a backup for ${result.gameName || args.title}`
    })
  } else if (result.error) {
    logError(
      `Ludusavi save backup after play failed: ${result.error}`,
      LogPrefix.Backend
    )
  }
}
