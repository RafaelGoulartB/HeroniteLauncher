import { useContext, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Close,
  Download,
  Edit,
  FolderOpen,
  OpenInNew,
  PlayArrow,
  Settings,
  Star,
  StarBorder,
  Stop,
  TravelExplore
} from '@mui/icons-material'
import type {
  ExtraInfo,
  FavouriteGame,
  GameAchievement,
  GameInfo,
  WikiInfo
} from 'common/types'
import type {
  CollectionGameArt,
  CollectionGameMetadata,
  CollectionSteamDetails,
  CompletionStatus,
  LocalGameMeta,
  LocalGameSource
} from 'common/types/local-library'
import { CachedImage } from 'frontend/components/UI'
import ContextProvider from 'frontend/state/ContextProvider'
import { timestampStore } from 'frontend/helpers/electronStores'
import { getGameInfo, sendKill } from 'frontend/helpers'
import { install, launch } from 'frontend/helpers/library'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import { hasProgress } from 'frontend/hooks/hasProgress'
import { hasStatus } from 'frontend/hooks/hasStatus'
import { getCardStatus } from 'frontend/screens/Library/components/GameCard/constants'
import fallBackImage from 'frontend/assets/heroic_card.jpg'
import {
  formatPlaytimeMinutes,
  onPlaytimeChanged,
  setPlaytimeMinutes
} from './playtime'
import { STATUS_COLORS } from './statusColors'
import { confirmForceStopPlaying } from './forceStopPlaying'
import { openSteamStoreUri, steamAppIdFromMeta } from './steamActions'
import {
  collectionArtKey,
  collectionCoverSrc,
  collectionMetadataKey,
  collectionStageArt
} from './steamArt'
import { sanitizeSteamDescription } from './steamHtml'
import CollectionGameArtDialog from './CollectionGameArtDialog'
import CollectionHowLongToBeat from './CollectionHowLongToBeat'
import CollectionMetadataDialog from './CollectionMetadataDialog'
import CollectionPlaytimeDialog from './CollectionPlaytimeDialog'
import CollectionRelatedGames from './CollectionRelatedGames'
import CollectionScreenshots from './CollectionScreenshots'
import PickRomDialog from './PickRomDialog'
import { emulatorNeedsRomPick, prepareEmulatorLaunch } from './emulatorLaunch'
import { collectionGameTitle } from './collectionTitle'
import {
  EMPTY_FACET_FILTERS,
  facetKey,
  type CollectionFacetFilters,
  type CollectionFacetKind
} from './collectionFacets'
import { collectRelatedGames } from './relatedGames'
import { EMPTY_TAG_OPTIONS, type CollectionTagKind } from './collectionTags'
import './CollectionFocus.css'

const SOURCE_LABELS: Record<LocalGameSource, string> = {
  steam: 'Steam',
  epic: 'Epic',
  gog: 'GOG',
  amazon: 'Amazon',
  xbox: 'Xbox',
  emulator: 'Emulator',
  manual: 'Local',
  other: 'Other'
}

type Props = {
  game: GameInfo | null
  meta?: LocalGameMeta
  statuses: CompletionStatus[]
  collectionArt?: CollectionGameArt
  metadata?: CollectionGameMetadata
  cachedHeroUrl?: string
  games?: GameInfo[]
  collectionMetadata?: Record<string, CollectionGameMetadata>
  collectionArtMap?: Record<string, CollectionGameArt>
  metas?: Record<string, LocalGameMeta>
  facetFilters?: CollectionFacetFilters
  onFacetFilter?: (kind: CollectionFacetKind, value: string) => void
  tagOptions?: Record<CollectionTagKind, string[]>
  onArtChange: (art: CollectionGameArt) => void
  onMetadataChange: (metadata: CollectionGameMetadata) => void
  onMetaChange?: (meta: LocalGameMeta) => void
  onSelectGame?: (game: GameInfo) => void
  onClose: () => void
  screenshotsFolder?: string
}

