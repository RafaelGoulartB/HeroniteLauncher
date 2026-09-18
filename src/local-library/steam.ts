import { spawn } from 'child_process'
import { parse } from '@node-steam/vdf'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { homedir } from 'os'
import { basename, dirname, join } from 'path'
import type LogWriter from 'backend/logger/log_writer'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { searchForExecutableOnPath } from 'backend/utils/os/path'
import type { GameInfo } from 'common/types'
import type {
  SteamClientUriAction,
  SteamClientUriResult
} from 'common/types/local-library'
import { getLocalGameMeta } from './stores'

const STEAM_INSTALL_CACHE_MS = 15_000
const STEAM_FULLY_INSTALLED = 4

const SKIP_STEAM_APP_IDS = new Set([
  '228980',
  '858280',
  '961940',
  '1070560',
  '1113280',
  '1161040',
  '1245040',
  '1391110',
  '1420170',
  '1493710',
  '1580130',
  '1628350',
  '1826330',
  '1887720',
  '2180100',
  '2230260',
  '2348590',
  '2805730',
  '3658110'
])

export type SteamInstalledGame = {
  appId: string
  name: string
}

type SteamManifest = SteamInstalledGame & {
  fullyInstalled: boolean
}

type AppState = {
  appid?: string | number
  name?: string
  StateFlags?: string | number
}

let steamManifestCache: { at: number; manifests: SteamManifest[] } | null = null

export async function findSteamBinary(): Promise<string | null> {
  const candidates = ['steam', 'steam-runtime']
  for (const name of candidates) {
    const found = await searchForExecutableOnPath(name)
    if (found) return found
  }
  return null
}

export async function isSteamClientAvailable(): Promise<boolean> {
  return Boolean(await findSteamBinary())
}

export function invalidateSteamManifestCache() {
  steamManifestCache = null
}

export async function openSteamClientUri(
  action: SteamClientUriAction,
  steamAppId: string
): Promise<SteamClientUriResult> {
  const steamBin = await findSteamBinary()
  if (!steamBin) {
    logError('Steam client was not found on PATH', LogPrefix.Backend)
    return { ok: false, error: 'Steam client was not found' }
  }

  const uri = `steam://${action}/${steamAppId}`
  logInfo(`Opening Steam via ${uri}`, LogPrefix.Backend)
  invalidateSteamManifestCache()

  return new Promise((resolve) => {
    let settled = false
    const finish = (result: SteamClientUriResult) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const child = spawn(steamBin, [uri], {
      detached: true,
      stdio: 'ignore'
    })
    child.once('error', (error) => {
      logError(
        `Failed to open Steam (${uri}): ${error.message}`,
        LogPrefix.Backend
      )
      finish({ ok: false, error: error.message })
    })
    const onSpawned = () => {
      child.unref()
      finish({ ok: true })
    }
    child.once('spawn', onSpawned)
    if (typeof child.pid === 'number') onSpawned()
  })
}

export async function steamLibraryRoots(): Promise<string[]> {
  const { getSteamLibraries } = await import('backend/utils')
  const fromHeroic = await getSteamLibraries()
  const extras = [
    join(homedir(), '.steam', 'steam'),
    join(homedir(), '.local', 'share', 'Steam')
  ]
  return [...new Set([...fromHeroic, ...extras])].filter((path) =>
    existsSync(path)
  )
}

function isNonGameSteamApp(name: string, appId: string): boolean {
  if (SKIP_STEAM_APP_IDS.has(appId)) return true
  return (
    /^(proton(\s|$|\d)|steam linux runtime|steamworks common redistributables|steam runtime)/i.test(
      name
    ) ||
    /\b(proton experimental|proton hotfix|easyanticheat runtime|battleye runtime)\b/i.test(
      name
    ) ||
    /\b(dedicated server|sdk|soundtrack|ost)\b/i.test(name)
  )
}

function parseAppManifest(
  file: string,
  fallbackAppId: string
): SteamManifest | undefined {
  try {
    const parsed = parse(readFileSync(file, 'utf-8')) as {
      AppState?: AppState
    }
    const state = parsed.AppState
    const appId = String(state?.appid ?? fallbackAppId)
    if (!appId) return undefined
    const flags = Number(state?.StateFlags ?? STEAM_FULLY_INSTALLED)
    return {
      appId,
      name: String(state?.name ?? '').trim(),
      fullyInstalled: (flags & STEAM_FULLY_INSTALLED) === STEAM_FULLY_INSTALLED
    }
  } catch {
    return {
      appId: fallbackAppId,
      name: '',
      fullyInstalled: true
    }
  }
}

