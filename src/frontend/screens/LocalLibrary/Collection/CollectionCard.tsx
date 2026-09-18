import {
  memo,
  useContext,
  useEffect,
  useMemo,
  useState,
  type CSSProperties
} from 'react'
import classNames from 'classnames'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  AccessTime,
  Cancel,
  DeleteForever,
  Description,
  Download,
  Edit,
  Favorite,
  FavoriteBorder,
  List,
  OpenInNew,
  PlayArrow,
  PlaylistRemove,
  Save,
  Settings,
  TravelExplore,
  Upgrade,
  Visibility,
  VisibilityOff
} from '@mui/icons-material'
import type { FavouriteGame, GameInfo, HiddenGame, Runner } from 'common/types'
import type {
  CollectionGameArt,
  CollectionGameMetadata,
  CompletionStatus,
  LocalGameMeta
} from 'common/types/local-library'
import { CachedImage, SvgButton } from 'frontend/components/UI'
import UninstallModal from 'frontend/components/UI/UninstallModal'
import EditGameDialog from 'frontend/components/UI/EditGameDialog'
import ContextProvider from 'frontend/state/ContextProvider'
import useGlobalState from 'frontend/state/GlobalStateV2'
import { openInstallGameModal } from 'frontend/state/InstallGameModal'
import { timestampStore } from 'frontend/helpers/electronStores'
import { getGameInfo, getProgress, sendKill } from 'frontend/helpers'
import { install, launch, updateGame } from 'frontend/helpers/library'
import { hasProgress } from 'frontend/hooks/hasProgress'
import { hasStatus } from 'frontend/hooks/hasStatus'
import PlayIcon from 'frontend/assets/play-icon.svg?react'
import StopIconAlt from 'frontend/assets/stop-icon-alt.svg?react'
import DownIcon from 'frontend/assets/down-icon.svg?react'
import { getCardStatus } from 'frontend/screens/Library/components/GameCard/constants'
import fallBackImage from 'frontend/assets/heroic_card.jpg'
import { formatPlaytimeMinutes } from './playtime'
import { STATUS_COLORS } from './statusColors'
import CollectionContextMenu from './CollectionContextMenu'
import CollectionMetadataDialog from './CollectionMetadataDialog'
import { confirmForceStopPlaying } from './forceStopPlaying'
import { openSteamStoreUri, steamAppIdFromMeta } from './steamActions'
import { collectionCoverSrc } from './steamArt'
import { collectionGameTitle } from './collectionTitle'
import PickRomDialog from './PickRomDialog'
import { emulatorNeedsRomPick, prepareEmulatorLaunch } from './emulatorLaunch'
import './CollectionCard.css'

const storage: Storage = window.localStorage

type Props = {
  gameInfo: GameInfo
  meta?: LocalGameMeta
  collectionArt?: CollectionGameArt
  metadata?: CollectionGameMetadata
  statuses: CompletionStatus[]
  isRecent?: boolean
  isFocused?: boolean
  onSelect: () => void
  onStatusChange: (statusId: string) => void
  onMetadataChange: (metadata: CollectionGameMetadata) => void
  onRemoved?: () => void
}

