import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { join, dirname } from 'path'
import {
  asArray,
  asBoolean,
  asDoc,
  asGuid,
  asNumber,
  asString,
  BsonDocument,
  BsonValue,
  readLiteDbDocuments
} from './litedb'

export const STEAM_PLUGIN_ID = 'cb91dfc9-b977-43bf-8e70-55f46e410fab'
export const EPIC_PLUGIN_ID = '00000002-dbd1-46c6-b5d0-b1ba559d10e4'
export const GOG_PLUGIN_ID = 'aebe8b7c-6dc3-4a66-af31-e7375c6b5e9e'
export const XBOX_PLUGIN_ID = '7e4fbb5e-2ae3-48d4-8ba0-6b30e7a4e287'
export const AMAZON_PLUGIN_ID = '402674cd-4af6-4886-b6ec-0e695bfa0688'
export const EMPTY_GUID = '00000000-0000-0000-0000-000000000000'
export const GAME_ACTIVITY_ID = 'afbb1a0d-04a1-4d0c-9afa-c6e42ca855b4'

export interface PlayniteGameAction {
  type: number
  name?: string
  path?: string
  arguments?: string
  workingDir?: string
  isPlayAction?: boolean
  emulatorId?: string
  emulatorProfileId?: string
  additionalArguments?: string
  overrideDefaultArgs?: boolean
}

export interface PlayniteRom {
  name?: string
  path: string
}

export interface PlayniteEmulatorProfile {
  id?: string
  name?: string
  executable?: string
  arguments?: string
  workingDir?: string
  startupExecutable?: string
  customArguments?: string
}

export interface PlayniteEmulator {
  id: string
  name?: string
  installDir?: string
  profiles: PlayniteEmulatorProfile[]
}

export interface PlayniteGame {
  id: string
  name: string
  gameId?: string
  pluginId: string
  sourceId?: string
  installDirectory?: string
  isInstalled?: boolean
  playtimeSeconds: number
  playCount: number
  lastActivity?: string
  added?: string
  notes?: string
  description?: string
  coverImage?: string
  backgroundImage?: string
  icon?: string
  releaseDate?: string
  developerIds: string[]
  developers: string[]
  publishers: string[]
  genres: string[]
  tags: string[]
  features: string[]
  platforms: string[]
  series?: string
  gameActions: PlayniteGameAction[]
  roms: PlayniteRom[]
  completionStatusId?: string
}

export interface PlayniteCompletionStatus {
  id: string
  name: string
}

export interface PlayniteActivitySession {
  dateSession: string
  elapsedSeconds: number
  gameActionName?: string
}

export interface PlayniteLibraryDump {
  libraryPath: string
  playniteRoot: string
  games: PlayniteGame[]
  emulators: PlayniteEmulator[]
  completionStatuses: PlayniteCompletionStatus[]
  sessionsByGameId: Record<string, PlayniteActivitySession[]>
}

function readDb(libraryPath: string, fileName: string): BsonDocument[] {
  const filePath = join(libraryPath, fileName)
  if (!existsSync(filePath)) return []
  return readLiteDbDocuments(readFileSync(filePath))
}

function nameMap(docs: BsonDocument[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const doc of docs) {
    const id = asGuid(doc._id) ?? asGuid(doc.Id)
    const name = asString(doc.Name)
    if (id && name) map.set(id, name)
  }
  return map
}

function parseAction(value: BsonDocument): PlayniteGameAction {
  return {
    type: asNumber(value.Type),
    name: asString(value.Name),
    path: asString(value.Path),
    arguments: asString(value.Arguments),
    workingDir: asString(value.WorkingDir),
    isPlayAction: asBoolean(value.IsPlayAction),
    emulatorId: asGuid(value.EmulatorId),
    emulatorProfileId: asString(value.EmulatorProfileId),
    additionalArguments: asString(value.AdditionalArguments),
    overrideDefaultArgs: asBoolean(value.OverrideDefaultArgs)
  }
}

