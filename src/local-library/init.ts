import { addHandler } from 'backend/ipc'
import { logInfo, LogPrefix } from 'backend/logger'
import { refreshMissingLocalCovers } from './covers'
import {
  importPlayniteLibrary,
  mergePlayniteLibrary,
  previewPlayniteImport,
  previewPlayniteMerge
} from './import'
import { exportPlayniteLibrary } from './export'
import { refreshLocalInstallStates } from './install-state'
import { openSteamClientUri } from './steam'
import {
  clearCollectionGameArt,
  getAllCollectionArt,
  setCollectionGameArt,
  setCollectionGameArtFromUrl
} from './art'
import { searchCollectionWebImages } from './web-images'
import { cacheSteamHero, warmSteamHeroes } from './heroes'
import { forceClearLocalPlaying } from './playtime-watch'
import { removeCollectionGame } from './remove'
import { getSteamAppDetails } from './steam-details'
import { initLocalArtProtocol } from './protocol'
import { maybeRunScheduledBackup, runCollectionBackup } from './backup'
import {
  getCollectionSettings,
  setCollectionBackupSettings,
  setCollectionMetadataSettings,
  setCollectionScreenshotsSettings,
  setCollectionUiSettings,
  setLudusaviSettings
} from './settings'
import { backupLudusaviForGame, detectLudusavi } from './ludusavi'
import {
  backfillMissingGameStatuses,
  ensureDefaultStatuses,
  deleteCompletionStatus,
  getCompletionStatuses,
  getLastPlayniteLibraryPath,
  reorderCompletionStatuses,
  setGameCompletionStatus,
  upsertCompletionStatus
} from './status'
import {
  getAllLocalGameMeta,
  getLocalGameMeta,
  getLocalSessions
} from './stores'
import {
  applyGameMetadata,
  cancelBulkMetadata,
  getAllCollectionMetadata,
  getBulkMetadataProgress,
  getCollectionGameMetadata,
  previewGameMetadata,
  refreshMissingCollectionMetadata,
  searchGameMetadata,
  startBulkMetadata,
  testIgdbCredentials,
  updateCollectionGameDetails
} from './metadata'
import {
  addDetectedEmulators,
  autoScanRomFolders,
  deleteRomScanner,
  deleteUserEmulator,
  getEmulationState,
  importRoms,
  saveRomScanner,
  saveUserEmulator,
  scanRomsPreview,
  setEmulatorLaunchRom
} from './emulation'
import { getCollectionScreenshots } from './screenshots'
import {
  clearScreenshotThumbnailCache,
  maintainScreenshotThumbnailCache
} from './screenshots/thumbnails'

let registered = false

