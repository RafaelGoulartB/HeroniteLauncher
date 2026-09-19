import { addHandler } from 'backend/ipc'
import { logInfo, LogPrefix } from 'backend/logger'
import { refreshLocalInstallStates } from './install-state'
import { initLocalArtProtocol } from './protocol'
import {
  getCollectionSettings,
  setCollectionBackupSettings,
  setCollectionMetadataSettings,
  setCollectionScreenshotsSettings,
  setCollectionUiSettings,
  setLudusaviSettings
} from './settings'
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
  captureActiveGameScreenshot,
  configureScreenshotCaptureHotkey,
  getScreenshotCaptureStatus,
  initScreenshotCaptureService
} from './screenshots/capture'

let registered = false
let idleWorkStarted = false

async function withLudusaviDetection(settings = getCollectionSettings()) {
  const { detectLudusavi } = await import('./ludusavi')
  const ludusaviDetected = await detectLudusavi(settings.ludusavi.binaryPath)
  return { ...settings, ludusaviDetected }
}

function scheduleIdleMaintenance() {
  if (idleWorkStarted) return
  idleWorkStarted = true
  const timer = setTimeout(() => {
    void (async () => {
      const { autoScanRomFolders } = await import('./emulation')
      const { refreshMissingLocalCovers } = await import('./covers')
      const { refreshMissingCollectionMetadata } = await import('./metadata')
      const { maintainScreenshotThumbnailCache } =
        await import('./screenshots/thumbnails')
      const { maybeRunScheduledBackup } = await import('./backup')
      void autoScanRomFolders()
      void refreshMissingLocalCovers()
      void refreshMissingCollectionMetadata()
      void maintainScreenshotThumbnailCache()
      void maybeRunScheduledBackup()
    })()
  }, 90_000)
  timer.unref()
}

