import { existsSync, statSync } from 'graceful-fs'
import { join } from 'path'
import { logWarning, LogPrefix } from 'backend/logger'
import { axiosClient } from 'backend/utils'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import { libraryStore as legendaryStore } from 'backend/storeManagers/legendary/electronStores'
import { libraryStore as gogStore } from 'backend/storeManagers/gog/electronStores'
import { libraryStore as nileStore } from 'backend/storeManagers/nile/electronStores'
import type { GameInfo } from 'common/types'
import type { CollectionGameMetadata } from 'common/types/local-library'
import { getSteamAppDetails } from '../steam-details'
import { getLastPlayniteLibraryPath } from '../status'
import { getLocalGameMeta } from '../stores'
import {
  loadPlayniteLibrary,
  PlayniteGame,
  PlayniteLibraryDump
} from '../playnite/reader'
import { steamLibraryCover, steamLibraryHero } from './steam-cdn'
import { blankMetadata, clipText, stripHtml, uniqueNames } from './blank'
import { pickBestMatch, titleQueries } from './match'

type LutrisListItem = {
  slug?: string
  name?: string
  year?: number
}

type LutrisDetail = {
  slug?: string
  name?: string
  year?: number
  description?: string
  website?: string
  platforms?: Array<{ name?: string } | string>
  genres?: Array<{ name?: string } | string>
  coverart?: string
  cover_url?: string
  banner_url?: string
  background_url?: string
}

let playniteDumpCache:
  | { path: string; dump: PlayniteLibraryDump; at: number }
  | undefined

export function steamCdnCover(steamAppId?: string) {
  return steamAppId ? steamLibraryCover(steamAppId) : undefined
}

export function steamCdnHero(steamAppId?: string) {
  return steamAppId ? steamLibraryHero(steamAppId) : undefined
}

function namedList(values?: Array<{ name?: string } | string>) {
  return uniqueNames(
    (values ?? []).map((item) => (typeof item === 'string' ? item : item.name))
  )
}

export async function fetchLutrisMetadata(args: {
  appName: string
  runner: string
  title: string
  lutrisSlug?: string
}): Promise<CollectionGameMetadata | null> {
  try {
    let slug = args.lutrisSlug
    if (!slug) {
      for (const query of titleQueries(args.title)) {
        const response = await axiosClient.get<{
          results?: LutrisListItem[]
        }>('https://lutris.net/api/games', {
          params: { search: query },
          timeout: 12000
        })
        const results = response.data.results ?? []
        const best = pickBestMatch(
          args.title,
          results,
          (item) => item.name ?? ''
        )
        if (best?.slug) {
          slug = best.slug
          break
        }
      }
    }
    if (!slug) return null
    const detail = await axiosClient.get<LutrisDetail>(
      `https://lutris.net/api/games/${slug}`,
      { timeout: 15000 }
    )
    const game = detail.data
    if (!game?.name) return null
    const cover = game.coverart || game.cover_url
    const hero = game.banner_url || game.background_url
    return {
      ...blankMetadata(args.appName, args.runner),
      lutrisSlug: game.slug || slug,
      title: game.name,
      description: clipText(stripHtml(game.description)),
      releaseDate: game.year ? String(game.year) : undefined,
      platforms: namedList(game.platforms),
      genres: namedList(game.genres),
      websites: uniqueNames([game.website], 2),
      coverUrl: cover?.startsWith('http') ? cover : undefined,
      heroUrl: hero?.startsWith('http') ? hero : undefined
    }
  } catch (error) {
    logWarning(
      `Lutris metadata failed for ${args.title}: ${String(error)}`,
      LogPrefix.Backend
    )
    return null
  }
}

export async function fetchSteamMetadata(args: {
  appName: string
  runner: string
  steamAppId?: string
  language?: string
}): Promise<CollectionGameMetadata | null> {
  if (!args.steamAppId) return null
  const details = await getSteamAppDetails({
    steamAppId: args.steamAppId,
    language: args.language
  })
  if (!details) return null
  return {
    ...blankMetadata(args.appName, args.runner),
    steamAppId: args.steamAppId,
    title: details.name,
    description: clipText(
      stripHtml(details.shortDescription || details.descriptionHtml)
    ),
    releaseDate: details.releaseDate,
    developers: uniqueNames(details.developers),
    publishers: uniqueNames(details.publishers),
    genres: uniqueNames(details.genres),
    features: uniqueNames(details.features),
    websites: uniqueNames([details.website, details.storeUrl], 3),
    coverUrl: steamCdnCover(args.steamAppId),
    heroUrl: steamCdnHero(args.steamAppId)
  }
}

