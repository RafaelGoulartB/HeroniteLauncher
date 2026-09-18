import type { OpenDialogOptions, TitleBarOverlay } from 'electron'

import type { SystemInformation } from 'backend/utils/systeminfo'

import type {
  AntiCheatInfo,
  AppSettings,
  ButtonOptions,
  ConnectivityStatus,
  DialogType,
  DiskSpaceData,
  DMQueueElement,
  DownloadManagerState,
  ExecResult,
  ExtraInfo,
  GameAchievement,
  GameInfo,
  GamepadActionArgs,
  GameSettings,
  GameStatus,
  ImportGameArgs,
  InstallInfo,
  InstallParams,
  InstallPlatform,
  KnownFixesInfo,
  LaunchOption,
  LaunchParams,
  MoveGameArgs,
  RecentGame,
  Release,
  Runner,
  RunnerCommandStub,
  RuntimeName,
  RunWineCommandArgs,
  SaveSyncArgs,
  StatusPromise,
  ToolArgs,
  Tools,
  UpdateParams,
  UploadedLogData,
  UserInfo,
  WikiInfo,
  WineCommandArgs,
  WineInstallation,
  WineManagerStatus,
  WineVersionInfo
} from '../types'
import type {
  CatalogLocaleSettings,
  CatalogProduct,
  GogDealsRegion
} from './discounts'
import type { GOGCloudSavesLocation, UserData } from './gog'
import type { NileLoginData, NileRegisterData, NileUserData } from './nile'
import type { GameOverride, SelectiveDownload } from './legendary'
import type { GetLogFileArgs } from 'backend/logger/paths'
import type {
  LocalGameMeta,
  LocalGameSession,
  PlayniteImportArgs,
  PlayniteImportPreview,
  PlayniteImportResult,
  PlayniteMergePreview,
  PlayniteExportResult,
  PlaynitePreviewArgs,
  CompletionStatus,
  SteamClientUriAction,
  SteamClientUriResult,
  SteamHeroCacheResult,
  CollectionSteamDetails,
  CollectionArtKind,
  CollectionGameArt,
  CollectionWebImage,
  CollectionWebImageSearchArgs,
  CollectionBackupInterval,
  CollectionBackupResult,
  CollectionSettings,
  CollectionScreenshotCacheInfo,
  CollectionScreenshotsResult,
  LudusaviBackupResult,
  LudusaviSettings,
  CollectionGameDetailsPatch,
  CollectionGameDetailsResult,
  CollectionGameMetadata,
  CollectionMetadataApplyArgs,
  CollectionMetadataBulkArgs,
  CollectionMetadataBulkProgress,
  CollectionMetadataPreview,
  CollectionMetadataSearchHit,
  CollectionMetadataSettings,
  IgdbCredentialTest,
  EmulationState,
  RomScanImportArgs,
  RomScanImportResult,
  RomScanPreview,
  RomScanner,
  UpsertRomScannerArgs,
  UpsertUserEmulatorArgs,
  UserEmulator
} from './local-library'

