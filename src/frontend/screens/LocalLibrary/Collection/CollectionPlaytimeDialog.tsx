import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import { formatPlaytimeMinutes } from './playtime'
import './CollectionPlaytimeDialog.css'

type Props = {
  title: string
  minutes: number
  onClose: () => void
  onSave: (minutes: number) => void
}

function clampNumber(value: string, max?: number) {
  const parsed = Number.parseInt(value, 10)
  if (Number.isNaN(parsed) || parsed < 0) return 0
  if (max !== undefined && parsed > max) return max
  return parsed
}

export default function CollectionPlaytimeDialog({
  title,
  minutes,
  onClose,
  onSave
}: Props) {
  const { t } = useTranslation()
  const [hours, setHours] = useState(() => Math.floor(minutes / 60))
  const [mins, setMins] = useState(() => minutes % 60)

  const total = hours * 60 + mins

  return (
    <Dialog onClose={onClose} showCloseButton className="CollectionPlaytime">
      <DialogHeader>
        {t('collection.playtime.edit', 'Edit playtime')}
      </DialogHeader>
      <DialogContent className="CollectionPlaytime__content">
        <p>
          {t(
            'collection.playtime.help',
            'Set the total time played for {{title}}. New sessions keep adding to this value.',
            { title }
          )}
        </p>
        <div className="CollectionPlaytime__fields">
          <label>
            <span>{t('collection.playtime.hours', 'Hours')}</span>
            <input
              type="number"
              min={0}
              value={hours}
              autoFocus
              onChange={(event) => setHours(clampNumber(event.target.value))}
            />
          </label>
          <label>
            <span>{t('collection.playtime.minutes', 'Minutes')}</span>
            <input
              type="number"
              min={0}
              max={59}
              value={mins}
              onChange={(event) => setMins(clampNumber(event.target.value, 59))}
            />
          </label>
        </div>
        <p className="CollectionPlaytime__preview">
          {formatPlaytimeMinutes(total)}
        </p>
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.cancel', 'Cancel')}
        </button>
        <button className="button" onClick={() => onSave(total)}>
          {t('collection.playtime.save', 'Save')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
