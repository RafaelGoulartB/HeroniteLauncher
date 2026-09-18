import { getLocalGameMeta, getLocalSessions } from './stores'

export { initLocalLibrary } from './init'
export { initLocalArtProtocol, registerLocalArtScheme } from './protocol'
export {
  applySideloadAppToLocalMeta,
  refreshLocalInstallStates
} from './install-state'
export {
  beginScreenshotCaptureSession,
  endScreenshotCaptureSession,
  prepareScreenshotCaptureService
} from './screenshots/capture'
export { getLocalGameMeta, getLocalSessions }

export function isSteamUriGame(appName: string) {
  const meta = getLocalGameMeta(appName)
  return meta?.launchKind === 'steam-uri' && Boolean(meta.steamAppId)
}

export async function refreshMissingLocalCovers() {
  const { refreshMissingLocalCovers: run } = await import('./covers')
  return run()
}

export async function recordLocalSession(
  ...args: Parameters<(typeof import('./sessions'))['recordLocalSession']>
) {
  const { recordLocalSession: run } = await import('./sessions')
  return run(...args)
}

export async function backupLudusaviAfterPlay(
  ...args: Parameters<(typeof import('./ludusavi'))['backupLudusaviAfterPlay']>
) {
  const { backupLudusaviAfterPlay: run } = await import('./ludusavi')
  return run(...args)
}

export async function isSteamClientAvailable() {
  const { isSteamClientAvailable: run } = await import('./steam')
  return run()
}

export async function isSteamAppInstalled(appId: string) {
  const { isSteamAppInstalled: run } = await import('./steam')
  return run(appId)
}

export async function openSteamClientUri(
  ...args: Parameters<(typeof import('./steam'))['openSteamClientUri']>
) {
  const { openSteamClientUri: run } = await import('./steam')
  return run(...args)
}

export async function tryLaunchLocalGame(
  ...args: Parameters<(typeof import('./steam'))['tryLaunchLocalGame']>
) {
  const { tryLaunchLocalGame: run } = await import('./steam')
  return run(...args)
}

export async function tryStopLocalGame(appName: string) {
  const { tryStopLocalGame: run } = await import('./steam')
  return run(appName)
}

export async function forceClearLocalPlaying(
  ...args: Parameters<
    (typeof import('./playtime-watch'))['forceClearLocalPlaying']
  >
) {
  const { forceClearLocalPlaying: run } = await import('./playtime-watch')
  return run(...args)
}

export async function removeCollectionGame(
  ...args: Parameters<(typeof import('./remove'))['removeCollectionGame']>
) {
  const { removeCollectionGame: run } = await import('./remove')
  return run(...args)
}
