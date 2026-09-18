import { sendFrontendMessage } from 'backend/ipc'
import { logInfo, LogPrefix } from 'backend/logger'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import type { GameInfo } from 'common/types'
import type { LocalGameMeta, LocalLaunchKind } from 'common/types/local-library'
import { pathExists } from './playnite/path-remap'
import { inferredStatusId } from './status'
import {
  findSteamBinary,
  getInstalledSteamAppIds,
  listInstalledSteamGames,
  steamCdnCovers,
  type SteamInstalledGame
} from './steam'
import {
  findMetaBySteamAppId,
  getAllLocalGameMeta,
  getLocalGameMeta,
  upsertLocalGameMeta
} from './stores'
import {
  emulatorExecutablePath,
  emulatorRomInstalled
} from './emulation/launch'

function firstExistingPath(...paths: Array<string | undefined>): string {
  for (const path of paths) {
    if (pathExists(path)) return path!
  }
  return ''
}

function localExecutablePath(game: GameInfo, meta: LocalGameMeta): string {
  return firstExistingPath(meta.remappedExecutable, game.install.executable)
}

function launchKindForLocalExe(existing?: LocalLaunchKind): LocalLaunchKind {
  return existing === 'emulator' ? 'emulator' : 'executable'
}

function looksLikeSteamBinary(path: string): boolean {
  const normalized = path.replaceAll('\\', '/').toLowerCase()
  return (
    path === 'steam' ||
    normalized.endsWith('/steam') ||
    normalized.endsWith('/steam.exe') ||
    normalized.endsWith('/steam.sh')
  )
}

export function applySideloadAppToLocalMeta(game: GameInfo): void {
  const executable = game.install.executable?.trim() || ''
  const existing = getLocalGameMeta(game.app_name)

  if (!executable && !existing) return
  if (
    existing?.launchKind === 'steam-uri' &&
    (!executable || looksLikeSteamBinary(executable))
  ) {
    return
  }

  upsertLocalGameMeta({
    appName: game.app_name,
    runner: 'sideload',
    playniteId: existing?.playniteId ?? `heroic_${game.app_name}`,
    pluginId: existing?.pluginId,
    source: existing?.source ?? 'manual',
    launchKind: executable
      ? launchKindForLocalExe(existing?.launchKind)
      : (existing?.launchKind ?? 'unavailable'),
    steamAppId: existing?.steamAppId,
    storeGameId: existing?.storeGameId,
    title: game.title || existing?.title || game.app_name,
    windowsInstallDirectory: existing?.windowsInstallDirectory,
    windowsExecutable: existing?.windowsExecutable,
    remappedExecutable: executable || undefined,
    launcherArgs: existing?.launcherArgs,
    roms: existing?.roms,
    emulatorName: existing?.emulatorName,
    emulatorId: existing?.emulatorId,
    emulatorProfileId: existing?.emulatorProfileId,
    platformId: existing?.platformId,
    selectedRomPath: existing?.selectedRomPath,
    notes: existing?.notes,
    completionStatusId: existing?.completionStatusId,
    playniteCompletionStatusId: existing?.playniteCompletionStatusId
  })
}

function syncMetaExecutable(meta: LocalGameMeta, executable: string): void {
  if (!executable || executable === (meta.remappedExecutable ?? '')) return
  if (meta.launchKind === 'steam-uri') return

  upsertLocalGameMeta({
    ...meta,
    remappedExecutable: executable,
    launchKind: launchKindForLocalExe(meta.launchKind)
  })
}

