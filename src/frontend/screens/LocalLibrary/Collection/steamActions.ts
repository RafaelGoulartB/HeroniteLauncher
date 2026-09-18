import type {
  LocalGameMeta,
  SteamClientUriAction
} from 'common/types/local-library'

export function steamAppIdFromMeta(meta?: LocalGameMeta): string | undefined {
  if (meta?.launchKind !== 'steam-uri' || !meta.steamAppId) return undefined
  return meta.steamAppId
}

export function openSteamStoreUri(
  action: SteamClientUriAction,
  steamAppId: string
) {
  return window.api.localLibrary.openSteamUri({ action, steamAppId })
}
