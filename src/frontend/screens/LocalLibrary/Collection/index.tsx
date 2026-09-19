import {
  useCallback,
  useContext,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import { useTranslation } from 'react-i18next'
import classNames from 'classnames'
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  Menu,
  MenuOpen,
  Settings,
  CloudDownload,
  SportsEsports
} from '@mui/icons-material'
import type { CSSProperties } from 'react'
import type { GameInfo } from 'common/types'
import type {
  CollectionBackgroundSettings,
  CollectionGameArt,
  CollectionGameMetadata,
  CollectionMetadataBulkProgress,
  CompletionStatus,
  CoverAspectPreset,
  LocalGameMeta
} from 'common/types/local-library'
import { DEFAULT_COLLECTION_BACKGROUND } from 'common/types/local-library'
import ContextProvider from 'frontend/state/ContextProvider'
import { CachedImage } from 'frontend/components/UI'
import { configStore, timestampStore } from 'frontend/helpers/electronStores'
import CollectionCard from './CollectionCard'
import CollectionFocus from './CollectionFocus'
import CollectionSettingsDialog from './CollectionSettingsDialog'
import CollectionMetadataWizard from './CollectionMetadataWizard'
import ScanRomsDialog from './ScanRomsDialog'
import InstallFilterMenu, { type InstallFilter } from './InstallFilterMenu'
import FacetFilterMenu from './FacetFilterMenu'
import PlayniteMenu from './PlayniteMenu'
import SortMenu, { type CollectionSort } from './SortMenu'
import StatusMenu from './StatusMenu'
import { STATUS_COLORS } from './statusColors'
import {
  collectFacetOptions,
  EMPTY_FACET_FILTERS,
  hasFacetFilters,
  matchesFacets,
  toggleFacetFilter,
  type CollectionFacetFilters,
  type CollectionFacetKind
} from './collectionFacets'
import {
  collectionArtKey,
  collectionMetadataKey,
  collectionStageArt
} from './steamArt'
import { collectionGameTitle } from './collectionTitle'
import { collectTagOptions } from './collectionTags'
import './index.css'

const INSTALL_FILTER_KEY = 'collection_install_filter'
const FACET_FILTER_KEY = 'collection_facet_filter'
const SORT_KEY = 'collection_sort'
const SIDEBAR_HIDDEN_KEY = 'collection_sidebar_hidden'
const COLLAPSED_GROUPS_KEY = 'collection_collapsed_groups'
const FOCUSED_GAME_KEY = 'collection_focused_game'
const UNKNOWN_GROUP_ID = 'ungrouped'
const EMPTY_BULK: CollectionMetadataBulkProgress = {
  state: 'idle',
  total: 0,
  processed: 0,
  updated: 0,
  skipped: 0,
  failed: 0,
  percent: 0,
  errors: []
}
const storage: Storage = window.localStorage
const SIDEBAR_HIDDEN_CLASS = 'collectionSidebarHidden'

function slugForMeta(
  meta: LocalGameMeta | undefined,
  statuses: CompletionStatus[]
): string {
  if (meta?.completionStatusId) return meta.completionStatusId
  return (
    statuses.find((item) => item.slug === 'not-played')?.id ??
    statuses[0]?.id ??
    'not-played'
  )
}

function readInstallFilter(): InstallFilter {
  const stored = storage.getItem(INSTALL_FILTER_KEY)
  if (stored === 'installed' || stored === 'uninstalled' || stored === 'all') {
    return stored
  }
  return 'all'
}

function readFacetFilters(): CollectionFacetFilters {
  try {
    const stored = storage.getItem(FACET_FILTER_KEY)
    if (!stored) return { ...EMPTY_FACET_FILTERS }
    const parsed: unknown = JSON.parse(stored)
    if (!parsed || typeof parsed !== 'object') return { ...EMPTY_FACET_FILTERS }
    const value = parsed as Record<string, unknown>
    const text = (key: CollectionFacetKind) =>
      typeof value[key] === 'string' && value[key] ? value[key] : null
    return {
      series: text('series'),
      developer: text('developer'),
      publisher: text('publisher'),
      genre: text('genre'),
      platform: text('platform')
    }
  } catch {
    return { ...EMPTY_FACET_FILTERS }
  }
}