// ts-prune-ignore-next
interface SyncIPCFunctions {
  setZoomFactor: (zoomFactor: string) => void
  changeLanguage: (language: string) => void
  notify: (args: { title: string; body: string }) => void
  frontendReady: () => void
  lock: (playing: boolean) => void
  unlock: () => void
  quit: () => void
  openExternalUrl: (url: string) => void
  openFolder: (folder: string) => void
  openSupportPage: () => void
  openReleases: () => void
  openWeblate: () => void
  showAboutWindow: () => void
  openLoginPage: () => void
  openDiscordLink: () => void
  openPatreonPage: () => void
  openKofiPage: () => void
  openGithubSponsorsPage: () => void
  openWinePrefixFAQ: () => void
  openWebviewPage: (url: string) => void
  openWikiLink: () => void
  openSidInfoPage: () => void
  openCustomThemesWiki: () => void
  showConfigFileInFolder: (appName: string) => void
  removeFolder: ([path, folderName]: [string, string]) => void
  clearCache: (showDialog?: boolean, fromVersionChange?: boolean) => void
  clearAchievementCache: (appName: string) => void
  resetHeroic: () => void
  createNewWindow: (url: string) => void
  logoutGOG: () => void
  logError: (message: unknown) => void
  logInfo: (message: unknown) => void
  showItemInFolder: (item: string) => void
  clipboardWriteText: (text: string) => void
  processShortcut: (combination: string) => void
  addNewApp: (args: GameInfo) => void
  showLogFileInFolder: (args: GetLogFileArgs) => void
  addShortcut: (appName: string, runner: Runner, fromMenu: boolean) => void
  removeShortcut: (appName: string, runner: Runner) => void
  removeFromDMQueue: (appName: string) => void
  clearDMFinished: () => void
  abort: (id: string) => void
  'connectivity-changed': (newStatus: ConnectivityStatus) => void
  'set-connectivity-online': () => void
  changeTrayColor: () => void
  setSetting: (args: {
    appName: string
    key: keyof AppSettings
    value: unknown
  }) => void
  resumeCurrentDownload: () => void
  pauseCurrentDownload: () => void
  cancelDownload: (removeDownloaded: boolean) => void
  copySystemInfoToClipboard: () => void
  minimizeWindow: () => void
  maximizeWindow: () => void
  unmaximizeWindow: () => void
  closeWindow: () => void
  setFullscreen: (enabled: boolean) => void
  setTitleBarOverlay: (options: TitleBarOverlay) => void
  winetricksInstall: (
    runner: Runner,
    appName: string,
    component: string
  ) => void
  changeGameVersionPinnedStatus: (
    appName: string,
    runner: Runner,
    status: boolean
  ) => void
  logoutZoom: () => void
  setGameMetadataOverride: (args: {
    appName: string
    title?: string
    art_cover?: string
    art_square?: string
  }) => void
}

/*
 * These events should only be used during tests to stub/mock
 *
 * We have to handle them in another interface because these
 * events don't have an IpcMainEvent first argument when handled
 */
interface TestSyncIPCFunctions {
  setLegendaryCommandStub: (stubs: RunnerCommandStub[]) => void
  resetLegendaryCommandStub: () => void
  setGogdlCommandStub: (stubs: RunnerCommandStub[]) => void
  resetGogdlCommandStub: () => void
  setNileCommandStub: (stubs: RunnerCommandStub[]) => void
  resetNileCommandStub: () => void
}

