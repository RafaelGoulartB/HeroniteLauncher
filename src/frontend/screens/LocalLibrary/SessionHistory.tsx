import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History } from '@mui/icons-material'
import { SmallInfo } from 'frontend/components/UI'
import type { GameInfo } from 'common/types'
import type { LocalGameSession } from 'common/types/local-library'
import './SessionHistory.css'

type Props = {
  gameInfo: GameInfo
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric'
  }).format(new Date(value))
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function SessionHistory({ gameInfo }: Props) {
  const { t } = useTranslation('gamepage')
  const [sessions, setSessions] = useState<LocalGameSession[]>([])

  useEffect(() => {
    let active = true
    window.api.localLibrary
      .getSessions(gameInfo.app_name)
      .then((items) => {
        if (active) setSessions(items)
      })
      .catch(() => {
        if (active) setSessions([])
      })
    return () => {
      active = false
    }
  }, [gameInfo.app_name])

  if (!sessions.length) return null

  return (
    <div className="sessionHistory">
      <p className="sessionHistory__title">
        <History />
        {t('game.sessions', 'Play sessions')} ({sessions.length})
      </p>
      <div className="sessionHistory__list">
        {sessions.slice(0, 12).map((session) => (
          <SmallInfo
            key={`${session.startedAt}-${session.elapsedSeconds}`}
            title={formatDate(session.startedAt)}
            subtitle={`${formatDuration(session.elapsedSeconds)} · ${
              session.source === 'playnite'
                ? t('game.sessionPlaynite', 'Playnite')
                : 'Heroic'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

export default SessionHistory
