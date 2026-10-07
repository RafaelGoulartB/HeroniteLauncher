import { existsSync } from 'graceful-fs'
import { join } from 'path'
import { GameConfig } from 'backend/game_config'
import { sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { tsStore } from 'backend/constants/key_value_stores'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import { libraryStore as legendaryStore } from 'backend/storeManagers/legendary/electronStores'
import { libraryStore as gogStore } from 'backend/storeManagers/gog/electronStores'
import type { GameInfo } from 'common/types'
import type {
  DriveRemap,
  LocalGameMeta,
  PlayniteImportArgs,
  PlayniteImportPreview,
  PlayniteImportResult,
  PlayniteMergePreview,
  PlaynitePreviewArgs
} from 'common/types/local-library'
import { fetchCoversForGame } from './covers'
import { seedPlayniteMetadata } from './metadata'
import {
  mapPlayniteGame,
  MappedPlayniteGame,
  normalizeTitle,
  playniteSessionsToLocal
} from './playnite/mapper'
import { collectWindowsDrives } from './playnite/path-remap'
import { loadPlayniteLibrary, PlayniteGame } from './playnite/reader'
import { ensurePlayniteEmulator } from './emulation/playnite'
import {
  findMetaByPlayniteId,
  countNewLocalSessions,
  mergeLocalSessions,
  upsertLocalGameMeta
} from './stores'
import { findSteamBinary, isSteamAppInstalled } from './steam'
import {
  inferredStatusId,
  mergeGameCompletionStatus,
  mergePlayniteStatuses,
  setLastPlayniteLibraryPath,
  setLastPlayniteDriveMap,
  statusIdForPlaynite,
  getLastPlayniteLibraryPath,
  getLastPlayniteDriveMap,
  getCompletionStatuses,
  resolvePlayniteStatusId,
  decideStatusMerge
} from './status'

function upsertSideloadGame(game: GameInfo) {
  const current = sideloadStore.get('games', [])
  const index = current.findIndex((item) => item.app_name === game.app_name)
  if (index >= 0) {
    current[index] = { ...current[index], ...game }
  } else {
    current.push(game)
  }
  sideloadStore.set('games', current)
}

function storeGames(runner: 'legendary' | 'gog'): GameInfo[] {
  if (runner === 'legendary') {
    return legendaryStore.get('library', [])
  }
  return gogStore.get('games', [])
}

function matchStoreGame(
  mapped: MappedPlayniteGame,
  runner: 'legendary' | 'gog'
): GameInfo | undefined {
  const games = storeGames(runner)
  const storeId = mapped.meta.storeGameId
  if (storeId) {
    const byId = games.find(
      (game) => game.app_name.toLowerCase() === storeId.toLowerCase()
    )
    if (byId) return byId
  }
  const title = normalizeTitle(mapped.meta.title)
  return games.find((game) => normalizeTitle(game.title) === title)
}

function collectPaths(game: PlayniteGame): string[] {
  return [
    game.installDirectory,
    ...game.gameActions.map((action) => action.path),
    ...game.roms.map((rom) => rom.path)
  ].filter((item): item is string => Boolean(item))
}

function writePlaytime(
  appName: string,
  playtimeMinutes: number,
  firstPlayed?: string,
  lastPlayed?: string
) {
  const existing = tsStore.get_nodefault(appName)
  const totalPlayed = Math.max(existing?.totalPlayed ?? 0, playtimeMinutes)
  const first =
    [existing?.firstPlayed, firstPlayed]
      .filter((value): value is string => Boolean(value))
      .sort()[0] ??
    firstPlayed ??
    ''
  const last =
    [existing?.lastPlayed, lastPlayed]
      .filter((value): value is string => Boolean(value))
      .sort()
      .at(-1) ??
    lastPlayed ??
    ''

  tsStore.set(appName, {
    firstPlayed: first,
    lastPlayed: last,
    totalPlayed
  })
}

async function applyLauncherArgs(appName: string, launcherArgs?: string) {
  if (!launcherArgs) return
  const config = GameConfig.get(appName)
  const settings = await config.getSettings()
  config.config = { ...settings, launcherArgs }
  config.flush()
}

function mergeExistingMeta(
  existed: LocalGameMeta,
  incoming: LocalGameMeta
): LocalGameMeta {
  return {
    ...existed,
    title: incoming.title || existed.title,
    notes: incoming.notes ?? existed.notes,
    pluginId: incoming.pluginId ?? existed.pluginId,
    source: incoming.source,
    steamAppId: incoming.steamAppId ?? existed.steamAppId,
    storeGameId: incoming.storeGameId ?? existed.storeGameId,
    windowsInstallDirectory: incoming.windowsInstallDirectory,
    windowsExecutable: incoming.windowsExecutable,
    remappedExecutable:
      incoming.remappedExecutable ?? existed.remappedExecutable,
    launcherArgs: incoming.launcherArgs ?? existed.launcherArgs,
    roms: incoming.roms ?? existed.roms,
    emulatorName: incoming.emulatorName ?? existed.emulatorName,
    emulatorId: incoming.emulatorId ?? existed.emulatorId,
    emulatorProfileId: incoming.emulatorProfileId ?? existed.emulatorProfileId,
    platformId: incoming.platformId ?? existed.platformId,
    playniteCompletionStatusId: incoming.playniteCompletionStatusId,
    completionStatusId: incoming.completionStatusId
  }
}

function destinationFor(
  mapped: MappedPlayniteGame
): PlayniteImportPreview['games'][number]['destination'] {
  if (mapped.destination === 'legendary') {
    return matchStoreGame(mapped, 'legendary') ? 'legendary' : 'skip'
  }
  if (mapped.destination === 'gog') {
    return matchStoreGame(mapped, 'gog') ? 'gog' : 'skip'
  }
  return mapped.destination
}

export function previewPlayniteImport(
  args: PlaynitePreviewArgs
): PlayniteImportPreview {
  const libraryPath = args.libraryPath
  if (!existsSync(join(libraryPath, 'games.db'))) {
    return {
      libraryPath,
      playniteRoot: libraryPath,
      gameCount: 0,
      sessionFileCount: 0,
      detectedDrives: [],
      games: [],
      counts: {
        steam: 0,
        emulator: 0,
        manual: 0,
        xbox: 0,
        amazon: 0,
        other: 0,
        epicMatch: 0,
        gogMatch: 0,
        skippedStore: 0
      },
      errors: ['games.db was not found in the selected folder']
    }
  }

  const dump = loadPlayniteLibrary(libraryPath)
  const games: PlayniteImportPreview['games'] = []
  const counts: PlayniteImportPreview['counts'] = {
    steam: 0,
    emulator: 0,
    manual: 0,
    xbox: 0,
    amazon: 0,
    other: 0,
    epicMatch: 0,
    gogMatch: 0,
    skippedStore: 0
  }

  for (const game of dump.games) {
    const sessions = playniteSessionsToLocal(game.id, dump.sessionsByGameId)
    const mapped = mapPlayniteGame(game, dump.emulators, sessions, [])
    const destination = destinationFor(mapped)

    if (mapped.meta.source === 'steam') counts.steam += 1
    else if (mapped.meta.source === 'emulator') counts.emulator += 1
    else if (mapped.meta.source === 'manual') counts.manual += 1
    else if (mapped.meta.source === 'xbox') counts.xbox += 1
    else if (mapped.meta.source === 'amazon') counts.amazon += 1
    else if (mapped.meta.source === 'epic' && destination === 'legendary')
      counts.epicMatch += 1
    else if (mapped.meta.source === 'gog' && destination === 'gog')
      counts.gogMatch += 1
    else if (destination === 'skip') counts.skippedStore += 1
    else counts.other += 1

    games.push({
      playniteId: game.id,
      title: game.name,
      source: mapped.meta.source,
      destination,
      playtimeMinutes: mapped.playtimeMinutes,
      sessionCount: sessions.length,
      alreadyImported: Boolean(findMetaByPlayniteId(game.id)),
      matchedAppName:
        destination === 'legendary'
          ? matchStoreGame(mapped, 'legendary')?.app_name
          : destination === 'gog'
            ? matchStoreGame(mapped, 'gog')?.app_name
            : mapped.meta.appName
    })
  }

  return {
    libraryPath: dump.libraryPath,
    playniteRoot: dump.playniteRoot,
    gameCount: dump.games.length,
    sessionFileCount: Object.keys(dump.sessionsByGameId).length,
    detectedDrives: collectWindowsDrives(dump.games.flatMap(collectPaths)),
    games,
    counts,
    errors: []
  }
}

export async function importPlayniteLibrary(
  args: PlayniteImportArgs
): Promise<PlayniteImportResult> {
  const result: PlayniteImportResult = {
    imported: 0,
    updated: 0,
    matchedStore: 0,
    skipped: 0,
    coversFetched: 0,
    sessionsImported: 0,
    errors: []
  }

  const dump = loadPlayniteLibrary(args.libraryPath)
  const driveMap: DriveRemap[] = args.driveMap ?? []
  const steamBin = await findSteamBinary()
  mergePlayniteStatuses(dump.completionStatuses)
  setLastPlayniteLibraryPath(dump.libraryPath)
  setLastPlayniteDriveMap(driveMap)

  logInfo(
    `Importing Playnite library from ${args.libraryPath} (${dump.games.length} games)`,
    LogPrefix.Backend
  )

  for (const game of dump.games) {
    try {
      const sessions = playniteSessionsToLocal(game.id, dump.sessionsByGameId)
      const mapped = mapPlayniteGame(game, dump.emulators, sessions, driveMap)
      if (mapped.meta.launchKind === 'emulator' && mapped.meta.emulatorId) {
        const playniteEmu = dump.emulators.find(
          (item) => item.id === mapped.meta.emulatorId
        )
        if (playniteEmu) {
          const user = ensurePlayniteEmulator(playniteEmu, driveMap)
          if (user) {
            mapped.meta.emulatorId = user.id
            mapped.meta.emulatorProfileId =
              user.profiles.find(
                (item) => item.id === mapped.meta.emulatorProfileId
              )?.id ?? user.profiles[0]?.id
            mapped.meta.emulatorName = user.name
            mapped.meta.remappedExecutable = user.executable
          }
        }
      }
      const destination = destinationFor(mapped)
      const existed = findMetaByPlayniteId(game.id)
      mapped.meta.completionStatusId = existed
        ? mergeGameCompletionStatus(
            existed,
            mapped.meta.playniteCompletionStatusId,
            mapped.playtimeMinutes
          )
        : mapped.meta.playniteCompletionStatusId
          ? statusIdForPlaynite(mapped.meta.playniteCompletionStatusId)
          : inferredStatusId(mapped.playtimeMinutes)

      if (existed) {
        mapped.meta = args.mergeExisting
          ? mergeExistingMeta(existed, mapped.meta)
          : {
              ...existed,
              ...mapped.meta,
              completionStatusId: mapped.meta.completionStatusId,
              playniteCompletionStatusId: mapped.meta.playniteCompletionStatusId
            }
      }

      if (destination === 'skip' && !existed) {
        result.skipped += 1
        continue
      }

      if (args.mergeExisting && existed) {
        upsertLocalGameMeta(mapped.meta)
        writePlaytime(
          mapped.meta.appName,
          mapped.playtimeMinutes,
          mapped.firstPlayed,
          mapped.lastPlayed
        )
        mergeLocalSessions(mapped.meta.appName, mapped.sessions)
        await seedPlayniteMetadata({
          appName: mapped.meta.appName,
          runner: mapped.meta.runner,
          game,
          libraryPath: dump.libraryPath
        })
        result.sessionsImported += mapped.sessions.length
        result.updated += 1
        if (
          mapped.meta.runner === 'legendary' ||
          mapped.meta.runner === 'gog'
        ) {
          result.matchedStore += 1
        }
        continue
      }

      if (destination === 'skip') {
        result.skipped += 1
        continue
      }

      if (destination === 'legendary' || destination === 'gog') {
        const matched = matchStoreGame(mapped, destination)
        if (!matched) {
          result.skipped += 1
          continue
        }
        mapped.meta.appName = matched.app_name
        mapped.meta.runner = destination
        upsertLocalGameMeta(mapped.meta)
        writePlaytime(
          matched.app_name,
          mapped.playtimeMinutes,
          mapped.firstPlayed,
          mapped.lastPlayed
        )
        mergeLocalSessions(matched.app_name, mapped.sessions)
        await seedPlayniteMetadata({
          appName: mapped.meta.appName,
          runner: mapped.meta.runner,
          game,
          libraryPath: dump.libraryPath
        })
        result.sessionsImported += mapped.sessions.length
        result.matchedStore += 1
        continue
      }

      if (!mapped.gameInfo) {
        result.skipped += 1
        continue
      }

      if (mapped.meta.launchKind === 'steam-uri') {
        const steamInstalled = mapped.meta.steamAppId
          ? await isSteamAppInstalled(mapped.meta.steamAppId)
          : false
        mapped.gameInfo.is_installed = steamInstalled
        mapped.gameInfo.is_linux_native = true
        mapped.gameInfo.install.executable = steamInstalled
          ? (steamBin ?? 'steam')
          : ''
      }

      if (args.fetchCovers !== false && !(args.mergeExisting && existed)) {
        const covers = await fetchCoversForGame(mapped.meta, mapped.gameInfo)
        if (covers.art_cover || covers.art_square) {
          mapped.gameInfo = { ...mapped.gameInfo, ...covers }
          result.coversFetched += 1
        }
      }

      upsertSideloadGame(mapped.gameInfo)
      upsertLocalGameMeta(mapped.meta)
      writePlaytime(
        mapped.meta.appName,
        mapped.playtimeMinutes,
        mapped.firstPlayed,
        mapped.lastPlayed
      )
      mergeLocalSessions(mapped.meta.appName, mapped.sessions)
      await seedPlayniteMetadata({
        appName: mapped.meta.appName,
        runner: mapped.meta.runner,
        game,
        libraryPath: dump.libraryPath
      })
      if (mapped.meta.launchKind !== 'emulator') {
        await applyLauncherArgs(mapped.meta.appName, mapped.meta.launcherArgs)
      }
      result.sessionsImported += mapped.sessions.length
      if (existed) result.updated += 1
      else result.imported += 1
    } catch (error) {
      const message = `Failed to import ${game.name}: ${String(error)}`
      logError(message, LogPrefix.Backend)
      result.errors.push(message)
    }
  }

  sendFrontendMessage('refreshLibrary', 'sideload')
  const { clearPlayniteDumpCache } = await import('./metadata/sources')
  clearPlayniteDumpCache()
  return result
}

export async function mergePlayniteLibrary(): Promise<PlayniteImportResult> {
  const libraryPath = getLastPlayniteLibraryPath()
  if (!libraryPath || !existsSync(join(libraryPath, 'games.db'))) {
    return {
      imported: 0,
      updated: 0,
      matchedStore: 0,
      skipped: 0,
      coversFetched: 0,
      sessionsImported: 0,
      errors: [
        'No Playnite library path is saved. Import a library first, then merge.'
      ]
    }
  }

  logInfo(`Merging Playnite library from ${libraryPath}`, LogPrefix.Backend)
  return importPlayniteLibrary({
    libraryPath,
    driveMap: getLastPlayniteDriveMap(),
    fetchCovers: true,
    mergeExisting: true
  })
}

function emptyMergePreview(errors: string[]): PlayniteMergePreview {
  return {
    libraryPath: '',
    newGames: [],
    playtimeUpdates: [],
    statusFromPlaynite: [],
    statusConflicts: [],
    newSessions: 0,
    unchanged: 0,
    skipped: 0,
    errors
  }
}

export function previewPlayniteMerge(): PlayniteMergePreview {
  const libraryPath = getLastPlayniteLibraryPath()
  if (!libraryPath || !existsSync(join(libraryPath, 'games.db'))) {
    return emptyMergePreview([
      'No Playnite library path is saved. Import a library first, then merge.'
    ])
  }

  const dump = loadPlayniteLibrary(libraryPath)
  const driveMap = getLastPlayniteDriveMap()
  const statuses = getCompletionStatuses()
  const nameOf = (id?: string) =>
    statuses.find((item) => item.id === id)?.name ?? id ?? ''
  const playniteName = (id?: string) =>
    dump.completionStatuses.find((item) => item.id === id)?.name ?? nameOf(id)

  const preview: PlayniteMergePreview = {
    libraryPath,
    newGames: [],
    playtimeUpdates: [],
    statusFromPlaynite: [],
    statusConflicts: [],
    newSessions: 0,
    unchanged: 0,
    skipped: 0,
    errors: []
  }

  for (const game of dump.games) {
    const sessions = playniteSessionsToLocal(game.id, dump.sessionsByGameId)
    const mapped = mapPlayniteGame(game, dump.emulators, sessions, driveMap)
    const destination = destinationFor(mapped)
    const existed = findMetaByPlayniteId(game.id)

    if (destination === 'skip' && !existed) {
      preview.skipped += 1
      continue
    }

    if (!existed) {
      preview.newGames.push({
        title: game.name,
        playniteId: game.id,
        playniteMinutes: mapped.playtimeMinutes,
        playniteStatus: playniteName(mapped.meta.playniteCompletionStatusId)
      })
      preview.newSessions += sessions.length
      continue
    }

    const currentMinutes =
      tsStore.get_nodefault(existed.appName)?.totalPlayed ?? 0
    const newSessions = countNewLocalSessions(existed.appName, mapped.sessions)
    preview.newSessions += newSessions

    const fromPlaynite = resolvePlayniteStatusId(
      mapped.meta.playniteCompletionStatusId,
      dump.completionStatuses
    )
    const decision = decideStatusMerge(
      existed,
      mapped.meta.playniteCompletionStatusId,
      fromPlaynite
    )

    let changed = false
    if (mapped.playtimeMinutes > currentMinutes) {
      preview.playtimeUpdates.push({
        title: game.name,
        playniteId: game.id,
        heroicMinutes: currentMinutes,
        playniteMinutes: mapped.playtimeMinutes
      })
      changed = true
    }

    if (decision.decision === 'take-playnite') {
      preview.statusFromPlaynite.push({
        title: game.name,
        playniteId: game.id,
        heroicStatus: nameOf(existed.completionStatusId),
        playniteStatus: playniteName(mapped.meta.playniteCompletionStatusId)
      })
      changed = true
    } else if (decision.decision === 'conflict') {
      preview.statusConflicts.push({
        title: game.name,
        playniteId: game.id,
        heroicStatus: nameOf(existed.completionStatusId),
        playniteStatus: playniteName(mapped.meta.playniteCompletionStatusId)
      })
      changed = true
    }

    if (newSessions) changed = true
    if (!changed) preview.unchanged += 1
  }

  return preview
}
