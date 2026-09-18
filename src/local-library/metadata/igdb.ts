import axios from 'axios'
import { logWarning, LogPrefix } from 'backend/logger'
import type {
  CollectionGameMetadata,
  CollectionMetadataSearchHit
} from 'common/types/local-library'
import { getCollectionSettings } from '../settings'
import { blankMetadata, clipText, uniqueNames } from './blank'
import { pickBestMatch, titleQueries } from './match'

const STEAM_EXTERNAL = 1
const TOKEN_SKEW_MS = 60 * 1000

type TokenState = {
  access: string
  expiresAt: number
  clientId: string
}

type IgdbNamed = { name?: string }
type IgdbImage = { image_id?: string }
type IgdbCompany = {
  developer?: boolean
  publisher?: boolean
  company?: IgdbNamed
}
type IgdbWebsite = { url?: string; category?: number }
type IgdbExternal = { uid?: string; category?: number }

type IgdbGame = {
  id: number
  name?: string
  slug?: string
  summary?: string
  storyline?: string
  first_release_date?: number
  aggregated_rating?: number
  total_rating?: number
  url?: string
  cover?: IgdbImage
  screenshots?: IgdbImage[]
  artworks?: IgdbImage[]
  genres?: IgdbNamed[]
  themes?: IgdbNamed[]
  game_modes?: IgdbNamed[]
  platforms?: IgdbNamed[]
  collection?: IgdbNamed
  franchises?: IgdbNamed[]
  involved_companies?: IgdbCompany[]
  websites?: IgdbWebsite[]
  external_games?: IgdbExternal[]
}

const GAME_FIELDS = [
  'name',
  'slug',
  'summary',
  'storyline',
  'first_release_date',
  'aggregated_rating',
  'total_rating',
  'url',
  'cover.image_id',
  'screenshots.image_id',
  'artworks.image_id',
  'genres.name',
  'themes.name',
  'game_modes.name',
  'platforms.name',
  'collection.name',
  'franchises.name',
  'involved_companies.developer',
  'involved_companies.publisher',
  'involved_companies.company.name',
  'websites.url',
  'websites.category',
  'external_games.uid',
  'external_games.category'
].join(',')

let tokenState: TokenState | null = null
let queue = Promise.resolve()
let lastCallAt = 0

function credentials() {
  const { igdbClientId, igdbClientSecret } = getCollectionSettings().metadata
  return {
    clientId: igdbClientId.trim(),
    clientSecret: igdbClientSecret.trim()
  }
}

export function igdbConfigured() {
  const { clientId, clientSecret } = credentials()
  return Boolean(clientId && clientSecret)
}

export function igdbImageUrl(
  imageId: string | undefined,
  size: 'cover_big_2x' | '720p' | 'screenshot_huge'
) {
  if (!imageId) return undefined
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`
}

function escapeApicalypse(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCallAt + 280 - Date.now()
    if (wait > 0) {
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
    lastCallAt = Date.now()
    return fn()
  })
  queue = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

async function twitchToken(force = false): Promise<string> {
  const { clientId, clientSecret } = credentials()
  if (!clientId || !clientSecret) {
    throw new Error('IGDB credentials are not configured')
  }
  if (
    !force &&
    tokenState &&
    tokenState.clientId === clientId &&
    tokenState.expiresAt - TOKEN_SKEW_MS > Date.now()
  ) {
    return tokenState.access
  }

  const response = await axios.post<{
    access_token?: string
    expires_in?: number
  }>('https://id.twitch.tv/oauth2/token', null, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials'
    },
    timeout: 15000
  })
  const access = response.data.access_token
  if (!access) throw new Error('Twitch did not return an IGDB token')
  tokenState = {
    access,
    clientId,
    expiresAt: Date.now() + (response.data.expires_in ?? 3600) * 1000
  }
  return access
}

async function igdbPost<T>(
  path: string,
  body: string,
  retry = true
): Promise<T> {
  const { clientId } = credentials()
  const token = await twitchToken()
  try {
    const response = await axios.post<T>(
      `https://api.igdb.com/v4/${path}`,
      body,
      {
        timeout: 20000,
        headers: {
          'Client-ID': clientId,
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          'Content-Type': 'text/plain'
        }
      }
    )
    return response.data
  } catch (error) {
    const status = axios.isAxiosError(error)
      ? error.response?.status
      : undefined
    if (retry && status === 401) {
      await twitchToken(true)
      return igdbPost(path, body, false)
    }
    throw error
  }
}

function yearFromUnix(value?: number) {
  if (!value) return undefined
  return new Date(value * 1000).getUTCFullYear()
}

function releaseDate(value?: number) {
  if (!value) return undefined
  return new Date(value * 1000).toISOString().slice(0, 10)
}