function storeGames(runner: string): GameInfo[] {
  if (runner === 'legendary') return legendaryStore.get('library', [])
  if (runner === 'gog') return gogStore.get('games', [])
  if (runner === 'nile') return nileStore.get('library', [])
  return sideloadStore.get('games', [])
}

export function fetchStoreMetadata(args: {
  appName: string
  runner: string
}): CollectionGameMetadata | null {
  const game = storeGames(args.runner).find(
    (item) => item.app_name === args.appName
  )
  if (!game) return null
  const extra = game.extra
  const description =
    extra?.about?.shortDescription ||
    extra?.about?.description ||
    game.description
  return {
    ...blankMetadata(args.appName, args.runner),
    title: game.title,
    description: clipText(stripHtml(description)),
    releaseDate: extra?.releaseDate,
    developers: uniqueNames([game.developer]),
    genres: uniqueNames(extra?.genres ?? []),
    websites: uniqueNames([extra?.storeUrl], 2),
    coverUrl: game.art_square || game.art_cover,
    heroUrl: game.art_background || game.art_cover
  }
}

function playniteFilePath(libraryPath: string, relative?: string) {
  if (!relative) return undefined
  const cleaned = relative
    .replace(/\\/g, '/')
    .replace(/^\{PlayniteDir\}\/?/i, '')
  const candidates = [
    join(libraryPath, 'files', cleaned),
    join(libraryPath, cleaned),
    cleaned.startsWith('files/')
      ? join(libraryPath, cleaned)
      : join(libraryPath, 'files', cleaned)
  ]
  return candidates.find((path) => existsSync(path))
}

export function usablePlayniteFile(
  libraryPath: string,
  relative?: string,
  maxBytes = 2 * 1024 * 1024
) {
  const path = playniteFilePath(libraryPath, relative)
  if (!path) return undefined
  try {
    if (statSync(path).size > maxBytes) return undefined
  } catch {
    return undefined
  }
  return path
}

export function getCachedPlayniteDump(): PlayniteLibraryDump | undefined {
  const libraryPath = getLastPlayniteLibraryPath()
  if (!libraryPath || !existsSync(join(libraryPath, 'games.db'))) {
    return undefined
  }
  if (
    playniteDumpCache &&
    playniteDumpCache.path === libraryPath &&
    Date.now() - playniteDumpCache.at < 60_000
  ) {
    return playniteDumpCache.dump
  }
  try {
    const dump = loadPlayniteLibrary(libraryPath)
    playniteDumpCache = { path: libraryPath, dump, at: Date.now() }
    return dump
  } catch (error) {
    logWarning(
      `Could not reread Playnite library: ${String(error)}`,
      LogPrefix.Backend
    )
    return undefined
  }
}

export function metadataFromPlayniteGame(
  appName: string,
  runner: string,
  game: PlayniteGame,
  libraryPath: string
): CollectionGameMetadata {
  const coverPath = usablePlayniteFile(libraryPath, game.coverImage)
  const heroPath = usablePlayniteFile(libraryPath, game.backgroundImage)
  return {
    ...blankMetadata(appName, runner),
    title: game.name,
    description: clipText(stripHtml(game.description)),
    releaseDate: game.releaseDate,
    developers: uniqueNames(game.developers),
    publishers: uniqueNames(game.publishers),
    genres: uniqueNames(game.genres),
    themes: uniqueNames(game.tags),
    platforms: uniqueNames(game.platforms),
    series: game.series,
    features: uniqueNames(game.features),
    coverUrl: coverPath,
    heroUrl: heroPath
  }
}

export function fetchPlayniteMetadata(args: {
  appName: string
  runner: string
}): CollectionGameMetadata | null {
  const meta = getLocalGameMeta(args.appName)
  const dump = getCachedPlayniteDump()
  if (!meta?.playniteId || !dump) return null
  const game = dump.games.find(
    (item) => item.id.toLowerCase() === meta.playniteId.toLowerCase()
  )
  if (!game) return null
  return metadataFromPlayniteGame(
    args.appName,
    args.runner,
    game,
    dump.libraryPath
  )
}
