import { sendFrontendMessage } from 'backend/ipc'
import { logError, logInfo, LogPrefix } from 'backend/logger'
import { tsStore } from 'backend/constants/key_value_stores'
import { libraryStore as sideloadStore } from 'backend/storeManagers/sideload/electronStores'
import type { Runner } from 'common/types'
import { removeAllCollectionGameArt } from './art'
import { removeMetadataArt } from './metadata/images'
import { deleteGameMetadata } from './metadata/store'
import { deleteLocalGameMeta, deleteLocalSessions } from './stores'

export async function removeCollectionGame(args: {
  appName: string
  runner: Runner
}): Promise<{ ok: boolean; error?: string }> {
  const { appName, runner } = args
  if (runner !== 'sideload') {
    return {
      ok: false,
      error: 'Only Local Collection games can be removed from here'
    }
  }

  const current = sideloadStore.get('games', [])
  const game = current.find((item) => item.app_name === appName)

  if (game) {
    try {
      const SideloadGame = (
        await import('backend/storeManagers/sideload/games')
      ).default
      const instance = new SideloadGame(appName)
      const { removeShortcuts } =
        await import('backend/shortcuts/shortcuts/shortcuts')
      await removeShortcuts(instance)
      const { removeNonSteamGame } =
        await import('backend/shortcuts/nonesteamgame/nonesteamgame')
      await removeNonSteamGame(instance)
    } catch (error) {
      logError(
        ['Could not remove shortcuts for Collection game:', error],
        LogPrefix.Backend
      )
    }

    sideloadStore.set(
      'games',
      current.filter((item) => item.app_name !== appName)
    )
  }

  deleteLocalGameMeta(appName)
  deleteLocalSessions(appName)
  removeAllCollectionGameArt(runner, appName)
  deleteGameMetadata(runner, appName)
  removeMetadataArt(runner, appName)
  tsStore.delete(appName)

  try {
    const { removeRecentGame } =
      await import('backend/recent_games/recent_games')
    await removeRecentGame(appName)
  } catch (error) {
    logError(
      ['Could not remove recent entry for Collection game:', error],
      LogPrefix.Backend
    )
  }

  sendFrontendMessage('refreshLibrary', 'sideload')
  logInfo(`Removed ${appName} from Collection`, LogPrefix.Backend)
  return { ok: true }
}
