import { existsSync, mkdirSync, writeFileSync } from 'graceful-fs'
import { join } from 'path'
import { app } from 'electron'
import axios, { isAxiosError } from 'axios'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import type { SteamHeroCacheResult } from 'common/types/local-library'
import { localArtUrl } from './protocol'

const pending = new Map<string, Promise<SteamHeroCacheResult | null>>()
const missing = new Set<string>()

function heroesDir() {
  return join(app.getPath('userData'), 'local_library', 'heroes')
}

function heroPath(steamAppId: string) {
  return join(heroesDir(), `${steamAppId}.jpg`)
}

function heroDisplayUrl(steamAppId: string) {
  return localArtUrl('heroes', `${steamAppId}.jpg`)
}

function heroCandidateUrls(steamAppId: string) {
  return [
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_hero_2x.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_hero.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero_2x.jpg`,
    `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${steamAppId}/library_hero.jpg`,
    `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/page_bg_generated_v6b.jpg`
  ]
}

async function downloadHero(url: string, dest: string): Promise<boolean> {
  try {
    const response = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 25000,
      validateStatus: (status) => status === 200
    })
    const bytes = Buffer.from(response.data)
    const type = String(response.headers['content-type'] ?? '')
    if (!type.includes('image') || bytes.length < 8000) return false
    writeFileSync(dest, bytes)
    return true
  } catch (error) {
    const status = isAxiosError(error) ? error.response?.status : undefined
    if (status !== 404) {
      logWarning(
        `Steam hero download failed for ${url}: ${String(error)}`,
        LogPrefix.Backend
      )
    }
    return false
  }
}

export async function cacheSteamHero(
  steamAppId: string
): Promise<SteamHeroCacheResult | null> {
  if (!steamAppId) return null

  const dest = heroPath(steamAppId)
  if (existsSync(dest)) {
    return {
      url: heroDisplayUrl(steamAppId),
      path: dest,
      fromCache: true
    }
  }
  if (missing.has(steamAppId)) return null

  const inflight = pending.get(steamAppId)
  if (inflight) return inflight

  const task = (async () => {
    mkdirSync(heroesDir(), { recursive: true })
    for (const url of heroCandidateUrls(steamAppId)) {
      if (await downloadHero(url, dest)) {
        missing.delete(steamAppId)
        return {
          url: heroDisplayUrl(steamAppId),
          path: dest,
          fromCache: false
        }
      }
    }
    missing.add(steamAppId)
    return null
  })().finally(() => pending.delete(steamAppId))

  pending.set(steamAppId, task)
  return task
}

export async function warmSteamHeroes(steamAppIds: string[]): Promise<void> {
  const unique = [...new Set(steamAppIds.filter(Boolean))]
  const needed = unique.filter(
    (id) => !existsSync(heroPath(id)) && !missing.has(id)
  )
  if (!needed.length) return

  logInfo(
    `Caching Steam heroes for ${needed.length} game(s)`,
    LogPrefix.Backend
  )

  let index = 0
  const workers = Array.from(
    { length: Math.min(2, needed.length) },
    async () => {
      while (index < needed.length) {
        const current = needed[index]
        index += 1
        await cacheSteamHero(current)
      }
    }
  )
  await Promise.all(workers)
}