export function registerLocalLibraryIpc() {
  if (registered) return
  registered = true

  addHandler('previewPlayniteImport', (_e, args) => previewPlayniteImport(args))
  addHandler('importPlayniteLibrary', (_e, args) => importPlayniteLibrary(args))
  addHandler('mergePlayniteLibrary', () => mergePlayniteLibrary())
  addHandler('previewPlayniteMerge', () => previewPlayniteMerge())
  addHandler('exportPlayniteLibrary', (_e, targetPath) =>
    exportPlayniteLibrary(targetPath)
  )
  addHandler('getLastPlayniteLibraryPath', () => getLastPlayniteLibraryPath())
  addHandler('getLocalGameSessions', (_e, appName) => getLocalSessions(appName))
  addHandler('getLocalGameMeta', (_e, appName) => getLocalGameMeta(appName))
  addHandler('getAllLocalGameMeta', () => getAllLocalGameMeta())
  addHandler('getCompletionStatuses', () => getCompletionStatuses())
  addHandler('setGameCompletionStatus', (_e, args) => {
    setGameCompletionStatus(args.appName, args.statusId, {
      runner: args.runner,
      title: args.title,
      playniteId: args.playniteId
    })
    return getLocalGameMeta(args.appName)
  })
  addHandler('upsertCompletionStatus', (_e, status) =>
    upsertCompletionStatus(status)
  )
  addHandler('deleteCompletionStatus', (_e, id) => deleteCompletionStatus(id))
  addHandler('reorderCompletionStatuses', (_e, ids) =>
    reorderCompletionStatuses(ids)
  )
  addHandler('openSteamClientUri', (_e, args) =>
    openSteamClientUri(args.action, args.steamAppId)
  )
  addHandler('cacheSteamHero', (_e, steamAppId) => cacheSteamHero(steamAppId))
  addHandler('getSteamAppDetails', (_e, args) => getSteamAppDetails(args))
  addHandler('getAllCollectionArt', () => getAllCollectionArt())
  addHandler('setCollectionGameArt', (_e, args) => setCollectionGameArt(args))
  addHandler('searchCollectionWebImages', (_e, args) =>
    searchCollectionWebImages(args)
  )
  addHandler('setCollectionGameArtFromUrl', (_e, args) =>
    setCollectionGameArtFromUrl(args)
  )
  addHandler('clearCollectionGameArt', (_e, args) =>
    clearCollectionGameArt(args)
  )
  addHandler('getCollectionSettings', async () => {
    const settings = getCollectionSettings()
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('setCollectionUiSettings', async (_e, args) => {
    const settings = setCollectionUiSettings(args)
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('setCollectionScreenshotsSettings', async (_e, args) => {
    const settings = setCollectionScreenshotsSettings(args)
    await maintainScreenshotThumbnailCache()
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('getCollectionScreenshotCacheInfo', () =>
    maintainScreenshotThumbnailCache()
  )
  addHandler('clearCollectionScreenshotCache', () =>
    clearScreenshotThumbnailCache()
  )
  addHandler('getCollectionScreenshots', (_e, args) =>
    getCollectionScreenshots(args)
  )
  addHandler('setCollectionBackupSettings', async (_e, args) => {
    const settings = setCollectionBackupSettings(args)
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('runCollectionBackup', (_e, force) =>
    runCollectionBackup(Boolean(force))
  )
  addHandler('setLudusaviSettings', async (_e, args) => {
    const settings = setLudusaviSettings(args)
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('runLudusaviBackup', (_e, args) =>
    backupLudusaviForGame({ ...args, reason: 'manual' })
  )
  addHandler('setCollectionMetadataSettings', async (_e, args) => {
    const settings = setCollectionMetadataSettings(args)
    const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
    return { ...settings, ludusaviDetected }
  })
  addHandler('testIgdbCredentials', () => testIgdbCredentials())
  addHandler('getAllCollectionMetadata', () => getAllCollectionMetadata())
  addHandler('getCollectionGameMetadata', (_e, args) =>
    getCollectionGameMetadata(args.runner, args.appName)
  )
  addHandler('previewCollectionMetadata', (_e, args) =>
    previewGameMetadata(args)
  )
  addHandler('applyCollectionMetadata', (_e, args) => applyGameMetadata(args))
  addHandler('updateCollectionGameDetails', (_e, args) =>
    updateCollectionGameDetails(args)
  )
  addHandler('searchCollectionMetadata', (_e, args) => searchGameMetadata(args))
  addHandler('startCollectionMetadataBulk', (_e, args) =>
    startBulkMetadata(args)
  )
  addHandler('getCollectionMetadataBulkStatus', () => getBulkMetadataProgress())
  addHandler('cancelCollectionMetadataBulk', () => cancelBulkMetadata())
  addHandler('forceClearLocalPlaying', (_e, args) =>
    forceClearLocalPlaying(args.appName, args.runner)
  )
  addHandler('removeCollectionGame', (_e, args) => removeCollectionGame(args))
  addHandler('getEmulationState', (_e, refreshDetect) =>
    getEmulationState(refreshDetect !== false)
  )
  addHandler('detectCollectionEmulators', () => getEmulationState(true))
  addHandler('addDetectedEmulators', () => addDetectedEmulators())
  addHandler('upsertUserEmulator', (_e, args) => saveUserEmulator(args))
  addHandler('removeUserEmulator', (_e, id) => deleteUserEmulator(id))
  addHandler('upsertRomScanner', (_e, args) => saveRomScanner(args))
  addHandler('removeRomScanner', (_e, id) => deleteRomScanner(id))
  addHandler('previewRomScan', (_e, args) => scanRomsPreview(args))
  addHandler('importRomScan', (_e, args) => importRoms(args))
  addHandler('runRomScanners', () => autoScanRomFolders())
  addHandler('setEmulatorLaunchRom', (_e, args) => setEmulatorLaunchRom(args))
}

export async function initLocalLibrary() {
  registerLocalLibraryIpc()
  initLocalArtProtocol()
  logInfo(
    'Collection overlay: Ludusavi backup handler registered',
    LogPrefix.Backend
  )
  ensureDefaultStatuses()
  backfillMissingGameStatuses()
  await refreshLocalInstallStates()
  void autoScanRomFolders()
  void refreshMissingLocalCovers()
  void warmSteamHeroes(
    Object.values(getAllLocalGameMeta())
      .map((meta) => meta.steamAppId)
      .filter((id): id is string => Boolean(id))
  )
  void refreshMissingCollectionMetadata()
  void maintainScreenshotThumbnailCache()
  void maybeRunScheduledBackup()
}
