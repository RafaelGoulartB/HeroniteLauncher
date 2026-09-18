import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LocalGameRom } from 'common/types/local-library'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './PickRomDialog.css'

type Props = {
  title: string
  roms: LocalGameRom[]
  selectedPath?: string
  onClose: () => void
  onPlay: (romPath: string) => void
}

export default function PickRomDialog({
  title,
  roms,
  selectedPath,
  onClose,
  onPlay
}: Props) {
  const { t } = useTranslation()
  const [path, setPath] = useState(
    selectedPath && roms.some((rom) => rom.path === selectedPath)
      ? selectedPath
      : roms[0]?.path
  )

  return (
    <Dialog onClose={onClose} showCloseButton className="PickRomDialog">
      <DialogHeader>
        {t('collection.emulation.pickRom', 'Choose disc')}
      </DialogHeader>
      <DialogContent className="PickRomDialog__content">
        <p>
          {t(
            'collection.emulation.pickRomHelp',
            'This title has more than one ROM. Pick which disc to launch.'
          )}
        </p>
        <ul className="PickRomDialog__list">
          {roms.map((rom) => (
            <li key={rom.path}>
              <label>
                <input
                  type="radio"
                  name="collection-rom"
                  checked={path === rom.path}
                  onChange={() => setPath(rom.path)}
                />
                <span>
                  <strong>{rom.name || title}</strong>
                  <em>{rom.path}</em>
                </span>
              </label>
            </li>
          ))}
        </ul>
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.cancel', 'Cancel')}
        </button>
        <button
          className="button"
          disabled={!path}
          onClick={() => path && onPlay(path)}
        >
          {t('collection.emulation.playDisc', 'Play')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