function CollectionCardActive({
  gameInfo: gameInfoFromProps,
  meta,
  collectionArt,
  metadata,
  statuses,
  isRecent = false,
  isFocused = false,
  onSelect,
  onStatusChange,
  onMetadataChange,
  onRemoved
}: Props) {
  const { t } = useTranslation('gamepage')
  const navigate = useNavigate()
  const {
    hiddenGames,
    favouriteGames,
    showDialogModal,
    connectivity,
    gameUpdates,
    refreshLibrary
  } = useContext(ContextProvider)
  const { openGameSettingsModal, openGameLogsModal, openGameCategoriesModal } =
    useGlobalState.keys(
      'openGameSettingsModal',
      'openGameLogsModal',
      'openGameCategoriesModal'
    )

  const [gameInfo, setGameInfo] = useState<GameInfo>(gameInfoFromProps)
  const [showUninstallModal, setShowUninstallModal] = useState(false)
  const [metadataOpen, setMetadataOpen] = useState(false)
  const [pickRomOpen, setPickRomOpen] = useState(false)

  const {
    app_name: appName,
    runner,
    is_installed: isInstalled,
    install: gameInstallInfo
  } = { ...gameInfoFromProps }
  const title = collectionGameTitle(gameInfoFromProps, metadata)
  const cover = collectionCoverSrc(
    gameInfoFromProps,
    collectionArt,
    meta?.steamAppId,
    metadata?.coverUrl
  )

  const currentStatusId = meta?.completionStatusId ?? 'not-played'
  const completion =
    statuses.find((item) => item.id === currentStatusId) ??
    statuses.find((item) => item.id === 'not-played')
  const isInstallable =
    gameInfo.installable === undefined || gameInfo.installable
  const [progress, previousProgress] = hasProgress(appName, runner)
  const { install_size: size = '0' } = { ...gameInstallInfo }
  const { status, folder } = hasStatus(gameInfo, size)
  const isBrowserGame = gameInfo.install.platform === 'Browser'
  const hasUpdate = Boolean(isInstalled && gameUpdates?.includes(appName))
  const {
    isInstalling,
    isUninstalling,
    isQueued,
    isPlaying,
    isUpdating,
    isLaunching
  } = getCardStatus(status, isInstalled, 'grid')
  const isTrackingTime = isPlaying || isLaunching
  const installingGrayscale = isInstalling
    ? `${125 - getProgress(progress)}%`
    : '100%'
  const [playedMinutes, setPlayedMinutes] = useState(
    () => timestampStore.get_nodefault(appName)?.totalPlayed
  )
  const [liveExtraMinutes, setLiveExtraMinutes] = useState(0)

  useEffect(() => {
    const updateInfo = async () => {
      const newInfo = await getGameInfo(appName, runner)
      if (newInfo) setGameInfo(newInfo)
    }
    void updateInfo()
    setPlayedMinutes(timestampStore.get_nodefault(appName)?.totalPlayed)
  }, [status, appName, runner, isTrackingTime])

  useEffect(() => {
    if (!isTrackingTime) {
      setLiveExtraMinutes(0)
      return
    }
    const startedAt = Date.now()
    const tick = () =>
      setLiveExtraMinutes(Math.floor((Date.now() - startedAt) / 60000))
    tick()
    const timer = window.setInterval(tick, 15000)
    return () => window.clearInterval(timer)
  }, [isTrackingTime, appName])

  const playedTotal = (playedMinutes ?? 0) + liveExtraMinutes
  const playtimeLabel = useMemo(
    () =>
      playedTotal > 0
        ? formatPlaytimeMinutes(playedTotal)
        : t('collection.notPlayed', 'Not Played'),
    [playedTotal, t]
  )

  const isHiddenGame = Boolean(
    hiddenGames.list.find((game: HiddenGame) => game.appName === appName)
  )
  const isFavouriteGame = Boolean(
    favouriteGames.list.find((game: FavouriteGame) => game.appName === appName)
  )
  const isSideloaded = runner === 'sideload'
  const steamAppId = steamAppIdFromMeta(meta)

  const handleRemoveFromQueue = () => {
    window.api.removeFromDMQueue(appName)
  }

  async function handleUpdate() {
    if (gameInfo.runner !== 'sideload') {
      updateGame({ appName, runner, gameInfo })
    }
  }

  function handleInstall() {
    if (steamAppId) {
      void openSteamFromCollection('install')
      return
    }
    openInstallGameModal({ appName, runner, gameInfo })
  }

  function handleUninstall() {
    if (steamAppId) {
      showDialogModal({
        showDialog: true,
        type: 'MESSAGE',
        title: t('button.uninstall'),
        message: t(
          'collection.steam.uninstallHelp',
          'This opens Steam to uninstall "{{title}}". The game stays in Collection; Heroic marks it uninstalled after Steam finishes and you refresh or reopen Heroic Local.',
          { title }
        ),
        buttons: [
          {
            text: t('box.yes'),
            onClick: () => void openSteamFromCollection('uninstall')
          },
          { text: t('box.no') }
        ]
      })
      return
    }
    setShowUninstallModal(true)
  }

  function handleRemoveFromCollection() {
    const removeGame = window.api.localLibrary.removeGame
    if (typeof removeGame !== 'function') {
      showDialogModal({
        showDialog: true,
        type: 'ERROR',
        title: t('collection.remove.title', 'Remove from Collection'),
        message: t(
          'collection.remove.restart',
          'Restart Heroic Local to load Remove from Collection.'
        )
      })
      return
    }

    showDialogModal({
      showDialog: true,
      type: 'MESSAGE',
      title: t('collection.remove.title', 'Remove from Collection'),
      message: t(
        'collection.remove.confirm',
        'Remove {{title}} from Collection? This does not uninstall the game. Playtime, status, and Collection images for it are deleted.',
        { title }
      ),
      buttons: [
        {
          text: t('box.yes'),
          onClick: () => {
            void (async () => {
              const result = await removeGame({ appName, runner })
              if (!result.ok) {
                showDialogModal({
                  showDialog: true,
                  type: 'ERROR',
                  title: t('collection.remove.title', 'Remove from Collection'),
                  message:
                    result.error ||
                    t(
                      'collection.remove.failed',
                      'Could not remove this game from Collection.'
                    )
                })
                return
              }
              hiddenGames.remove(appName)
              favouriteGames.remove(appName)
              timestampStore.delete(appName)
              await refreshLibrary({
                library: 'sideload',
                runInBackground: true
              })
              onRemoved?.()
            })()
          }
        },
        { text: t('box.no') }
      ]
    })
  }

  async function handleLudusaviBackup() {
    const backup = window.api.localLibrary.runLudusaviBackup
    if (typeof backup !== 'function') {
      showDialogModal({
        showDialog: true,
        type: 'ERROR',
        title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
        message: t(
          'collection.ludusavi.restart',
          'Restart Heroic Local to load Ludusavi backup.'
        )
      })
      return
    }
    showDialogModal({
      showDialog: true,
      type: 'MESSAGE',
      title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
      message: t(
        'collection.ludusavi.running',
        'Backing up saves with Ludusavi…'
      )
    })
    try {
      const result = await backup({
        appName,
        title,
        runner,
        steamAppId,
        storeGameId: meta?.storeGameId
      })
      if (result.skippedReason === 'already-running') {
        showDialogModal({
          showDialog: true,
          type: 'MESSAGE',
          title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
          message: t(
            'collection.ludusavi.busy',
            'Ludusavi is already backing up a save. Wait a moment and try again.'
          )
        })
        return
      }
      if (result.error && !result.ran) {
        showDialogModal({
          showDialog: true,
          type: result.skippedReason === 'no-match' ? 'MESSAGE' : 'ERROR',
          title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
          message: result.error
        })
        return
      }
      const backupPath = result.backupPath
      showDialogModal({
        showDialog: true,
        type: 'MESSAGE',
        title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
        message: backupPath
          ? t(
              'collection.ludusavi.donePath',
              'Saved a Ludusavi backup for {{title}} in {{path}}.',
              { title: result.gameName || title, path: backupPath }
            )
          : t(
              'collection.ludusavi.done',
              'Saved a Ludusavi backup for {{title}}.',
              { title: result.gameName || title }
            ),
        buttons: backupPath
          ? [
              {
                text: t('box.show-in-folder', 'Show in folder'),
                onClick: () => window.api.showItemInFolder(backupPath)
              },
              { text: t('box.close', 'Close') }
            ]
          : undefined
      })
    } catch (error) {
      showDialogModal({
        showDialog: true,
        type: 'ERROR',
        title: t('collection.ludusavi.backup', 'Ludusavi save backup'),
        message: String(error)
      })
    }
  }

  async function openSteamFromCollection(action: 'install' | 'uninstall') {
    if (!steamAppId) return
    const result = await openSteamStoreUri(action, steamAppId)
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

  function handleEdit() {
    if (isSideloaded) {
      openInstallGameModal({ appName, runner, gameInfo })
      return
    }

    showDialogModal({
      showDialog: true,
      title: t('edit-game.title', 'Edit Game'),
      message: (
        <EditGameDialog
          gameInfo={gameInfo}
          backdropClick={() => showDialogModal({ showDialog: false })}
        />
      )
    })
  }

  async function handlePlay(playRunner: Runner) {
    if (!isInstalled && !isQueued && gameInfo.runner !== 'sideload') {
      return install({
        gameInfo,
        installPath: folder || 'default',
        isInstalling,
        previousProgress,
        progress,
        t,
        showDialogModal
      })
    }

    if (isUpdating) {
      return sendKill(appName, playRunner)
    }

    if (isPlaying) {
      confirmForceStopPlaying({
        appName,
        runner: playRunner,
        title,
        t,
        showDialogModal
      })
      return
    }

    if (isQueued) {
      storage.removeItem(appName)
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
        t,
        runner: playRunner,
        hasUpdate,
        showDialogModal,
        notPlayableOffline: isOffline && !gameInfo.canRunOffline
      })
    }
  }

  function hoverPlayButton() {
    if (!isInstallable) return null

    if (isPlaying || isUpdating) {
      return (
        <SvgButton
          className="collectionCard__playBtn cancel"
          title={`${t('label.playing.stop')} (${title})`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void handlePlay(runner)
          }}
        >
          <StopIconAlt />
        </SvgButton>
      )
    }

    if (isInstalling) {
      return (
        <SvgButton
          className="collectionCard__playBtn cancel"
          title={`${t('button.cancel')} (${title})`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void handlePlay(runner)
          }}
        >
          <StopIconAlt />
        </SvgButton>
      )
    }

    if (isInstalled) {
      return (
        <SvgButton
          className="collectionCard__playBtn play"
          title={`${t('label.playing.start')} (${title})`}
          disabled={isLaunching}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void handlePlay(runner)
          }}
        >
          <PlayIcon />
        </SvgButton>
      )
    }

    if (!isQueued) {
      return (
        <SvgButton
          className="collectionCard__playBtn install"
          title={`${t('button.install')} (${title})`}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            handleInstall()
          }}
        >
          <DownIcon />
        </SvgButton>
      )
    }

    return null
  }

  return (
    <>
      {showUninstallModal && (
        <UninstallModal
          appName={appName}
          runner={runner}
          isDlc={Boolean(gameInfo.install.is_dlc)}
          onClose={() => setShowUninstallModal(false)}
        />
      )}
      {metadataOpen && (
        <CollectionMetadataDialog
          game={gameInfo}
          title={title}
          steamAppId={meta?.steamAppId}
          metadata={metadata}
          onChange={onMetadataChange}
          onClose={() => setMetadataOpen(false)}
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
                t,
                runner,
                hasUpdate,
                showDialogModal,
                notPlayableOffline: isOffline && !gameInfo.canRunOffline
              })
            })()
          }}
        />
      )}
      <CollectionContextMenu
        statuses={statuses.map((item) => ({
          id: item.id,
          label: item.name,
          color: STATUS_COLORS[item.slug],
          selected: item.id === currentStatusId
        }))}
        onStatusChange={onStatusChange}
        items={[
          {
            label: t('button.queue.remove'),
            onclick: handleRemoveFromQueue,
            show: isQueued && !isInstalling,
            icon: <Cancel />
          },
          {
            label: t('label.playing.stop'),
            onclick: () => void handlePlay(runner),
            show: isPlaying,
            icon: <Cancel />
          },
          {
            label: t('label.playing.start'),
            onclick: () => void handlePlay(runner),
            show: isInstalled && !isPlaying && !isUpdating && !isQueued,
            icon: <PlayArrow />
          },
          {
            label: t('button.update', 'Update'),
            onclick: () => void handleUpdate(),
            show: hasUpdate && !isUpdating && !isQueued && !steamAppId,
            icon: <Upgrade />
          },
          {
            label: t('button.install'),
            onclick: handleInstall,
            show: !isInstalled && !isQueued && isInstallable,
            icon: <Download />
          },
          {
            label: t('button.cancel'),
            onclick: () => void handlePlay(runner),
            show: isInstalling || isUpdating,
            icon: <Cancel />
          },
          {
            label: t('button.details', 'Details'),
            onclick: () =>
              navigate(`/gamepage/${runner}/${appName}`, {
                state: { gameInfo, fromCollection: true }
              }),
            show: true,
            icon: <OpenInNew />
          },
          {
            label: t('submenu.settings', 'Settings'),
            onclick: () => openGameSettingsModal(gameInfo),
            show: isInstalled && !isUninstalling && !isBrowserGame,
            icon: <Settings />
          },
          {
            label: t('collection.metadata.title', 'Collection metadata'),
            onclick: () => setMetadataOpen(true),
            show: true,
            icon: <TravelExplore />
          },
          {
            label: t('submenu.logs', 'Logs'),
            onclick: () => openGameLogsModal(gameInfo),
            show: isInstalled && !isUninstalling && !isBrowserGame,
            icon: <Description />
          },
          {
            label: isSideloaded
              ? t('button.sideload.edit', 'Edit App/Game')
              : t('edit-game.title', 'Edit Game'),
            onclick: handleEdit,
            show: true,
            icon: <Edit />
          },
          {
            label: t('button.hide_game', 'Hide Game'),
            onclick: () => hiddenGames.add(appName, title),
            show: !isHiddenGame,
            icon: <VisibilityOff />
          },
          {
            label: t('button.unhide_game', 'Unhide Game'),
            onclick: () => hiddenGames.remove(appName),
            show: isHiddenGame,
            icon: <Visibility />
          },
          {
            label: t('button.add_to_favourites', 'Add To Favourites'),
            onclick: () => favouriteGames.add(appName, title),
            show: !isFavouriteGame,
            icon: <Favorite />
          },
          {
            label: t('submenu.categories', 'Categories'),
            onclick: () => openGameCategoriesModal(gameInfo),
            show: true,
            icon: <List />
          },
          {
            label: t('button.remove_from_favourites', 'Remove From Favourites'),
            onclick: () => favouriteGames.remove(appName),
            show: isFavouriteGame,
            icon: <FavoriteBorder />
          },
          {
            label: t('button.remove_from_recent', 'Remove From Recent'),
            onclick: () => void window.api.removeRecentGame(appName),
            show: isRecent,
            icon: <PlaylistRemove />
          },
          {
            label: t('collection.ludusavi.backup', 'Backup save (Ludusavi)'),
            onclick: () => void handleLudusaviBackup(),
            show: true,
            icon: <Save />
          },
          {
            label: t('button.uninstall'),
            onclick: handleUninstall,
            show: isInstalled && !isUpdating && !isPlaying,
            icon: <DeleteForever />
          },
          {
            label: t('collection.remove.title', 'Remove from Collection'),
            onclick: handleRemoveFromCollection,
            show: isSideloaded && !isPlaying && !isUpdating,
            icon: <DeleteForever />
          }
        ]}
      >
        <div
          className={classNames('collectionCard', {
            installed: isInstalled,
            'is-playing': isTrackingTime,
            'is-focused': isFocused
          })}
          data-app-name={appName}
        >
          <div className="collectionCard__cover">
            <button
              type="button"
              className="collectionCard__link"
              onClick={onSelect}
              aria-pressed={isFocused}
              aria-label={title}
              style={
                { '--installing-effect': installingGrayscale } as CSSProperties
              }
            >
              <CachedImage
                key={cover}
                src={cover}
                fallback={fallBackImage}
                className={classNames('collectionCard__image', {
                  installed: isInstalled
                })}
                alt={title}
              />
              {completion && (
                <span
                  className="collectionCard__statusDot"
                  style={{ background: STATUS_COLORS[completion.slug] }}
                  title={completion.name}
                />
              )}
            </button>
            <div className="collectionCard__bar">
              <span className="collectionCard__title">
                <span>{title}</span>
              </span>
              {hoverPlayButton()}
            </div>
          </div>
          <span
            className={classNames('collectionCard__playtime', {
              'is-playing': isTrackingTime,
              'is-empty': playedTotal <= 0
            })}
            title={
              isTrackingTime
                ? t('collection.tracking', 'Counting playtime')
                : undefined
            }
          >
            <AccessTime className="collectionCard__clock" />
            {isTrackingTime && <span className="collectionCard__liveDot" />}
            {playtimeLabel}
          </span>
        </div>
      </CollectionContextMenu>
    </>
  )
}

function CollectionCard(props: Props) {
  const appName = props.gameInfo.app_name
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const callback = (event: CustomEvent<{ appNames: string[] }>) => {
      if (event.detail.appNames.includes(appName)) setVisible(true)
    }
    window.addEventListener('visible-cards', callback)
    return () => window.removeEventListener('visible-cards', callback)
  }, [appName])

  useEffect(() => {
    if (props.isFocused) setVisible(true)
  }, [props.isFocused])

  if (!visible && !props.isFocused) {
    return (
      <div
        className="collectionCard"
        data-app-name={appName}
        data-invisible="true"
      />
    )
  }

  return <CollectionCardActive {...props} />
}

export default memo(CollectionCard)