function persistFacetFilters(next: CollectionFacetFilters) {
  if (!hasFacetFilters(next)) storage.removeItem(FACET_FILTER_KEY)
  else storage.setItem(FACET_FILTER_KEY, JSON.stringify(next))
}

function readSort(): CollectionSort {
  const stored = storage.getItem(SORT_KEY)
  if (stored === 'lastPlayed' || stored === 'playtime' || stored === 'title') {
    return stored
  }
  return 'title'
}

function readSidebarHidden(): boolean {
  return storage.getItem(SIDEBAR_HIDDEN_KEY) === '1'
}

function readFocusedKey(): string | null {
  const stored = storage.getItem(FOCUSED_GAME_KEY)
  return stored || null
}

function persistFocusedKey(key: string) {
  storage.setItem(FOCUSED_GAME_KEY, key)
}

function readCollapsedGroups(): Set<string> {
  try {
    const stored = storage.getItem(COLLAPSED_GROUPS_KEY)
    if (!stored) return new Set()
    const parsed: unknown = JSON.parse(stored)
    if (!Array.isArray(parsed)) return new Set()
    return new Set(
      parsed.filter((item): item is string => typeof item === 'string')
    )
  } catch {
    return new Set()
  }
}

function applySidebarHidden(hidden: boolean) {
  document.getElementById('app')?.classList.toggle(SIDEBAR_HIDDEN_CLASS, hidden)
}

function gameKey(game: GameInfo) {
  return `${game.runner}_${game.app_name}`
}

function playtimeMinutes(appName: string): number {
  return timestampStore.get_nodefault(appName)?.totalPlayed ?? 0
}

function lastPlayedAt(appName: string): string {
  return timestampStore.get_nodefault(appName)?.lastPlayed ?? ''
}

function sameIdSet(left: Set<string>, right: Set<string>) {
  if (left.size !== right.size) return false
  for (const id of left) {
    if (!right.has(id)) return false
  }
  return true
}

function readStuckGroupIds(root: HTMLElement) {
  const rootTop = root.getBoundingClientRect().top
  const next = new Set<string>()
  root.querySelectorAll<HTMLElement>('.collection__group').forEach((group) => {
    const id = group.dataset.groupId
    const toggle = group.querySelector<HTMLElement>('.collection__groupToggle')
    if (!id || !toggle) return
    const groupTop = group.getBoundingClientRect().top
    const toggleTop = toggle.getBoundingClientRect().top
    if (groupTop < rootTop - 2 && toggleTop <= rootTop + 1) {
      next.add(id)
    }
  })
  return next
}