function splitNames(value?: string) {
  if (!value) return []
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

function FactChips({
  items,
  kind,
  activeValue,
  onSelect,
  className
}: {
  items: string[]
  kind?: CollectionFacetKind
  activeValue?: string | null
  onSelect?: (kind: CollectionFacetKind, value: string) => void
  className?: string
}) {
  if (!items.length) return null
  return (
    <dd
      className={
        className
          ? `collectionFocus__chips ${className}`
          : 'collectionFocus__chips'
      }
    >
      {items.map((item) => {
        const clickable = Boolean(kind && onSelect)
        const active =
          Boolean(activeValue) &&
          facetKey(activeValue as string) === facetKey(item)
        const className = active
          ? 'collectionFocus__chip is-active'
          : 'collectionFocus__chip'
        if (!clickable || !kind || !onSelect) {
          return (
            <span key={item} className={className}>
              {item}
            </span>
          )
        }
        return (
          <button
            key={item}
            type="button"
            className={`${className} is-button`}
            onClick={() => onSelect(kind, item)}
          >
            {item}
          </button>
        )
      })}
    </dd>
  )
}

function toPlainText(value?: string) {
  if (!value) return ''
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatTimestamp(value?: string) {
  if (!value) return ''
  if (/^\d{4}$/.test(value)) return value
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  })
}

function libraryLabel(
  meta: LocalGameMeta | undefined,
  runner: GameInfo['runner'],
  fallback: string
) {
  if (meta?.source) return SOURCE_LABELS[meta.source]
  if (runner === 'legendary') return 'Epic'
  if (runner === 'gog') return 'GOG'
  if (runner === 'nile') return 'Amazon'
  return fallback
}

export default function CollectionFocus({
  game,
  meta,
  statuses,
  collectionArt,
  metadata,
  cachedHeroUrl,
  games,
  collectionMetadata,
  collectionArtMap,
  metas,
  facetFilters,
  onFacetFilter,
  tagOptions,
  onArtChange,
  onMetadataChange,
  onMetaChange,
  onSelectGame,
  onClose,
  screenshotsFolder
}: Props) {
  const { t } = useTranslation()
  if (!game) {
    return (
      <aside className="collectionFocus collectionFocus--empty">
        <p>{t('collection.focus.none', 'No game selected')}</p>
      </aside>
    )
  }

  return (
    <CollectionFocusPanel
      key={`${game.runner}_${game.app_name}`}
      game={game}
      meta={meta}
      statuses={statuses}
      collectionArt={collectionArt}
      metadata={metadata}
      cachedHeroUrl={cachedHeroUrl}
      games={games}
      collectionMetadata={collectionMetadata}
      collectionArtMap={collectionArtMap}
      metas={metas}
      facetFilters={facetFilters}
      onFacetFilter={onFacetFilter}
      tagOptions={tagOptions}
      onArtChange={onArtChange}
      onMetadataChange={onMetadataChange}
      onMetaChange={onMetaChange}
      onSelectGame={onSelectGame}
      onClose={onClose}
      screenshotsFolder={screenshotsFolder}
    />
  )
}

