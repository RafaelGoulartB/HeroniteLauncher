export type LocalLaunchKind =
  | 'steam-uri'
  | 'executable'
  | 'emulator'
  | 'unavailable'

export type LocalGameSource =
  | 'steam'
  | 'epic'
  | 'gog'
  | 'amazon'
  | 'xbox'
  | 'emulator'
  | 'manual'
  | 'other'

export type LocalSessionSource = 'playnite' | 'heroic'

export type CompletionStatusSlug =
  | 'playing'
  | 'plan-to-play'
  | 'on-hold'
  | 'played'
  | 'endless'
  | 'beaten'
  | 'completed'
  | 'abandoned'
  | 'not-played'
  | 'custom'

export interface CompletionStatus {
  id: string
  name: string
  slug: CompletionStatusSlug
  sortOrder: number
  playniteId?: string
  playniteIds?: string[]
}

export interface LocalGameRom {
  name?: string
  path: string
}

export type EmulatorLaunchKind = 'native' | 'flatpak' | 'wine'

export type EmulatorWorkingDir = 'emulator' | 'rom'

export interface EmulatorDefinitionProfile {
  id: string
  name: string
  platformId: string
  platformName: string
  extensions: string[]
  arguments: string
  core?: string
  folderIndicator?: string
  playlistExtensions?: string[]
  workingDir?: EmulatorWorkingDir
}

export interface EmulatorDefinition {
  id: string
  name: string
  website?: string
  binaries: string[]
  flatpakId?: string
  stopPattern?: string
  coreDirHints?: string[]
  profiles: EmulatorDefinitionProfile[]
}

export interface UserEmulatorProfile {
  id: string
  definitionProfileId?: string
  name: string
  platformId?: string
  platformName?: string
  arguments: string
  extensions: string[]
  corePath?: string
  folderIndicator?: string
  playlistExtensions?: string[]
  workingDir?: EmulatorWorkingDir
}

export interface UserEmulator {
  id: string
  definitionId: string
  name: string
  executable: string
  installDir?: string
  launchKind: EmulatorLaunchKind
  flatpakId?: string
  playniteId?: string
  profiles: UserEmulatorProfile[]
}

export interface DetectedEmulatorProfile {
  id: string
  name: string
  platformName: string
  corePath?: string
}

export interface DetectedEmulator {
  definitionId: string
  name: string
  executable: string
  launchKind: EmulatorLaunchKind
  flatpakId?: string
  profiles: DetectedEmulatorProfile[]
  alreadyAdded: boolean
}

export interface RomScanner {
  id: string
  name: string
  emulatorId: string
  profileId: string
  directory: string
  scanSubfolders: boolean
  mergeRelatedFiles: boolean
  autoScanOnRefresh: boolean
}

export interface RomScanItem {
  title: string
  roms: LocalGameRom[]
  alreadyImported: boolean
  import: boolean
}

export interface RomScanPreview {
  scannerId?: string
  emulatorId: string
  emulatorName: string
  profileId: string
  profileName: string
  platformName?: string
  directory: string
  games: RomScanItem[]
  errors: string[]
}

export interface RomScanImportArgs {
  emulatorId: string
  profileId: string
  directory: string
  scannerId?: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
  autoScanOnRefresh?: boolean
  games: RomScanItem[]
}

export interface RomScanImportResult {
  imported: number
  updated: number
  skipped: number
  scannerId: string
  errors: string[]
}

export interface EmulationState {
  catalog: EmulatorDefinition[]
  emulators: UserEmulator[]
  scanners: RomScanner[]
  detected: DetectedEmulator[]
}

export interface UpsertUserEmulatorArgs {
  id?: string
  definitionId: string
  name: string
  executable: string
  installDir?: string
  launchKind: EmulatorLaunchKind
  flatpakId?: string
  playniteId?: string
  profiles?: UserEmulatorProfile[]
}

export interface UpsertRomScannerArgs {
  id?: string
  name?: string
  emulatorId: string
  profileId: string
  directory: string
  scanSubfolders?: boolean
  mergeRelatedFiles?: boolean
  autoScanOnRefresh?: boolean
}

