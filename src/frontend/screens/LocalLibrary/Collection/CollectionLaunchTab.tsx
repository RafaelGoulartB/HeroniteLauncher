import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MenuItem } from '@mui/material'
import type { GameInfo } from 'common/types'
import type {
  LocalExecutableKind,
  LocalLaunchInfo,
  LocalRunAs
} from 'common/types/local-library'
import { SelectField } from 'frontend/components/UI'
import './CollectionLaunchTab.css'

type Props = {
  game: GameInfo
}

const DETECTED_LABELS: Record<LocalExecutableKind, string> = {
  linux: 'Linux program (ELF, script or AppImage)',
  windows: 'Windows program',
  unknown: 'Unknown file type'
}

/**
 * Collection game settings → Launch: which file a Local game starts and whether it
 * runs natively on Linux or through Wine/Proton.
 */
export default function CollectionLaunchTab({ game }: Props) {
  const { t } = useTranslation()
  const [info, setInfo] = useState<LocalLaunchInfo | null>(null)
  const [executable, setExecutable] = useState('')
  const [runAs, setRunAs] = useState<LocalRunAs>('auto')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    void window.api.localLibrary
      .getLaunchInfo({ appName: game.app_name })
      .then((next) => {
        if (cancelled) return
        setInfo(next)
        setExecutable(next?.executable ?? '')
        setRunAs(next?.runAs ?? 'auto')
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [game.app_name])

  if (loading) return null
  if (!info) {
    return (
      <p className="CollectionLaunchTab__help">
        {t(
          'collection.launch.unavailable',
          'This game is started by an emulator, Steam or its store, not by an executable.'
        )}
      </p>
    )
  }

  const dirty = executable !== info.executable || runAs !== info.runAs

  async function browse() {
    const path = await window.api.openDialog({
      buttonLabel: t('box.select.button', 'Select'),
      properties: ['openFile'],
      title: t('collection.launch.selectExecutable', 'Select executable'),
      defaultPath: executable ? executable.replace(/\/[^/]*$/, '') : undefined
    })
    if (path) {
      setExecutable(path)
      setSaved(false)
    }
  }

  async function save() {
    setBusy(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setLaunchOptions({
        appName: game.app_name,
        executable,
        runAs
      })
      if (next) {
        setInfo(next)
        setExecutable(next.executable)
        setRunAs(next.runAs)
        setSaved(true)
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setBusy(false)
    }
  }

  const effectiveLabel =
    info.effective === 'linux'
      ? t('collection.launch.effective.linux', 'Runs natively on Linux')
      : t('collection.launch.effective.windows', 'Runs through Wine/Proton')

  return (
    <div className="CollectionLaunchTab">
      <p className="CollectionLaunchTab__help">
        {t(
          'collection.launch.help',
          'Linux programs (ELF binaries, shell scripts, AppImages) run directly; Windows programs run through Wine/Proton. Automatic decides from the file.'
        )}
      </p>

      <label className="CollectionLaunchTab__field">
        <span>{t('collection.launch.executable', 'Executable')}</span>
        <div className="CollectionLaunchTab__path">
          <input
            value={executable}
            disabled={busy}
            spellCheck={false}
            onChange={(event) => {
              setExecutable(event.target.value)
              setSaved(false)
            }}
          />
          <button
            type="button"
            className="button outline"
            disabled={busy}
            onClick={() => void browse()}
          >
            {t('collection.launch.browse', 'Browse')}
          </button>
        </div>
      </label>

      <p className="CollectionLaunchTab__status">
        <strong>{t('collection.launch.detectedLabel', 'Detected')}:</strong>{' '}
        {t(
          `collection.launch.kind.${info.detected}`,
          DETECTED_LABELS[info.detected]
        )}
        {!info.exists && (
          <em className="CollectionLaunchTab__warn">
            {' '}
            {t('collection.launch.missing', '(file not found)')}
          </em>
        )}
        <br />
        <strong>{t('collection.launch.current', 'Current')}:</strong>{' '}
        {effectiveLabel}
      </p>

      <SelectField
        htmlId="collection-launch-run-as"
        label={t('collection.launch.runAsLabel', 'Run as')}
        value={runAs}
        disabled={busy}
        onChange={(event) => {
          setRunAs(event.target.value as LocalRunAs)
          setSaved(false)
        }}
      >
        <MenuItem value="auto">
          {t('collection.launch.runAs.auto', 'Automatic (from the file)')}
        </MenuItem>
        <MenuItem value="linux">
          {t('collection.launch.runAs.linux', 'Linux native')}
        </MenuItem>
        <MenuItem value="windows">
          {t('collection.launch.runAs.windows', 'Windows (Wine/Proton)')}
        </MenuItem>
      </SelectField>

      <div className="CollectionLaunchTab__actions">
        <button
          type="button"
          className="button is-primary"
          disabled={busy || !dirty || !executable.trim()}
          onClick={() => void save()}
        >
          {busy
            ? t('collection.gameConfig.saving', 'Saving…')
            : t('collection.gameConfig.save', 'Save')}
        </button>
        {saved && !dirty && (
          <span className="CollectionLaunchTab__saved">
            {t('collection.launch.saved', 'Saved')}
          </span>
        )}
      </div>
      {error && <p className="CollectionLaunchTab__error">{error}</p>}
    </div>
  )
}