function parseRom(value: BsonDocument): PlayniteRom | undefined {
  const path = asString(value.Path)
  if (!path) return undefined
  return { name: asString(value.Name), path }
}

function parseProfiles(
  value: BsonValue | undefined
): PlayniteEmulatorProfile[] {
  const profiles: PlayniteEmulatorProfile[] = []
  for (const item of asArray(value)) {
    const doc = asDoc(item)
    if (!doc) continue
    profiles.push({
      id: asString(doc.Id) ?? asGuid(doc.Id),
      name: asString(doc.Name),
      executable: asString(doc.Executable),
      arguments: asString(doc.Arguments),
      workingDir: asString(doc.WorkingDirectory) ?? asString(doc.WorkingDir),
      startupExecutable: asString(doc.StartupExecutable),
      customArguments: asString(doc.CustomArguments)
    })
  }
  return profiles
}

function parseEmulator(doc: BsonDocument): PlayniteEmulator | undefined {
  const id = asGuid(doc._id) ?? asGuid(doc.Id)
  if (!id) return undefined
  return {
    id,
    name: asString(doc.Name),
    installDir: asString(doc.InstallDir),
    profiles: [
      ...parseProfiles(doc.CustomProfiles),
      ...parseProfiles(doc.BuiltinProfiles)
    ]
  }
}

function namesFor(
  ids: BsonValue | undefined,
  lookup: Map<string, string>
): string[] {
  return asArray(ids)
    .map((item) => asGuid(item))
    .filter((item): item is string => Boolean(item))
    .map((id) => lookup.get(id))
    .filter((item): item is string => Boolean(item))
}

