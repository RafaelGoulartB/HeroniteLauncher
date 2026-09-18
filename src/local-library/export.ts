import { existsSync, mkdirSync, statSync, writeFileSync } from 'graceful-fs'
import { dirname, join } from 'path'
import { logInfo, LogPrefix } from 'backend/logger'
import { tsStore } from 'backend/constants/key_value_stores'
import type {
  PlayniteExportFile,
  PlayniteExportGame,
  PlayniteExportResult
} from 'common/types/local-library'
import { getCompletionStatuses } from './status'
import { getAllLocalGameMeta, getLocalSessions } from './stores'

const EXPORT_COMMENT =
  'Copy this JSON to Windows. A Playnite extension can merge playtime, completion status, and sessions using playniteId or steamAppId.'

function resolveExportPath(targetPath: string): string {
  try {
    if (existsSync(targetPath) && statSync(targetPath).isDirectory()) {
      const stamp = new Date().toISOString().slice(0, 10)
      return join(targetPath, `heroic-playnite-export-${stamp}.json`)
    }
  } catch {
    // Fall through and treat the path as a file
  }
  if (targetPath.toLowerCase().endsWith('.json')) return targetPath
  const stamp = new Date().toISOString().slice(0, 10)
  return join(targetPath, `heroic-playnite-export-${stamp}.json`)
}

export function exportPlayniteLibrary(
  targetPath: string
): PlayniteExportResult {
  const statuses = getCompletionStatuses()
  const games: PlayniteExportGame[] = Object.values(getAllLocalGameMeta()).map(
    (meta) => {
      const played = tsStore.get_nodefault(meta.appName)
      const minutes = played?.totalPlayed ?? 0
      const status =
        statuses.find((item) => item.id === meta.completionStatusId) ??
        statuses.find((item) => item.slug === 'not-played') ??
        statuses[0]
      return {
        playniteId: meta.playniteId,
        heroicAppName: meta.appName,
        steamAppId: meta.steamAppId,
        storeGameId: meta.storeGameId,
        title: meta.title,
        source: meta.source,
        playtimeMinutes: minutes,
        playtimeSeconds: minutes * 60,
        firstPlayed: played?.firstPlayed || undefined,
        lastPlayed: played?.lastPlayed || undefined,
        completionStatus: {
          id: status?.id ?? 'not-played',
          name: status?.name ?? 'Not Played',
          slug: status?.slug ?? 'not-played',
          playniteId: status?.playniteId
        },
        lastPlayniteCompletionStatusId: meta.playniteCompletionStatusId,
        sessions: getLocalSessions(meta.appName)
      }
    }
  )

  const payload: PlayniteExportFile = {
    format: 'heroic-playnite-export',
    version: 1,
    exportedAt: new Date().toISOString(),
    comment: EXPORT_COMMENT,
    statuses,
    games
  }

  const filePath = resolveExportPath(targetPath)
  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8')
  logInfo(
    `Exported ${games.length} games for Playnite to ${filePath}`,
    LogPrefix.Backend
  )
  return { path: filePath, gameCount: games.length }
}
