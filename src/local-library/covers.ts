import { GlobalConfig } from 'backend/config'
import { sendFrontendMessage } from 'backend/ipc'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { decryptApiKey, isEncryptedValue } from 'backend/steamgrid/secureKey'
import { getGrids, getHeroes, searchGame } from 'backend/steamgrid/utils'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import { axiosClient } from 'backend/utils'
import type { GameInfo } from 'common/types'
import type { LocalGameMeta } from 'common/types/local-library'
import { normalizeTitle } from './playnite/mapper'
import { getLocalGameMeta } from './stores'

function steamCdn(appId: string, file: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/${file}`
}

function steamCovers(appId: string): { art_square: string; art_cover: string } {
  return {
    art_square: steamCdn(appId, 'library_600x900_2x.jpg'),
    art_cover: steamCdn(appId, 'header.jpg')
  }
}

function steamGridKey(): string {
  const stored = GlobalConfig.get().getSettings().steamGridDbApiKey ?? ''
  if (!stored) return ''
  return isEncryptedValue(stored) ? decryptApiKey(stored) : stored
}

function titleQueries(title: string): string[] {
  const cleaned = title.replaceAll('_', ' ').replace(/\s+/g, ' ').trim()
  const colon = cleaned.replace(/\s+-\s+/g, ': ')
  return [...new Set([cleaned, colon])].filter((query) => query.length >= 2)
}

function isLikelyAddon(name: string, query: string): boolean {
  const extra =
    /\b(soundtrack|ost|dlc|pack|bundle|redkit|demo|toolkit|bonus)\b/i
  return extra.test(normalizeTitle(name)) && !extra.test(normalizeTitle(query))
}

function scoreSteamName(query: string, name: string): number {
  const wanted = normalizeTitle(query)
  const got = normalizeTitle(name)
  if (!wanted || !got) return 0
  if (isLikelyAddon(name, query)) return 0
  if (wanted === got) return 100
  if (got.startsWith(wanted) || wanted.startsWith(got)) {
    return Math.max(60, 90 - Math.abs(got.length - wanted.length))
  }
  if (got.includes(wanted)) return 45
  return 0
}

async function steamAppIdFromTitle(title: string): Promise<string | undefined> {
  let best: { id: string; score: number } | undefined

  const consider = (id: string | number | undefined, name: string) => {
    if (!id) return
    const score = scoreSteamName(title, name)
    if (score < 60) return
    if (!best || score > best.score) {
      best = { id: String(id), score }
    }
  }

  for (const query of titleQueries(title)) {
    try {
      const community = await axiosClient.get<
        Array<{ appid?: string; name?: string }>
      >(
        `https://steamcommunity.com/actions/SearchApps/${encodeURIComponent(query)}`
      )
      const hits = Array.isArray(community.data) ? community.data : []
      for (const item of hits) {
        consider(item.appid, item.name ?? '')
      }
    } catch (error) {
      logWarning(
        `Steam community search failed for ${query}: ${String(error)}`,
        LogPrefix.Backend
      )
    }

    if (best && best.score >= 90) break

    try {
      const store = await axiosClient.get<{
        items?: Array<{ type?: string; id?: number; name?: string }>
      }>('https://store.steampowered.com/api/storesearch/', {
        params: { term: query, l: 'english', cc: 'US' }
      })
      for (const item of store.data.items ?? []) {
        if (item.type && item.type !== 'app') continue
        consider(item.id, item.name ?? '')
      }
    } catch (error) {
      logWarning(
        `Steam store search failed for ${query}: ${String(error)}`,
        LogPrefix.Backend
      )
    }

    if (best && best.score >= 90) break
  }

  return best?.id
}

async function bottlesGrid(title: string): Promise<string | undefined> {
  try {
    const response = await axiosClient.get<string>(
      `https://steamgrid.usebottles.com/api/search/${encodeURIComponent(title)}`,
      { timeout: 5000 }
    )
    const url = response.data
    if (typeof url === 'string' && url.startsWith('http')) return url
  } catch (error) {
    logWarning(
      `Bottles SteamGrid search failed for ${title}: ${String(error)}`,
      LogPrefix.Backend
    )
  }
  return undefined
}

