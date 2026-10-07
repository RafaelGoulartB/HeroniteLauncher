import { getInfoFromGamesDB } from 'backend/wiki_game_info/gamesdb/utils'
import { getInfoFromProtonDB } from 'backend/wiki_game_info/protondb/utils'
import { getSteamDeckComp } from 'backend/wiki_game_info/steamdeck/utils'
import { wikiGameInfoStore } from './electronStore'
import { removeSpecialcharacters } from '../utils'
import { SteamInfo, WikiInfo } from 'common/types'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { getInfoFromAppleGamingWiki } from './applegamingwiki/utils'
import { getHowLongToBeat } from './howlongtobeat/utils'
import { getInfoFromPCGamingWiki } from './pcgamingwiki/utils'
import { getUmuId } from './umu/utils'
import { isLinux, isMac } from 'backend/constants/environment'
import type { Game } from 'common/types/game_manager'

const hltbCacheRefreshTried = new Set<string>()

export async function getWikiGameInfo(
  game: Game,
  preferredTitle?: string
): Promise<WikiInfo | null> {
  const gameInfo = game.getGameInfo()
  const appName = gameInfo.app_name
  const runner = gameInfo.runner
  const lookupTitle = preferredTitle?.trim() || gameInfo.title

  try {
    if (!lookupTitle) {
      return null
    }

    const title = removeSpecialcharacters(lookupTitle)
    const fallbackTitle = removeSpecialcharacters(gameInfo.title || '')
    const cachedResponse =
      wikiGameInfoStore.get(title) ??
      (fallbackTitle && fallbackTitle !== title
        ? wikiGameInfoStore.get(fallbackTitle)
        : undefined)
    if (cachedResponse?.howlongtobeat) {
      logInfo(
        [`Using cached ExtraGameInfo data for ${title}`],
        LogPrefix.ExtraGameInfo
      )
      return cachedResponse
    }

    if (cachedResponse && hltbCacheRefreshTried.has(title)) {
      logInfo(
        [`Using cached ExtraGameInfo data for ${title}`],
        LogPrefix.ExtraGameInfo
      )
      return cachedResponse
    }

    if (cachedResponse) {
      hltbCacheRefreshTried.add(title)
      logInfo(
        [`Refreshing HowLongToBeat data for ${title}`],
        LogPrefix.ExtraGameInfo
      )
      const pcgamingwiki =
        cachedResponse.pcgamingwiki ??
        (await getInfoFromPCGamingWiki(
          lookupTitle,
          runner === 'gog' ? appName : undefined
        ))
      const howlongtobeat = await getHowLongToBeat(
        game,
        pcgamingwiki?.howLongToBeatID,
        lookupTitle
      )
      const refreshed = {
        ...cachedResponse,
        pcgamingwiki,
        howlongtobeat
      }
      wikiGameInfoStore.set(title, refreshed)
      return refreshed
    }

    logInfo(`Getting ExtraGameInfo data for ${title}`, LogPrefix.ExtraGameInfo)

    const [pcgamingwiki, gamesdb, applegamingwiki, umuId] = await Promise.all([
      getInfoFromPCGamingWiki(
        lookupTitle,
        runner === 'gog' ? appName : undefined
      ),
      getInfoFromGamesDB(title, appName, runner),
      isMac ? getInfoFromAppleGamingWiki(title) : null,
      isLinux ? getUmuId(appName, runner) : null
    ])

    // Get HowLongToBeat data, using gog.com site for GOG games, and HLTB ID from PCGamingWiki if available
    const howlongtobeat = await getHowLongToBeat(
      game,
      pcgamingwiki?.howLongToBeatID,
      lookupTitle
    )

    let steamInfo = null
    if (isLinux) {
      // gamesdb is more accurate since we always query by appName
      // pcgamingwiki is queried by title in most cases
      const steamID = gamesdb?.steamID || pcgamingwiki?.steamID
      const [protondb, steamdeck] = await Promise.all([
        getInfoFromProtonDB(steamID),
        getSteamDeckComp(steamID)
      ])

      if (protondb || steamdeck) {
        steamInfo = {
          compatibilityLevel: protondb?.level,
          steamDeckCatagory: steamdeck?.category
        } as SteamInfo
      }
    }

    const wikiGameInfo = {
      pcgamingwiki,
      applegamingwiki,
      howlongtobeat,
      gamesdb,
      steamInfo,
      umuId
    }

    wikiGameInfoStore.set(title, wikiGameInfo)

    return wikiGameInfo
  } catch (error) {
    logError(
      [`Was not able to get ExtraGameInfo data for ${gameInfo.title}`, error],
      LogPrefix.ExtraGameInfo
    )
    return null
  }
}
