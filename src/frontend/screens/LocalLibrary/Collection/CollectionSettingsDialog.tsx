import type { KeyboardEvent as ReactKeyboardEvent, SyntheticEvent } from 'react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  CollectionBackupInterval,
  CollectionMetadataSettings,
  CollectionScreenshotCacheInfo,
  CollectionScreenshotCaptureStatus,
  CollectionSettings,
  CoverAspectPreset,
  LudusaviBackupFormat,
  LudusaviCompression,
  MetadataField,
  MetadataSourceId,
  RomScanner,
  UserEmulator
} from 'common/types/local-library'
import {
  DEFAULT_FIELD_PRIORITY,
  METADATA_FIELDS
} from 'common/types/local-library'
import {
  PathSelectionBox,
  SelectField,
  TabPanel,
  TextInputField,
  ToggleSwitch,
  WarningMessage
} from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import { MenuItem, Tab, Tabs } from '@mui/material'
import EmulatorManager from './EmulatorManager'
import './CollectionSettingsDialog.css'

type Props = {
  onClose: () => void
  onSettingsChange?: (settings: CollectionSettings) => void
  onOpenMetadataWizard?: () => void
  onOpenScan?: (seed?: {
    emulatorId?: string
    profileId?: string
    directory?: string
  }) => void
}

type SettingsTab = 'appearance' | 'metadata' | 'emulators' | 'backup' | 'saves'

function formatBackupTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
}

function formatCacheSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function acceleratorFromKey(event: ReactKeyboardEvent<HTMLInputElement>) {
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return null
  const namedKeys: Record<string, string> = {
    ' ': 'Space',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    PrintScreen: 'PrintScreen'
  }
  const key =
    namedKeys[event.key] ??
    (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  const modifiers = [
    event.ctrlKey || event.metaKey ? 'CommandOrControl' : '',
    event.altKey ? 'Alt' : '',
    event.shiftKey ? 'Shift' : ''
  ].filter(Boolean)
  return [...modifiers, key].join('+')
}

const FIELD_LABELS: Record<MetadataField, string> = {
  description: 'Description',
  releaseDate: 'Release date',
  developers: 'Developers',
  publishers: 'Publishers',
  genres: 'Genres',
  themes: 'Themes',
  gameModes: 'Game modes',
  platforms: 'Platforms',
  series: 'Series',
  features: 'Features',
  criticScore: 'Score',
  cover: 'Cover',
  hero: 'Background'
}

export default function CollectionSettingsDialog({
  onClose,
  onSettingsChange,
  onOpenMetadataWizard,
  onOpenScan
}: Props) {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance')
  const [settings, setSettings] = useState<CollectionSettings | null>(null)
  const [folder, setFolder] = useState('')
  const [interval, setInterval] = useState<CollectionBackupInterval>('weekly')
  const [greyUninstalledGames, setGreyUninstalledGames] = useState(true)
  const [screenshotsFolder, setScreenshotsFolder] = useState('')
  const [screenshotCacheLimit, setScreenshotCacheLimit] = useState('500')
  const [screenshotCacheInfo, setScreenshotCacheInfo] =
    useState<CollectionScreenshotCacheInfo | null>(null)
  const [screenshotCacheBusy, setScreenshotCacheBusy] = useState(false)
  const [screenshotCacheMessage, setScreenshotCacheMessage] = useState('')
  const [screenshotCaptureEnabled, setScreenshotCaptureEnabled] =
    useState(false)
  const [screenshotAccelerator, setScreenshotAccelerator] = useState('F10')
  const [screenshotCaptureStatus, setScreenshotCaptureStatus] =
    useState<CollectionScreenshotCaptureStatus | null>(null)
  const [ludusaviEnabled, setLudusaviEnabled] = useState(false)
  const [useInstalledConfig, setUseInstalledConfig] = useState(true)
  const [ludusaviBinary, setLudusaviBinary] = useState('')
  const [ludusaviFolder, setLudusaviFolder] = useState('')
  const [ludusaviFormat, setLudusaviFormat] =
    useState<LudusaviBackupFormat>('zip')
  const [ludusaviCompression, setLudusaviCompression] =
    useState<LudusaviCompression>('deflate')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [igdbClientId, setIgdbClientId] = useState('')
  const [igdbClientSecret, setIgdbClientSecret] = useState('')
  const [coverAspect, setCoverAspect] = useState<CoverAspectPreset>('steam')
  const [downloadImages, setDownloadImages] = useState(false)
  const [autoFillMissing, setAutoFillMissing] = useState(true)
  const [fieldPriority, setFieldPriority] = useState(DEFAULT_FIELD_PRIORITY)
  const [igdbTest, setIgdbTest] = useState('')

  async function reload() {
    const [next, cacheInfo, captureStatus] = await Promise.all([
      window.api.localLibrary.getSettings(),
      window.api.localLibrary.getScreenshotCacheInfo(),
      window.api.localLibrary.getScreenshotCaptureStatus()
    ])
    setSettings(next)
    setScreenshotCacheInfo(cacheInfo)
    setScreenshotCaptureStatus(captureStatus)
    setFolder(next.backup.folder)
    setInterval(next.backup.interval)
    setLudusaviEnabled(next.ludusavi.enabled)
    setUseInstalledConfig(next.ludusavi.useInstalledConfig)
    setLudusaviBinary(next.ludusavi.binaryPath)
    setLudusaviFolder(next.ludusavi.backupPath)
    setLudusaviFormat(next.ludusavi.format)
    setLudusaviCompression(next.ludusavi.compression)
    setGreyUninstalledGames(next.greyUninstalledGames !== false)
    setScreenshotsFolder(next.screenshots?.folder ?? '')
    setScreenshotCacheLimit(String(next.screenshots.cacheLimitMb))
    setScreenshotCaptureEnabled(next.screenshots.captureEnabled)
    setScreenshotAccelerator(next.screenshots.captureAccelerator)
    setIgdbClientId(next.metadata.igdbClientId)
    setIgdbClientSecret(next.metadata.igdbClientSecret)
    setCoverAspect(next.metadata.coverAspect)
    setDownloadImages(next.metadata.downloadImages)
    setAutoFillMissing(next.metadata.autoFillMissing !== false)
    setFieldPriority(next.metadata.fieldPriority)
  }

  useEffect(() => {
    void reload()
  }, [])

  async function persistUi(nextGrey = greyUninstalledGames) {
    setSaving(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setUiSettings({
        greyUninstalledGames: nextGrey
      })
      setSettings(next)
      setGreyUninstalledGames(next.greyUninstalledGames)
      onSettingsChange?.(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function persistScreenshots(
    nextFolder = screenshotsFolder,
    nextCacheLimit = Number(screenshotCacheLimit),
    nextCaptureEnabled = screenshotCaptureEnabled,
    nextAccelerator = screenshotAccelerator
  ) {
    setSaving(true)
    setError('')
    setScreenshotCacheMessage('')
    try {
      const next = await window.api.localLibrary.setScreenshotsSettings({
        folder: nextFolder,
        cacheLimitMb: nextCacheLimit,
        captureEnabled: nextCaptureEnabled,
        captureAccelerator: nextAccelerator
      })
      setSettings(next)
      setScreenshotsFolder(next.screenshots.folder)
      setScreenshotCacheLimit(String(next.screenshots.cacheLimitMb))
      setScreenshotCaptureEnabled(next.screenshots.captureEnabled)
      setScreenshotAccelerator(next.screenshots.captureAccelerator)
      setScreenshotCacheInfo(
        await window.api.localLibrary.getScreenshotCacheInfo()
      )
      setScreenshotCaptureStatus(
        await window.api.localLibrary.getScreenshotCaptureStatus()
      )
      onSettingsChange?.(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function clearScreenshotCache() {
    setScreenshotCacheBusy(true)
    setError('')
    setScreenshotCacheMessage('')
    try {
      const info = await window.api.localLibrary.clearScreenshotCache()
      setScreenshotCacheInfo(info)
      setScreenshotCacheMessage(
        t(
          'collection.settings.screenshotCacheCleared',
          'Screenshot preview cache cleared.'
        )
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setScreenshotCacheBusy(false)
    }
  }

  async function persistMetadata(patch: Partial<CollectionMetadataSettings>) {
    setSaving(true)
    setError('')
    setIgdbTest('')
    try {
      const next = await window.api.localLibrary.setMetadataSettings(patch)
      setSettings(next)
      setIgdbClientId(next.metadata.igdbClientId)
      setIgdbClientSecret(next.metadata.igdbClientSecret)
      setCoverAspect(next.metadata.coverAspect)
      setDownloadImages(next.metadata.downloadImages)
      setAutoFillMissing(next.metadata.autoFillMissing)
      setFieldPriority(next.metadata.fieldPriority)
      onSettingsChange?.(next)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  function preferredSource(field: MetadataField): string {
    const current = fieldPriority[field] ?? DEFAULT_FIELD_PRIORITY[field]
    const fallback = DEFAULT_FIELD_PRIORITY[field]
    if (current.join(',') === fallback.join(',')) return 'auto'
    return current[0] || 'auto'
  }

  function handlePreferredSource(field: MetadataField, value: string) {
    const next = {
      ...fieldPriority,
      [field]:
        value === 'auto'
          ? DEFAULT_FIELD_PRIORITY[field]
          : [
              value as MetadataSourceId,
              ...DEFAULT_FIELD_PRIORITY[field].filter((item) => item !== value)
            ]
    }
    setFieldPriority(next)
    void persistMetadata({ fieldPriority: next })
  }

  async function handleTestIgdb() {
    setSaving(true)
    setError('')
    setIgdbTest('')
    try {
      if (
        igdbClientId !== settings?.metadata.igdbClientId ||
        igdbClientSecret !== settings?.metadata.igdbClientSecret
      ) {
        await persistMetadata({
          igdbClientId,
          igdbClientSecret
        })
      }
      const result = await window.api.localLibrary.testIgdbCredentials()
      if (result.ok) {
        setIgdbTest(t('collection.metadata.igdbOk', 'IGDB credentials work.'))
        return
      }
      setError(
        result.error || t('collection.metadata.igdbFail', 'IGDB test failed.')
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function persist(nextFolder = folder, nextInterval = interval) {
    setSaving(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setBackupSettings({
        folder: nextFolder,
        interval: nextInterval
      })
      setSettings(next)
      setFolder(next.backup.folder)
      setInterval(next.backup.interval)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function persistLudusavi(
    patch: Parameters<typeof window.api.localLibrary.setLudusaviSettings>[0]
  ) {
    setSaving(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setLudusaviSettings(patch)
      setSettings(next)
      setLudusaviEnabled(next.ludusavi.enabled)
      setUseInstalledConfig(next.ludusavi.useInstalledConfig)
      setLudusaviBinary(next.ludusavi.binaryPath)
      setLudusaviFolder(next.ludusavi.backupPath)
      setLudusaviFormat(next.ludusavi.format)
      setLudusaviCompression(next.ludusavi.compression)
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  async function handleBackupNow() {
    setRunning(true)
    setError('')
    setMessage('')
    try {
      if (
        folder !== settings?.backup.folder ||
        interval !== settings.backup.interval
      ) {
        await persist()
      }
      const result = await window.api.localLibrary.runBackup(true)
      await reload()
      if (result.error) {
        setError(result.error)
        return
      }
      if (result.ran && result.path) {
        setMessage(
          t('collection.settings.backupDone', 'Backup saved to {{path}}', {
            path: result.path
          })
        )
        return
      }
      setMessage(
        t('collection.settings.backupSkipped', 'Backup is already up to date.')
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setRunning(false)
    }
  }

  const lastBackup = settings?.backup.lastBackupAt
    ? formatBackupTime(settings.backup.lastBackupAt)
    : t('collection.settings.backupNever', 'Never')
  const lastSaveBackup = settings?.ludusavi.lastBackupAt
    ? formatBackupTime(settings.ludusavi.lastBackupAt)
    : t('collection.settings.backupNever', 'Never')
  const detected = settings?.ludusaviDetected
  const overridesLocked = useInstalledConfig && Boolean(detected?.configPath)

  function handleTabChange(_event: SyntheticEvent, next: SettingsTab) {
    setActiveTab(next)
  }

  return (
    <Dialog
      onClose={onClose}
      showCloseButton
      className="CollectionSettingsDialog"
    >
      <DialogHeader>
        {t('collection.settings.title', 'Collection settings')}
      </DialogHeader>
      <DialogContent className="CollectionSettingsDialog__content">
        <Tabs
          value={activeTab}
          onChange={handleTabChange}
          aria-label={t(
            'collection.settings.tabsLabel',
            'Collection settings tabs'
          )}
          variant="scrollable"
        >
          <Tab
            label={t('collection.settings.tab.appearance', 'Appearance')}
            value="appearance"
          />
          <Tab
            label={t('collection.settings.tab.metadata', 'Metadata')}
            value="metadata"
          />
          <Tab
            label={t('collection.settings.tab.emulators', 'Emulators')}
            value="emulators"
          />
          <Tab
            label={t('collection.settings.tab.backup', 'Backup')}
            value="backup"
          />
          <Tab
            label={t('collection.settings.tab.saves', 'Save backup')}
            value="saves"
          />
        </Tabs>

        <TabPanel value={activeTab} index="appearance">
          <section className="CollectionSettingsDialog__section">
            <ToggleSwitch
              htmlId="collection-grey-uninstalled"
              value={greyUninstalledGames}
              disabled={saving}
              handleChange={() => {
                const next = !greyUninstalledGames
                setGreyUninstalledGames(next)
                void persistUi(next)
              }}
              title={t(
                'collection.settings.greyUninstalled',
                'Fade uninstalled games'
              )}
            />
            <p className="CollectionSettingsDialog__meta">
              {t(
                'collection.settings.greyUninstalledHelp',
                'Uninstalled covers appear grey. Turn this off to keep their original colour.'
              )}
            </p>
          </section>
          <section className="CollectionSettingsDialog__section">
            <h5 className="CollectionSettingsDialog__subheading">
              {t('collection.settings.screenshotsHeading', 'Screenshots')}
            </h5>
            <p className="CollectionSettingsDialog__meta">
              {t(
                'collection.settings.screenshotsHelp',
                'Folder with a subfolder per game (Xbox Game Bar Captures, NVIDIA, etc.). Collection matches those names to the selected game even when they are not identical.'
              )}
            </p>
            <PathSelectionBox
              htmlId="collection-screenshots-folder"
              type="directory"
              path={screenshotsFolder}
              onPathChange={(next) => {
                setScreenshotsFolder(next)
                void persistScreenshots(next)
              }}
              label={t(
                'collection.settings.screenshotsFolder',
                'Screenshots folder'
              )}
              pathDialogTitle={t(
                'collection.settings.screenshotsFolder',
                'Screenshots folder'
              )}
            />
            <ToggleSwitch
              htmlId="collection-screenshot-capture-enabled"
              disabled={saving}
              value={screenshotCaptureEnabled}
              handleChange={() => {
                const next = !screenshotCaptureEnabled
                setScreenshotCaptureEnabled(next)
                void persistScreenshots(
                  screenshotsFolder,
                  Number(screenshotCacheLimit),
                  next
                )
              }}
              title={t(
                'collection.settings.screenshotCaptureEnabled',
                'Capture screenshots while a game is running'
              )}
            />
            <TextInputField
              htmlId="collection-screenshot-hotkey"
              extraClass="CollectionSettingsDialog__captureHotkey"
              value={screenshotAccelerator}
              readOnly
              disabled={saving}
              onChange={() => {}}
              onKeyDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
                const next = acceleratorFromKey(event)
                if (!next) return
                setScreenshotAccelerator(next)
                void persistScreenshots(
                  screenshotsFolder,
                  Number(screenshotCacheLimit),
                  screenshotCaptureEnabled,
                  next
                )
              }}
              label={t(
                'collection.settings.screenshotCaptureHotkey',
                'Screenshot shortcut'
              )}
            />
            <p className="CollectionSettingsDialog__meta">
              {t(
                'collection.settings.screenshotCaptureHelp',
                'Click the shortcut field and press the desired key combination. Captures are saved in the matched game folder and appear automatically in Collection.'
              )}
            </p>
            {screenshotCaptureEnabled &&
              screenshotCaptureStatus?.registered && (
                <p className="CollectionSettingsDialog__ok">
                  {t(
                    'collection.settings.screenshotCaptureReady',
                    'Shortcut registered and ready.'
                  )}
                </p>
              )}
            {screenshotCaptureEnabled &&
              !screenshotCaptureStatus?.registered &&
              !screenshotCaptureStatus?.error && (
                <p className="CollectionSettingsDialog__meta">
                  {t(
                    'collection.settings.screenshotCaptureWaiting',
                    'The shortcut activates automatically when a game starts.'
                  )}
                </p>
              )}
            {screenshotCaptureEnabled && screenshotCaptureStatus?.error && (
              <p className="CollectionSettingsDialog__error">
                {screenshotCaptureStatus.error}
              </p>
            )}
            <TextInputField
              htmlId="collection-screenshot-cache-limit"
              extraClass="CollectionSettingsDialog__cacheLimit"
              type="number"
              min={50}
              max={10000}
              step={50}
              value={screenshotCacheLimit}
              disabled={saving || screenshotCacheBusy}
              onChange={setScreenshotCacheLimit}
              onBlur={() =>
                void persistScreenshots(
                  screenshotsFolder,
                  Number(screenshotCacheLimit)
                )
              }
              label={t(
                'collection.settings.screenshotCacheLimit',
                'Preview cache limit (MB)'
              )}
            />
            <div className="CollectionSettingsDialog__actions">
              <button
                type="button"
                className="button outline"
                disabled={
                  saving ||
                  screenshotCacheBusy ||
                  !screenshotCacheInfo?.itemCount
                }
                onClick={() => void clearScreenshotCache()}
              >
                {screenshotCacheBusy
                  ? t(
                      'collection.settings.screenshotCacheClearing',
                      'Clearing…'
                    )
                  : t(
                      'collection.settings.screenshotCacheClear',
                      'Clear preview cache'
                    )}
              </button>
            </div>
            {screenshotCacheInfo && (
              <p className="CollectionSettingsDialog__meta">
                {t(
                  'collection.settings.screenshotCacheUsage',
                  '{{size}} used by {{count}} previews · {{limit}} limit',
                  {
                    size: formatCacheSize(screenshotCacheInfo.sizeBytes),
                    count: screenshotCacheInfo.itemCount,
                    limit: formatCacheSize(screenshotCacheInfo.limitBytes)
                  }
                )}
              </p>
            )}
            {screenshotCacheMessage && (
              <p className="CollectionSettingsDialog__ok">
                {screenshotCacheMessage}
              </p>
            )}
          </section>
        </TabPanel>

        <TabPanel value={activeTab} index="metadata">
          <section className="CollectionSettingsDialog__section">
            <p>
              {t(
                'collection.metadata.settingsHelp',
                'Collection uses IGDB first, then Steam, store pages, Lutris, and Playnite files. Create a Twitch app to get IGDB keys: https://dev.twitch.tv/console'
              )}
            </p>

            <h5 className="CollectionSettingsDialog__subheading">
              {t('collection.metadata.igdbHeading', 'Twitch / IGDB API')}
            </h5>
            <TextInputField
              htmlId="collection-igdb-id"
              label={t(
                'collection.metadata.clientId',
                'Twitch / IGDB Client ID'
              )}
              value={igdbClientId}
              onChange={setIgdbClientId}
              onBlur={() => void persistMetadata({ igdbClientId })}
            />
            <TextInputField
              htmlId="collection-igdb-secret"
              type="password"
              label={t(
                'collection.metadata.clientSecret',
                'Twitch / IGDB Client Secret'
              )}
              value={igdbClientSecret}
              onChange={setIgdbClientSecret}
              onBlur={() => void persistMetadata({ igdbClientSecret })}
            />
            <div className="CollectionSettingsDialog__actions">
              <button
                type="button"
                className="button outline"
                disabled={saving}
                onClick={() => void handleTestIgdb()}
              >
                {t('collection.metadata.testIgdb', 'Test IGDB')}
              </button>
              <button
                type="button"
                className="button is-primary"
                disabled={saving}
                onClick={() => onOpenMetadataWizard?.()}
              >
                {t('collection.metadata.wizard.open', 'Download metadata…')}
              </button>
            </div>
            {igdbTest && (
              <p className="CollectionSettingsDialog__ok">{igdbTest}</p>
            )}

            <h5 className="CollectionSettingsDialog__subheading">
              {t('collection.metadata.imagesHeading', 'Images & fields')}
            </h5>
            <SelectField
              htmlId="collection-cover-aspect"
              label={t('collection.metadata.coverAspect', 'Cover aspect')}
              value={coverAspect}
              disabled={saving}
              onChange={(event) => {
                const next = event.target.value as CoverAspectPreset
                setCoverAspect(next)
                void persistMetadata({ coverAspect: next })
              }}
            >
              <MenuItem value="steam">Steam (2:3)</MenuItem>
              <MenuItem value="igdb">IGDB (3:4)</MenuItem>
              <MenuItem value="gog">GOG</MenuItem>
              <MenuItem value="square">
                {t('collection.metadata.square', 'Square')}
              </MenuItem>
              <MenuItem value="dvd">DVD (5:7)</MenuItem>
              <MenuItem value="banner">Banner (16:9)</MenuItem>
            </SelectField>
            <ToggleSwitch
              htmlId="collection-metadata-autofill"
              value={autoFillMissing}
              disabled={saving}
              handleChange={() => {
                const next = !autoFillMissing
                setAutoFillMissing(next)
                void persistMetadata({ autoFillMissing: next })
              }}
              title={t(
                'collection.metadata.autoFill',
                'Fill missing metadata in the background'
              )}
            />
            <ToggleSwitch
              htmlId="collection-metadata-download"
              value={downloadImages}
              disabled={saving}
              handleChange={() => {
                const next = !downloadImages
                setDownloadImages(next)
                void persistMetadata({ downloadImages: next })
              }}
              title={t(
                'collection.metadata.downloadImages',
                'Copy covers to disk (default keeps CDN URLs)'
              )}
            />

            <details className="advancedFields">
              <summary>
                {t(
                  'collection.metadata.priorityHeading',
                  'Field priority (advanced)'
                )}
              </summary>
              <p className="CollectionSettingsDialog__meta">
                {t(
                  'collection.metadata.priorityHelp',
                  'Preferred source per field. Other sources still fill empty values.'
                )}
              </p>
              <div className="CollectionSettingsDialog__priority">
                {METADATA_FIELDS.map((field) => (
                  <SelectField
                    key={field}
                    htmlId={`collection-priority-${field}`}
                    label={t(
                      `collection.metadata.field.${field}`,
                      FIELD_LABELS[field]
                    )}
                    value={preferredSource(field)}
                    disabled={saving}
                    onChange={(event) =>
                      handlePreferredSource(field, event.target.value)
                    }
                  >
                    <MenuItem value="auto">
                      {t('collection.metadata.auto', 'Auto (IGDB first)')}
                    </MenuItem>
                    <MenuItem value="igdb">IGDB</MenuItem>
                    <MenuItem value="steam">Steam</MenuItem>
                    <MenuItem value="store">
                      {t('collection.metadata.store', 'Store')}
                    </MenuItem>
                    <MenuItem value="lutris">Lutris</MenuItem>
                    <MenuItem value="playnite">Playnite</MenuItem>
                  </SelectField>
                ))}
              </div>
            </details>
          </section>
        </TabPanel>

        <TabPanel value={activeTab} index="emulators">
          <EmulatorManager
            onScan={(scanner?: RomScanner, emulator?: UserEmulator) => {
              onClose()
              onOpenScan?.({
                emulatorId: emulator?.id ?? scanner?.emulatorId,
                profileId: scanner?.profileId,
                directory: scanner?.directory
              })
            }}
          />
        </TabPanel>

        <TabPanel value={activeTab} index="backup">
          <section className="CollectionSettingsDialog__section">
            <p>
              {t(
                'collection.settings.backupHelp',
                'Copies Heroic config (Collection, playtime, statuses, Local games, logins) into the folder below. Installed games are not included. Cache and Wine tools are skipped. A dated folder is created when Heroic Local opens, if the schedule is due.'
              )}
            </p>
            <PathSelectionBox
              htmlId="collection-backup-folder"
              type="directory"
              path={folder}
              onPathChange={(next) => {
                setFolder(next)
                void persist(next, interval)
              }}
              label={t('collection.settings.backupFolder', 'Backup folder')}
              pathDialogTitle={t(
                'collection.settings.backupFolder',
                'Backup folder'
              )}
            />
            <SelectField
              htmlId="collection-backup-interval"
              label={t('collection.settings.backupInterval', 'How often')}
              value={interval}
              disabled={saving || running}
              onChange={(event) => {
                const next = event.target.value as CollectionBackupInterval
                setInterval(next)
                void persist(folder, next)
              }}
            >
              <MenuItem value="daily">
                {t('collection.settings.backupDaily', 'Once a day')}
              </MenuItem>
              <MenuItem value="weekly">
                {t('collection.settings.backupWeekly', 'Once a week')}
              </MenuItem>
              <MenuItem value="monthly">
                {t('collection.settings.backupMonthly', 'Once a month')}
              </MenuItem>
            </SelectField>
            <div className="CollectionSettingsDialog__actions">
              <button
                type="button"
                className="button is-primary"
                disabled={running || saving || !folder.trim()}
                onClick={() => void handleBackupNow()}
              >
                {running
                  ? t('collection.settings.backupRunning', 'Backing up…')
                  : t('collection.settings.backupNow', 'Backup now')}
              </button>
            </div>
            <p className="CollectionSettingsDialog__meta">
              {t('collection.settings.lastBackup', 'Last backup')}: {lastBackup}
              {settings?.backup.lastBackupPath
                ? ` · ${settings.backup.lastBackupPath}`
                : ''}
            </p>
            {message && (
              <p className="CollectionSettingsDialog__ok">{message}</p>
            )}
            {settings?.backup.lastError && !message && !error && (
              <p className="CollectionSettingsDialog__error">
                {settings.backup.lastError}
              </p>
            )}
          </section>
        </TabPanel>

        <TabPanel value={activeTab} index="saves">
          <section className="CollectionSettingsDialog__section">
            <p>
              {t(
                'collection.settings.ludusaviHelp',
                'When enabled, Heroic Local backs up the game save with Ludusavi after you close a game. Right-click a Collection card to back up that game now.'
              )}
            </p>
            <ToggleSwitch
              htmlId="collection-ludusavi-enabled"
              value={ludusaviEnabled}
              disabled={saving}
              handleChange={() => {
                const next = !ludusaviEnabled
                setLudusaviEnabled(next)
                void persistLudusavi({ enabled: next })
              }}
              title={t(
                'collection.settings.ludusaviEnabled',
                'Back up saves when a game closes'
              )}
            />
            {detected ? (
              <p className="CollectionSettingsDialog__callout">
                {t(
                  'collection.settings.ludusaviDetected',
                  'Found Ludusavi {{version}} at {{binary}}. Backups go to {{path}} ({{format}}{{compression}}).',
                  {
                    version: detected.version || '',
                    binary: detected.binary,
                    path:
                      detected.backupPath ||
                      t('collection.settings.unknown', 'unknown'),
                    format: detected.format || 'simple',
                    compression:
                      detected.format === 'zip' && detected.compression
                        ? ` / ${detected.compression}`
                        : ''
                  }
                )}
              </p>
            ) : (
              <WarningMessage>
                {t(
                  'collection.settings.ludusaviMissing',
                  'Ludusavi was not found automatically. Set the binary and backup folder below.'
                )}
              </WarningMessage>
            )}
            <ToggleSwitch
              htmlId="collection-ludusavi-use-config"
              value={useInstalledConfig}
              disabled={saving || !detected?.configPath}
              handleChange={() => {
                const next = !useInstalledConfig
                setUseInstalledConfig(next)
                void persistLudusavi({ useInstalledConfig: next })
              }}
              title={t(
                'collection.settings.ludusaviUseConfig',
                'Use installed Ludusavi settings (path, zip, compression)'
              )}
            />
            <details className="advancedFields" open={!overridesLocked}>
              <summary>
                {t(
                  'collection.settings.ludusaviOverridesHeading',
                  'Backup location & format'
                )}
              </summary>
              <PathSelectionBox
                htmlId="collection-ludusavi-binary"
                type="file"
                path={ludusaviBinary}
                disabled={saving}
                onPathChange={(next) => {
                  setLudusaviBinary(next)
                  void persistLudusavi({ binaryPath: next })
                }}
                label={t(
                  'collection.settings.ludusaviBinary',
                  'Ludusavi binary'
                )}
                pathDialogTitle={t(
                  'collection.settings.ludusaviBinary',
                  'Ludusavi binary'
                )}
                placeholder={detected?.binary}
              />
              <PathSelectionBox
                htmlId="collection-ludusavi-folder"
                type="directory"
                path={ludusaviFolder}
                disabled={saving || overridesLocked}
                onPathChange={(next) => {
                  setLudusaviFolder(next)
                  void persistLudusavi({ backupPath: next })
                }}
                label={t(
                  'collection.settings.ludusaviFolder',
                  'Save backup folder'
                )}
                pathDialogTitle={t(
                  'collection.settings.ludusaviFolder',
                  'Save backup folder'
                )}
                placeholder={detected?.backupPath}
              />
              <SelectField
                htmlId="collection-ludusavi-format"
                label={t('collection.settings.ludusaviFormat', 'Backup format')}
                value={ludusaviFormat}
                disabled={saving || overridesLocked}
                onChange={(event) => {
                  const next = event.target.value as LudusaviBackupFormat
                  setLudusaviFormat(next)
                  void persistLudusavi({ format: next })
                }}
              >
                <MenuItem value="zip">
                  {t('collection.settings.ludusaviZip', 'Zip')}
                </MenuItem>
                <MenuItem value="simple">
                  {t('collection.settings.ludusaviSimple', 'Simple folder')}
                </MenuItem>
              </SelectField>
              <SelectField
                htmlId="collection-ludusavi-compression"
                label={t(
                  'collection.settings.ludusaviCompression',
                  'Zip compression'
                )}
                value={ludusaviCompression}
                disabled={saving || overridesLocked || ludusaviFormat !== 'zip'}
                onChange={(event) => {
                  const next = event.target.value as LudusaviCompression
                  setLudusaviCompression(next)
                  void persistLudusavi({ compression: next })
                }}
              >
                <MenuItem value="none">
                  {t('collection.settings.ludusaviNone', 'None')}
                </MenuItem>
                <MenuItem value="deflate">Deflate</MenuItem>
                <MenuItem value="bzip2">Bzip2</MenuItem>
                <MenuItem value="zstd">Zstd</MenuItem>
              </SelectField>
            </details>
            <p className="CollectionSettingsDialog__meta">
              {t('collection.settings.lastSaveBackup', 'Last save backup')}:{' '}
              {lastSaveBackup}
              {settings?.ludusavi.lastBackupGame
                ? ` · ${settings.ludusavi.lastBackupGame}`
                : ''}
              {settings?.ludusavi.lastBackupPath
                ? ` · ${settings.ludusavi.lastBackupPath}`
                : ''}
            </p>
            {settings?.ludusavi.lastError && !error && (
              <p className="CollectionSettingsDialog__error">
                {settings.ludusavi.lastError}
              </p>
            )}
          </section>
        </TabPanel>

        {error && <p className="CollectionSettingsDialog__error">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.close', 'Close')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
