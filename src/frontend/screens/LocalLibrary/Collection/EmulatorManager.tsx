import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  EmulationState,
  RomScanner,
  UserEmulator
} from 'common/types/local-library'
import './EmulatorManager.css'

type Props = {
  onScan: (scanner?: RomScanner, emulator?: UserEmulator) => void
}

const empty: EmulationState = {
  catalog: [],
  emulators: [],
  scanners: [],
  detected: []
}

export default function EmulatorManager({ onScan }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState<EmulationState>(empty)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  async function reload(refreshDetect = true) {
    const next = await window.api.localLibrary.getEmulationState(refreshDetect)
    setState(next)
    return next
  }

  useEffect(() => {
    void reload()
  }, [])

  async function handleDetect() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const added = await window.api.localLibrary.addDetectedEmulators()
      await reload(true)
      setMessage(
        added.length
          ? t(
              'collection.emulation.detectedSaved',
              'Saved {{count}} emulator(s) found on this PC.',
              { count: added.length }
            )
          : t(
              'collection.emulation.noneDetected',
              'No emulators were found on PATH or Flatpak. Add one manually.'
            )
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveEmulator(id: string) {
    setBusy(true)
    setError('')
    try {
      await window.api.localLibrary.removeEmulator(id)
      await reload(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveScanner(id: string) {
    setBusy(true)
    setError('')
    try {
      await window.api.localLibrary.removeRomScanner(id)
      await reload(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  async function handleScanAll() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const imported = await window.api.localLibrary.runRomScanners()
      setMessage(
        t(
          'collection.emulation.autoScanDone',
          'Added {{count}} new game(s) from saved folders.',
          { count: imported }
        )
      )
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="EmulatorManager">
      <p>
        {t(
          'collection.emulation.settingsHelp',
          'Detect Linux/Flatpak emulators, then scan a ROM folder. Games stay in Collection and launch through the emulator you picked.'
        )}
      </p>
      <div className="EmulatorManager__actions">
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={() => void handleDetect()}
        >
          {busy
            ? t('collection.emulation.detecting', 'Detecting…')
            : t('collection.emulation.detect', 'Detect on this PC')}
        </button>
        <button
          type="button"
          className="button outline"
          disabled={busy || !state.scanners.length}
          onClick={() => void handleScanAll()}
        >
          {t('collection.emulation.scanSaved', 'Scan saved folders')}
        </button>
        <button
          type="button"
          className="button outline"
          onClick={() => onScan()}
        >
          {t('collection.emulation.addGames', 'Add emulated games…')}
        </button>
      </div>
      {message && <p className="EmulatorManager__ok">{message}</p>}
      {error && <p className="EmulatorManager__error">{error}</p>}

      {!state.emulators.length && (
        <p className="EmulatorManager__empty">
          {t(
            'collection.emulation.empty',
            'No emulators configured yet. Detect them on this PC, or add a custom executable when scanning ROMs.'
          )}
        </p>
      )}

      <ul className="EmulatorManager__list">
        {state.emulators.map((emulator) => {
          const folders = state.scanners.filter(
            (item) => item.emulatorId === emulator.id
          )
          return (
            <li key={emulator.id} className="EmulatorManager__card">
              <div className="EmulatorManager__cardHead">
                <div>
                  <strong>{emulator.name}</strong>
                  <p>
                    {emulator.launchKind === 'flatpak'
                      ? `Flatpak · ${emulator.flatpakId}`
                      : emulator.executable}
                  </p>
                </div>
                <button
                  type="button"
                  className="button outline"
                  disabled={busy}
                  onClick={() => void handleRemoveEmulator(emulator.id)}
                >
                  {t('box.remove', 'Remove')}
                </button>
              </div>
              <p className="EmulatorManager__meta">
                {emulator.profiles
                  .map((profile) => profile.platformName || profile.name)
                  .join(' · ')}
              </p>
              {folders.map((scanner) => (
                <div key={scanner.id} className="EmulatorManager__folder">
                  <span>
                    <strong>{scanner.name}</strong>
                    <em>{scanner.directory}</em>
                  </span>
                  <span>
                    <button
                      type="button"
                      className="button outline"
                      onClick={() => onScan(scanner, emulator)}
                    >
                      {t('collection.emulation.scan', 'Scan folder')}
                    </button>
                    <button
                      type="button"
                      className="button outline"
                      disabled={busy}
                      onClick={() => void handleRemoveScanner(scanner.id)}
                    >
                      {t('box.remove', 'Remove')}
                    </button>
                  </span>
                </div>
              ))}
              <button
                type="button"
                className="button outline"
                onClick={() => onScan(undefined, emulator)}
              >
                {t('collection.emulation.addFolder', 'Add ROM folder…')}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
