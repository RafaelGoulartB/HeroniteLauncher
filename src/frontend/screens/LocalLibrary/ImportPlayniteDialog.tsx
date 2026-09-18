import { useContext, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PathSelectionBox,
  TextInputField,
  ToggleSwitch
} from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import ContextProvider from 'frontend/state/ContextProvider'
import type {
  DriveRemap,
  PlayniteImportPreview,
  PlayniteImportResult
} from 'common/types/local-library'
import './ImportPlayniteDialog.css'

type Props = {
  onClose: () => void
}

export default function ImportPlayniteDialog({ onClose }: Props) {
  const { t } = useTranslation()
  const { refreshLibrary } = useContext(ContextProvider)
  const [libraryPath, setLibraryPath] = useState('')
  const [preview, setPreview] = useState<PlayniteImportPreview | null>(null)
  const [driveMap, setDriveMap] = useState<Record<string, string>>({})
  const [fetchCovers, setFetchCovers] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PlayniteImportResult | null>(null)
  const [error, setError] = useState('')

  const remaps: DriveRemap[] = useMemo(
    () =>
      Object.entries(driveMap)
        .filter(([, linuxPath]) => linuxPath.trim())
        .map(([windowsRoot, linuxPath]) => ({
          windowsRoot,
          linuxPath: linuxPath.trim()
        })),
    [driveMap]
  )

  async function handlePreview() {
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const next = await window.api.localLibrary.previewImport({ libraryPath })
      setPreview(next)
      setDriveMap((current) => {
        const merged = { ...current }
        for (const drive of next.detectedDrives) {
          if (!(drive in merged)) merged[drive] = ''
        }
        return merged
      })
      if (next.errors.length) {
        setError(next.errors.join('\n'))
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    if (!preview) return
    setError('')
    setLoading(true)
    try {
      const imported = await window.api.localLibrary.importLibrary({
        libraryPath: preview.libraryPath,
        driveMap: remaps,
        fetchCovers
      })
      setResult(imported)
      await refreshLibrary({
        library: 'sideload',
        runInBackground: false
      })
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog onClose={onClose} showCloseButton className="ImportPlayniteDialog">
      <DialogHeader>
        {t('localLibrary.import.title', 'Import Playnite library')}
      </DialogHeader>
      <DialogContent className="ImportPlayniteDialog__content">
        <p>
          {t(
            'localLibrary.import.help',
            'Select the Playnite library folder (the one that contains games.db). Steam, emulators, and manual games become Local titles. Epic and GOG playtime is matched onto games already in Heroic. Covers are fetched from Steam or SteamGridDB.'
          )}
        </p>
        <PathSelectionBox
          htmlId="playnite-library-path"
          type="directory"
          path={libraryPath}
          onPathChange={setLibraryPath}
          label={t('localLibrary.import.folder', 'Playnite library folder')}
          pathDialogTitle={t(
            'localLibrary.import.folder',
            'Playnite library folder'
          )}
        />
        {preview && preview.detectedDrives.length > 0 && (
          <div className="ImportPlayniteDialog__drives">
            <h4>
              {t(
                'localLibrary.import.drives',
                'Windows drive mapping (optional)'
              )}
            </h4>
            {preview.detectedDrives.map((drive) => (
              <TextInputField
                key={drive}
                htmlId={`drive-${drive}`}
                label={drive}
                placeholder="/run/media/..."
                value={driveMap[drive] ?? ''}
                onChange={(value) =>
                  setDriveMap((current) => ({ ...current, [drive]: value }))
                }
              />
            ))}
          </div>
        )}
        <ToggleSwitch
          htmlId="fetch-covers"
          value={fetchCovers}
          handleChange={() => setFetchCovers(!fetchCovers)}
          title={t(
            'localLibrary.import.covers',
            'Download covers from Steam / SteamGridDB'
          )}
        />
        {preview && (
          <ul className="ImportPlayniteDialog__counts">
            <li>
              {t('localLibrary.import.games', 'Games')}: {preview.gameCount}
            </li>
            <li>
              {t('localLibrary.import.sessions', 'Session files')}:{' '}
              {preview.sessionFileCount}
            </li>
            <li>Steam: {preview.counts.steam}</li>
            <li>
              {t('localLibrary.import.emulators', 'Emulators')}:{' '}
              {preview.counts.emulator}
            </li>
            <li>
              {t('localLibrary.import.manual', 'Manual')}:{' '}
              {preview.counts.manual}
            </li>
            <li>
              {t('localLibrary.import.epicMatch', 'Epic playtime matches')}:{' '}
              {preview.counts.epicMatch}
            </li>
            <li>
              {t('localLibrary.import.gogMatch', 'GOG playtime matches')}:{' '}
              {preview.counts.gogMatch}
            </li>
            <li>
              {t('localLibrary.import.skipped', 'Unmatched store games')}:{' '}
              {preview.counts.skippedStore}
            </li>
          </ul>
        )}
        {result && (
          <p className="ImportPlayniteDialog__result">
            {t(
              'localLibrary.import.done',
              'Imported {{imported}}, updated {{updated}}, matched store playtime {{matched}}, skipped {{skipped}}, covers {{covers}}, sessions {{sessions}}.',
              {
                imported: result.imported,
                updated: result.updated,
                matched: result.matchedStore,
                skipped: result.skipped,
                covers: result.coversFetched,
                sessions: result.sessionsImported
              }
            )}
          </p>
        )}
        {error && <p className="ImportPlayniteDialog__error">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <button
          className="button outline"
          disabled={loading || !libraryPath}
          onClick={() => void handlePreview()}
        >
          {t('localLibrary.import.preview', 'Preview')}
        </button>
        <button
          className="button is-primary"
          disabled={loading || !preview}
          onClick={() => void handleImport()}
        >
          {loading
            ? t('localLibrary.import.working', 'Working…')
            : t('localLibrary.import.confirm', 'Import')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
