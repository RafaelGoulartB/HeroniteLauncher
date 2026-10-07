import { timestampStore } from 'frontend/helpers/electronStores'

const PLAYTIME_CHANGED_EVENT = 'collection-playtime-changed'

export function formatPlaytimeMinutes(minutes?: number): string {
  if (!minutes || minutes <= 0) return '0m'
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (!hours) return `${mins}m`
  if (!mins) return `${hours}h`
  return `${hours}h ${mins}m`
}

export function getPlaytimeMinutes(appName: string): number {
  return timestampStore.get_nodefault(appName)?.totalPlayed ?? 0
}

export function setPlaytimeMinutes(appName: string, minutes: number) {
  const current = timestampStore.get_nodefault(appName)
  timestampStore.set(appName, {
    firstPlayed: current?.firstPlayed ?? '',
    lastPlayed: current?.lastPlayed ?? '',
    totalPlayed: Math.max(0, Math.round(minutes))
  })
  window.dispatchEvent(
    new CustomEvent<string>(PLAYTIME_CHANGED_EVENT, { detail: appName })
  )
}

export function onPlaytimeChanged(callback: (appName: string) => void) {
  const handler = (event: Event) =>
    callback((event as CustomEvent<string>).detail)
  window.addEventListener(PLAYTIME_CHANGED_EVENT, handler)
  return () => window.removeEventListener(PLAYTIME_CHANGED_EVENT, handler)
}
