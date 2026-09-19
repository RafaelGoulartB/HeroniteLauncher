import axios from 'axios'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import type { Game } from 'common/types/game_manager'

export interface HeroicHowLongToBeatEntry {
  completionist: number
  mainStory: number
  mainExtra: number
  gameId?: number
  gameName?: string
  gameImageUrl?: string
  gameWebLink?: string
}

type HowLongToBeatSearchHit = {
  game_id: number
  game_name: string
  game_type?: string
  game_image?: string
  comp_main?: number
  comp_plus?: number
  comp_100?: number
}

type HowLongToBeatGamePageData = HowLongToBeatSearchHit

type HowLongToBeatInitResponse = {
  token?: string
  hpKey?: string
  hpVal?: string
}

type HowLongToBeatFindResponse = {
  data?: HowLongToBeatSearchHit[]
}

type HowLongToBeatSearchToken = {
  token: string
  hpKey: string
  hpVal: string
  fetchedAt: number
}

const HLTB_BASE_URL = 'https://howlongtobeat.com'
const HLTB_SEARCH_INIT_URL = `${HLTB_BASE_URL}/api/search/site/init`
const HLTB_SEARCH_URL = `${HLTB_BASE_URL}/api/search/site`
const HLTB_USER_AGENT =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
const HLTB_TOKEN_TTL_MS = 10 * 60 * 1000

const HLTB_PAGE_HEADERS = {
  'User-Agent': HLTB_USER_AGENT,
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  Referer: `${HLTB_BASE_URL}/`,
  'Accept-Encoding': 'gzip, deflate, br',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
}

let cachedSearchToken: HowLongToBeatSearchToken | null = null

export function secondsToHours(seconds?: number) {
  if (!seconds || seconds <= 0) return 0
  return seconds / 3600
}

