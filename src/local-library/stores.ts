import Store from 'electron-store'
import type {
  LocalGameMeta,
  LocalGameSession
} from 'common/types/local-library'

type LocalLibraryFile = {
  games: Record<string, LocalGameMeta>
}

type SessionFile = {
  sessions: Record<string, LocalGameSession[]>
}

const libraryFile = new Store<LocalLibraryFile>({
  cwd: 'local_library',
  name: 'library',
  defaults: { games: {} }
})

const sessionFile = new Store<SessionFile>({
  cwd: 'local_library',
  name: 'sessions',
  defaults: { sessions: {} }
})

export function getLocalGameMeta(appName: string): LocalGameMeta | undefined {
  return libraryFile.get('games')[appName]
}

export function getAllLocalGameMeta(): Record<string, LocalGameMeta> {
  return libraryFile.get('games')
}

export function upsertLocalGameMeta(meta: LocalGameMeta) {
  const games = { ...libraryFile.get('games') }
  games[meta.appName] = meta
  libraryFile.set('games', games)
}

export function findMetaByPlayniteId(
  playniteId: string
): LocalGameMeta | undefined {
  return Object.values(libraryFile.get('games')).find(
    (game) => game.playniteId === playniteId
  )
}

export function findMetaBySteamAppId(
  steamAppId: string
): LocalGameMeta | undefined {
  if (!steamAppId) return undefined
  return Object.values(libraryFile.get('games')).find(
    (game) =>
      game.steamAppId === steamAppId || game.appName === `steam_${steamAppId}`
  )
}

export function getLocalSessions(appName: string): LocalGameSession[] {
  const sessions = sessionFile.get('sessions')[appName] ?? []
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function replaceLocalSessions(
  appName: string,
  sessions: LocalGameSession[]
) {
  const all = { ...sessionFile.get('sessions') }
  all[appName] = sessions
  sessionFile.set('sessions', all)
}

export function deleteLocalGameMeta(appName: string) {
  const games = { ...libraryFile.get('games') }
  delete games[appName]
  libraryFile.set('games', games)
}

export function deleteLocalSessions(appName: string) {
  const all = { ...sessionFile.get('sessions') }
  delete all[appName]
  sessionFile.set('sessions', all)
}

export function countNewLocalSessions(
  appName: string,
  incoming: LocalGameSession[]
): number {
  const existing = sessionFile.get('sessions')[appName] ?? []
  const keys = new Set(
    existing.map((session) => `${session.startedAt}:${session.elapsedSeconds}`)
  )
  return incoming.filter(
    (session) => !keys.has(`${session.startedAt}:${session.elapsedSeconds}`)
  ).length
}

export function mergeLocalSessions(
  appName: string,
  incoming: LocalGameSession[]
) {
  const existing = sessionFile.get('sessions')[appName] ?? []
  const keys = new Set(
    existing.map((session) => `${session.startedAt}:${session.elapsedSeconds}`)
  )
  const merged = [...existing]
  for (const session of incoming) {
    const key = `${session.startedAt}:${session.elapsedSeconds}`
    if (keys.has(key)) continue
    keys.add(key)
    merged.push(session)
  }
  replaceLocalSessions(appName, merged)
}
