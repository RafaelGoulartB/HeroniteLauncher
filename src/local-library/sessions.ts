import { logInfo, LogPrefix } from 'backend/logger'
import type { LocalGameSession } from 'common/types/local-library'
import { mergeLocalSessions } from './stores'

export function recordLocalSession(params: {
  appName: string
  startedAt: Date
  endedAt: Date
}) {
  const elapsedSeconds = Math.floor(
    (params.endedAt.getTime() - params.startedAt.getTime()) / 1000
  )
  if (elapsedSeconds < 5) return

  const session: LocalGameSession = {
    startedAt: params.startedAt.toISOString(),
    endedAt: params.endedAt.toISOString(),
    elapsedSeconds,
    source: 'heroic'
  }

  mergeLocalSessions(params.appName, [session])
  logInfo(
    `Recorded local session for ${params.appName} (${elapsedSeconds}s)`,
    LogPrefix.Backend
  )
}
