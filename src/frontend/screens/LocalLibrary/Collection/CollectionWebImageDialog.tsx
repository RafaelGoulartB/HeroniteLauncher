import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch, faSpinner } from '@fortawesome/free-solid-svg-icons'
import classNames from 'classnames'
import type { GameInfo, Runner } from 'common/types'
import type {
  CollectionArtKind,
  CollectionGameArt,
  CollectionWebImage
} from 'common/types/local-library'
import { CachedImage } from 'frontend/components/UI'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader
} from 'frontend/components/UI/Dialog'
import './CollectionWebImageDialog.css'

function ipcErrorMessage(err: unknown) {
  const raw = err instanceof Error ? err.message : String(err)
  return raw.replace(/^Error invoking remote method '[^']+': (?:Error: )?/u, '')
}

const PAGE_SIZE = 20

type Props = {
  game: GameInfo
  title: string
  kind: CollectionArtKind
  onChange: (art: CollectionGameArt) => void
  onClose: () => void
}

function collectionWebImageQuery(title: string, kind: CollectionArtKind) {
  const name = title.replace(/\s+/g, ' ').trim()
  const suffix = kind === 'cover' ? 'cover' : 'wallpaper'
  return name ? `"${name}" ${suffix}` : suffix
}

export default function CollectionWebImageDialog({
  game,
  title,
  kind,
  onChange,
  onClose
}: Props) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(collectionWebImageQuery(title, kind))
  const [transparent, setTransparent] = useState(false)
  const [images, setImages] = useState<CollectionWebImage[]>([])
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [selected, setSelected] = useState<CollectionWebImage | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const requestId = useRef(0)

  async function runSearch(term = query, nextTransparent = transparent) {
    const trimmed = term.replace(/\s+/g, ' ').trim()
    if (!trimmed) return
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setSelected(null)
    setImages([])
    setVisible(PAGE_SIZE)
    try {
      const results = await window.api.localLibrary.searchWebImages({
        query: trimmed,
        transparent: nextTransparent
      })
      if (id !== requestId.current) return
      setImages(results)
      if (!results.length) {
        setError(
          t(
            'collection.gameArt.webSearch.empty',
            'No images found. Try another search.'
          )
        )
      }
    } catch (err) {
      if (id !== requestId.current) return
      setError(
        ipcErrorMessage(err) ||
          t(
            'collection.gameArt.webSearch.failed',
            'Could not search images. Try another term.'
          )
      )
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    void runSearch()
    return () => {
      requestId.current += 1
    }
    // Search once with the Playnite-style query when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function confirm(image = selected) {
    if (!image || saving) return
    setSaving(true)
    setError('')
    try {
      const next = await window.api.localLibrary.setGameArtFromUrl({
        appName: game.app_name,
        runner: game.runner as Runner,
        kind,
        imageUrl: image.imageUrl,
        thumbUrl: image.thumbUrl
      })
      onChange(next)
      onClose()
    } catch (err) {
      setError(
        ipcErrorMessage(err) ||
          t(
            'collection.gameArt.webSearch.downloadFailed',
            'Could not download the selected image.'
          )
      )
      setSaving(false)
    }
  }

  const shown = images.slice(0, visible)
  const kindLabel =
    kind === 'cover'
      ? t('collection.gameArt.cover', 'Cover')
      : t('collection.gameArt.hero', 'Background')

  return (
    <Dialog
      onClose={onClose}
      showCloseButton
      className="CollectionWebImageDialog"
    >
      <DialogHeader>
        {t('collection.gameArt.webSearch.title', 'Search images')}
      </DialogHeader>
      <DialogContent className="CollectionWebImageDialog__content">
        <p className="CollectionWebImageDialog__help">
          {t(
            'collection.gameArt.webSearch.help',
            'Pick an image from the web. Collection saves it like a file you selected yourself.'
          )}{' '}
          {kindLabel}
        </p>

        <div className="CollectionWebImageDialog__toolbar">
          <button
            type="button"
            className="button outline"
            disabled={loading || saving || !query.trim()}
            onClick={() => void runSearch()}
          >
            {t('collection.gameArt.webSearch.search', 'Search')}
          </button>
          <label className="CollectionWebImageDialog__query">
            <FontAwesomeIcon icon={faSearch} />
            <input
              value={query}
              disabled={saving}
              aria-label={t('collection.gameArt.webSearch.search', 'Search')}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void runSearch()
              }}
            />
          </label>
          <label className="CollectionWebImageDialog__check">
            <input
              type="checkbox"
              checked={transparent}
              disabled={loading || saving}
              onChange={(event) => {
                const next = event.target.checked
                setTransparent(next)
                void runSearch(query, next)
              }}
            />
            {t('collection.gameArt.webSearch.transparent', 'Transparent')}
          </label>
        </div>

        <div
          className={classNames('CollectionWebImageDialog__grid', {
            'is-cover': kind === 'cover',
            'is-hero': kind === 'hero'
          })}
        >
          {loading && (
            <div className="CollectionWebImageDialog__status">
              <FontAwesomeIcon icon={faSpinner} spin />
              {t('collection.gameArt.webSearch.loading', 'Searching…')}
            </div>
          )}
          {!loading &&
            shown.map((image) => {
              const isSelected = selected?.imageUrl === image.imageUrl
              const size =
                image.width && image.height
                  ? `${image.width}×${image.height}`
                  : ''
              return (
                <button
                  key={image.imageUrl}
                  type="button"
                  className={classNames('CollectionWebImageDialog__item', {
                    'is-selected': isSelected
                  })}
                  title={image.imageUrl}
                  onClick={() => setSelected(image)}
                  onDoubleClick={() => void confirm(image)}
                >
                  <CachedImage src={image.thumbUrl} alt="" />
                  {size && <span>{size}px</span>}
                </button>
              )
            })}
        </div>

        {visible < images.length && !loading && (
          <button
            type="button"
            className="button outline CollectionWebImageDialog__more"
            onClick={() => setVisible((count) => count + PAGE_SIZE)}
          >
            {t('collection.gameArt.webSearch.more', 'Load more')}
          </button>
        )}

        {error && <p className="CollectionWebImageDialog__error">{error}</p>}
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
            ? t('collection.gameArt.webSearch.saving', 'Downloading…')
            : t('collection.gameArt.webSearch.select', 'Select')}
        </button>
      </DialogFooter>
    </Dialog>
  )
}
