import { basename, dirname } from 'path'
import { access, chmod } from 'fs/promises'
import {
  closeSync,
  constants as FS_CONSTANTS,
  existsSync,
  openSync,
  readSync,
  statSync
} from 'graceful-fs'
import { split as shellSplit } from 'shlex'
import type LogWriter from 'backend/logger/log_writer'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { GameConfig } from 'backend/game_config'
import { isLinux } from 'backend/constants/environment'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import type { GameInfo, GameSettings } from 'common/types'
import type {
  LocalExecutableKind,
  LocalGameMeta,
  LocalLaunchInfo,
  LocalLaunchOptionsPatch,
  LocalRunAs
} from 'common/types/local-library'
import { getLocalGameMeta, upsertLocalGameMeta } from './stores'

const WINDOWS_EXTENSIONS = ['.exe', '.bat', '.cmd', '.com', '.msi', '.lnk']
const LINUX_EXTENSIONS = ['.sh', '.appimage', '.x86_64', '.x86', '.run']

function readHead(path: string, size: number): Buffer | null {
  let fd: number | undefined
  try {
    if (!statSync(path).isFile()) return null
    fd = openSync(path, 'r')
    const buffer = Buffer.alloc(size)
    const read = readSync(fd, buffer, 0, size, 0)
    return buffer.subarray(0, read)
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Linux: ELF (AppImages included) or a `#!` script; Windows: an MZ binary or a Windows extension. */
export function detectExecutableKind(path?: string): LocalExecutableKind {
  if (!path) return 'unknown'
  const lower = path.toLowerCase()
  if (WINDOWS_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'windows'
  const head = readHead(path, 4)
  if (head && head.length >= 2) {
    if (head.length === 4 && head.toString('latin1') === '\x7fELF')
      return 'linux'
    if (head[0] === 0x23 && head[1] === 0x21) return 'linux'
    if (head[0] === 0x4d && head[1] === 0x5a) return 'windows'
  }
  if (LINUX_EXTENSIONS.some((ext) => lower.endsWith(ext))) return 'linux'
  return 'unknown'
}

/** Local executables only: emulators and Steam URIs launch their own way. */
function isExecutableGame(game: GameInfo, meta?: LocalGameMeta): boolean {
  if (game.runner !== 'sideload') return false
  if (game.browserUrl || game.install.platform === 'Browser') return false
  return meta?.launchKind !== 'emulator' && meta?.launchKind !== 'steam-uri'
}

export function effectivePlatform(
  game: GameInfo,
  meta: LocalGameMeta | undefined,
  executable = game.install.executable
): 'linux' | 'windows' {
  const runAs = meta?.runAs ?? 'auto'
  if (runAs !== 'auto') return runAs
  const detected = detectExecutableKind(executable)
  if (detected !== 'unknown') return detected
  return game.install.platform?.toLowerCase() === 'linux' ? 'linux' : 'windows'
}

function findSideloadGame(appName: string): GameInfo | undefined {
  return sideloadStore
    .get('games', [])
    .find((item) => item.app_name === appName)
}

/**
 * Keeps the sideload entry's platform in line with the Collection choice. Heroic's
 * own dialogs start at Windows on Linux, so saving one used to run Linux files in Wine.
 */
function syncSideloadPlatform(
  appName: string,
  platform: 'linux' | 'windows',
  executable?: string
): GameInfo | undefined {
  const games = sideloadStore.get('games', [])
  const index = games.findIndex((item) => item.app_name === appName)
  if (index < 0) return undefined
  const current = games[index]
  const wanted = platform === 'linux' ? 'linux' : 'Windows'
  const nextExecutable = executable ?? current.install.executable
  if (
    current.install.platform === wanted &&
    Boolean(current.is_linux_native) === (platform === 'linux') &&
    current.install.executable === nextExecutable
  ) {
    return current
  }
  const next: GameInfo = {
    ...current,
    is_linux_native: platform === 'linux',
    folder_name: nextExecutable ? dirname(nextExecutable) : current.folder_name,
    install: {
      ...current.install,
      executable: nextExecutable,
      platform: wanted
    }
  }
  games[index] = next
  sideloadStore.set('games', games)
  logInfo(
    `Collection: ${current.title} runs as ${wanted} (${nextExecutable ?? 'no executable'})`,
    LogPrefix.Backend
  )
  return next
}

/** After Heroic's add/edit dialog saves a Local game: keep the platform the file needs. */
export function syncLocalExecutablePlatform(game: GameInfo): void {
  const meta = getLocalGameMeta(game.app_name)
  if (!isLinux || !isExecutableGame(game, meta)) return
  if (!game.install.executable) return
  syncSideloadPlatform(game.app_name, effectivePlatform(game, meta))
}

export function getLocalLaunchInfo(appName: string): LocalLaunchInfo | null {
  const game = findSideloadGame(appName)
  if (!game) return null
  const meta = getLocalGameMeta(appName)
  if (!isExecutableGame(game, meta)) return null
  const executable = game.install.executable ?? ''
  return {
    appName,
    executable,
    exists: Boolean(executable) && existsSync(executable),
    detected: detectExecutableKind(executable),
    runAs: meta?.runAs ?? 'auto',
    effective: effectivePlatform(game, meta)
  }
}

export function setLocalLaunchOptions(
  patch: LocalLaunchOptionsPatch
): LocalLaunchInfo | null {
  const game = findSideloadGame(patch.appName)
  if (!game) return null
  const meta = getLocalGameMeta(patch.appName)
  if (!isExecutableGame(game, meta)) return null
  const executable = patch.executable?.trim() || game.install.executable
  const runAs: LocalRunAs = patch.runAs ?? meta?.runAs ?? 'auto'
  if (meta) {
    upsertLocalGameMeta({
      ...meta,
      runAs,
      remappedExecutable: executable || meta.remappedExecutable,
      launchKind: executable ? 'executable' : meta.launchKind
    })
  }
  const nextMeta = getLocalGameMeta(patch.appName)
  const platform = effectivePlatform(
    { ...game, install: { ...game.install, executable } },
    nextMeta ?? { ...(meta as LocalGameMeta), runAs },
    executable
  )
  syncSideloadPlatform(patch.appName, platform, executable)
  return getLocalLaunchInfo(patch.appName)
}

async function appSettings(appName: string): Promise<GameSettings> {
  return (
    GameConfig.get(appName).config ||
    (await GameConfig.get(appName).getSettings())
  )
}

/**
 * Runs a Local game whose executable is a Linux program directly, with Heroic's own
 * wrappers (MangoHud, GameMode, Gamescope, user wrappers) and environment. Heroic's
 * native path also adds umu whenever the game's Wine version is Proton, which starts a
 * Linux program through Proton inside the Steam Runtime; here umu is used only when the
 * game asks for the Steam Runtime. Returns null for games that are not Linux executables.
 */
export async function tryLaunchNativeLocalGame(
  gameInfo: GameInfo,
  logWriter: LogWriter,
  args: string[] = []
): Promise<boolean | null> {
  if (!isLinux) return null
  const meta = getLocalGameMeta(gameInfo.app_name)
  if (!isExecutableGame(gameInfo, meta)) return null

  const appName = gameInfo.app_name
  const gameSettings = await appSettings(appName)
  let executable = gameSettings.targetExe || gameInfo.install.executable
  if (!executable) return null
  if (effectivePlatform(gameInfo, meta, executable) !== 'linux') {
    syncSideloadPlatform(appName, 'windows')
    return null
  }
  const nativeInfo =
    syncSideloadPlatform(appName, 'linux') ??
    ({
      ...gameInfo,
      is_linux_native: true,
      install: { ...gameInfo.install, platform: 'linux' }
    } as GameInfo)

  if (!existsSync(executable)) {
    await logWriter.logError(`Executable not found: ${executable}`)
    return false
  }

  const {
    prepareLaunch,
    launchCleanup,
    setupEnvVars,
    setupWrapperEnvVars,
    setupWrappers,
    callRunner,
    getKnownFixesEnvVariables
  } = await import('backend/launcher')
  const { sendGameStatusUpdate } = await import('backend/utils')
  const { showDialogBoxModalAuto } = await import('backend/dialog/dialog')
  const i18next = (await import('i18next')).default

  const useSteamRuntime = Boolean(gameSettings.steamRuntime)
  const prepSettings: GameSettings = useSteamRuntime
    ? gameSettings
    : { ...gameSettings, disableUMU: true }
  const {
    success,
    failureReason,
    rpcClient,
    mangoHudCommand,
    gameScopeCommand,
    gameModeBin,
    steamRuntime
  } = await prepareLaunch(prepSettings, logWriter, nativeInfo, true)

  const wrappers = setupWrappers(
    gameSettings,
    mangoHudCommand,
    gameModeBin,
    gameScopeCommand,
    useSteamRuntime && steamRuntime?.length ? [...steamRuntime] : undefined
  )

  if (!success) {
    void logWriter.logError(['Launch aborted:', failureReason])
    launchCleanup()
    showDialogBoxModalAuto({
      title: i18next.t('box.error.launchAborted', 'Launch aborted'),
      message: failureReason!,
      type: 'ERROR'
    })
    return false
  }

  sendGameStatusUpdate({ appName, runner: 'sideload', status: 'playing' })

  const extraArgs = [...shellSplit(gameSettings.launcherArgs ?? ''), ...args]
  logInfo(
    `Collection: launching Linux executable ${executable} ${extraArgs.join(' ')}`,
    LogPrefix.Backend
  )

  try {
    await access(executable, FS_CONSTANTS.X_OK)
  } catch {
    logWarning('File not executable, making it executable', LogPrefix.Backend)
    await chmod(executable, 0o775)
  }

  const env = {
    ...setupWrapperEnvVars({ appName, appRunner: 'sideload' }),
    ...setupEnvVars(gameSettings, gameInfo.install.install_path),
    ...getKnownFixesEnvVariables(appName, 'sideload')
  }

  if (wrappers.length > 0) {
    extraArgs.unshift(...wrappers, executable)
    executable = extraArgs.shift()!
  }

  await callRunner(
    extraArgs,
    {
      name: 'sideload',
      logPrefix: LogPrefix.Backend,
      bin: basename(executable),
      dir: dirname(executable)
    },
    {
      env,
      wrappers,
      logWriters: [logWriter],
      logMessagePrefix: LogPrefix.Backend
    }
  )

  launchCleanup(rpcClient)
  return true
}
