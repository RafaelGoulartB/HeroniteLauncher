import Store from 'electron-store'
import type {
  CollectionBackupInterval,
  CollectionBackupSettings,
  CollectionMetadataSettings,
  CollectionSettings,
  CoverAspectPreset,
  LudusaviBackupFormat,
  LudusaviCompression,
  LudusaviSettings,
  MetadataSourceId
} from 'common/types/local-library'
import {
  DEFAULT_FIELD_PRIORITY,
  METADATA_FIELDS
} from 'common/types/local-library'

type SettingsFile = {
  backup: CollectionBackupSettings
  ludusavi: LudusaviSettings
  greyUninstalledGames: boolean
  metadata: CollectionMetadataSettings
}

const SOURCE_IDS: MetadataSourceId[] = [
  'igdb',
  'steam',
  'store',
  'playnite',
  'lutris',
  'manual'
]

function asCoverAspect(value?: string): CoverAspectPreset {
  if (
    value === 'igdb' ||
    value === 'gog' ||
    value === 'square' ||
    value === 'dvd' ||
    value === 'banner'
  ) {
    return value
  }
  return 'steam'
}

function asSourceList(value: unknown, fallback: MetadataSourceId[]) {
  if (!Array.isArray(value)) return [...fallback]
  const next = value.filter(
    (item): item is MetadataSourceId =>
      typeof item === 'string' && SOURCE_IDS.includes(item as MetadataSourceId)
  )
  return next.length ? next : [...fallback]
}

function fallbackMetadata(): CollectionMetadataSettings {
  return {
    igdbClientId: '',
    igdbClientSecret: '',
    coverAspect: 'steam',
    downloadImages: false,
    autoFillMissing: true,
    fieldPriority: { ...DEFAULT_FIELD_PRIORITY }
  }
}

function normalizeMetadata(
  value?: Partial<CollectionMetadataSettings>
): CollectionMetadataSettings {
  const fallback = fallbackMetadata()
  const fieldPriority = { ...fallback.fieldPriority }
  for (const field of METADATA_FIELDS) {
    fieldPriority[field] = asSourceList(
      value?.fieldPriority?.[field],
      DEFAULT_FIELD_PRIORITY[field]
    )
  }
  return {
    igdbClientId: value?.igdbClientId?.trim() ?? '',
    igdbClientSecret: value?.igdbClientSecret ?? '',
    coverAspect: asCoverAspect(value?.coverAspect),
    downloadImages: Boolean(value?.downloadImages),
    autoFillMissing: value?.autoFillMissing !== false,
    fieldPriority
  }
}

const settingsFile = new Store<SettingsFile>({
  cwd: 'local_library',
  name: 'settings',
  defaults: {
    backup: {
      folder: '',
      interval: 'weekly'
    },
    ludusavi: {
      enabled: false,
      useInstalledConfig: true,
      binaryPath: '',
      backupPath: '',
      format: 'zip',
      compression: 'deflate'
    },
    greyUninstalledGames: true,
    metadata: fallbackMetadata()
  }
})

function fallbackBackup(): CollectionBackupSettings {
  return {
    folder: '',
    interval: 'weekly'
  }
}

function fallbackLudusavi(): LudusaviSettings {
  return {
    enabled: false,
    useInstalledConfig: true,
    binaryPath: '',
    backupPath: '',
    format: 'zip',
    compression: 'deflate'
  }
}

function asFormat(value?: string): LudusaviBackupFormat {
  return value === 'simple' ? 'simple' : 'zip'
}

function asCompression(value?: string): LudusaviCompression {
  return value === 'none' || value === 'bzip2' || value === 'zstd'
    ? value
    : 'deflate'
}

export function getCollectionSettings(): CollectionSettings {
  const backup = settingsFile.get('backup') ?? fallbackBackup()
  const ludusavi = settingsFile.get('ludusavi') ?? fallbackLudusavi()
  const interval: CollectionBackupInterval =
    backup.interval === 'daily' ||
    backup.interval === 'weekly' ||
    backup.interval === 'monthly'
      ? backup.interval
      : 'weekly'
  return {
    backup: {
      folder: backup.folder ?? '',
      interval,
      lastBackupAt: backup.lastBackupAt,
      lastBackupPath: backup.lastBackupPath,
      lastError: backup.lastError
    },
    ludusavi: {
      enabled: Boolean(ludusavi.enabled),
      useInstalledConfig: ludusavi.useInstalledConfig !== false,
      binaryPath: ludusavi.binaryPath ?? '',
      backupPath: ludusavi.backupPath ?? '',
      format: asFormat(ludusavi.format),
      compression: asCompression(ludusavi.compression),
      lastBackupAt: ludusavi.lastBackupAt,
      lastBackupGame: ludusavi.lastBackupGame,
      lastBackupPath: ludusavi.lastBackupPath,
      lastError: ludusavi.lastError
    },
    greyUninstalledGames: settingsFile.get('greyUninstalledGames') !== false,
    metadata: normalizeMetadata(settingsFile.get('metadata'))
  }
}

export function setCollectionUiSettings(args: {
  greyUninstalledGames: boolean
}): CollectionSettings {
  settingsFile.set('greyUninstalledGames', args.greyUninstalledGames)
  return getCollectionSettings()
}

export function setCollectionBackupSettings(args: {
  folder: string
  interval: CollectionBackupInterval
}): CollectionSettings {
  const current = getCollectionSettings()
  settingsFile.set('backup', {
    ...current.backup,
    folder: args.folder.trim(),
    interval: args.interval
  })
  return getCollectionSettings()
}

export function setLudusaviSettings(
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
): CollectionSettings {
  const current = getCollectionSettings()
  settingsFile.set('ludusavi', {
    ...current.ludusavi,
    ...args,
    binaryPath: args.binaryPath?.trim() ?? current.ludusavi.binaryPath,
    backupPath: args.backupPath?.trim() ?? current.ludusavi.backupPath
  })
  return getCollectionSettings()
}

export function recordCollectionBackup(args: {
  at: string
  path?: string
  error?: string
}): CollectionSettings {
  const current = getCollectionSettings()
  settingsFile.set('backup', {
    ...current.backup,
    lastBackupAt: args.error ? current.backup.lastBackupAt : args.at,
    lastBackupPath: args.error ? current.backup.lastBackupPath : args.path,
    lastError: args.error
  })
  return getCollectionSettings()
}

export function recordLudusaviBackup(args: {
  at?: string
  game?: string
  path?: string
  error?: string
}): CollectionSettings {
  const current = getCollectionSettings()
  settingsFile.set('ludusavi', {
    ...current.ludusavi,
    lastBackupAt: args.error ? current.ludusavi.lastBackupAt : args.at,
    lastBackupGame: args.error ? current.ludusavi.lastBackupGame : args.game,
    lastBackupPath: args.error ? current.ludusavi.lastBackupPath : args.path,
    lastError: args.error
  })
  return getCollectionSettings()
}

export function setCollectionMetadataSettings(
  args: Partial<CollectionMetadataSettings>
): CollectionSettings {
  const current = getCollectionSettings().metadata
  settingsFile.set(
    'metadata',
    normalizeMetadata({
      ...current,
      ...args,
      igdbClientId: args.igdbClientId ?? current.igdbClientId,
      igdbClientSecret: args.igdbClientSecret ?? current.igdbClientSecret,
      fieldPriority: args.fieldPriority
        ? { ...current.fieldPriority, ...args.fieldPriority }
        : current.fieldPriority
    })
  )
  return getCollectionSettings()
}