export function normalizeHowLongToBeatTitle(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

export function howLongToBeatSearchTerms(title: string) {
  return title
    .split(/[^A-Za-z0-9]+/)
    .map((term) => term.trim())
    .filter(Boolean)
}

export function pickHowLongToBeatSearchMatch(
  title: string,
  results: HowLongToBeatSearchHit[]
): HowLongToBeatSearchHit | null {
  if (!results.length) return null
  const games = results.filter(
    (item) => !item.game_type || item.game_type === 'game'
  )
  const pool = games.length ? games : results
  const needle = normalizeHowLongToBeatTitle(title)
  return (
    pool.find(
      (item) => normalizeHowLongToBeatTitle(item.game_name) === needle
    ) ||
    pool.find((item) => {
      const name = normalizeHowLongToBeatTitle(item.game_name)
      return name.startsWith(needle) || needle.startsWith(name)
    }) ||
    pool.find((item) => {
      const name = normalizeHowLongToBeatTitle(item.game_name)
      return name.includes(needle) || needle.includes(name)
    }) ||
    pool[0]
  )
}

function entryFromSearchHit(
  hit: HowLongToBeatSearchHit
): HeroicHowLongToBeatEntry {
  return {
    mainStory: secondsToHours(hit.comp_main),
    mainExtra: secondsToHours(hit.comp_plus),
    completionist: secondsToHours(hit.comp_100),
    gameId: hit.game_id,
    gameName: hit.game_name || undefined,
    gameImageUrl: hit.game_image
      ? `${HLTB_BASE_URL}/games/${hit.game_image}`
      : undefined,
    gameWebLink: hit.game_id
      ? `${HLTB_BASE_URL}/game/${hit.game_id}`
      : undefined
  }
}

async function getGameDataById(
  gameId: string
): Promise<HeroicHowLongToBeatEntry | null> {
  if (!/^\d+$/.test(gameId)) {
    return null
  }

  try {
    const gameUrl = `${HLTB_BASE_URL}/game/${gameId}`

    const response = await axios.get(gameUrl, {
      headers: HLTB_PAGE_HEADERS,
      timeout: 10000,
      validateStatus: (status) => status < 500
    })

    if (response.status !== 200) {
      return null
    }

    // Extract game data from Next.js props
    const html = String(response.data)
    const nextDataMatch = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    )

    if (!nextDataMatch) {
      return null
    }

    const nextData = JSON.parse(nextDataMatch[1]) as {
      props?: {
        pageProps?: {
          game?: { data?: { game?: HowLongToBeatGamePageData[] } }
        }
      }
    }
    const gameData = nextData.props?.pageProps?.game?.data?.game?.[0]

    if (!gameData || !gameData.game_id) {
      return null
    }

    return {
      mainStory: secondsToHours(gameData.comp_main),
      mainExtra: secondsToHours(gameData.comp_plus),
      completionist: secondsToHours(gameData.comp_100),
      gameId: gameData.game_id,
      gameName: gameData.game_name || undefined,
      gameImageUrl: gameData.game_image
        ? `${HLTB_BASE_URL}/games/${gameData.game_image}`
        : undefined,
      gameWebLink: gameData.game_id
        ? `${HLTB_BASE_URL}/game/${gameData.game_id}`
        : undefined
    }
  } catch (error) {
    logError(
      [`Error fetching HLTB game data for ID ${gameId}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

async function getGogHLTBGameData(
  game: Game
): Promise<HeroicHowLongToBeatEntry | null> {
  const { app_name, title } = game.getGameInfo()
  const { storeUrl } = await game.getExtraInfo()
  if (!storeUrl) return null

  try {
    const response = await axios.get(storeUrl, {
      headers: HLTB_PAGE_HEADERS,
      timeout: 10000,
      validateStatus: (status) => status < 500
    })

    if (response.status !== 200) {
      return null
    }

    const html = response.data as string
    const mainStory = parseFloat(
      html.match(
        /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Main<\/span>/
      )![1]
    )
    const mainExtra = parseFloat(
      html.match(
        /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Main \+ Sides<\/span>/
      )![1]
    )
    const completionist = parseFloat(
      html.match(
        /<span class="howlongtobeat-box__time"> ?([\d.]+) h ?<\/span><span class="howlongtobeat-box__name">Completionist<\/span>/
      )![1]
    )

    const hltbId = parseInt(
      html.match(
        /<a target="_blank" href="https:\/\/howlongtobeat.com\/game\/(\d+)">HowLongToBeat<\/a>/
      )![1]
    )

    return {
      mainStory: Number.isFinite(mainStory) ? mainStory : 0,
      mainExtra: Number.isFinite(mainExtra) ? mainExtra : 0,
      completionist: Number.isFinite(completionist) ? completionist : 0,
      gameId: hltbId,
      gameName: title,
      gameWebLink: `${HLTB_BASE_URL}/game/${hltbId}`
    }
  } catch (error) {
    logError(
      [`Error fetching HLTB game data for ID ${app_name}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

async function fetchSearchToken(force = false) {
  if (
    !force &&
    cachedSearchToken &&
    Date.now() - cachedSearchToken.fetchedAt < HLTB_TOKEN_TTL_MS
  ) {
    return cachedSearchToken
  }

  const response = await axios.get<HowLongToBeatInitResponse>(
    HLTB_SEARCH_INIT_URL,
    {
      params: { t: Date.now() },
      headers: {
        'User-Agent': HLTB_USER_AGENT,
        Accept: 'application/json',
        Origin: HLTB_BASE_URL,
        Referer: `${HLTB_BASE_URL}/`
      },
      timeout: 10000,
      validateStatus: (status) => status < 500
    }
  )

  const data = response.data
  const token = data?.token
  const hpKey = data?.hpKey
  const hpVal = data?.hpVal
  if (response.status !== 200 || !token || !hpKey || !hpVal) {
    logInfo(
      `HowLongToBeat search init failed (${response.status})`,
      LogPrefix.ExtraGameInfo
    )
    cachedSearchToken = null
    return null
  }

  cachedSearchToken = {
    token,
    hpKey,
    hpVal,
    fetchedAt: Date.now()
  }
  return cachedSearchToken
}

async function searchHowLongToBeatByTitle(
  title: string
): Promise<HeroicHowLongToBeatEntry | null> {
  const searchTerms = howLongToBeatSearchTerms(title)
  if (!searchTerms.length) return null

  const searchOnce = async (
    forceToken: boolean
  ): Promise<{ status: number; data: HowLongToBeatFindResponse | null }> => {
    const auth = await fetchSearchToken(forceToken)
    if (!auth) return { status: 0, data: null }

    const payload: Record<string, unknown> = {
      searchType: 'games',
      searchTerms,
      searchPage: 1,
      size: 8,
      searchOptions: {
        games: {
          userId: 0,
          platform: '',
          sortCategory: 'popular',
          rangeCategory: 'main',
          rangeTime: { min: null, max: null },
          gameplay: {
            perspective: '',
            flow: '',
            genre: '',
            difficulty: ''
          },
          year: '',
          modifier: ''
        },
        users: { sortCategory: 'postcount' },
        lists: { sortCategory: 'follows' },
        filter: '',
        sort: 0,
        randomizer: 0
      },
      useCache: true,
      [auth.hpKey]: auth.hpVal
    }

    const response = await axios.post<HowLongToBeatFindResponse>(
      HLTB_SEARCH_URL,
      payload,
      {
        headers: {
          'User-Agent': HLTB_USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Origin: HLTB_BASE_URL,
          Referer: `${HLTB_BASE_URL}/`,
          'x-auth-token': auth.token,
          'x-hp-key': auth.hpKey,
          'x-hp-val': auth.hpVal
        },
        timeout: 10000,
        validateStatus: (status) => status < 500
      }
    )

    return { status: response.status, data: response.data }
  }

  try {
    let result = await searchOnce(false)
    if (result.status === 403 || result.status === 401) {
      cachedSearchToken = null
      result = await searchOnce(true)
    }
    if (result.status !== 200 || !Array.isArray(result.data?.data)) {
      logInfo(
        `HowLongToBeat search failed for ${title} (${result.status})`,
        LogPrefix.ExtraGameInfo
      )
      return null
    }

    const match = pickHowLongToBeatSearchMatch(title, result.data.data)
    if (!match?.game_id) return null
    return entryFromSearchHit(match)
  } catch (error) {
    logError(
      [`Error searching HLTB for ${title}:`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}

export async function getHowLongToBeat(
  game: Game,
  hltbId?: string,
  searchTitle?: string
): Promise<HeroicHowLongToBeatEntry | null> {
  const gameInfo = game.getGameInfo()
  const title = searchTitle?.trim() || gameInfo.title

  if (gameInfo.runner == 'gog') {
    logInfo(
      `Getting HowLongToBeat data for ${title} ${gameInfo.app_name} - ${gameInfo.runner}`,
      LogPrefix.ExtraGameInfo
    )

    const gameData = await getGogHLTBGameData(game)
    if (gameData) {
      return gameData
    }
    logInfo(
      `GOG HowLongToBeat scrape missed for ${title}, trying fallbacks`,
      LogPrefix.ExtraGameInfo
    )
  }

  if (hltbId) {
    logInfo(
      `Getting HowLongToBeat data for ${title} (ID: ${hltbId}) - ${gameInfo.runner}`,
      LogPrefix.ExtraGameInfo
    )

    const gameData = await getGameDataById(hltbId)
    if (gameData) {
      return gameData
    }
    logInfo(`HLTB ID ${hltbId} not found for ${title}`, LogPrefix.ExtraGameInfo)
  }

  logInfo(
    `Searching HowLongToBeat by title for ${title}`,
    LogPrefix.ExtraGameInfo
  )
  const searched = await searchHowLongToBeatByTitle(title)
  if (searched) {
    logInfo(
      `Found HowLongToBeat data for ${title}${
        searched.gameName ? ` (${searched.gameName})` : ''
      }`,
      LogPrefix.ExtraGameInfo
    )
    return searched
  }

  logInfo(
    `No HowLongToBeat data available for ${title}`,
    LogPrefix.ExtraGameInfo
  )
  return null
}