// ts-prune-ignore-next
interface AsyncIPCFunctions {
  kill: (appName: string, runner: Runner) => Promise<void>
  checkDiskSpace: (folder: string) => Promise<DiskSpaceData>
  callTool: (args: Tools) => Promise<void>
  runWineCommand: (
    args: WineCommandArgs
  ) => Promise<{ stdout: string; stderr: string }>
  winetricksInstalled: (runner: Runner, appName: string) => Promise<string[]>
  winetricksAvailable: (runner: Runner, appName: string) => Promise<string[]>
  checkGameUpdates: () => Promise<string[]>
  getEpicGamesStatus: () => Promise<boolean>
  updateAll: () => Promise<({ status: 'done' | 'error' | 'abort' } | null)[]>
  getMaxCpus: () => number
  getHeroicVersion: () => string
  getLegendaryVersion: () => Promise<string>
  getGogdlVersion: () => Promise<string>
  getCometVersion: () => Promise<string>
  getNileVersion: () => Promise<string>
  isFullscreen: () => boolean
  isFrameless: () => boolean
  isMaximized: () => boolean
  isMinimized: () => boolean
  showUpdateSetting: () => boolean
  getLatestReleases: () => Promise<Release[]>
  getCurrentChangelog: () => Promise<Release | null>
  getGameInfo: (appName: string, runner: Runner) => Promise<GameInfo | null>
  getAchievements: (
    appName: string,
    runner: Runner,
    lang?: string
  ) => Promise<GameAchievement[]>
  getExtraInfo: (appName: string, runner: Runner) => Promise<ExtraInfo | null>
  getGameSettings: (
    appName: string,
    runner: Runner
  ) => Promise<GameSettings | null>
  getGOGLinuxInstallersLangs: (appName: string) => Promise<string[]>
  getInstallInfo: (
    appName: string,
    runner: Runner,
    installPlatform: InstallPlatform,
    branch?: string,
    build?: string
  ) => Promise<InstallInfo | null>
  getUserInfo: () => Promise<UserInfo | undefined>
  getAmazonUserInfo: () => Promise<NileUserData | undefined>
  getZoomUserInfo: () => Promise<{ username: string } | undefined>
  isLoggedIn: () => boolean
  login: (sid: string) => Promise<{
    status: 'done' | 'failed'
    data: UserInfo | undefined
  }>
  authGOG: (code: string) => Promise<{
    status: 'done' | 'error'
    data?: UserData
  }>
  authAmazon: (data: NileRegisterData) => Promise<{
    status: 'done' | 'failed'
    user: NileUserData | undefined
  }>
  authZoom: (url: string) => Promise<{ status: 'done' | 'error' }>
  logoutLegendary: () => Promise<void>
  logoutAmazon: () => Promise<void>
  getAlternativeWine: () => Promise<WineInstallation[]>
  readConfig: (config_class: 'library' | 'user') => Promise<GameInfo[] | string>
  requestAppSettings: () => AppSettings
  requestGameSettings: (appName: string) => Promise<GameSettings>
  writeConfig: (args: { appName: string; config: Partial<AppSettings> }) => void
  refreshLibrary: (library?: Runner | 'all') => Promise<void>
  previewPlayniteImport: (
    args: PlaynitePreviewArgs
  ) => Promise<PlayniteImportPreview>
  importPlayniteLibrary: (
    args: PlayniteImportArgs
  ) => Promise<PlayniteImportResult>
  mergePlayniteLibrary: () => Promise<PlayniteImportResult>
  previewPlayniteMerge: () => Promise<PlayniteMergePreview>
  exportPlayniteLibrary: (targetPath: string) => Promise<PlayniteExportResult>
  getLastPlayniteLibraryPath: () => Promise<string | undefined>
  getLocalGameSessions: (appName: string) => Promise<LocalGameSession[]>
  getLocalGameMeta: (appName: string) => Promise<LocalGameMeta | undefined>
  getAllLocalGameMeta: () => Promise<Record<string, LocalGameMeta>>
  getCompletionStatuses: () => Promise<CompletionStatus[]>
  setGameCompletionStatus: (args: {
    appName: string
    statusId: string
    runner?: LocalGameMeta['runner']
    title?: string
    playniteId?: string
  }) => Promise<LocalGameMeta | undefined>
  upsertCompletionStatus: (
    status: CompletionStatus
  ) => Promise<CompletionStatus[]>
  deleteCompletionStatus: (id: string) => Promise<CompletionStatus[]>
  reorderCompletionStatuses: (ids: string[]) => Promise<CompletionStatus[]>
  openSteamClientUri: (args: {
    action: SteamClientUriAction
    steamAppId: string
  }) => Promise<SteamClientUriResult>
  cacheSteamHero: (steamAppId: string) => Promise<SteamHeroCacheResult | null>
  getSteamAppDetails: (args: {
    steamAppId: string
    language?: string
  }) => Promise<CollectionSteamDetails | null>
  getAllCollectionArt: () => Promise<Record<string, CollectionGameArt>>
  setCollectionGameArt: (args: {
    appName: string
    runner: Runner
    kind: CollectionArtKind
    sourcePath: string
  }) => Promise<CollectionGameArt>
  searchCollectionWebImages: (
    args: CollectionWebImageSearchArgs
  ) => Promise<CollectionWebImage[]>
  setCollectionGameArtFromUrl: (args: {
    appName: string
    runner: Runner
    kind: CollectionArtKind
    imageUrl: string
    thumbUrl?: string
  }) => Promise<CollectionGameArt>
  clearCollectionGameArt: (args: {
    appName: string
    runner: Runner
    kind: CollectionArtKind
  }) => Promise<CollectionGameArt>
  getCollectionSettings: () => Promise<CollectionSettings>
  setCollectionUiSettings: (args: {
    greyUninstalledGames: boolean
  }) => Promise<CollectionSettings>
  setCollectionScreenshotsSettings: (args: {
    folder: string
    cacheLimitMb: number
  }) => Promise<CollectionSettings>
  getCollectionScreenshotCacheInfo: () => Promise<CollectionScreenshotCacheInfo>
  clearCollectionScreenshotCache: () => Promise<CollectionScreenshotCacheInfo>
  getCollectionScreenshots: (args: {
    title: string
    steamAppId?: string
    aliases?: string[]
  }) => Promise<CollectionScreenshotsResult>
  setCollectionBackupSettings: (args: {
    folder: string
    interval: CollectionBackupInterval
  }) => Promise<CollectionSettings>
  runCollectionBackup: (force?: boolean) => Promise<CollectionBackupResult>
  setLudusaviSettings: (
    args: Partial<
      Pick<
        LudusaviSettings,
        | 'enabled'
        | 'useInstalledConfig'
        | 'binaryPath'
        | 'backupPath'
        | 'format'
        | 'compression'
      >
    >
  ) => Promise<CollectionSettings>
  runLudusaviBackup: (args: {
    appName: string
    title: string
    runner: Runner
    steamAppId?: string
    storeGameId?: string
  }) => Promise<LudusaviBackupResult>
  setCollectionMetadataSettings: (
    args: Partial<CollectionMetadataSettings>
  ) => Promise<CollectionSettings>
  testIgdbCredentials: () => Promise<IgdbCredentialTest>
  getAllCollectionMetadata: () => Promise<
    Record<string, CollectionGameMetadata>
  >
  getCollectionGameMetadata: (args: {
    runner: string
    appName: string
  }) => Promise<CollectionGameMetadata | undefined>
  previewCollectionMetadata: (
    args: CollectionMetadataApplyArgs
  ) => Promise<CollectionMetadataPreview>
  applyCollectionMetadata: (
    args: CollectionMetadataApplyArgs
  ) => Promise<CollectionGameMetadata>
  updateCollectionGameDetails: (
    args: CollectionGameDetailsPatch
  ) => Promise<CollectionGameDetailsResult>
  searchCollectionMetadata: (args: {
    title: string
  }) => Promise<CollectionMetadataSearchHit[]>
  startCollectionMetadataBulk: (
    args: CollectionMetadataBulkArgs
  ) => Promise<CollectionMetadataBulkProgress>
  getCollectionMetadataBulkStatus: () => Promise<CollectionMetadataBulkProgress>
  cancelCollectionMetadataBulk: () => Promise<CollectionMetadataBulkProgress>
  forceClearLocalPlaying: (args: {
    appName: string
    runner: Runner
  }) => Promise<void>
  removeCollectionGame: (args: {
    appName: string
    runner: Runner
  }) => Promise<{ ok: boolean; error?: string }>
  getEmulationState: (refreshDetect?: boolean) => Promise<EmulationState>
  detectCollectionEmulators: () => Promise<EmulationState>
  addDetectedEmulators: () => Promise<UserEmulator[]>
  upsertUserEmulator: (args: UpsertUserEmulatorArgs) => Promise<UserEmulator>
  removeUserEmulator: (id: string) => Promise<UserEmulator[]>
  upsertRomScanner: (args: UpsertRomScannerArgs) => Promise<RomScanner>
  removeRomScanner: (id: string) => Promise<RomScanner[]>
  previewRomScan: (args: {
    emulatorId: string
    profileId: string
    directory: string
    scanSubfolders?: boolean
    mergeRelatedFiles?: boolean
  }) => Promise<RomScanPreview>
  importRomScan: (args: RomScanImportArgs) => Promise<RomScanImportResult>
  runRomScanners: () => Promise<number>
  setEmulatorLaunchRom: (args: {
    appName: string
    romPath: string
  }) => Promise<LocalGameMeta | undefined>
  launch: (args: LaunchParams) => StatusPromise
  openDialog: (args: OpenDialogOptions) => Promise<string | false>
  install: (args: InstallParams) => Promise<void>
  uninstall: (
    appName: string,
    runner: Runner,
    shouldRemovePrefix: boolean,
    shoudlRemoveSetting: boolean
  ) => Promise<void>
  repair: (appName: string, runner: Runner) => Promise<void>
  moveInstall: (args: MoveGameArgs) => Promise<void>
  importGame: (args: ImportGameArgs) => StatusPromise
  updateGame: (args: UpdateParams) => Promise<void>
  changeInstallPath: (args: MoveGameArgs) => Promise<void>
  egsSync: (arg: string) => Promise<string>
  syncGOGSaves: (
    gogSaves: GOGCloudSavesLocation[],
    appname: string,
    arg: string
  ) => Promise<string>
  syncSaves: (args: SaveSyncArgs) => Promise<string>
  gamepadAction: (args: GamepadActionArgs) => Promise<void>
  runWineCommandForGame: (args: RunWineCommandArgs) => Promise<ExecResult>
  getShellPath: (path: string) => Promise<string>
  getWebviewPreloadPath: () => string
  clipboardReadText: () => string
  getCustomThemes: () => Promise<string[]>
  getThemeCSS: (theme: string) => Promise<string>
  isNative: (args: { appName: string; runner: Runner }) => boolean
  getLogContent: (args: GetLogFileArgs) => Promise<string>
  installWineVersion: (release: WineVersionInfo) => Promise<void>
  refreshWineVersionInfo: (fetch?: boolean) => Promise<void>
  removeWineVersion: (release: WineVersionInfo) => Promise<void>
  'wine.isValidVersion': (release: WineInstallation) => Promise<boolean>
  shortcutsExists: (appName: string, runner: Runner) => boolean
  addToSteam: (appName: string, runner: Runner) => Promise<boolean>
  removeFromSteam: (appName: string, runner: Runner) => Promise<boolean>
  isAddedToSteam: (appName: string, runner: Runner) => Promise<boolean>
  getAnticheatInfo: (appNamespace: string) => Promise<AntiCheatInfo | null>
  getKnownFixes: (appName: string, runner: Runner) => KnownFixesInfo | null
  getGameMetadataOverride: (appName: string) => Promise<{
    title?: string
    art_cover?: string
    art_square?: string
  } | null>
  getAllGameOverrides: () => Promise<
    Record<
      string,
      {
        title?: string
        art_cover?: string
        art_square?: string
      }
    >
  >
  getEosOverlayStatus: () => {
    isInstalled: boolean
    version?: string
    install_path?: string
  }
  getLatestEosOverlayVersion: () => Promise<string>
  updateEosOverlayInfo: () => Promise<void>
  installEosOverlay: () => Promise<string | undefined>
  removeEosOverlay: () => Promise<boolean>
  enableEosOverlay: (
    appName: string
  ) => Promise<{ wasEnabled: boolean; installNow?: boolean }>
  disableEosOverlay: (appName: string) => Promise<void>
  isEosOverlayEnabled: (appName?: string) => Promise<boolean>
  downloadRuntime: (runtime_name: RuntimeName) => Promise<boolean>
  isRuntimeInstalled: (runtime_name: RuntimeName) => Promise<boolean>
  getDMQueueInformation: () => {
    elements: DMQueueElement[]
    finished: DMQueueElement[]
    state: DownloadManagerState
  }
  'get-connectivity-status': () => {
    status: ConnectivityStatus
    retryIn: number
  }
  getSystemInfo: (cache?: boolean) => Promise<SystemInformation>
  removeRecent: (appName: string) => Promise<void>
  getWikiGameInfo: (
    title: string,
    appName: string,
    runner: Runner
  ) => Promise<WikiInfo | null>
  getDefaultSavePath: (
    appName: string,
    runner: Runner,
    alreadyDefinedGogSaves: GOGCloudSavesLocation[]
  ) => Promise<string | GOGCloudSavesLocation[]>
  isGameAvailable: (args: {
    appName: string
    runner: Runner
  }) => Promise<boolean>
  toggleDXVK: (args: ToolArgs) => Promise<boolean>
  toggleVKD3D: (args: ToolArgs) => Promise<boolean>
  toggleDXVKNVAPI: (args: ToolArgs) => Promise<boolean>
  pathExists: (path: string) => Promise<boolean>
  getLaunchOptions: (appName: string, runner: Runner) => Promise<LaunchOption[]>
  getGameOverride: () => Promise<GameOverride>
  getGameSdl: (appName: string) => Promise<SelectiveDownload[]>
  getPlaytimeFromRunner: (
    runner: Runner,
    appName: string
  ) => Promise<number | undefined>
  getAmazonLoginData: () => Promise<NileLoginData>
  hasExecutable: (executable: string) => Promise<boolean>