export function registerLocalLibraryIpc() {
  if (registered) return
  registered = true

  addHandler('previewPlayniteImport', async (_e, args) => {
    const { previewPlayniteImport } = await import('./import')
    return previewPlayniteImport(args)
  })
  addHandler('importPlayniteLibrary', async (_e, args) => {
    const { importPlayniteLibrary } = await import('./import')
    return importPlayniteLibrary(args)
  })
  addHandler('mergePlayniteLibrary', async () => {
    const { mergePlayniteLibrary } = await import('./import')
    return mergePlayniteLibrary()
  })
  addHandler('previewPlayniteMerge', async () => {
    const { previewPlayniteMerge } = await import('./import')
    return previewPlayniteMerge()
  })
  addHandler('exportPlayniteLibrary', async (_e, targetPath) => {
    const { exportPlayniteLibrary } = await import('./export')
    return exportPlayniteLibrary(targetPath)
  })
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
  addHandler('openSteamClientUri', async (_e, args) => {
    const { openSteamClientUri } = await import('./steam')
    return openSteamClientUri(args.action, args.steamAppId)
  })
  addHandler('cacheSteamHero', async (_e, steamAppId) => {
    const { cacheSteamHero } = await import('./heroes')
    return cacheSteamHero(steamAppId)
  })
  addHandler('getSteamAppDetails', async (_e, args) => {
    const { getSteamAppDetails } = await import('./steam-details')
    return getSteamAppDetails(args)
  })
  addHandler('getAllCollectionArt', async () => {
    const { getAllCollectionArt } = await import('./art')
    return getAllCollectionArt()
  })
  addHandler('setCollectionGameArt', async (_e, args) => {
    const { setCollectionGameArt } = await import('./art')
    return setCollectionGameArt(args)
  })
  addHandler('searchCollectionWebImages', async (_e, args) => {
    const { searchCollectionWebImages } = await import('./web-images')
    return searchCollectionWebImages(args)
  })
  addHandler('setCollectionGameArtFromUrl', async (_e, args) => {
    const { setCollectionGameArtFromUrl } = await import('./art')
    return setCollectionGameArtFromUrl(args)
  })
  addHandler('clearCollectionGameArt', async (_e, args) => {
    const { clearCollectionGameArt } = await import('./art')
    return clearCollectionGameArt(args)
  })
  addHandler('getCollectionSettings', () => withLudusaviDetection())
  addHandler('setCollectionUiSettings', (_e, args) =>
    withLudusaviDetection(setCollectionUiSettings(args))
  )
  addHandler('setCollectionScreenshotsSettings', async (_e, args) => {
    const settings = setCollectionScreenshotsSettings(args)
    configureScreenshotCaptureHotkey()
    const { maintainScreenshotThumbnailCache } =
      await import('./screenshots/thumbnails')
    await maintainScreenshotThumbnailCache()
    return withLudusaviDetection(settings)
  })
  addHandler('getCollectionScreenshotCacheInfo', async () => {
    const { maintainScreenshotThumbnailCache } =
      await import('./screenshots/thumbnails')
    return maintainScreenshotThumbnailCache()
  })
  addHandler('clearCollectionScreenshotCache', async () => {
    const { clearScreenshotThumbnailCache } =
      await import('./screenshots/thumbnails')
    return clearScreenshotThumbnailCache()
  })
  addHandler('getCollectionScreenshots', async (_e, args) => {
    const { getCollectionScreenshots } = await import('./screenshots')
    return getCollectionScreenshots(args)
  })
  addHandler('deleteCollectionScreenshot', async (_e, args) => {
    const { deleteCollectionScreenshot } = await import('./screenshots')
    return deleteCollectionScreenshot(args)
  })
  addHandler('getCollectionScreenshotCaptureStatus', () =>
    getScreenshotCaptureStatus()
  )
  addHandler('captureCollectionScreenshot', () => captureActiveGameScreenshot())
  addHandler('setCollectionBackupSettings', async (_e, args) => {
    const settings = setCollectionBackupSettings(args)
    return withLudusaviDetection(settings)
  })
  addHandler('runCollectionBackup', async (_e, force) => {
    const { runCollectionBackup } = await import('./backup')
    return runCollectionBackup(Boolean(force))
  })
  addHandler('setLudusaviSettings', async (_e, args) => {
    const settings = setLudusaviSettings(args)
    return withLudusaviDetection(settings)
  })
  addHandler('runLudusaviBackup', async (_e, args) => {
    const { backupLudusaviForGame } = await import('./ludusavi')
    return backupLudusaviForGame({ ...args, reason: 'manual' })
  })
  addHandler('setCollectionMetadataSettings', async (_e, args) => {
    const settings = setCollectionMetadataSettings(args)
    return withLudusaviDetection(settings)
  })
  addHandler('testIgdbCredentials', async () => {
    const { testIgdbCredentials } = await import('./metadata')
    return testIgdbCredentials()
  })
  addHandler('getAllCollectionMetadata', async () => {
    const { getAllCollectionMetadata } = await import('./metadata')
    return getAllCollectionMetadata()
  })
  addHandler('getCollectionGameMetadata', async (_e, args) => {
    const { getCollectionGameMetadata } = await import('./metadata')
    return getCollectionGameMetadata(args.runner, args.appName)
  })
  addHandler('previewCollectionMetadata', async (_e, args) => {
    const { previewGameMetadata } = await import('./metadata')
    return previewGameMetadata(args)
  })
  addHandler('applyCollectionMetadata', async (_e, args) => {
    const { applyGameMetadata } = await import('./metadata')
    return applyGameMetadata(args)
  })
  addHandler('updateCollectionGameDetails', async (_e, args) => {
    const { updateCollectionGameDetails } = await import('./metadata')
    return updateCollectionGameDetails(args)
  })
  addHandler('searchCollectionMetadata', async (_e, args) => {
    const { searchGameMetadata } = await import('./metadata')
    return searchGameMetadata(args)
  })
  addHandler('startCollectionMetadataBulk', async (_e, args) => {
    const { startBulkMetadata } = await import('./metadata')
    return startBulkMetadata(args)
  })
  addHandler('getCollectionMetadataBulkStatus', async () => {
    const { getBulkMetadataProgress } = await import('./metadata')
    return getBulkMetadataProgress()
  })
  addHandler('cancelCollectionMetadataBulk', async () => {
    const { cancelBulkMetadata } = await import('./metadata')
    return cancelBulkMetadata()
  })
  addHandler('forceClearLocalPlaying', async (_e, args) => {
    const { forceClearLocalPlaying } = await import('./playtime-watch')
    return forceClearLocalPlaying(args.appName, args.runner)
  })
  addHandler('removeCollectionGame', async (_e, args) => {
    const { removeCollectionGame } = await import('./remove')
    return removeCollectionGame(args)
  })
  addHandler('getEmulationState', async (_e, refreshDetect) => {
    const { getEmulationState } = await import('./emulation')
    return getEmulationState(refreshDetect !== false)
  })
  addHandler('detectCollectionEmulators', async () => {
    const { getEmulationState } = await import('./emulation')
    return getEmulationState(true)
  })
  addHandler('addDetectedEmulators', async () => {
    const { addDetectedEmulators } = await import('./emulation')
    return addDetectedEmulators()
  })
  addHandler('upsertUserEmulator', async (_e, args) => {
    const { saveUserEmulator } = await import('./emulation')
    return saveUserEmulator(args)
  })
  addHandler('removeUserEmulator', async (_e, id) => {
    const { deleteUserEmulator } = await import('./emulation')
    return deleteUserEmulator(id)
  })
  addHandler('upsertRomScanner', async (_e, args) => {
    const { saveRomScanner } = await import('./emulation')
    return saveRomScanner(args)
  })
  addHandler('removeRomScanner', async (_e, id) => {
    const { deleteRomScanner } = await import('./emulation')
    return deleteRomScanner(id)
  })
  addHandler('previewRomScan', async (_e, args) => {
    const { scanRomsPreview } = await import('./emulation')
    return scanRomsPreview(args)
  })
  addHandler('importRomScan', async (_e, args) => {
    const { importRoms } = await import('./emulation')
    return importRoms(args)
  })
  addHandler('runRomScanners', async () => {
    const { autoScanRomFolders } = await import('./emulation')
    return autoScanRomFolders()
  })
  addHandler('setEmulatorLaunchRom', async (_e, args) => {
    const { setEmulatorLaunchRom } = await import('./emulation')
    return setEmulatorLaunchRom(args)
  })
}

export async function initLocalLibrary() {
  registerLocalLibraryIpc()
  initLocalArtProtocol()
  initScreenshotCaptureService()
  logInfo(
    'Collection overlay: Ludusavi backup handler registered',
    LogPrefix.Backend
  )
  ensureDefaultStatuses()
  backfillMissingGameStatuses()
  await refreshLocalInstallStates()
  scheduleIdleMaintenance()
}
