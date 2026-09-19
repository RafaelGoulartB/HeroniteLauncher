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

const MAX_SESSIONS_PER_GAME = 200

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

let playniteIndex: Map<string, string> | null = null
let steamIndex: Map<string, string> | null = null

function invalidateIndexes() {
  playniteIndex = null
  steamIndex = null
}

function ensureIndexes() {
  if (playniteIndex && steamIndex) return
  playniteIndex = new Map()
  steamIndex = new Map()
  for (const game of Object.values(libraryFile.get('games'))) {
    if (game.playniteId) playniteIndex.set(game.playniteId, game.appName)
    if (game.steamAppId) steamIndex.set(game.steamAppId, game.appName)
  }
}

function newestSessions(sessions: LocalGameSession[]) {
  if (sessions.length <= MAX_SESSIONS_PER_GAME) return sessions
  return [...sessions]
    .sort((left, right) => right.startedAt.localeCompare(left.startedAt))
    .slice(0, MAX_SESSIONS_PER_GAME)
}

export function getLocalGameMeta(appName: string): LocalGameMeta | undefined {
  return libraryFile.get('games')[appName]
}

export function getAllLocalGameMeta(): Record<string, LocalGameMeta> {
  return libraryFile.get('games')
}

export function upsertLocalGameMeta(meta: LocalGameMeta) {
  const games = libraryFile.get('games')
  games[meta.appName] = meta
  libraryFile.set('games', games)
  invalidateIndexes()
}

export function findMetaByPlayniteId(
  playniteId: string
): LocalGameMeta | undefined {
  if (!playniteId) return undefined
  ensureIndexes()
  const appName = playniteIndex?.get(playniteId)
  return appName ? getLocalGameMeta(appName) : undefined
}

export function findMetaBySteamAppId(
  steamAppId: string
): LocalGameMeta | undefined {
  if (!steamAppId) return undefined
  ensureIndexes()
  const indexed = steamIndex?.get(steamAppId)
  if (indexed) return getLocalGameMeta(indexed)
  return getLocalGameMeta(`steam_${steamAppId}`)
}

export function getLocalSessions(appName: string): LocalGameSession[] {
  const sessions = sessionFile.get('sessions')[appName] ?? []
  return [...sessions].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
}

export function replaceLocalSessions(
  appName: string,
  sessions: LocalGameSession[]
) {
  const all = sessionFile.get('sessions')
  all[appName] = newestSessions(sessions)
  sessionFile.set('sessions', all)
}

export function deleteLocalGameMeta(appName: string) {
  const games = libraryFile.get('games')
  delete games[appName]
  libraryFile.set('games', games)
  invalidateIndexes()
}

export function deleteLocalSessions(appName: string) {
  const all = sessionFile.get('sessions')
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