  setPrivateBranchPassword: (appName: string, password: string) => void
  getPrivateBranchPassword: (appName: string) => string

  getAvailableCyberpunkMods: () => Promise<string[]>
  setCyberpunkModConfig: (props: {
    enabled: boolean
    modsToLoad: string[]
  }) => Promise<void>

  uploadLogFile: (
    name: string,
    args: GetLogFileArgs
  ) => Promise<false | [string, UploadedLogData]>
  deleteUploadedLogFile: (url: string) => Promise<boolean>
  getUploadedLogFiles: () => Promise<Record<string, UploadedLogData>>
  getCustomCSS: () => Promise<string>
  isIntelMac: () => boolean
  getGogDealsRegion: () => Promise<GogDealsRegion | null>
  getGogDiscounts: (
    locale: CatalogLocaleSettings,
    hideOwned?: boolean
  ) => Promise<CatalogProduct[]>
  getGogWishlist: () => Promise<string[]>
  getGmgDiscounts: (currencyCode?: string) => Promise<CatalogProduct[]>
  getHumbleDiscounts: (currencyCode?: string) => Promise<CatalogProduct[]>
  'steamgriddb.hasApiKey': () => Promise<boolean>
  'steamgriddb.setApiKey': (key: string) => Promise<void>
  'steamgriddb.searchGame': (
    query: string
  ) => Promise<Array<{ id: number; name: string }>>
  'steamgriddb.getGrids': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
  'steamgriddb.getHeroes': (args: {
    gameId: number
    styles?: string[]
    dimensions?: string[]
  }) => Promise<Array<{ id: number; url: string; thumb: string }>>
}