async function coversFromSteamGrid(
  apiKey: string,
  sgdbId: number
): Promise<{ art_square?: string; art_cover?: string }> {
  const [grids, heroes] = await Promise.all([
    getGrids(apiKey, { gameId: sgdbId, dimensions: ['600x900'] }),
    getHeroes(apiKey, { gameId: sgdbId, dimensions: ['1600x650'] })
  ])
  return {
    art_square: grids[0]?.url,
    art_cover: heroes[0]?.url ?? grids[0]?.url
  }
}

async function steamGridIdFromSteamApp(
  apiKey: string,
  steamAppId: string
): Promise<number | undefined> {
  try {
    const response = await axiosClient.get<{
      success: boolean
      data?: { id: number }
    }>(`https://www.steamgriddb.com/api/v2/games/steam/${steamAppId}`, {
      headers: { Authorization: `Bearer ${apiKey}` }
    })
    if (response.data.success && response.data.data?.id) {
      return response.data.data.id
    }
  } catch (error) {
    logWarning(
      `SteamGridDB steam id lookup failed for ${steamAppId}: ${String(error)}`,
      LogPrefix.Backend
    )
  }
  return undefined
}

function hasCover(covers: Pick<GameInfo, 'art_cover' | 'art_square'>): boolean {
  return Boolean(covers.art_cover || covers.art_square)
}

export async function fetchCoversForGame(
  meta: LocalGameMeta,
  gameInfo: GameInfo
): Promise<Pick<GameInfo, 'art_cover' | 'art_square'>> {
  const apiKey = steamGridKey()

  if (meta.steamAppId) {
    const fromSteam = steamCovers(meta.steamAppId)
    if (apiKey) {
      const sgdbId = await steamGridIdFromSteamApp(apiKey, meta.steamAppId)
      if (sgdbId) {
        const sgdb = await coversFromSteamGrid(apiKey, sgdbId)
        return {
          art_square: sgdb.art_square ?? fromSteam.art_square,
          art_cover: sgdb.art_cover ?? fromSteam.art_cover
        }
      }
    }
    return fromSteam
  }

  if (apiKey) {
    try {
      const results = await searchGame(apiKey, meta.title)
      if (results[0]) {
        const sgdb = await coversFromSteamGrid(apiKey, results[0].id)
        if (sgdb.art_cover || sgdb.art_square) {
          return {
            art_square: sgdb.art_square ?? gameInfo.art_square,
            art_cover: sgdb.art_cover ?? gameInfo.art_cover
          }
        }
      }
    } catch (error) {
      logWarning(
        `SteamGridDB search failed for ${meta.title}: ${String(error)}`,
        LogPrefix.Backend
      )
    }
  }

  const steamId = await steamAppIdFromTitle(meta.title)
  if (steamId) {
    return steamCovers(steamId)
  }

  const grid = await bottlesGrid(meta.title)
  if (grid) {
    return { art_square: grid, art_cover: grid }
  }

  return {
    art_cover: gameInfo.art_cover,
    art_square: gameInfo.art_square
  }
}

async function mapPool<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>
) {
  let index = 0
  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length) {
        const current = items[index]
        index += 1
        await fn(current)
      }
    }
  )
  await Promise.all(workers)
}

let coverBackfillRunning = false

export async function refreshMissingLocalCovers(): Promise<number> {
  if (coverBackfillRunning) return 0
  coverBackfillRunning = true

  try {
    const games = sideloadStore.get('games', [])
    const missing = games.filter(
      (game) =>
        !game.art_cover && !game.art_square && getLocalGameMeta(game.app_name)
    )
    if (!missing.length) return 0

    logInfo(
      `Fetching covers for ${missing.length} local game(s) without artwork`,
      LogPrefix.Backend
    )

    let fetched = 0
    await mapPool(missing, 4, async (game) => {
      const meta = getLocalGameMeta(game.app_name)
      if (!meta) return
      const covers = await fetchCoversForGame(meta, game)
      if (!hasCover(covers)) return
      game.art_cover = covers.art_cover || game.art_cover
      game.art_square = covers.art_square || game.art_square
      fetched += 1
    })

    if (fetched) {
      sideloadStore.set('games', games)
      sendFrontendMessage('refreshLibrary', 'sideload')
      logInfo(`Saved covers for ${fetched} local game(s)`, LogPrefix.Backend)
    }

    return fetched
  } finally {
    coverBackfillRunning = false
  }
}