function nextInstallState(
  game: GameInfo,
  meta: LocalGameMeta,
  installedSteam: Set<string>,
  steamBin: string | null
): { is_installed: boolean; executable: string } {
  if (meta.launchKind === 'steam-uri') {
    const installed = Boolean(
      meta.steamAppId && installedSteam.has(meta.steamAppId)
    )
    return {
      is_installed: installed,
      executable: installed ? (steamBin ?? 'steam') : ''
    }
  }

  if (meta.launchKind === 'emulator') {
    const executable =
      emulatorExecutablePath(meta) || localExecutablePath(game, meta)
    const romsOk = emulatorRomInstalled(meta)
    const exeOk =
      meta.emulatorId && executable === 'flatpak'
        ? true
        : Boolean(executable && pathExists(executable))
    return {
      is_installed: exeOk && romsOk,
      executable: exeOk ? executable : ''
    }
  }

  const executable = localExecutablePath(game, meta)
  if (meta.launchKind === 'executable' || executable) {
    return {
      is_installed: Boolean(executable),
      executable
    }
  }

  return { is_installed: false, executable: '' }
}

function steamSideloadEntry(
  game: SteamInstalledGame,
  steamBin: string | null
): { gameInfo: GameInfo; meta: LocalGameMeta } {
  const appName = `steam_${game.appId}`
  const covers = steamCdnCovers(game.appId)
  const executable = steamBin ?? 'steam'
  return {
    meta: {
      appName,
      runner: 'sideload',
      playniteId: `steam_${game.appId}`,
      source: 'steam',
      launchKind: 'steam-uri',
      steamAppId: game.appId,
      storeGameId: game.appId,
      title: game.name,
      launcherArgs: `steam://rungameid/${game.appId}`,
      completionStatusId: inferredStatusId(0)
    },
    gameInfo: {
      runner: 'sideload',
      app_name: appName,
      title: game.name,
      art_cover: covers.art_cover,
      art_square: covers.art_square,
      is_installed: true,
      canRunOffline: false,
      is_linux_native: true,
      install: {
        executable,
        platform: 'linux',
        is_dlc: false
      }
    }
  }
}

function knownSteamAppIds(games: GameInfo[]): Set<string> {
  const ids = new Set<string>()
  for (const meta of Object.values(getAllLocalGameMeta())) {
    if (meta.steamAppId) ids.add(meta.steamAppId)
  }
  for (const game of games) {
    const fromName = game.app_name.match(/^steam_(\d+)$/)
    if (fromName) ids.add(fromName[1])
    const meta = getLocalGameMeta(game.app_name)
    if (meta?.steamAppId) ids.add(meta.steamAppId)
  }
  return ids
}

export async function refreshLocalInstallStates(): Promise<void> {
  const games = [...sideloadStore.get('games', [])]
  const installedSteam = await getInstalledSteamAppIds(true)
  const steamBin = await findSteamBinary()
  let updated = 0
  let added = 0

  for (const game of games) {
    const meta = getLocalGameMeta(game.app_name)
    if (!meta) continue

    const next = nextInstallState(game, meta, installedSteam, steamBin)
    syncMetaExecutable(meta, next.executable)
    if (
      next.is_installed === game.is_installed &&
      next.executable === (game.install.executable ?? '')
    ) {
      continue
    }

    game.is_installed = next.is_installed
    game.install = { ...game.install, executable: next.executable }
    updated += 1
  }

  const known = knownSteamAppIds(games)
  for (const steamGame of await listInstalledSteamGames()) {
    if (known.has(steamGame.appId) || findMetaBySteamAppId(steamGame.appId)) {
      continue
    }
    const entry = steamSideloadEntry(steamGame, steamBin)
    games.push(entry.gameInfo)
    upsertLocalGameMeta(entry.meta)
    known.add(steamGame.appId)
    added += 1
  }

  if (!updated && !added) return

  sideloadStore.set('games', games)
  if (updated) {
    logInfo(
      `Updated install state for ${updated} local game(s)`,
      LogPrefix.Backend
    )
  }
  if (added) {
    logInfo(
      `Added ${added} installed Steam game(s) to the local library`,
      LogPrefix.Backend
    )
  }
  sendFrontendMessage('refreshLibrary', 'sideload')
}
