import { useContext, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  PathSelectionBox,
  SelectField,
  TextInputField,
  ToggleSwitch
} from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import { MenuItem } from '@mui/material'
import ContextProvider from 'frontend/state/ContextProvider'
import type {
  EmulationState,
  RomScanPreview,
  UserEmulator,
  UserEmulatorProfile
} from 'common/types/local-library'
import './ScanRomsDialog.css'

type Props = {
  onClose: () => void
  onImported?: () => void
  initialEmulatorId?: string
  initialProfileId?: string
  initialDirectory?: string
}

const emptyState: EmulationState = {
  catalog: [],
  emulators: [],
  scanners: [],
  detected: []
}

export default function ScanRomsDialog({
  onClose,
  onImported,
  initialEmulatorId,
  initialProfileId,
  initialDirectory
}: Props) {
  const { t } = useTranslation()
  const { refreshLibrary } = useContext(ContextProvider)
  const [state, setState] = useState<EmulationState>(emptyState)
  const [emulatorId, setEmulatorId] = useState(initialEmulatorId ?? '')
  const [profileId, setProfileId] = useState(initialProfileId ?? '')
  const [directory, setDirectory] = useState(initialDirectory ?? '')
  const [scanSubfolders, setScanSubfolders] = useState(true)
  const [mergeRelatedFiles, setMergeRelatedFiles] = useState(true)
  const [autoScanOnRefresh, setAutoScanOnRefresh] = useState(true)
  const [preview, setPreview] = useState<RomScanPreview | null>(null)
  const [loading, setLoading] = useState(false)
  const [detecting, setDetecting] = useState(false)
  const [error, setError] = useState('')
  const [customOpen, setCustomOpen] = useState(false)
  const [customName, setCustomName] = useState('')
  const [customExe, setCustomExe] = useState('')
  const [customExt, setCustomExt] = useState('iso,cue,chd,zip')
  const [customArgs, setCustomArgs] = useState('{ImagePath}')

  const emulator = state.emulators.find((item) => item.id === emulatorId)
  const profiles = emulator?.profiles ?? []
  const profile: UserEmulatorProfile | undefined =
    profiles.find((item) => item.id === profileId) ?? profiles[0]
  const selectedCount = preview?.games.filter((item) => item.import).length ?? 0

  async function reload(refreshDetect = false) {
    const next = await window.api.localLibrary.getEmulationState(refreshDetect)
    setState(next)
    return next
  }

  useEffect(() => {
    void reload(true).then((next) => {
      const first = initialEmulatorId
        ? next.emulators.find((item) => item.id === initialEmulatorId)
        : next.emulators[0]
      if (first) {
        setEmulatorId(first.id)
        setProfileId(
          initialProfileId &&
            first.profiles.some((item) => item.id === initialProfileId)
            ? initialProfileId
            : (first.profiles[0]?.id ?? '')
        )
      }
    })
  }, [])

  async function handleDetect() {
    setDetecting(true)
    setError('')
    try {
      const added = await window.api.localLibrary.addDetectedEmulators()
      const next = await reload(true)
      if (!emulatorId && added[0]) {
        setEmulatorId(added[0].id)
        setProfileId(added[0].profiles[0]?.id ?? '')
      }
      if (!next.emulators.length) {
        setError(
          t(
            'collection.emulation.noneDetected',
            'No emulators were found on PATH or Flatpak. Add one manually.'
          )
        )
      }
    } catch (err) {
      setError(String(err))
    } finally {
      setDetecting(false)
    }
  }

  async function handleAddCustom() {
    if (!customExe.trim()) return
    setLoading(true)
    setError('')
    try {
      const extensions = customExt
        .split(/[,\s]+/)
        .map((item) => item.replace(/^\./, '').toLowerCase())
        .filter(Boolean)
      const created: UserEmulator =
        await window.api.localLibrary.upsertEmulator({
          definitionId: 'custom',
          name: customName.trim() || 'Custom emulator',
          executable: customExe.trim(),
          launchKind: customExe.toLowerCase().endsWith('.exe')
            ? 'wine'
            : 'native',
          profiles: [
            {
              id: 'custom',
              definitionProfileId: 'custom',
              name: customName.trim() || 'Custom',
              platformName: 'Other',
              arguments: customArgs.trim() || '{ImagePath}',
              extensions
            }
          ]
        })
      await reload()
      setEmulatorId(created.id)
      setProfileId(created.profiles[0]?.id ?? '')
      setCustomOpen(false)
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  async function handleScan() {
    if (!emulatorId || !profile?.id || !directory) return
    setLoading(true)
    setError('')
    try {
      const next = await window.api.localLibrary.previewRomScan({
        emulatorId,
        profileId: profile.id,
        directory,
        scanSubfolders,
        mergeRelatedFiles
      })
      setPreview(next)
      if (next.errors.length) setError(next.errors.join('\n'))
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  function toggleGame(path: string) {
    setPreview((current) => {
      if (!current) return current
      return {
        ...current,
        games: current.games.map((item) =>
          item.roms[0]?.path === path ? { ...item, import: !item.import } : item
        )
      }
    })
  }

  function toggleAll(next: boolean) {
    setPreview((current) => {
      if (!current) return current
      return {
        ...current,
        games: current.games.map((item) =>
          item.alreadyImported ? item : { ...item, import: next }
        )
      }
    })
  }

  async function handleImport() {
    if (!preview || !emulatorId || !profile?.id) return
    setLoading(true)
    setError('')
    try {
      const result = await window.api.localLibrary.importRomScan({
        emulatorId,
        profileId: profile.id,
        directory,
        scanSubfolders,
        mergeRelatedFiles,
        autoScanOnRefresh,
        games: preview.games
      })
      await refreshLibrary({ library: 'sideload', runInBackground: false })
      onImported?.()
      if (result.errors.length) {
        setError(result.errors.join('\n'))
        return
      }
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setLoading(false)
    }
  }

  const detectedHint = useMemo(() => {
    const missing = state.detected.filter((item) => !item.alreadyAdded)
    if (!missing.length) return ''
    return t(
      'collection.emulation.detectedHint',
      '{{count}} emulator(s) found on this PC.',
      { count: missing.length }
    )
  }, [state.detected, t])

  return (
    <Dialog onClose={onClose} showCloseButton className="ScanRomsDialog">
      <DialogHeader>
        {t('collection.emulation.scanTitle', 'Add emulated games')}
      </DialogHeader>
      <DialogContent className="ScanRomsDialog__content">
        <p>
          {t(
            'collection.emulation.scanHelp',
            'Pick an emulator, its platform profile, and the folder with ROMs. Collection scans that folder and adds the games.'
          )}
        </p>

        <div className="ScanRomsDialog__row">
          <SelectField
            htmlId="scan-emulator"
            label={t('collection.emulation.emulator', 'Emulator')}
            value={emulatorId}
            disabled={!state.emulators.length}
            onChange={(event) => {
              const id = event.target.value
              setEmulatorId(id)
              const next = state.emulators.find((item) => item.id === id)
              setProfileId(next?.profiles[0]?.id ?? '')
              setPreview(null)
            }}
          >
            {!state.emulators.length && (
              <MenuItem value="">
                {t('collection.emulation.noEmulators', 'No emulators yet')}
              </MenuItem>
            )}
            {state.emulators.map((item) => (
              <MenuItem key={item.id} value={item.id}>
                {item.name}
              </MenuItem>
            ))}
          </SelectField>
          <button
            type="button"
            className="button outline"
            disabled={detecting}
            onClick={() => void handleDetect()}
          >
            {detecting
              ? t('collection.emulation.detecting', 'Detecting…')
              : t('collection.emulation.detect', 'Detect on this PC')}
          </button>
          <button
            type="button"
            className="button outline"
            onClick={() => setCustomOpen((open) => !open)}
          >
            {t('collection.emulation.addCustom', 'Custom…')}
          </button>
        </div>
        {detectedHint && <p className="ScanRomsDialog__hint">{detectedHint}</p>}

        {customOpen && (
          <div className="ScanRomsDialog__custom">
            <TextInputField
              htmlId="custom-emu-name"
              label={t('collection.emulation.customName', 'Name')}
              value={customName}
              onChange={setCustomName}
            />
            <PathSelectionBox
              htmlId="custom-emu-exe"
              type="file"
              path={customExe}
              onPathChange={setCustomExe}
              label={t('collection.emulation.executable', 'Executable')}
              pathDialogTitle={t(
                'collection.emulation.executable',
                'Executable'
              )}
            />
            <TextInputField
              htmlId="custom-emu-ext"
              label={t(
                'collection.emulation.extensions',
                'ROM extensions (comma-separated)'
              )}
              value={customExt}
              onChange={setCustomExt}
            />
            <TextInputField
              htmlId="custom-emu-args"
              label={t(
                'collection.emulation.arguments',
                'Arguments ({ImagePath} is the ROM)'
              )}
              value={customArgs}
              onChange={setCustomArgs}
            />
            <button
              type="button"
              className="button"
              disabled={!customExe.trim() || loading}
              onClick={() => void handleAddCustom()}
            >
              {t('collection.emulation.saveCustom', 'Save emulator')}
            </button>
          </div>
        )}

        <SelectField
          htmlId="scan-profile"
          label={t('collection.emulation.profile', 'Platform / profile')}
          value={profile?.id ?? ''}
          disabled={!profiles.length}
          onChange={(event) => {
            setProfileId(event.target.value)
            setPreview(null)
          }}
        >
          {profiles.map((item) => (
            <MenuItem key={item.id} value={item.id}>
              {item.platformName || item.name}
            </MenuItem>
          ))}
        </SelectField>

        <PathSelectionBox
          htmlId="scan-rom-folder"
          type="directory"
          path={directory}
          onPathChange={(next) => {
            setDirectory(next)
            setPreview(null)
          }}
          label={t('collection.emulation.romFolder', 'ROM folder')}
          pathDialogTitle={t('collection.emulation.romFolder', 'ROM folder')}
        />

        <div className="ScanRomsDialog__toggles">
          <ToggleSwitch
            htmlId="scan-subfolders"
            value={scanSubfolders}
            handleChange={() => setScanSubfolders((value) => !value)}
            title={t('collection.emulation.subfolders', 'Include subfolders')}
          />
          <ToggleSwitch
            htmlId="scan-merge"
            value={mergeRelatedFiles}
            handleChange={() => setMergeRelatedFiles((value) => !value)}
            title={t(
              'collection.emulation.mergeDiscs',
              'Merge discs into one game'
            )}
          />
          <ToggleSwitch
            htmlId="scan-auto"
            value={autoScanOnRefresh}
            handleChange={() => setAutoScanOnRefresh((value) => !value)}
            title={t(
              'collection.emulation.autoScan',
              'Scan this folder when Collection refreshes'
            )}
          />
        </div>

        <div className="ScanRomsDialog__actions">
          <button
            type="button"
            className="button"
            disabled={!emulatorId || !directory || loading}
            onClick={() => void handleScan()}
          >
            {loading
              ? t('collection.emulation.scanning', 'Scanning…')
              : t('collection.emulation.scan', 'Scan folder')}
          </button>
        </div>

        {preview && (
          <div className="ScanRomsDialog__preview">
            <div className="ScanRomsDialog__previewHead">
              <strong>
                {t('collection.emulation.found', '{{count}} game(s) found', {
                  count: preview.games.length
                })}
              </strong>
              <span>
                <button
                  type="button"
                  className="button outline"
                  onClick={() => toggleAll(true)}
                >
                  {t('collection.emulation.selectAll', 'Select all')}
                </button>
                <button
                  type="button"
                  className="button outline"
                  onClick={() => toggleAll(false)}
                >
                  {t('collection.emulation.selectNone', 'Select none')}
                </button>
              </span>
            </div>
            <ul className="ScanRomsDialog__games">
              {preview.games.map((item) => (
                <li
                  key={item.roms[0]?.path}
                  className={item.alreadyImported ? 'is-imported' : ''}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={item.import}
                      disabled={item.alreadyImported}
                      onChange={() =>
                        item.roms[0] && toggleGame(item.roms[0].path)
                      }
                    />
                    <span>
                      <strong>{item.title}</strong>
                      <em>
                        {item.alreadyImported
                          ? t(
                              'collection.emulation.alreadyIn',
                              'Already in Collection'
                            )
                          : item.roms.length > 1
                            ? t(
                                'collection.emulation.discCount',
                                '{{count}} discs',
                                { count: item.roms.length }
                              )
                            : item.roms[0]?.path}
                      </em>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="ScanRomsDialog__error">{error}</p>}
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.close', 'Close')}
        </button>
        <button
          className="button"
          disabled={!preview || selectedCount === 0 || loading}
          onClick={() => void handleImport()}
        >
          {t(
            'collection.emulation.importCount',
            'Add {{count}} to Collection',
            {
              count: selectedCount
            }
          )}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