interface FrontendMessages {
  gameStatusUpdate: (status: GameStatus) => void
  wineVersionsUpdated: () => void
  showDialog: (
    title: string,
    message: string,
    type: DialogType,
    buttons?: Array<ButtonOptions>
  ) => void
  changedDMQueueInformation: (
    elements: DMQueueElement[],
    state: DownloadManagerState
  ) => void
  maximized: () => void
  unmaximized: () => void
  fullscreen: (status: boolean) => void
  refreshLibrary: (runner?: Runner) => void
  openScreen: (screen: string) => void
  'connectivity-changed': (status: {
    status: ConnectivityStatus
    retryIn: number
  }) => void
  launchGame: (appName: string, runner: Runner, args: string[]) => void
  installGame: (appName: string, runner: Runner) => void
  recentGamesChanged: (newRecentGames: RecentGame[]) => void
  pushGameToLibrary: (info: GameInfo) => void
  progressOfWinetricks: (payload: {
    messages: string[]
    installingComponent: string
  }) => void
  progressOfWineManager: (version: string, progress: WineManagerStatus) => void
  'installing-winetricks-component': (component: string) => void
  logFileUploaded: (url: string, data: UploadedLogData) => void
  logFileUploadDeleted: (url: string) => void
  progressUpdate: (progress: GameStatus) => void
  metadataChanged: (
    overrides: Record<
      string,
      { title?: string; art_cover?: string; art_square?: string }
    >
  ) => void
  collectionMetadataBulkProgress: (
    progress: CollectionMetadataBulkProgress
  ) => void

  // Used inside tests, so we can be a bit lenient with the type checking here
  message: (...params: unknown[]) => void
}

export type {
  SyncIPCFunctions,
  TestSyncIPCFunctions,
  AsyncIPCFunctions,
  FrontendMessages
}