function CollectionFocusPanel({
  game,
  meta,
  statuses,
  collectionArt,
  metadata: metadataFromList,
  cachedHeroUrl,
  games = [],
  collectionMetadata = {},
  collectionArtMap = {},
  metas = {},
  facetFilters = EMPTY_FACET_FILTERS,
  onFacetFilter,
  tagOptions = EMPTY_TAG_OPTIONS,
  onArtChange,
  onMetadataChange,
  onMetaChange,
  onSelectGame,
  onClose,
  screenshotsFolder
}: {
  game: GameInfo
  meta?: LocalGameMeta
  statuses: CompletionStatus[]
  collectionArt?: CollectionGameArt
  metadata?: CollectionGameMetadata
  cachedHeroUrl?: string
  games?: GameInfo[]
  collectionMetadata?: Record<string, CollectionGameMetadata>
  collectionArtMap?: Record<string, CollectionGameArt>
  metas?: Record<string, LocalGameMeta>
  facetFilters?: CollectionFacetFilters
  onFacetFilter?: (kind: CollectionFacetKind, value: string) => void
  tagOptions?: Record<CollectionTagKind, string[]>
  onArtChange: (art: CollectionGameArt) => void
  onMetadataChange: (metadata: CollectionGameMetadata) => void
  onMetaChange?: (meta: LocalGameMeta) => void
  onSelectGame?: (game: GameInfo) => void
  onClose: () => void
  screenshotsFolder?: string
}) {
  const { t } = useTranslation()
  const { t: tGame } = useTranslation('gamepage')
  const navigate = useNavigate()
  const {
    showDialogModal,
    connectivity,
    gameUpdates,
    favouriteGames,
    language
  } = useContext(ContextProvider)
  const [artOpen, setArtOpen] = useState(false)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [playtimeOpen, setPlaytimeOpen] = useState(false)
  const [pickRomOpen, setPickRomOpen] = useState(false)

  const [gameInfo, setGameInfo] = useState<GameInfo>(game)
  const [extraInfo, setExtraInfo] = useState<ExtraInfo | null>(
    game.extra ?? null
  )
  const [wikiInfo, setWikiInfo] = useState<WikiInfo | null>(null)
  const [steamDetails, setSteamDetails] =
    useState<CollectionSteamDetails | null>(null)
  const [achievements, setAchievements] = useState<GameAchievement[]>([])
  const [playedMinutes, setPlayedMinutes] = useState(
    () => timestampStore.get_nodefault(game.app_name)?.totalPlayed ?? 0
  )
  const [detailMetadata, setDetailMetadata] = useState(metadataFromList)

  const { app_name: appName, runner } = game
  const metadata = detailMetadata ?? metadataFromList
  const title = collectionGameTitle(gameInfo, metadata)
  const steamAppId = steamAppIdFromMeta(meta)
  const storeAppId = meta?.steamAppId

  useEffect(() => {
    setDetailMetadata(metadataFromList)
    if (metadataFromList?.description || metadataFromList?.notes) return
    let cancelled = false
    const loadFull = async () => {
      if (typeof window.api.localLibrary.getGameMetadata !== 'function') return
      const full = await window.api.localLibrary.getGameMetadata({
        runner,
        appName
      })
      if (!cancelled && full) setDetailMetadata(full)
    }
    void loadFull()
    return () => {
      cancelled = true
    }
  }, [appName, runner, metadataFromList])

  useEffect(() => {
    setGameInfo(game)
    setExtraInfo(game.extra ?? null)
    setWikiInfo(null)
    setSteamDetails(null)
    setAchievements([])
    setPlayedMinutes(timestampStore.get_nodefault(appName)?.totalPlayed ?? 0)

    let cancelled = false
    const load = async () => {
      const extraPromise =
        runner === 'sideload'
          ? Promise.resolve(null)
          : window.api.getExtraInfo(appName, runner)
      const steamPromise =
        !metadataFromList &&
        storeAppId &&
        typeof window.api.localLibrary.getSteamDetails === 'function'
          ? window.api.localLibrary.getSteamDetails({
              steamAppId: storeAppId,
              language
            })
          : Promise.resolve(null)
      const wikiTitle = collectionGameTitle(game, metadataFromList)
      const [fresh, extra, wiki, nextAchievements, steam] =
        await Promise.allSettled([
          getGameInfo(appName, runner),
          extraPromise,
          window.api.getWikiGameInfo(wikiTitle, appName, runner),
          window.api.getAchievements(appName, runner),
          steamPromise
        ])
      if (cancelled) return
      if (fresh.status === 'fulfilled' && fresh.value) {
        setGameInfo(fresh.value)
      }
      if (extra.status === 'fulfilled') setExtraInfo(extra.value)
      if (wiki.status === 'fulfilled') setWikiInfo(wiki.value)
      if (nextAchievements.status === 'fulfilled') {
        setAchievements(nextAchievements.value ?? [])
      }
      if (steam.status === 'fulfilled') setSteamDetails(steam.value)
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [appName, runner, game, storeAppId, language, metadataFromList])

  const { status, folder } = hasStatus(gameInfo)
  const [progress, previousProgress] = hasProgress(appName, runner)
  const isInstalled = Boolean(gameInfo.is_installed)
  const { isInstalling, isPlaying, isUpdating, isQueued, isLaunching } =
    getCardStatus(status, isInstalled, 'grid')
  const isTrackingTime = isPlaying || isLaunching
  const hasUpdate = Boolean(isInstalled && gameUpdates?.includes(appName))
  const isFavouriteGame = Boolean(
    favouriteGames.list.find((item: FavouriteGame) => item.appName === appName)
  )

  useEffect(() => {
    if (!artOpen && !metadataOpen && !playtimeOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopImmediatePropagation()
      setArtOpen(false)
      setMetadataOpen(false)
      setPlaytimeOpen(false)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [artOpen, metadataOpen, playtimeOpen])

  useEffect(() => {
    setPlayedMinutes(timestampStore.get_nodefault(appName)?.totalPlayed ?? 0)
  }, [status, appName, isTrackingTime])

  useEffect(
    () =>
      onPlaytimeChanged((changed) => {
        if (changed !== appName) return
        setPlayedMinutes(
          timestampStore.get_nodefault(appName)?.totalPlayed ?? 0
        )
      }),
    [appName]
  )

  const completion =
    statuses.find((item) => item.id === (meta?.completionStatusId ?? '')) ??
    statuses.find((item) => item.slug === 'not-played')

  const cover =
    collectionCoverSrc(
      gameInfo,
      collectionArt,
      storeAppId,
      metadata?.coverUrl
    ) || fallBackImage
  const defaultCover = collectionCoverSrc(gameInfo, undefined, storeAppId)
  const defaultHero = collectionStageArt(gameInfo, meta, cachedHeroUrl)?.src
  const useSteamHtml =
    metadata?.fieldSources.description === 'steam' || !metadata?.description
  const descriptionHtml =
    useSteamHtml && steamDetails?.descriptionHtml
      ? sanitizeSteamDescription(steamDetails.descriptionHtml)
      : ''
  const description = toPlainText(
    metadata?.description ||
      extraInfo?.about?.shortDescription ||
      extraInfo?.about?.description ||
      steamDetails?.shortDescription ||
      gameInfo.description
  )
  const genres = (
    (metadata?.genres.length ? metadata.genres : undefined) ||
    steamDetails?.genres ||
    extraInfo?.genres ||
    gameInfo.extra?.genres ||
    wikiInfo?.pcgamingwiki?.genres ||
    []
  ).filter(Boolean)
  const releaseDate =
    metadata?.releaseDate ||
    steamDetails?.releaseDate ||
    extraInfo?.releaseDate ||
    wikiInfo?.pcgamingwiki?.releaseDate?.[0]?.replace(/^[^:]+:\s*/, '')
  const developer =
    metadata?.developers.join(', ') ||
    steamDetails?.developers.join(', ') ||
    gameInfo.developer
  const publisher =
    metadata?.publishers.join(', ') || steamDetails?.publishers.join(', ')
  const developers = metadata?.developers?.length
    ? metadata.developers
    : steamDetails?.developers?.length
      ? steamDetails.developers
      : splitNames(developer)
  const publishers = metadata?.publishers?.length
    ? metadata.publishers
    : steamDetails?.publishers?.length
      ? steamDetails.publishers
      : splitNames(publisher)
  const features = metadata?.features.length
    ? metadata.features
    : (steamDetails?.features ?? [])
  const platforms = metadata?.platforms.length
    ? metadata.platforms
    : [gameInfo.install?.platform || 'PC']
  const platform = platforms[0] || 'PC'
  const sourceLabel = libraryLabel(
    meta,
    runner,
    t('collection.focus.local', 'Local')
  )
  const installPath =
    meta?.remappedExecutable ||
    meta?.windowsInstallDirectory ||
    gameInfo.install?.install_path ||
    gameInfo.folder_name
  const installSize = gameInfo.install?.install_size
  const lastPlayed = formatTimestamp(
    timestampStore.get_nodefault(appName)?.lastPlayed
  )
  const howLong = wikiInfo?.howlongtobeat
  const unlockedCount = achievements.filter((item) => item.date_unlocked).length
  const sortedAchievements = useMemo(() => {
    const unlocked = achievements.filter((item) => item.date_unlocked)
    const locked = achievements.filter((item) => !item.date_unlocked)
    return [...unlocked, ...locked].slice(0, 8)
  }, [achievements])
  const relatedGroups = useMemo(
    () =>
      collectRelatedGames({
        current: gameInfo,
        series: metadata?.series ? [metadata.series] : [],
        developers,
        games,
        metadataFor: (item) =>
          collectionMetadata[collectionMetadataKey(item.runner, item.app_name)],
        artFor: (item) =>
          collectionArtMap[collectionArtKey(item.runner, item.app_name)],
        steamAppIdFor: (item) => metas[item.app_name]?.steamAppId
      }),
    [
      gameInfo,
      metadata?.series,
      developers,
      games,
      collectionMetadata,
      collectionArtMap,
      metas
    ]
  )

  async function openSteamFromCollection() {
    if (!steamAppId) return
    const result = await openSteamStoreUri('install', steamAppId)
    if (result.ok) return
    showDialogModal({
      showDialog: true,
      type: 'ERROR',
      title: t('collection.steam.clientMissingTitle', 'Steam not found'),
      message: t(
        'collection.steam.clientMissing',
        'Steam was not found. Install or launch the Steam client, then try again.'
      )
    })
  }

  function handleInstall() {
    if (steamAppId) {
      void openSteamFromCollection()
      return
    }
    openInstallGameModal({ appName, runner, gameInfo })
  }

  async function handlePlay() {
    if (!isInstalled && !isQueued && gameInfo.runner !== 'sideload') {
      return install({
        gameInfo,
        installPath: folder || 'default',
        isInstalling,
        previousProgress,
        progress,
        t: tGame,
        showDialogModal
      })
    }
    if (isUpdating) {
      return sendKill(appName, runner)
    }

    if (isPlaying) {
      confirmForceStopPlaying({
        appName,
        runner,
        title,
        t: tGame,
        showDialogModal
      })
      return
    }
    if (isQueued) {
      return window.api.removeFromDMQueue(appName)
    }
    if (isInstalled) {
      if (emulatorNeedsRomPick(meta)) {
        setPickRomOpen(true)
        return
      }
      const isOffline = connectivity.status !== 'online'
      await launch({
        appName,
        t: tGame,
        runner,
        hasUpdate,
        showDialogModal,
        notPlayableOffline: isOffline && !gameInfo.canRunOffline
      })
    }
  }

  function handlePrimary() {
    if (!isInstalled) {
      handleInstall()
      return
    }
    void handlePlay()
  }

  const primaryLabel = isPlaying
    ? tGame('label.playing.stop')
    : isLaunching
      ? tGame('label.launching', 'Launching')
      : isInstalled
        ? tGame('label.playing.start')
        : tGame('button.install')

  return (
    <aside className="collectionFocus">
      <div className="collectionFocus__tools">
        <button
          type="button"
          className="collectionFocus__iconBtn"
          title={tGame('button.details', 'Details')}
          onClick={() =>
            navigate(`/gamepage/${runner}/${appName}`, {
              state: { gameInfo, fromCollection: true }
            })
          }
        >
          <OpenInNew />
        </button>
        <button
          type="button"
          className="collectionFocus__iconBtn"
          title={t('box.close', 'Close')}
          onClick={onClose}
        >
          <Close />
        </button>
      </div>
      <div className="collectionFocus__inner">
        <header className="collectionFocus__header">
          <div className="collectionFocus__heading">
            <h2>{title}</h2>
            <p className="collectionFocus__meta">
              {[formatTimestamp(releaseDate), platform, ...genres.slice(0, 4)]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          <CachedImage
            key={cover}
            src={cover}
            fallback={fallBackImage}
            className="collectionFocus__cover"
            alt=""
          />
        </header>

        <div className="collectionFocus__body">
          <div className="collectionFocus__main">
            <CollectionScreenshots
              appName={appName}
              runner={runner}
              title={title}
              steamAppId={storeAppId}
              aliases={[gameInfo.title, gameInfo.folder_name].filter(
                (item): item is string => Boolean(item && item !== title)
              )}
              screenshotsFolder={screenshotsFolder}
            />
            <section className="collectionFocus__overview">
              <h3>{t('collection.focus.overview', 'Overview')}</h3>
              {descriptionHtml ? (
                <div
                  className="collectionFocus__html"
                  dangerouslySetInnerHTML={{ __html: descriptionHtml }}
                />
              ) : (
                <p>
                  {description ||
                    tGame('generic.noDescription', 'No description available')}
                </p>
              )}
            </section>
            {onSelectGame && (
              <CollectionRelatedGames
                groups={relatedGroups}
                onSelect={onSelectGame}
              />
            )}
          </div>

          <div className="collectionFocus__aside">
            {achievements.length > 0 && (
              <section className="collectionFocus__panel">
                <h3>
                  {tGame('game.achievements', 'Achievements')}
                  <span>
                    {unlockedCount}/{achievements.length}
                  </span>
                </h3>
                <ul className="collectionFocus__achievements">
                  {sortedAchievements.map((item) => (
                    <li
                      key={item.achievement_id}
                      className={item.date_unlocked ? 'is-unlocked' : undefined}
                    >
                      <img
                        src={
                          item.date_unlocked
                            ? item.image_url_unlocked
                            : item.image_url_locked
                        }
                        alt=""
                      />
                      <span>{item.visible ? item.name : '???'}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="collectionFocus__details">
              <h3>{t('collection.focus.details', 'Details')}</h3>
              <div className="collectionFocus__panel collectionFocus__panel--facts">
                <dl className="collectionFocus__facts">
                  {completion && (
                    <div>
                      <dt>{t('collection.status.menu', 'Status')}</dt>
                      <dd>
                        <span
                          className="collectionFocus__dot"
                          style={{ background: STATUS_COLORS[completion.slug] }}
                        />
                        {completion.name}
                      </dd>
                    </div>
                  )}
                  {developers.length > 0 && (
                    <div>
                      <dt>{tGame('info.developer', 'Developer')}</dt>
                      <FactChips
                        items={developers}
                        kind="developer"
                        activeValue={facetFilters.developer}
                        onSelect={onFacetFilter}
                      />
                    </div>
                  )}
                  {publishers.length > 0 && (
                    <div>
                      <dt>{tGame('info.publisher', 'Publisher')}</dt>
                      <FactChips
                        items={publishers}
                        kind="publisher"
                        activeValue={facetFilters.publisher}
                        onSelect={onFacetFilter}
                      />
                    </div>
                  )}
                  {metadata?.series && (
                    <div>
                      <dt>{t('collection.metadata.field.series', 'Series')}</dt>
                      <FactChips
                        items={[metadata.series]}
                        kind="series"
                        activeValue={facetFilters.series}
                        onSelect={onFacetFilter}
                      />
                    </div>
                  )}
                  {typeof metadata?.criticScore === 'number' && (
                    <div>
                      <dt>
                        {t('collection.metadata.field.criticScore', 'Score')}
                      </dt>
                      <dd>{metadata.criticScore}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t('collection.focus.library', 'Library')}</dt>
                    <dd>{sourceLabel}</dd>
                  </div>
                  <div>
                    <dt>{tGame('game.lastPlayed', 'Last Played')}</dt>
                    <dd>{lastPlayed || tGame('game.neverPlayed', 'Never')}</dd>
                  </div>
                  <div>
                    <dt>{t('collection.sort.playtime', 'Playtime')}</dt>
                    <dd className="collectionFocus__playtime">
                      <span>{formatPlaytimeMinutes(playedMinutes)}</span>
                      {!isTrackingTime && (
                        <button
                          type="button"
                          className="collectionFocus__playtimeEdit"
                          title={t('collection.playtime.edit', 'Edit playtime')}
                          onClick={() => setPlaytimeOpen(true)}
                        >
                          <Edit />
                        </button>
                      )}
                    </dd>
                  </div>
                  {installPath && (
                    <div className="is-split">
                      <dt>
                        <FolderOpen />
                        {t(
                          'collection.focus.installFolder',
                          'Installation Folder'
                        )}
                      </dt>
                      <dd className="collectionFocus__install">
                        <span title={installPath}>{installPath}</span>
                        {installSize && installSize !== '0' && (
                          <em>{installSize}</em>
                        )}
                      </dd>
                    </div>
                  )}
                  {features.length > 0 && (
                    <div className="is-split">
                      <dt>{t('collection.focus.features', 'Features')}</dt>
                      <FactChips items={features.slice(0, 8)} />
                    </div>
                  )}
                  {metadata && metadata.themes.length > 0 && (
                    <div className="is-split">
                      <dt>{t('collection.metadata.field.themes', 'Themes')}</dt>
                      <FactChips items={metadata.themes.slice(0, 8)} />
                    </div>
                  )}
                  {platforms.length > 1 && (
                    <div className="is-split">
                      <dt>
                        {t('collection.metadata.field.platforms', 'Platforms')}
                      </dt>
                      <FactChips items={platforms.slice(0, 8)} />
                    </div>
                  )}
                  {genres.length > 0 && (
                    <div className="is-split">
                      <dt>{t('collection.focus.tags', 'Tags')}</dt>
                      <FactChips
                        items={genres}
                        kind="genre"
                        activeValue={facetFilters.genre}
                        onSelect={onFacetFilter}
                        className="collectionFocus__tags"
                      />
                    </div>
                  )}
                  {(metadata?.notes || meta?.notes) && (
                    <div className="is-split">
                      <dt>{t('collection.focus.notes', 'Notes')}</dt>
                      <dd className="is-wrap">
                        {metadata?.notes || meta?.notes}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </section>

            {howLong && (howLong.mainStory || howLong.mainExtra) && (
              <CollectionHowLongToBeat
                info={howLong}
                playedMinutes={playedMinutes}
              />
            )}
          </div>
        </div>
      </div>
      <footer className="collectionFocus__footer">
        <button
          type="button"
          className={
            isFavouriteGame
              ? 'collectionFocus__iconBtn is-active'
              : 'collectionFocus__iconBtn'
          }
          title={
            isFavouriteGame
              ? tGame('button.remove_from_favourites', 'Remove From Favourites')
              : tGame('button.add_to_favourites', 'Add To Favourites')
          }
          aria-pressed={isFavouriteGame}
          onClick={() =>
            isFavouriteGame
              ? favouriteGames.remove(appName)
              : favouriteGames.add(appName, title)
          }
        >
          {isFavouriteGame ? <Star /> : <StarBorder />}
        </button>
        <button
          type="button"
          className="collectionFocus__iconBtn"
          title={t('collection.metadata.title', 'Collection metadata')}
          aria-label={t('collection.metadata.title', 'Collection metadata')}
          onClick={() => setMetadataOpen(true)}
        >
          <TravelExplore />
        </button>
        <button
          type="button"
          className="collectionFocus__iconBtn"
          title={t('collection.gameConfig.title', 'Game settings')}
          aria-label={t('collection.gameConfig.title', 'Game settings')}
          onClick={() => setArtOpen(true)}
        >
          <Settings />
        </button>
        <button
          type="button"
          className="collectionFocus__play"
          disabled={isLaunching}
          onClick={handlePrimary}
        >
          {isPlaying ? <Stop /> : isInstalled ? <PlayArrow /> : <Download />}
          {primaryLabel}
        </button>
      </footer>
      {artOpen && (
        <CollectionGameArtDialog
          game={gameInfo}
          title={title}
          art={collectionArt}
          metadata={metadata}
          meta={meta}
          defaultCover={defaultCover}
          defaultHero={defaultHero}
          tagOptions={tagOptions}
          onChange={onArtChange}
          onDetailsChange={(next) => {
            onMetadataChange(next.metadata)
            if (next.meta) onMetaChange?.(next.meta)
          }}
          onClose={() => setArtOpen(false)}
        />
      )}
      {metadataOpen && (
        <CollectionMetadataDialog
          game={gameInfo}
          title={title}
          steamAppId={storeAppId}
          metadata={metadata}
          onChange={onMetadataChange}
          onClose={() => setMetadataOpen(false)}
        />
      )}
      {playtimeOpen && (
        <CollectionPlaytimeDialog
          title={title}
          minutes={playedMinutes}
          onClose={() => setPlaytimeOpen(false)}
          onSave={(minutes) => {
            setPlaytimeMinutes(appName, minutes)
            setPlaytimeOpen(false)
          }}
        />
      )}
      {pickRomOpen && meta?.roms && (
        <PickRomDialog
          title={title}
          roms={meta.roms}
          selectedPath={meta.selectedRomPath}
          onClose={() => setPickRomOpen(false)}
          onPlay={(romPath) => {
            setPickRomOpen(false)
            void (async () => {
              await prepareEmulatorLaunch(appName, romPath)
              const isOffline = connectivity.status !== 'online'
              await launch({
                appName,
                t: tGame,
                runner,
                hasUpdate,
                showDialogModal,
                notPlayableOffline: isOffline && !gameInfo.canRunOffline
              })
            })()
          }}
        />
      )}
    </aside>
  )
}
