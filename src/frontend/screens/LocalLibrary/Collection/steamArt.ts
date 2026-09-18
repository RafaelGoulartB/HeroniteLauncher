import type { GameInfo } from 'common/types'
import type {
  CollectionGameArt,
  LocalGameMeta
} from 'common/types/local-library'
import fallBackImage from 'frontend/assets/heroic_card.jpg'
import { getImageFormatting } from 'frontend/screens/Library/components/GameCard/constants'

export function collectionArtKey(runner: string, appName: string) {
  return `${runner}:${appName}`
}

export function collectionMetadataKey(runner: string, appName: string) {
  return `${runner === 'zoom' ? 'sideload' : runner}:${appName}`
}

function isLocalSrc(src: string) {
  return (
    src.startsWith('file:') ||
    src.startsWith('localart:') ||
    src.startsWith('/')
  )
}

function isManagedArt(src?: string) {
  return Boolean(src?.startsWith('localart:'))
}

export function steamLibraryCover(steamAppId: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_600x900_2x.jpg`
}

export function steamLibraryHero(steamAppId: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/library_hero_2x.jpg`
}

function firstDefaultSrc(values: (string | undefined)[]) {
  for (const value of values) {
    if (!value || isManagedArt(value)) continue
    return value
  }
  return ''
}

export function collectionCoverSrc(
  game: GameInfo,
  art?: CollectionGameArt,
  steamAppId?: string,
  metadataCover?: string
): string {
  if (art?.coverUrl) return art.coverUrl
  if (metadataCover) return metadataCover
  const steam = steamAppId ? steamLibraryCover(steamAppId) : ''
  const raw = firstDefaultSrc([
    game.overrides?.art_square,
    game.art_square,
    game.art_cover,
    steam,
    fallBackImage
  ])
  if (!raw) return fallBackImage
  if (isLocalSrc(raw)) return raw
  return getImageFormatting(raw, game.runner)
}

export function collectionStageArt(
  game: GameInfo,
  meta?: LocalGameMeta,
  cachedHeroUrl?: string,
  customHeroUrl?: string,
  metadataHeroUrl?: string
): { src: string; fallback?: string } | null {
  if (customHeroUrl) {
    return { src: customHeroUrl }
  }

  if (metadataHeroUrl) {
    return { src: metadataHeroUrl }
  }

  if (cachedHeroUrl) {
    return { src: cachedHeroUrl }
  }

  const steamHero = meta?.steamAppId
    ? steamLibraryHero(meta.steamAppId)
    : undefined
  const src = firstDefaultSrc([
    game.art_background,
    game.overrides?.art_cover,
    game.art_cover,
    steamHero,
    game.art_square
  ])
  if (!src) return null
  return { src, fallback: steamHero }
}