function parseReleaseDate(value: BsonValue | undefined): string | undefined {
  const direct = asString(value)
  if (direct) return direct
  const doc = asDoc(value)
  if (!doc) return undefined
  const year = asNumber(doc.Year)
  if (!year) return undefined
  const month = asNumber(doc.Month)
  const day = asNumber(doc.Day)
  if (!month) return String(year)
  if (!day) return `${year}-${String(month).padStart(2, '0')}`
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

type PlayniteNameMaps = {
  companies: Map<string, string>
  genres: Map<string, string>
  tags: Map<string, string>
  features: Map<string, string>
  platforms: Map<string, string>
  series: Map<string, string>
}

function parseGame(
  doc: BsonDocument,
  maps: PlayniteNameMaps
): PlayniteGame | undefined {
  const id = asGuid(doc._id) ?? asGuid(doc.Id)
  const name = asString(doc.Name)
  if (!id || !name) return undefined

  const developerIds = asArray(doc.DeveloperIds)
    .map((item) => asGuid(item))
    .filter((item): item is string => Boolean(item))

  return {
    id,
    name,
    gameId: asString(doc.GameId),
    pluginId: (asGuid(doc.PluginId) ?? EMPTY_GUID).toLowerCase(),
    sourceId: asGuid(doc.SourceId),
    installDirectory: asString(doc.InstallDirectory),
    isInstalled: asBoolean(doc.IsInstalled),
    playtimeSeconds: asNumber(doc.Playtime),
    playCount: asNumber(doc.PlayCount),
    lastActivity: asString(doc.LastActivity),
    added: asString(doc.Added),
    notes: asString(doc.Notes),
    description: asString(doc.Description),
    coverImage: asString(doc.CoverImage),
    backgroundImage: asString(doc.BackgroundImage),
    icon: asString(doc.Icon),
    releaseDate: parseReleaseDate(doc.ReleaseDate) ?? asString(doc.ReleaseYear),
    developerIds,
    developers: developerIds
      .map((devId) => maps.companies.get(devId))
      .filter((item): item is string => Boolean(item)),
    publishers: namesFor(doc.PublisherIds, maps.companies),
    genres: namesFor(doc.GenreIds, maps.genres),
    tags: namesFor(doc.TagIds, maps.tags),
    features: namesFor(doc.FeatureIds, maps.features),
    platforms: namesFor(doc.PlatformIds, maps.platforms),
    series:
      asString(doc.Series) ||
      maps.series.get(asGuid(doc.SeriesId) ?? '') ||
      undefined,
    gameActions: asArray(doc.GameActions)
      .map((item) => asDoc(item))
      .filter((item): item is BsonDocument => Boolean(item))
      .map(parseAction),
    roms: asArray(doc.Roms)
      .map((item) => asDoc(item))
      .filter((item): item is BsonDocument => Boolean(item))
      .map(parseRom)
      .filter((item): item is PlayniteRom => Boolean(item)),
    completionStatusId: asGuid(doc.CompletionStatusId)
  }
}

function parseCompletionStatus(
  doc: BsonDocument
): PlayniteCompletionStatus | undefined {
  const id = asGuid(doc._id) ?? asGuid(doc.Id)
  const name = asString(doc.Name)
  if (!id || !name) return undefined
  return { id, name }
}

function resolvePlayniteRoot(libraryPath: string): string {
  const parent = dirname(libraryPath)
  if (existsSync(join(parent, 'ExtensionsData'))) return parent
  if (existsSync(join(libraryPath, 'ExtensionsData'))) return libraryPath
  return parent
}

function readGameActivity(
  playniteRoot: string
): Record<string, PlayniteActivitySession[]> {
  const folder = join(
    playniteRoot,
    'ExtensionsData',
    GAME_ACTIVITY_ID,
    'GameActivity'
  )
  const sessionsByGameId: Record<string, PlayniteActivitySession[]> = {}
  if (!existsSync(folder)) return sessionsByGameId

  for (const fileName of readdirSync(folder)) {
    if (!fileName.endsWith('.json')) continue
    const gameId = fileName.replace(/\.json$/i, '').toLowerCase()
    try {
      const parsed = JSON.parse(
        readFileSync(join(folder, fileName), 'utf-8')
      ) as {
        Items?: Array<{
          DateSession?: string
          ElapsedSeconds?: number
          GameActionName?: string
        }>
      }
      sessionsByGameId[gameId] = (parsed.Items ?? [])
        .filter((item) => item.DateSession && item.ElapsedSeconds)
        .map((item) => ({
          dateSession: item.DateSession as string,
          elapsedSeconds: Number(item.ElapsedSeconds) || 0,
          gameActionName: item.GameActionName
        }))
    } catch {
      // Ignore malformed activity files
    }
  }

  return sessionsByGameId
}

export function loadPlayniteLibrary(libraryPath: string): PlayniteLibraryDump {
  const gamesDocs = readDb(libraryPath, 'games.db')
  const maps: PlayniteNameMaps = {
    companies: nameMap(readDb(libraryPath, 'companies.db')),
    genres: nameMap(readDb(libraryPath, 'genres.db')),
    tags: nameMap(readDb(libraryPath, 'tags.db')),
    features: nameMap(readDb(libraryPath, 'features.db')),
    platforms: nameMap(readDb(libraryPath, 'platforms.db')),
    series: nameMap(readDb(libraryPath, 'series.db'))
  }
  const emulators = readDb(libraryPath, 'emulators.db')
    .map(parseEmulator)
    .filter((item): item is PlayniteEmulator => Boolean(item))

  const playniteRoot = resolvePlayniteRoot(libraryPath)

  const completionStatuses = readDb(libraryPath, 'completionstatuses.db')
    .map(parseCompletionStatus)
    .filter((item): item is PlayniteCompletionStatus => Boolean(item))

  return {
    libraryPath,
    playniteRoot,
    games: gamesDocs
      .map((doc) => parseGame(doc, maps))
      .filter((item): item is PlayniteGame => Boolean(item)),
    emulators,
    completionStatuses,
    sessionsByGameId: readGameActivity(playniteRoot)
  }
}