export interface LocalGameMeta {
  appName: string
  runner: 'sideload' | 'legendary' | 'gog' | 'nile'
  playniteId: string
  pluginId?: string
  source: LocalGameSource
  launchKind: LocalLaunchKind
  steamAppId?: string
  storeGameId?: string
  title: string
  windowsInstallDirectory?: string
  windowsExecutable?: string
  remappedExecutable?: string
  launcherArgs?: string
  roms?: LocalGameRom[]
  emulatorName?: string
  emulatorId?: string
  emulatorProfileId?: string
  platformId?: string
  selectedRomPath?: string
  notes?: string
  completionStatusId?: string
  playniteCompletionStatusId?: string
}

export interface LocalGameSession {
  startedAt: string
  endedAt: string
  elapsedSeconds: number
  source: LocalSessionSource
  gameActionName?: string
}

export interface DriveRemap {
  windowsRoot: string
  linuxPath: string
}

export interface PlaynitePreviewArgs {
  libraryPath: string
}

export interface PlaynitePreviewGame {
  playniteId: string
  title: string
  source: LocalGameSource
  destination: 'sideload' | 'legendary' | 'gog' | 'nile' | 'skip'
  playtimeMinutes: number
  sessionCount: number
  alreadyImported: boolean
  matchedAppName?: string
}

export interface PlayniteImportPreview {
  libraryPath: string
  playniteRoot: string
  gameCount: number
  sessionFileCount: number
  detectedDrives: string[]
  games: PlaynitePreviewGame[]
  counts: {
    steam: number
    emulator: number
    manual: number
    xbox: number
    amazon: number
    other: number
    epicMatch: number
    gogMatch: number
    skippedStore: number
  }
  errors: string[]
}

export interface PlayniteImportArgs {
  libraryPath: string
  driveMap: DriveRemap[]
  fetchCovers?: boolean
  mergeExisting?: boolean
}

export interface PlayniteImportResult {
  imported: number
  updated: number
  matchedStore: number
  skipped: number
  coversFetched: number
  sessionsImported: number
  errors: string[]
}

export interface PlayniteMergePreviewItem {
  title: string
  playniteId: string
  heroicMinutes?: number
  playniteMinutes?: number
  heroicStatus?: string
  playniteStatus?: string
}

export interface PlayniteMergePreview {
  libraryPath: string
  newGames: PlayniteMergePreviewItem[]
  playtimeUpdates: PlayniteMergePreviewItem[]
  statusFromPlaynite: PlayniteMergePreviewItem[]
  statusConflicts: PlayniteMergePreviewItem[]
  newSessions: number
  unchanged: number
  skipped: number
  errors: string[]
}

export interface PlayniteExportGame {
  playniteId: string
  heroicAppName: string
  steamAppId?: string
  storeGameId?: string
  title: string
  source: LocalGameSource
  playtimeMinutes: number
  playtimeSeconds: number
  firstPlayed?: string
  lastPlayed?: string
  completionStatus: {
    id: string
    name: string
    slug: CompletionStatusSlug
    playniteId?: string
  }
  lastPlayniteCompletionStatusId?: string
  sessions: LocalGameSession[]
}

export interface PlayniteExportFile {
  format: 'heroic-playnite-export'
  version: 1
  exportedAt: string
  comment: string
  statuses: CompletionStatus[]
  games: PlayniteExportGame[]
}

export interface PlayniteExportResult {
  path: string
  gameCount: number
}

export type SteamClientUriAction = 'install' | 'uninstall'

export type SteamClientUriResult = { ok: true } | { ok: false; error: string }

export interface SteamHeroCacheResult {
  url: string
  path: string
  fromCache: boolean
}

export interface CollectionSteamDetails {
  steamAppId: string
  language: string
  name: string
  shortDescription: string
  descriptionHtml: string
  developers: string[]
  publishers: string[]
  genres: string[]
  features: string[]
  releaseDate?: string
  website?: string
  storeUrl: string
}

export type CollectionArtKind = 'cover' | 'hero'

export interface CollectionGameArt {
  coverUrl?: string
  heroUrl?: string
}

