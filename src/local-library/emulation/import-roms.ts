import { createHash } from 'crypto'
import { dirname, resolve } from 'path'
import { sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import type { GameInfo } from 'common/types'
import type {
  LocalGameMeta,
  RomScanImportArgs,
  RomScanImportResult,
  RomScanItem
} from 'common/types/local-library'
import { inferredStatusId } from '../status'
import { getAllLocalGameMeta, upsertLocalGameMeta } from '../stores'
import { blankMetadata } from '../metadata/blank'
import { getGameMetadata, upsertGameMetadata } from '../metadata/store'
import { previewRomScan } from './scan'
import {
  getUserEmulator,
  getUserProfile,
  resolveProfileTemplate,
  upsertRomScanner
} from './store'

function normalizePath(value: string) {
  return resolve(value).replaceAll('\\', '/').replace(/\/+$/, '').toLowerCase()
}

function emuAppName(
  emulatorId: string,
  profileId: string,
  key: string
): string {
  const hash = createHash('sha1')
    .update(`${emulatorId}|${profileId}|${key}`)
    .digest('hex')
    .slice(0, 16)
  return `emu_${hash}`
}

function upsertSideloadGame(game: GameInfo) {
  const current = sideloadStore.get('games', [])
  const index = current.findIndex((item) => item.app_name === game.app_name)
  if (index >= 0) current[index] = { ...current[index], ...game }
  else current.push(game)
  sideloadStore.set('games', current)
}

function findExisting(
  emulatorId: string,
  profileId: string,
  item: RomScanItem
): LocalGameMeta | undefined {
  const games = Object.values(getAllLocalGameMeta())
  const romKeys = new Set(item.roms.map((rom) => normalizePath(rom.path)))
  return games.find((meta) => {
    if (meta.emulatorId !== emulatorId) return false
    if (meta.emulatorProfileId && meta.emulatorProfileId !== profileId) {
      return false
    }
    return (meta.roms ?? []).some((rom) => romKeys.has(normalizePath(rom.path)))
  })
}

function seedPlatforms(appName: string, platformName?: string) {
  if (!platformName) return
  const current =
    getGameMetadata('sideload', appName) ?? blankMetadata(appName, 'sideload')
  if (
    current.platforms.some(
      (item) => item.toLowerCase() === platformName.toLowerCase()
    )
  ) {
    return
  }
  upsertGameMetadata({
    ...current,
    platforms: [...current.platforms, platformName],
    fieldSources: { ...current.fieldSources, platforms: 'manual' }
  })
}

export async function importScannedRoms(
  args: RomScanImportArgs
): Promise<RomScanImportResult> {
  const result: RomScanImportResult = {
    imported: 0,
    updated: 0,
    skipped: 0,
    scannerId: args.scannerId ?? '',
    errors: []
  }

  const emulator = getUserEmulator(args.emulatorId)
  if (!emulator) {
    result.errors.push('Emulator not found.')
    return result
  }
  const profile = getUserProfile(emulator, args.profileId)
  if (!profile) {
    result.errors.push('Emulator profile not found.')
    return result
  }
  const template = resolveProfileTemplate(emulator, profile)
  const native = emulator.launchKind !== 'wine'
  const installedExe =
    emulator.launchKind === 'flatpak' ? 'flatpak' : emulator.executable

  const scanner = upsertRomScanner({
    id: args.scannerId,
    emulatorId: emulator.id,
    profileId: profile.id,
    directory: args.directory,
    scanSubfolders: args.scanSubfolders,
    mergeRelatedFiles: args.mergeRelatedFiles,
    autoScanOnRefresh: args.autoScanOnRefresh
  })
  result.scannerId = scanner.id

  const selected = args.games.filter((item) => item.import && item.roms.length)
  for (const item of selected) {
    try {
      const existing = findExisting(emulator.id, profile.id, item)
      const identity = item.roms
        .map((rom) => normalizePath(rom.path))
        .sort()
        .join('|')
      const appName =
        existing?.appName ?? emuAppName(emulator.id, profile.id, identity)
      const roms = existing
        ? [
            ...(existing.roms ?? []).filter(
              (rom) =>
                !item.roms.some(
                  (incoming) =>
                    normalizePath(incoming.path) === normalizePath(rom.path)
                )
            ),
            ...item.roms
          ]
        : item.roms
      const firstRom = roms[0]?.path
      const meta: LocalGameMeta = {
        appName,
        runner: 'sideload',
        playniteId: existing?.playniteId ?? appName,
        source: 'emulator',
        launchKind: 'emulator',
        title: item.title || existing?.title || appName,
        remappedExecutable: installedExe,
        launcherArgs: template.arguments,
        roms,
        emulatorName: emulator.name,
        emulatorId: emulator.id,
        emulatorProfileId: profile.id,
        platformId: template.platformId,
        completionStatusId: existing?.completionStatusId ?? inferredStatusId(0)
      }
      const gameInfo: GameInfo = {
        runner: 'sideload',
        app_name: appName,
        title: meta.title,
        art_cover: '',
        art_square: '',
        is_installed: Boolean(installedExe && firstRom),
        canRunOffline: true,
        is_linux_native: native,
        folder_name: firstRom ? dirname(firstRom) : dirname(installedExe),
        install: {
          executable: installedExe ?? '',
          platform: native ? 'linux' : 'Windows',
          is_dlc: false
        }
      }
      upsertSideloadGame(gameInfo)
      upsertLocalGameMeta(meta)
      seedPlatforms(appName, template.platformName)
      if (existing) result.updated += 1
      else result.imported += 1
    } catch (error) {
      const message = `Failed to import ${item.title}: ${String(error)}`
      logError(message, LogPrefix.Backend)
      result.errors.push(message)
    }
  }

  result.skipped = args.games.length - selected.length
  logInfo(
    `ROM scan imported ${result.imported}, updated ${result.updated}`,
    LogPrefix.Backend
  )
  sendFrontendMessage('refreshLibrary', 'sideload')
  return result
}

export async function runAutoRomScanners(): Promise<number> {
  const { listRomScanners } = await import('./store')
  let imported = 0
  for (const scanner of listRomScanners()) {
    if (!scanner.autoScanOnRefresh) continue
    const preview = previewRomScan({
      emulatorId: scanner.emulatorId,
      profileId: scanner.profileId,
      directory: scanner.directory,
      scanSubfolders: scanner.scanSubfolders,
      mergeRelatedFiles: scanner.mergeRelatedFiles
    })
    const newcomers = preview.games.filter((item) => !item.alreadyImported)
    if (!newcomers.length) continue
    const result = await importScannedRoms({
      emulatorId: scanner.emulatorId,
      profileId: scanner.profileId,
      directory: scanner.directory,
      scannerId: scanner.id,
      scanSubfolders: scanner.scanSubfolders,
      mergeRelatedFiles: scanner.mergeRelatedFiles,
      autoScanOnRefresh: scanner.autoScanOnRefresh,
      games: newcomers.map((item) => ({ ...item, import: true }))
    })
    imported += result.imported
  }
  return imported
}
