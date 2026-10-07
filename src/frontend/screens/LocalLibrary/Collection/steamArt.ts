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

export function steamHeaderImage(steamAppId: string) {
  return `https://cdn.cloudflare.steamstatic.com/steam/apps/${steamAppId}/header.jpg`
}

function firstDefaultSrc(values: (string | undefined)[]) {
  for (const value of values) {
    if (!value || isManagedArt(value)) continue
    return value
  }
  return ''
}

// Steam only has a portrait cover for released games, so demos and betas keep
// answering 404 for it. Every source is kept so the image can walk down the
// list instead of jumping straight to the placeholder.
export function collectionCoverSources(
  game: GameInfo,
  art?: CollectionGameArt,
  steamAppId?: string,
  metadataCover?: string
): { src: string; fallback: string[] } {
  const defaults = [
    game.overrides?.art_square,
    game.art_square,
    game.art_cover,
    steamAppId ? steamLibraryCover(steamAppId) : undefined,
    steamAppId ? steamHeaderImage(steamAppId) : undefined
  ].filter((value) => value && !isManagedArt(value))

  const sources: string[] = []
  for (const value of [art?.coverUrl, metadataCover, ...defaults]) {
    if (!value) continue
    const src = isLocalSrc(value)
      ? value
      : getImageFormatting(value, game.runner)
    if (!sources.includes(src)) sources.push(src)
  }

  return {
    src: sources[0] ?? fallBackImage,
    fallback: [...sources.slice(1), fallBackImage]
  }
}

export function collectionCoverSrc(
  game: GameInfo,
  art?: CollectionGameArt,
  steamAppId?: string,
  metadataCover?: string
): string {
  return collectionCoverSources(game, art, steamAppId, metadataCover).src
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