export type CollectionWebImageSource = 'duckduckgo'

export interface CollectionWebImage {
  imageUrl: string
  thumbUrl: string
  width: number
  height: number
}

export interface CollectionWebImageSearchArgs {
  query: string
  source?: CollectionWebImageSource
  transparent?: boolean
}

export type CollectionBackupInterval = 'daily' | 'weekly' | 'monthly'

export interface CollectionBackupSettings {
  folder: string
  interval: CollectionBackupInterval
  lastBackupAt?: string
  lastBackupPath?: string
  lastError?: string
}

export type MetadataSourceId =
  | 'igdb'
  | 'steam'
  | 'store'
  | 'playnite'
  | 'lutris'
  | 'manual'

export type MetadataField =
  | 'description'
  | 'releaseDate'
  | 'developers'
  | 'publishers'
  | 'genres'
  | 'themes'
  | 'gameModes'
  | 'platforms'
  | 'series'
  | 'features'
  | 'criticScore'
  | 'cover'
  | 'hero'

export const METADATA_FIELDS: MetadataField[] = [
  'description',
  'releaseDate',
  'developers',
  'publishers',
  'genres',
  'themes',
  'gameModes',
  'platforms',
  'series',
  'features',
  'criticScore',
  'cover',
  'hero'
]

export type CoverAspectPreset =
  | 'steam'
  | 'igdb'
  | 'gog'
  | 'square'
  | 'dvd'
  | 'banner'

export const DEFAULT_FIELD_PRIORITY: Record<MetadataField, MetadataSourceId[]> =
  {
    description: ['igdb', 'steam', 'store', 'lutris', 'playnite'],
    releaseDate: ['igdb', 'steam', 'store', 'lutris', 'playnite'],
    developers: ['igdb', 'steam', 'store', 'playnite', 'lutris'],
    publishers: ['igdb', 'steam', 'store', 'playnite'],
    genres: ['igdb', 'steam', 'store', 'playnite', 'lutris'],
    themes: ['igdb', 'playnite'],
    gameModes: ['igdb'],
    platforms: ['igdb', 'store', 'playnite', 'lutris'],
    series: ['igdb', 'playnite'],
    features: ['igdb', 'steam', 'playnite'],
    criticScore: ['igdb', 'steam'],
    cover: ['igdb', 'steam', 'lutris', 'playnite', 'store'],
    hero: ['igdb', 'steam', 'lutris', 'playnite']
  }

export interface CollectionMetadataSettings {
  igdbClientId: string
  igdbClientSecret: string
  coverAspect: CoverAspectPreset
  downloadImages: boolean
  autoFillMissing: boolean
  fieldPriority: Record<MetadataField, MetadataSourceId[]>
}

export interface CollectionGameMetadata {
  appName: string
  runner: string
  igdbId?: number
  igdbSlug?: string
  lutrisSlug?: string
  steamAppId?: string
  title?: string
  description?: string
  releaseDate?: string
  developers: string[]
  publishers: string[]
  genres: string[]
  themes: string[]
  gameModes: string[]
  platforms: string[]
  series?: string
  features: string[]
  criticScore?: number
  websites: string[]
  notes?: string
  coverUrl?: string
  heroUrl?: string
  fieldSources: Partial<Record<MetadataField, MetadataSourceId>>
  fetchedAt?: string
  fetchError?: string
}

export interface CollectionGameDetailsPatch {
  appName: string
  runner: string
  title?: string
  notes?: string
  description?: string
  releaseDate?: string
  developers?: string[]
  publishers?: string[]
  genres?: string[]
  themes?: string[]
  gameModes?: string[]
  platforms?: string[]
  series?: string
  features?: string[]
  criticScore?: number | null
  websites?: string[]
}

export interface CollectionGameDetailsResult {
  metadata: CollectionGameMetadata
  meta?: LocalGameMeta
}

export interface CollectionMetadataCandidate {
  source: MetadataSourceId
  matchName?: string
  matchYear?: number
  metadata: CollectionGameMetadata
}

