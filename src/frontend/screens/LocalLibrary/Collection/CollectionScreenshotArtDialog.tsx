import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSpinner } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'
import type { GameInfo, Runner } from 'common/types'
import type {
  CollectionArtKind,
  CollectionGameArt,
  CollectionScreenshot
} from 'common/types/local-library'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import ScreenshotPreview from './ScreenshotPreview'
import './CollectionScreenshotArtDialog.css'

const PAGE_SIZE = 24
const ART_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'avif'])

function ipcErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
}

function isArtScreenshot(item: CollectionScreenshot) {
  const ext = item.name.split('.').pop()?.toLowerCase()
  return Boolean(ext && ART_EXT.has(ext))
}

type Props = {
  game: GameInfo
  title: string
  kind: CollectionArtKind
  steamAppId?: string
  aliases?: string[]
  onChange: (art: CollectionGameArt) => void
  onClose: () => void
}

export default function CollectionScreenshotArtDialog({
  game,
  title,
  kind,
  steamAppId,
  aliases,
  onChange,
  onClose
}: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<CollectionScreenshot[]>([])
  const [folderConfigured, setFolderConfigured] = useState(true)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<CollectionScreenshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)
  const aliasKey = useMemo(
    () => (aliases ?? []).filter(Boolean).join('\0'),
    [aliases]
  )

  useEffect(() => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setSelected(null)
    setItems([])
    setVisible(PAGE_SIZE)
    const extra = aliasKey ? aliasKey.split('\0') : []
    void window.api.localLibrary
      .getScreenshots({ title, steamAppId, aliases: extra })
      .then((result) => {
        if (id !== requestId.current) return
        setFolderConfigured(Boolean(result.folder))
        setItems(result.items.filter(isArtScreenshot).reverse())
      })
      .catch((err) => {
        if (id !== requestId.current) return
        setFolderConfigured(true)
        setError(
          ipcErrorMessage(err) ||
            t(
              'collection.gameArt.fromScreenshot.loadFailed',
              'Could not load screenshots.'
            )
        )
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false)
      })

    return () => {
      requestId.current += 1
    }
  }, [aliasKey, steamAppId, t, title])

  async function confirm(item = selected) {
    if (!item || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setGameArt({
        appName: game.app_name,
        runner: game.runner as Runner,
        kind,
        sourcePath: item.url
      })
      onChange(next)
      onClose()
    } catch (err) {
      setError(
        ipcErrorMessage(err) ||
          t(
            'collection.gameArt.fromScreenshot.failed',
            'Could not use this screenshot.'
          )
      )
      setSaving(false)
    }
  }

  const shown = items.slice(0, visible)
  const emptyMessage = !folderConfigured
    ? t(
        'collection.gameArt.fromScreenshot.noFolder',
        'Set a screenshots folder in Collection settings first.'
      )
    : t(
        'collection.gameArt.fromScreenshot.empty',
        'No screenshots found for this game.'
      )

  return (
    <Dialog
      onClose={onClose}
      showCloseButton
      className="CollectionScreenshotArtDialog"
    >
      <DialogHeader>
        {t('collection.gameArt.fromScreenshot.title', 'Select screenshot')}
      </DialogHeader>
      <DialogContent className="CollectionScreenshotArtDialog__content">
        <p className="CollectionScreenshotArtDialog__help">
          {t(
            'collection.gameArt.fromScreenshot.help',
            'Pick a screenshot of this game to use as the background.'
          )}
        </p>

        <div className="CollectionScreenshotArtDialog__grid">
          {loading && (
            <div className="CollectionScreenshotArtDialog__status">
              <FontAwesomeIcon icon={faSpinner} spin />
              {t('collection.gameArt.fromScreenshot.loading', 'Loading…')}
            </div>
          )}
          {!loading && !items.length && (
            <div className="CollectionScreenshotArtDialog__status">
              {emptyMessage}
            </div>
          )}
          {!loading &&
            shown.map((item) => {
              const isSelected = selected?.id === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  className={classNames('CollectionScreenshotArtDialog__item', {
                    'is-selected': isSelected
                  })}
                  title={item.name}
                  onClick={() => setSelected(item)}
                  onDoubleClick={() => void confirm(item)}
                >
                  <ScreenshotPreview item={item} />
                </button>
              )
            })}
        </div>

        {visible < items.length && !loading && (
          <button
            type="button"
            className="button outline CollectionScreenshotArtDialog__more"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
          >
            {t('collection.gameArt.fromScreenshot.more', 'Load more')}
          </button>
        )}

        {error && (
          <p className="CollectionScreenshotArtDialog__error">{error}</p>
        )}
      </DialogContent>
      <DialogFooter>
        <button className="button outline" disabled={saving} onClick={onClose}>
          {t('button.cancel', 'Cancel')}
        </button>
        <button
          className="button is-primary"
          disabled={!selected || loading || saving}
          onClick={() => void confirm()}
        >
          {saving
            ? t('collection.gameArt.saving', 'Saving…')
            : t('collection.gameArt.fromScreenshot.select', 'Select')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