export default function Collection() {
  const { t } = useTranslation()
  const {
    epic,
    gog,
    amazon,
    zoom,
    sideloadedLibrary,
    allTilesInColor,
    hiddenGames
  } = useContext(ContextProvider)
  const [search, setSearch] = useState('')
  const deferredSearch = useDeferredValue(search)
  const [installFilter, setInstallFilter] =
    useState<InstallFilter>(readInstallFilter)
  const [facetFilters, setFacetFilters] =
    useState<CollectionFacetFilters>(readFacetFilters)
  const [sort, setSort] = useState<CollectionSort>(readSort)
  const [statuses, setStatuses] = useState<CompletionStatus[]>([])
  const [metas, setMetas] = useState<Record<string, LocalGameMeta>>({})
  const [groupByStatus, setGroupByStatus] = useState(true)
  const [collapsedGroups, setCollapsedGroups] =
    useState<Set<string>>(readCollapsedGroups)
  const [stuckGroups, setStuckGroups] = useState<Set<string>>(() => new Set())
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [greyUninstalledGames, setGreyUninstalledGames] = useState(true)
  const [background, setBackground] = useState<CollectionBackgroundSettings>(
    DEFAULT_COLLECTION_BACKGROUND
  )
  const [screenshotsFolder, setScreenshotsFolder] = useState('')
  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden)
  const [focusedKey, setFocusedKey] = useState<string | null>(readFocusedKey)
  const [heroCache, setHeroCache] = useState<Record<string, string>>({})
  const [collectionArt, setCollectionArt] = useState<
    Record<string, CollectionGameArt>
  >({})
  const [collectionMetadata, setCollectionMetadata] = useState<
    Record<string, CollectionGameMetadata>
  >({})
  const [coverAspect, setCoverAspect] = useState<CoverAspectPreset>('steam')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [scanSeed, setScanSeed] = useState<{
    emulatorId?: string
    profileId?: string
    directory?: string
  }>({})
  const [bulkProgress, setBulkProgress] =
    useState<CollectionMetadataBulkProgress>(EMPTY_BULK)
  const [bulkDismissed, setBulkDismissed] = useState(true)
  const [recentAppNames, setRecentAppNames] = useState<Set<string>>(
    () => new Set()
  )
  const listRef = useRef<HTMLDivElement | null>(null)

  const handleSearch = useCallback((text: string) => {
    setSearch(text)
  }, [])

  function handleInstallFilter(next: InstallFilter) {
    storage.setItem(INSTALL_FILTER_KEY, next)
    setInstallFilter(next)
  }

  function handleFacetFilter(kind: CollectionFacetKind, value: string) {
    setFacetFilters((current) => {
      const next = toggleFacetFilter(current, kind, value)
      persistFacetFilters(next)
      return next
    })
  }

  function handleClearFacets() {
    persistFacetFilters({ ...EMPTY_FACET_FILTERS })
    setFacetFilters({ ...EMPTY_FACET_FILTERS })
  }

  function handleSort(next: CollectionSort) {
    storage.setItem(SORT_KEY, next)
    setSort(next)
  }

  function toggleGroup(id: string) {
    setCollapsedGroups((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      storage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify([...next]))
      return next
    })
  }

  async function reload() {
    const [nextStatuses, nextMetas, nextArt, nextSettings, nextMetadata] =
      await Promise.all([
        window.api.localLibrary.getStatuses(),
        window.api.localLibrary.getAllMeta(),
        window.api.localLibrary.getAllCollectionArt(),
        window.api.localLibrary.getSettings(),
        window.api.localLibrary.getAllMetadata()
      ])
    setStatuses(nextStatuses)
    setMetas(nextMetas)
    setCollectionArt(nextArt)
    setCollectionMetadata(nextMetadata)
    setGreyUninstalledGames(nextSettings.greyUninstalledGames !== false)
    setBackground(nextSettings.background ?? DEFAULT_COLLECTION_BACKGROUND)
    setScreenshotsFolder(nextSettings.screenshots?.folder ?? '')
    setCoverAspect(nextSettings.metadata?.coverAspect || 'steam')
  }

  useEffect(() => {
    void reload()
  }, [sideloadedLibrary])

  useEffect(() => {
    void window.api.localLibrary.getMetadataBulkStatus().then((next) => {
      setBulkProgress(next)
      if (next.state === 'running' || next.state === 'cancelling') {
        setBulkDismissed(false)
      }
    })
    const remove = window.api.localLibrary.onMetadataBulkProgress(
      (_event, next) => {
        setBulkProgress(next)
        if (next.state === 'running' || next.state === 'cancelling') {
          setBulkDismissed(false)
        }
        if (next.state === 'done') void reload()
      }
    )
    return () => remove()
  }, [])

  useEffect(() => {
    applySidebarHidden(sidebarHidden)
    return () => applySidebarHidden(false)
  }, [sidebarHidden])

  function handleSidebarToggle() {
    const next = !sidebarHidden
    storage.setItem(SIDEBAR_HIDDEN_KEY, next ? '1' : '0')
    setSidebarHidden(next)
  }

  useEffect(() => {
    const loadRecent = () => {
      const recent = configStore.get('games.recent', [])
      setRecentAppNames(new Set(recent.map((game) => game.appName)))
    }
    loadRecent()
    const removeListener = window.api.handleRecentGamesChanged(loadRecent)
    return () => removeListener()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (settingsOpen || wizardOpen || scanOpen) return
        setFocusedKey(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [settingsOpen, wizardOpen, scanOpen])

  const games = useMemo(() => {
    const all: GameInfo[] = [
      ...sideloadedLibrary,
      ...epic.library,
      ...gog.library,
      ...amazon.library,
      ...zoom.library
    ]
    const hiddenAppNames = new Set(hiddenGames.list.map((game) => game.appName))
    const seen = new Set<string>()
    const unique: GameInfo[] = []
    for (const game of all) {
      if (game.install?.is_dlc) continue
      if (hiddenAppNames.has(game.app_name)) continue
      const key = `${game.runner}_${game.app_name}`
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(game)
    }
    return unique
  }, [
    sideloadedLibrary,
    epic.library,
    gog.library,
    amazon.library,
    zoom.library,
    hiddenGames.list
  ])

  const filtered = useMemo(() => {
    const query = deferredSearch.trim().toLowerCase()
    const next = games.filter((game) => {
      const title = collectionGameTitle(
        game,
        collectionMetadata[collectionMetadataKey(game.runner, game.app_name)]
      )
      if (query && !title.toLowerCase().includes(query)) return false
      if (installFilter === 'installed' && !game.is_installed) return false
      if (installFilter === 'uninstalled' && game.is_installed) return false
      return matchesFacets(
        game,
        collectionMetadata[collectionMetadataKey(game.runner, game.app_name)],
        facetFilters
      )
    })

    return next.sort((a, b) => {
      if (sort === 'playtime') {
        const delta = playtimeMinutes(b.app_name) - playtimeMinutes(a.app_name)
        if (delta) return delta
      }
      if (sort === 'lastPlayed') {
        const aLast = lastPlayedAt(a.app_name)
        const bLast = lastPlayedAt(b.app_name)
        if (aLast || bLast) {
          if (!aLast) return 1
          if (!bLast) return -1
          const delta = bLast.localeCompare(aLast)
          if (delta) return delta
        }
      }
      return collectionGameTitle(
        a,
        collectionMetadata[collectionMetadataKey(a.runner, a.app_name)]
      ).localeCompare(
        collectionGameTitle(
          b,
          collectionMetadata[collectionMetadataKey(b.runner, b.app_name)]
        )
      )
    })
  }, [
    games,
    deferredSearch,
    installFilter,
    sort,
    collectionMetadata,
    facetFilters
  ])

  const facetOptions = useMemo(
    () =>
      collectFacetOptions(
        games,
        (game) =>
          collectionMetadata[collectionMetadataKey(game.runner, game.app_name)]
      ),
    [games, collectionMetadata]
  )

  const tagOptions = useMemo(
    () =>
      collectTagOptions(
        games,
        (game) =>
          collectionMetadata[collectionMetadataKey(game.runner, game.app_name)]
      ),
    [games, collectionMetadata]
  )

  const grouped = useMemo(() => {
    const buckets = new Map<string, GameInfo[]>()
    for (const status of statuses) {
      buckets.set(status.id, [])
    }
    const unknown: GameInfo[] = []
    for (const game of filtered) {
      const statusId = slugForMeta(metas[game.app_name], statuses)
      const bucket = buckets.get(statusId)
      if (bucket) bucket.push(game)
      else unknown.push(game)
    }
    return { buckets, unknown }
  }, [filtered, metas, statuses])

  const focusedGame = useMemo(() => {
    if (!focusedKey) return null
    return games.find((game) => gameKey(game) === focusedKey) ?? null
  }, [focusedKey, games])

  const paintedGame = focusedGame
  const paintedMeta = paintedGame ? metas[paintedGame.app_name] : undefined
  const paintedArt = paintedGame
    ? collectionStageArt(
        paintedGame,
        paintedMeta,
        paintedMeta?.steamAppId ? heroCache[paintedMeta.steamAppId] : undefined,
        collectionArt[
          collectionArtKey(paintedGame.runner, paintedGame.app_name)
        ]?.heroUrl,
        collectionMetadata[
          collectionMetadataKey(paintedGame.runner, paintedGame.app_name)
        ]?.heroUrl
      )
    : null

  useEffect(() => {
    const steamAppId = paintedMeta?.steamAppId
    if (!steamAppId) return
    const cacheHero = window.api.localLibrary.cacheSteamHero
    if (typeof cacheHero !== 'function') return
    let cancelled = false
    void cacheHero(steamAppId).then((result) => {
      if (cancelled || !result?.url) return
      setHeroCache((current) =>
        current[steamAppId] === result.url
          ? current
          : { ...current, [steamAppId]: result.url }
      )
    })
    return () => {
      cancelled = true
    }
  }, [paintedMeta?.steamAppId])

  useEffect(() => {
    if (!filtered.length) return
    const observer = new IntersectionObserver(
      (entries, current) => {
        const entered: string[] = []
        entries.forEach((entry) => {
          if (entry.intersectionRatio > 0) {
            entered.push(
              (entry.target as HTMLDivElement).dataset.appName as string
            )
            current.unobserve(entry.target)
          }
        })
        if (entered.length) {
          window.dispatchEvent(
            new CustomEvent('visible-cards', { detail: { appNames: entered } })
          )
        }
      },
      { rootMargin: '500px', threshold: 0 }
    )

    listRef.current
      ?.querySelectorAll('[data-invisible]')
      .forEach((card) => observer.observe(card))

    const frame = window.requestAnimationFrame(() => {
      listRef.current
        ?.querySelectorAll('[data-invisible]')
        .forEach((card) => observer.observe(card))
    })

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [filtered, groupByStatus, statuses, collapsedGroups])

  useEffect(() => {
    if (!groupByStatus) {
      setStuckGroups((current) => (current.size ? new Set() : current))
      return
    }
    const root = listRef.current
    if (!root) return

    let frame = 0
    const update = () => {
      const next = readStuckGroupIds(root)
      setStuckGroups((current) => (sameIdSet(current, next) ? current : next))
    }
    const onScroll = () => {
      if (frame) return
      frame = window.requestAnimationFrame(() => {
        frame = 0
        update()
      })
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      root.removeEventListener('scroll', onScroll)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [
    filtered,
    groupByStatus,
    statuses,
    metas,
    sort,
    collapsedGroups,
    facetFilters
  ])

  useEffect(() => {
    if (!focusedKey) return
    const timer = window.setTimeout(() => {
      listRef.current
        ?.querySelector('.collectionCard.is-focused')
        ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }, 240)
    return () => window.clearTimeout(timer)
  }, [focusedKey, filtered])

  async function handleStatusChange(game: GameInfo, statusId: string) {
    const next = await window.api.localLibrary.setStatus({
      appName: game.app_name,
      statusId,
      runner: game.runner === 'zoom' ? 'sideload' : game.runner,
      title: game.title,
      playniteId: metas[game.app_name]?.playniteId
    })
    if (next) {
      setMetas((current) => ({ ...current, [game.app_name]: next }))
    }
  }

  const backgroundStyle = {
    '--collection-bg-blur': `${background.blur}px`,
    '--collection-bg-dim': background.dimming / 100,
    '--collection-bg-saturate': background.saturation / 100,
    '--collection-bg-scrim': background.scrim / 100
  } as CSSProperties

  function renderCards(list: GameInfo[]) {
    return list.map((game) => (
      <CollectionCard
        key={gameKey(game)}
        gameInfo={game}
        meta={metas[game.app_name]}
        collectionArt={
          collectionArt[collectionArtKey(game.runner, game.app_name)]
        }
        metadata={
          collectionMetadata[collectionMetadataKey(game.runner, game.app_name)]
        }
        onMetadataChange={(next) => {
          setCollectionMetadata((current) => ({
            ...current,
            [collectionMetadataKey(game.runner, game.app_name)]: next
          }))
        }}
        statuses={statuses}
        isRecent={recentAppNames.has(game.app_name)}
        isFocused={focusedKey === gameKey(game)}
        onSelect={() => {
          const key = gameKey(game)
          persistFocusedKey(key)
          setFocusedKey(key)
        }}
        onStatusChange={(statusId) => handleStatusChange(game, statusId)}
        onRemoved={() => {
          void reload()
          setFocusedKey((current) => {
            if (current !== gameKey(game)) return current
            storage.removeItem(FOCUSED_GAME_KEY)
            return null
          })
        }}
      />
    ))
  }

  return (
    <div
      className={classNames('collection collection--focused', {
        allTilesInColor,
        'collection--greyUninstalled': greyUninstalledGames
      })}
      data-cover-aspect={coverAspect}
      style={backgroundStyle}
    >
      {background.enabled && paintedArt && (
        <div className="collection__stage" aria-hidden>
          <CachedImage
            key={paintedArt.src}
            src={paintedArt.src}
            fallback={paintedArt.fallback}
            className="collection__stageArt"
            alt=""
          />
          <div className="collection__stageScrim" />
        </div>
      )}
      <header className="collection__header">
        <div className="collection__toolbarLeft">
          <button
            type="button"
            className="collection__toolBtn"
            title={
              sidebarHidden
                ? t('collection.showSidebar', 'Show sidebar')
                : t('collection.hideSidebar', 'Hide sidebar')
            }
            aria-label={
              sidebarHidden
                ? t('collection.showSidebar', 'Show sidebar')
                : t('collection.hideSidebar', 'Hide sidebar')
            }
            aria-pressed={sidebarHidden}
            onClick={handleSidebarToggle}
          >
            {sidebarHidden ? <Menu /> : <MenuOpen />}
          </button>
          <InstallFilterMenu
            value={installFilter}
            onChange={handleInstallFilter}
          />
        </div>
        <div className="collection__toolbarCenter">
          <label className="collection__search">
            <FontAwesomeIcon
              className="collection__searchIcon"
              icon={faSearch}
            />
            <input
              id="search"
              className="collection__searchInput"
              data-testid="searchInput"
              aria-label={t('search', 'Search for Games')}
              placeholder={t('search', 'Search for Games')}
              value={search}
              onChange={(event) => handleSearch(event.target.value)}
            />
          </label>
          <FacetFilterMenu
            filters={facetFilters}
            options={facetOptions}
            onChange={handleFacetFilter}
            onClear={handleClearFacets}
          />
          <SortMenu value={sort} onChange={handleSort} />
          <StatusMenu
            groupByStatus={groupByStatus}
            onGroupByStatusChange={setGroupByStatus}
            onStatusesChanged={() => void reload()}
          />
        </div>
        <div className="collection__toolbarRight">
          {(bulkProgress.state === 'running' ||
            bulkProgress.state === 'cancelling' ||
            (bulkProgress.state === 'done' && !bulkDismissed)) && (
            <button
              type="button"
              className="collection__toolBtn collection__bulkBtn"
              title={t('collection.metadata.wizard.title', 'Download metadata')}
              aria-label={t(
                'collection.metadata.wizard.title',
                'Download metadata'
              )}
              onClick={() => {
                setBulkDismissed(false)
                setWizardOpen(true)
              }}
            >
              <CloudDownload />
              <span>{bulkProgress.percent}%</span>
            </button>
          )}
          <PlayniteMenu onLibraryChanged={() => void reload()} />
          <button
            type="button"
            className="collection__toolBtn"
            title={t('collection.emulation.scanTitle', 'Add emulated games')}
            aria-label={t(
              'collection.emulation.scanTitle',
              'Add emulated games'
            )}
            onClick={() => {
              setScanSeed({})
              setScanOpen(true)
            }}
          >
            <SportsEsports />
          </button>
          <button
            type="button"
            className="collection__toolBtn"
            title={t('collection.settings.title', 'Collection settings')}
            aria-label={t('collection.settings.title', 'Collection settings')}
            onClick={() => setSettingsOpen(true)}
          >
            <Settings />
          </button>
        </div>
      </header>

      <div className="collection__workspace">
        <div className="collection__list" ref={listRef}>
          {groupByStatus ? (
            statuses.map((status) => {
              const list = grouped.buckets.get(status.id) ?? []
              if (!list.length) return null
              return (
                <section
                  key={status.id}
                  data-group-id={status.id}
                  className={classNames('collection__group', {
                    'is-collapsed': collapsedGroups.has(status.id)
                  })}
                >
                  <button
                    type="button"
                    className={classNames('collection__groupToggle', {
                      'is-stuck': stuckGroups.has(status.id)
                    })}
                    aria-expanded={!collapsedGroups.has(status.id)}
                    onClick={() => toggleGroup(status.id)}
                  >
                    <span
                      className="collection__dot"
                      style={{
                        background: STATUS_COLORS[status.slug]
                      }}
                    />
                    {status.name}
                    <span className="collection__count">{list.length}</span>
                  </button>
                  <div className="collection__grid">{renderCards(list)}</div>
                </section>
              )
            })
          ) : (
            <div className="collection__grid">{renderCards(filtered)}</div>
          )}
          {groupByStatus && grouped.unknown.length > 0 && (
            <section
              data-group-id={UNKNOWN_GROUP_ID}
              className={classNames('collection__group', {
                'is-collapsed': collapsedGroups.has(UNKNOWN_GROUP_ID)
              })}
            >
              <button
                type="button"
                className={classNames('collection__groupToggle', {
                  'is-stuck': stuckGroups.has(UNKNOWN_GROUP_ID)
                })}
                aria-expanded={!collapsedGroups.has(UNKNOWN_GROUP_ID)}
                onClick={() => toggleGroup(UNKNOWN_GROUP_ID)}
              >
                {t('collection.ungrouped', 'Other')}
                <span className="collection__count">
                  {grouped.unknown.length}
                </span>
              </button>
              <div className="collection__grid">
                {renderCards(grouped.unknown)}
              </div>
            </section>
          )}
        </div>
        <CollectionFocus
          game={paintedGame}
          meta={paintedGame ? metas[paintedGame.app_name] : undefined}
          collectionArt={
            paintedGame
              ? collectionArt[
                  collectionArtKey(paintedGame.runner, paintedGame.app_name)
                ]
              : undefined
          }
          metadata={
            paintedGame
              ? collectionMetadata[
                  collectionMetadataKey(
                    paintedGame.runner,
                    paintedGame.app_name
                  )
                ]
              : undefined
          }
          games={games}
          collectionMetadata={collectionMetadata}
          collectionArtMap={collectionArt}
          metas={metas}
          onSelectGame={(next) => {
            const key = gameKey(next)
            persistFocusedKey(key)
            setFocusedKey(key)
          }}
          onMetadataChange={(next) => {
            if (!paintedGame) return
            setCollectionMetadata((current) => ({
              ...current,
              [collectionMetadataKey(paintedGame.runner, paintedGame.app_name)]:
                next
            }))
          }}
          onMetaChange={(next) => {
            setMetas((current) => ({ ...current, [next.appName]: next }))
          }}
          cachedHeroUrl={
            paintedMeta?.steamAppId
              ? heroCache[paintedMeta.steamAppId]
              : undefined
          }
          statuses={statuses}
          facetFilters={facetFilters}
          onFacetFilter={handleFacetFilter}
          tagOptions={tagOptions}
          onArtChange={(next) => {
            if (!paintedGame) return
            const key = collectionArtKey(
              paintedGame.runner,
              paintedGame.app_name
            )
            setCollectionArt((current) => {
              if (!next.coverUrl && !next.heroUrl) {
                const rest = { ...current }
                delete rest[key]
                return rest
              }
              return { ...current, [key]: next }
            })
          }}
          onClose={() => setFocusedKey(null)}
          screenshotsFolder={screenshotsFolder}
        />
      </div>
      {settingsOpen && (
        <CollectionSettingsDialog
          onClose={() => setSettingsOpen(false)}
          onSettingsChange={(next) => {
            setGreyUninstalledGames(next.greyUninstalledGames !== false)
            setBackground(next.background ?? DEFAULT_COLLECTION_BACKGROUND)
            setCoverAspect(next.metadata?.coverAspect || 'steam')
            setScreenshotsFolder(next.screenshots?.folder ?? '')
          }}
          onBackgroundPreview={setBackground}
          previewArt={paintedArt?.src}
          onOpenMetadataWizard={() => {
            setSettingsOpen(false)
            setBulkDismissed(false)
            setWizardOpen(true)
          }}
          onOpenScan={(seed) => {
            setScanSeed(seed ?? {})
            setScanOpen(true)
          }}
        />
      )}
      {scanOpen && (
        <ScanRomsDialog
          initialEmulatorId={scanSeed.emulatorId}
          initialProfileId={scanSeed.profileId}
          initialDirectory={scanSeed.directory}
          onClose={() => setScanOpen(false)}
          onImported={() => void reload()}
        />
      )}
      {wizardOpen && (
        <CollectionMetadataWizard
          games={filtered.map((game) => ({
            appName: game.app_name,
            runner: game.runner === 'zoom' ? 'sideload' : game.runner,
            title: collectionGameTitle(
              game,
              collectionMetadata[
                collectionMetadataKey(game.runner, game.app_name)
              ]
            ),
            steamAppId: metas[game.app_name]?.steamAppId
          }))}
          progress={bulkProgress}
          onProgress={(next) => {
            setBulkProgress(next)
            setBulkDismissed(false)
          }}
          onHide={() => {
            setWizardOpen(false)
            if (bulkProgress.state === 'done') setBulkDismissed(true)
          }}
        />
      )}
    </div>
  )
}