function mapGame(
  appName: string,
  runner: string,
  game: IgdbGame
): CollectionGameMetadata {
  const developers = uniqueNames(
    (game.involved_companies ?? [])
      .filter((item) => item.developer)
      .map((item) => item.company?.name)
  )
  const publishers = uniqueNames(
    (game.involved_companies ?? [])
      .filter((item) => item.publisher)
      .map((item) => item.company?.name)
  )
  const websites = uniqueNames(
    [game.url, ...(game.websites ?? []).map((item) => item.url)].filter(
      Boolean
    ),
    4
  )
  const steam = (game.external_games ?? []).find(
    (item) => item.category === STEAM_EXTERNAL && item.uid
  )
  const cover = igdbImageUrl(game.cover?.image_id, 'cover_big_2x')
  const hero =
    igdbImageUrl(game.artworks?.[0]?.image_id, '720p') ||
    igdbImageUrl(game.screenshots?.[0]?.image_id, 'screenshot_huge')

  return {
    ...blankMetadata(appName, runner),
    igdbId: game.id,
    igdbSlug: game.slug,
    steamAppId: steam?.uid,
    title: game.name,
    description: clipText(game.summary || game.storyline),
    releaseDate: releaseDate(game.first_release_date),
    developers,
    publishers,
    genres: uniqueNames((game.genres ?? []).map((item) => item.name)),
    themes: uniqueNames((game.themes ?? []).map((item) => item.name)),
    gameModes: uniqueNames((game.game_modes ?? []).map((item) => item.name)),
    platforms: uniqueNames(
      (game.platforms ?? []).map((item) => item.name),
      10
    ),
    series: game.collection?.name || game.franchises?.[0]?.name,
    criticScore:
      typeof game.aggregated_rating === 'number'
        ? Math.round(game.aggregated_rating)
        : typeof game.total_rating === 'number'
          ? Math.round(game.total_rating)
          : undefined,
    websites,
    coverUrl: cover,
    heroUrl: hero
  }
}

async function queryGames(body: string): Promise<IgdbGame[]> {
  return enqueue(async () => {
    const data = await igdbPost<IgdbGame[]>('games', body)
    return Array.isArray(data) ? data : []
  })
}

export async function testIgdbCredentials(): Promise<{
  ok: boolean
  error?: string
}> {
  if (!igdbConfigured()) {
    return {
      ok: false,
      error: 'Add a Twitch Client ID and Client Secret first.'
    }
  }
  try {
    await twitchToken(true)
    await queryGames('fields id; limit 1;')
    return { ok: true }
  } catch (error) {
    const message = axios.isAxiosError(error)
      ? error.response?.data
        ? String(error.response.data)
        : error.message
      : String(error)
    logWarning(`IGDB credential test failed: ${message}`, LogPrefix.Backend)
    return { ok: false, error: message }
  }
}

export async function searchIgdbGames(
  title: string
): Promise<CollectionMetadataSearchHit[]> {
  if (!igdbConfigured() || !title.trim()) return []
  const hits: CollectionMetadataSearchHit[] = []
  const seen = new Set<string>()
  for (const query of titleQueries(title)) {
    try {
      const games = await queryGames(
        `search "${escapeApicalypse(query)}"; fields name,slug,first_release_date; limit 8;`
      )
      for (const game of games) {
        const id = String(game.id)
        if (seen.has(id) || !game.name) continue
        seen.add(id)
        hits.push({
          source: 'igdb',
          id,
          name: game.name,
          year: yearFromUnix(game.first_release_date),
          extra: game.slug
        })
      }
      if (hits.length >= 8) break
    } catch (error) {
      logWarning(
        `IGDB search failed for ${query}: ${String(error)}`,
        LogPrefix.Backend
      )
    }
  }
  return hits.slice(0, 8)
}

async function gameById(id: number): Promise<IgdbGame | undefined> {
  const games = await queryGames(
    `fields ${GAME_FIELDS}; where id = ${id}; limit 1;`
  )
  return games[0]
}

async function gameBySteamId(
  steamAppId: string
): Promise<IgdbGame | undefined> {
  const uid = escapeApicalypse(steamAppId)
  const games = await queryGames(
    `fields ${GAME_FIELDS}; where external_games.uid = "${uid}" & external_games.category = ${STEAM_EXTERNAL}; limit 1;`
  )
  return games[0]
}

async function gameByTitle(title: string): Promise<IgdbGame | undefined> {
  for (const query of titleQueries(title)) {
    const games = await queryGames(
      `search "${escapeApicalypse(query)}"; fields ${GAME_FIELDS}; limit 8;`
    )
    const best = pickBestMatch(title, games, (item) => item.name ?? '')
    if (best) return best
  }
  return undefined
}

export async function fetchIgdbMetadata(args: {
  appName: string
  runner: string
  title: string
  steamAppId?: string
  igdbId?: number
}): Promise<CollectionGameMetadata | null> {
  if (!igdbConfigured()) return null
  try {
    const game =
      (args.igdbId ? await gameById(args.igdbId) : undefined) ||
      (args.steamAppId ? await gameBySteamId(args.steamAppId) : undefined) ||
      (await gameByTitle(args.title))
    if (!game) return null
    return mapGame(args.appName, args.runner, game)
  } catch (error) {
    logWarning(
      `IGDB fetch failed for ${args.title}: ${String(error)}`,
      LogPrefix.Backend
    )
    return null
  }
}
