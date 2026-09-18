import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'graceful-fs'
import { join } from 'path'
import { app } from 'electron'
import axios from 'axios'
import { logWarning, LogPrefix } from 'backend/logger'
import type { CollectionSteamDetails } from 'common/types/local-library'

const CACHE_MS = 30 * 24 * 60 * 60 * 1000
const pending = new Map<string, Promise<CollectionSteamDetails | null>>()
const missingUntil = new Map<string, number>()

type CachedFile = CollectionSteamDetails & { fetchedAt: number }

type SteamAppDetailsData = {
  name?: string
  short_description?: string
  detailed_description?: string
  about_the_game?: string
  developers?: string[]
  publishers?: string[]
  website?: string
  release_date?: { date?: string }
  genres?: Array<{ description?: string }>
  categories?: Array<{ description?: string }>
}

const STEAM_LANG: Record<string, string> = {
  en: 'english',
  'en-US': 'english',
  pt: 'portuguese',
  'pt-PT': 'portuguese',
  'pt-BR': 'brazilian',
  pt_BR: 'brazilian',
  es: 'spanish',
  fr: 'french',
  de: 'german',
  it: 'italian',
  ja: 'japanese',
  ko: 'koreana',
  ru: 'russian',
  pl: 'polish',
  nl: 'dutch',
  sv: 'swedish',
  tr: 'turkish',
  uk: 'ukrainian',
  hu: 'hungarian',
  cs: 'czech',
  zh: 'schinese',
  zh_Hans: 'schinese',
  'zh-Hans': 'schinese',
  zh_Hant: 'tchinese',
  'zh-Hant': 'tchinese'
}

function steamLanguage(language?: string) {
  const raw = (language || 'en').trim()
  if (STEAM_LANG[raw]) return STEAM_LANG[raw]
  const dashed = raw.replace('_', '-')
  if (STEAM_LANG[dashed]) return STEAM_LANG[dashed]
  const short = dashed.split('-')[0]
  return STEAM_LANG[short] || 'english'
}

function detailsDir() {
  return join(app.getPath('userData'), 'local_library', 'steam-details')
}

function cachePath(steamAppId: string, language: string) {
  return join(detailsDir(), `${steamAppId}.${language}.json`)
}

function cacheKey(steamAppId: string, language: string) {
  return `${steamAppId}:${language}`
}

function readCache(steamAppId: string, language: string): CachedFile | null {
  const file = cachePath(steamAppId, language)
  if (!existsSync(file)) return null
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as CachedFile
  } catch {
    return null
  }
}

function writeCache(details: CachedFile) {
  mkdirSync(detailsDir(), { recursive: true })
  writeFileSync(
    cachePath(details.steamAppId, details.language),
    JSON.stringify(details)
  )
}

function withoutFetchedAt(cached: CachedFile): CollectionSteamDetails {
  const { fetchedAt, ...details } = cached
  void fetchedAt
  return details
}

function mapDetails(
  steamAppId: string,
  language: string,
  data: SteamAppDetailsData
): CollectionSteamDetails | null {
  const descriptionHtml = (
    data.detailed_description ||
    data.about_the_game ||
    data.short_description ||
    ''
  ).trim()
  if (!descriptionHtml && !data.short_description) return null

  const features = (data.categories ?? [])
    .map((item) => item.description?.trim() ?? '')
    .filter((name) => name && !name.toLowerCase().startsWith('steam '))

  return {
    steamAppId,
    language,
    name: data.name || '',
    shortDescription: data.short_description || '',
    descriptionHtml,
    developers: (data.developers ?? []).filter(Boolean),
    publishers: (data.publishers ?? []).filter(Boolean),
    genres: (data.genres ?? [])
      .map((item) => item.description?.trim() ?? '')
      .filter(Boolean),
    features,
    releaseDate: data.release_date?.date || undefined,
    website: data.website || undefined,
    storeUrl: `https://store.steampowered.com/app/${steamAppId}`
  }
}

async function fetchDetails(
  steamAppId: string,
  language: string
): Promise<CollectionSteamDetails | null> {
  const langs = [...new Set([language, 'english'])]
  for (const lang of langs) {
    try {
      const response = await axios.get<
        Record<string, { success: boolean; data?: SteamAppDetailsData }>
      >(`https://store.steampowered.com/api/appdetails`, {
        params: { appids: steamAppId, l: lang },
        timeout: 20000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36'
        }
      })
      const payload = response.data?.[steamAppId]
      if (!payload?.success || !payload.data) continue
      const mapped = mapDetails(steamAppId, lang, payload.data)
      if (mapped) return mapped
    } catch (error) {
      logWarning(
        `Steam appdetails failed for ${steamAppId} (${lang}): ${String(error)}`,
        LogPrefix.Backend
      )
    }
  }
  return null
}

export async function getSteamAppDetails(args: {
  steamAppId: string
  language?: string
}): Promise<CollectionSteamDetails | null> {
  const steamAppId = args.steamAppId?.trim()
  if (!steamAppId) return null
  const language = steamLanguage(args.language)
  const key = cacheKey(steamAppId, language)

  const cached = readCache(steamAppId, language)
  if (cached && Date.now() - cached.fetchedAt < CACHE_MS) {
    return withoutFetchedAt(cached)
  }

  const blockedUntil = missingUntil.get(key)
  if (blockedUntil && blockedUntil > Date.now()) {
    if (cached) {
      return withoutFetchedAt(cached)
    }
    return null
  }

  const inflight = pending.get(key)
  if (inflight) return inflight

  const task = (async () => {
    const fetched = await fetchDetails(steamAppId, language)
    if (fetched) {
      missingUntil.delete(key)
      writeCache({ ...fetched, fetchedAt: Date.now() })
      return fetched
    }
    missingUntil.set(key, Date.now() + 30 * 60 * 1000)
    if (cached) {
      return withoutFetchedAt(cached)
    }
    return null
  })().finally(() => pending.delete(key))

  pending.set(key, task)
  return task
}