export interface CollectionMetadataPreview {
  appName: string
  current?: CollectionGameMetadata
  proposed: CollectionGameMetadata
  candidates: CollectionMetadataCandidate[]
  igdbConfigured: boolean
}

export interface CollectionMetadataApplyArgs {
  appName: string
  runner: string
  title: string
  steamAppId?: string
  source?: MetadataSourceId | 'auto'
  fieldPicks?: Partial<Record<MetadataField, MetadataSourceId | 'keep'>>
  overwriteExisting?: boolean
  preserveManual?: boolean
  downloadImages?: boolean
  igdbId?: number
  lutrisSlug?: string
}

export interface CollectionMetadataSearchHit {
  source: MetadataSourceId
  id: string
  name: string
  year?: number
  extra?: string
}

export interface CollectionMetadataBulkItem {
  appName: string
  runner: string
  title: string
  steamAppId?: string
}

export interface CollectionMetadataBulkArgs {
  games: CollectionMetadataBulkItem[]
  overwriteExisting?: boolean
  preserveManual?: boolean
  downloadImages?: boolean
}

export interface CollectionMetadataBulkResult {
  updated: number
  skipped: number
  failed: number
  errors: string[]
}

export type CollectionMetadataBulkState =
  | 'idle'
  | 'running'
  | 'cancelling'
  | 'done'

export interface CollectionMetadataBulkProgress {
  state: CollectionMetadataBulkState
  total: number
  processed: number
  updated: number
  skipped: number
  failed: number
  percent: number
  currentTitle?: string
  errors: string[]
}

export interface IgdbCredentialTest {
  ok: boolean
  error?: string
}

export interface CollectionScreenshot {
  id: string
  name: string
  url: string
  takenAt?: number
}

export interface CollectionScreenshotsResult {
  folder?: string
  matchedFolder?: string
  items: CollectionScreenshot[]
}

export interface CollectionScreenshotsSettings {
  folder: string
  cacheLimitMb: number
  captureEnabled: boolean
  captureAccelerator: string
}

export interface CollectionScreenshotCaptureStatus {
  registered: boolean
  accelerator: string
  activeGame?: {
    appName: string
    runner: 'sideload' | 'legendary' | 'gog' | 'nile' | 'zoom'
    title: string
  }
  error?: string
}

export interface CollectionScreenshotCaptureResult {
  ok: boolean
  path?: string
  error?: string
  skippedReason?:
    | 'disabled'
    | 'no-active-game'
    | 'folder-not-configured'
    | 'capture-unavailable'
    | 'busy'
}

export interface CollectionScreenshotSaved {
  appName: string
  runner: 'sideload' | 'legendary' | 'gog' | 'nile' | 'zoom'
  path: string
}

export interface CollectionScreenshotCacheInfo {
  sizeBytes: number
  itemCount: number
  limitBytes: number
}

export interface CollectionSettings {
  backup: CollectionBackupSettings
  ludusavi: LudusaviSettings
  ludusaviDetected?: LudusaviDetectedConfig
  greyUninstalledGames: boolean
  screenshots: CollectionScreenshotsSettings
  metadata: CollectionMetadataSettings
}

export type LudusaviBackupFormat = 'simple' | 'zip'
export type LudusaviCompression = 'none' | 'deflate' | 'bzip2' | 'zstd'

export interface LudusaviDetectedConfig {
  binary: string
  configPath?: string
  backupPath?: string
  format?: LudusaviBackupFormat
  compression?: LudusaviCompression
  version?: string
}

export interface LudusaviSettings {
  enabled: boolean
  useInstalledConfig: boolean
  binaryPath: string
  backupPath: string
  format: LudusaviBackupFormat
  compression: LudusaviCompression
  lastBackupAt?: string
  lastBackupGame?: string
  lastBackupPath?: string
  lastError?: string
}

export interface LudusaviBackupResult {
  ran: boolean
  skippedReason?: 'disabled' | 'not-found' | 'no-match' | 'already-running'
  gameName?: string
  backupPath?: string
  totalGames?: number
  error?: string
}

export interface CollectionBackupResult {
  ran: boolean
  skippedReason?: 'disabled' | 'not-due' | 'already-running'
  path?: string
  error?: string
}