async function readSteamManifests(force = false): Promise<SteamManifest[]> {
  if (
    !force &&
    steamManifestCache &&
    Date.now() - steamManifestCache.at < STEAM_INSTALL_CACHE_MS
  ) {
    return steamManifestCache.manifests
  }

  const manifests: SteamManifest[] = []
  const seen = new Set<string>()

  for (const library of await steamLibraryRoots()) {
    const steamapps = join(library, 'steamapps')
    if (!existsSync(steamapps)) continue
    try {
      for (const file of readdirSync(steamapps)) {
        const match = file.match(/^appmanifest_(\d+)\.acf$/i)
        if (!match) continue
        const parsed = parseAppManifest(join(steamapps, file), match[1])
        if (!parsed || seen.has(parsed.appId)) continue
        seen.add(parsed.appId)
        manifests.push(parsed)
      }
    } catch {
      // Unreadable library folder — skip
    }
  }

  steamManifestCache = { at: Date.now(), manifests }
  return manifests
}

export async function getInstalledSteamAppIds(
  force = false
): Promise<Set<string>> {
  const manifests = await readSteamManifests(force)
  return new Set(
    manifests.filter((item) => item.fullyInstalled).map((item) => item.appId)
  )
}

export async function listInstalledSteamGames(
  force = false
): Promise<SteamInstalledGame[]> {
  const manifests = await readSteamManifests(force)
  return manifests.filter(
    (item) =>
      item.fullyInstalled &&
      item.name &&
      !isNonGameSteamApp(item.name, item.appId)
  )
}

export function steamCdnCovers(appId: string): {
  art_cover: string
  art_square: string
} {
  return {
    art_square: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`,
    art_cover: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`
  }
}

export async function isSteamAppInstalled(appId: string): Promise<boolean> {
  if (!appId) return false
  const ids = await getInstalledSteamAppIds()
  return ids.has(appId)
}

export async function getSteamLogFiles(): Promise<string[]> {
  const names = ['console_log.txt', 'console-linux.txt', 'console-windows.txt']
  const dirs = new Set<string>()
  for (const root of await steamLibraryRoots()) {
    dirs.add(join(root, 'logs'))
  }
  dirs.add(join(homedir(), '.steam', 'steam', 'logs'))
  dirs.add(join(homedir(), '.local', 'share', 'Steam', 'logs'))

  const files: string[] = []
  for (const dir of dirs) {
    for (const name of names) {
      const file = join(dir, name)
      if (existsSync(file)) files.push(file)
    }
  }
  return [...new Set(files)]
}

export function isSteamUriGame(appName: string): boolean {
  const meta = getLocalGameMeta(appName)
  return meta?.launchKind === 'steam-uri' && Boolean(meta.steamAppId)
}

export async function tryLaunchLocalGame(
  gameInfo: GameInfo,
  logWriter: LogWriter,
  extraArgs: string[] = []
): Promise<boolean | null> {
  const { tryLaunchEmulatedGame } = await import('./emulation/launch')
  const emulated = await tryLaunchEmulatedGame(gameInfo, logWriter, extraArgs)
  if (emulated !== null) return emulated

  const meta = getLocalGameMeta(gameInfo.app_name)
  if (!meta || meta.launchKind !== 'steam-uri' || !meta.steamAppId) {
    return null
  }

  const steamBin = await findSteamBinary()
  if (!steamBin) {
    await logWriter.logError('Steam client was not found on PATH')
    return false
  }

  const uri = `steam://rungameid/${meta.steamAppId}`
  logInfo(`Launching ${gameInfo.title} via ${uri}`, LogPrefix.Backend)

  const { callRunner } = await import('backend/launcher')
  const result = await callRunner(
    [uri, ...extraArgs],
    {
      name: 'sideload',
      logPrefix: LogPrefix.Sideload,
      bin: basename(steamBin),
      dir: dirname(steamBin)
    },
    {
      abortId: gameInfo.app_name,
      logWriters: [logWriter],
      logMessagePrefix: LogPrefix.Sideload
    }
  )

  if (result.error || result.abort) {
    return !result.error && !result.abort
  }

  const { sendGameStatusUpdate } = await import('backend/utils')
  sendGameStatusUpdate({
    appName: gameInfo.app_name,
    runner: 'sideload',
    status: 'playing'
  })

  const { createAbortController, deleteAbortController } =
    await import('backend/utils/aborthandler/aborthandler')
  const { waitForSteamSession } = await import('./playtime-watch')

  const abortController = createAbortController(gameInfo.app_name)
  try {
    await waitForSteamSession({
      appName: gameInfo.app_name,
      steamAppId: meta.steamAppId,
      signal: abortController.signal,
      title: gameInfo.title,
      logFiles: await getSteamLogFiles(),
      resolveLogFiles: getSteamLogFiles
    })
  } finally {
    deleteAbortController(gameInfo.app_name)
  }

  return true
}

export async function tryStopLocalGame(appName: string): Promise<boolean> {
  const { tryStopEmulatedGame } = await import('./emulation/launch')
  if (await tryStopEmulatedGame(appName)) return true
  if (!isSteamUriGame(appName)) return false
  const { stopLocalPlaytimeWatch } = await import('./playtime-watch')
  stopLocalPlaytimeWatch(appName)
  return true
}
