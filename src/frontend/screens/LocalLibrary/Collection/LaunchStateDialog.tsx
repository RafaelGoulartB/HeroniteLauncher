import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  EmulatorSaveState,
  EmulatorSaveStateList
} from 'common/types/local-library'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './LaunchStateDialog.css'

type Props = {
  title: string
  list: EmulatorSaveStateList
  onClose: () => void
  /** `undefined` starts the game from the beginning. */
  onPlay: (statePath?: string) => void
}

const FRESH = ''

const RELATIVE_UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60]
]

function relativeTime(iso: string, language: string): string {
  const seconds = (new Date(iso).getTime() - Date.now()) / 1000
  const format = new Intl.RelativeTimeFormat(language, { numeric: 'auto' })
  for (const [unit, size] of RELATIVE_UNITS) {
    if (Math.abs(seconds) >= size) {
      return format.format(Math.round(seconds / size), unit)
    }
  }
  return format.format(0, 'minute')
}

function absoluteTime(iso: string, language: string): string {
  return new Date(iso).toLocaleString(language, {
    dateStyle: 'medium',
    timeStyle: 'short'
  })
}

export default function LaunchStateDialog({
  title,
  list,
  onClose,
  onPlay
}: Props) {
  const { t, i18n } = useTranslation()
  const [selected, setSelected] = useState(list.states[0]?.path ?? FRESH)
  const language = i18n.language || 'en'

  const play = (path = selected) => onPlay(path === FRESH ? undefined : path)

  const stateLabel = (state: EmulatorSaveState) => {
    if (state.kind === 'resume') {
      return t('collection.emulation.stateResume', 'Resume point')
    }
    if (state.slot === undefined) {
      return t('collection.emulation.stateGeneric', 'Save state')
    }
    return t('collection.emulation.stateSlot', 'Slot {{slot}}', {
      slot: state.slot
    })
  }

  return (
    <Dialog onClose={onClose} showCloseButton className="LaunchStateDialog">
      <DialogHeader>
        {t('collection.emulation.launchStateTitle', 'How do you want to play?')}
      </DialogHeader>
      <DialogContent className="LaunchStateDialog__content">
        <p>
          {t(
            'collection.emulation.launchStateHelp',
            '{{emulator}} has save states for {{title}}. Continue from one or start from the beginning.',
            { emulator: list.emulatorName ?? 'The emulator', title }
          )}
        </p>
        <ul className="LaunchStateDialog__list" role="radiogroup">
          {list.states.map((state) => (
            <li key={state.path}>
              <label
                className={selected === state.path ? 'is-selected' : undefined}
                title={state.path}
                onDoubleClick={() => play(state.path)}
              >
                <input
                  type="radio"
                  name="collection-launch-state"
                  checked={selected === state.path}
                  onChange={() => setSelected(state.path)}
                />
                <span className="LaunchStateDialog__thumb">
                  {state.thumbnail ? (
                    <img src={state.thumbnail} alt="" />
                  ) : (
                    <span aria-hidden>
                      {state.kind === 'resume' ? '▶' : (state.slot ?? '•')}
                    </span>
                  )}
                </span>
                <span className="LaunchStateDialog__text">
                  <strong>{stateLabel(state)}</strong>
                  <em>
                    {relativeTime(state.modifiedAt, language)} ·{' '}
                    {absoluteTime(state.modifiedAt, language)}
                  </em>
                </span>
              </label>
            </li>
          ))}
          <li>
            <label
              className={selected === FRESH ? 'is-selected' : undefined}
              onDoubleClick={() => play(FRESH)}
            >
              <input
                type="radio"
                name="collection-launch-state"
                checked={selected === FRESH}
                onChange={() => setSelected(FRESH)}
              />
              <span className="LaunchStateDialog__thumb">
                <span aria-hidden>⟲</span>
              </span>
              <span className="LaunchStateDialog__text">
                <strong>
                  {t(
                    'collection.emulation.stateFresh',
                    'Start from the beginning'
                  )}
                </strong>
                <em>
                  {t(
                    'collection.emulation.stateFreshHelp',
                    'Boot the game normally. In-game saves on memory cards are kept.'
                  )}
                </em>
              </span>
            </label>
          </li>
        </ul>
      </DialogContent>
      <DialogFooter>
        <button className="button outline" onClick={onClose}>
          {t('box.cancel', 'Cancel')}
        </button>
        <button className="button" onClick={() => play()}>
          {selected === FRESH
            ? t('collection.emulation.playFresh', 'Start')
            : t('collection.emulation.playState', 'Continue')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
