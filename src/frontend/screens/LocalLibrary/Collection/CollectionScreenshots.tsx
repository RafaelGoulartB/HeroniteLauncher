import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import {
  ChevronLeft,
  ChevronRight,
  Close,
  DeleteOutline,
  Fullscreen,
  FullscreenExit
} from '@mui/icons-material'
import type { CollectionScreenshot } from 'common/types/local-library'
import type { Runner } from 'common/types'
import './CollectionScreenshots.css'

type Props = {
  appName: string
  runner: Runner
  title: string
  steamAppId?: string
  aliases?: string[]
  screenshotsFolder?: string
}

const PREVIEW_SLOTS = 4
const GALLERY_PAGE_SIZE = 50
const MIN_ZOOM = 1
const MAX_ZOOM = 5
const ZOOM_STEP = 1.12

function clampZoom(value: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, value))
}

function screenshotPreviewUrl(item: CollectionScreenshot) {
  const version = Math.trunc(item.takenAt ?? 0)
  return `${item.url}?preview=1&v=${version}`
}

function ScreenshotPreview({ item }: { item: CollectionScreenshot }) {
  const [visible, setVisible] = useState(false)
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    if (!('IntersectionObserver' in window)) {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setVisible(true)
        observer.disconnect()
      },
      { rootMargin: '120px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <span ref={containerRef} className="collectionScreenshots__preview">
      {visible && (
        <img
          src={screenshotPreviewUrl(item)}
          alt=""
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      )}
    </span>
  )
}

export default function CollectionScreenshots({
  appName,
  runner,
  title,
  steamAppId,
  aliases,
  screenshotsFolder
}: Props) {
  const { t } = useTranslation()
  const [items, setItems] = useState<CollectionScreenshot[]>([])
  const [galleryOpen, setGalleryOpen] = useState(false)
  const [galleryVisibleCount, setGalleryVisibleCount] =
    useState(GALLERY_PAGE_SIZE)
  const [viewIndex, setViewIndex] = useState<number | null>(null)
  const [zoom, setZoom] = useState(MIN_ZOOM)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [fitScreen, setFitScreen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const zoomRef = useRef(MIN_ZOOM)
  const panRef = useRef({ x: 0, y: 0 })
  const dragRef = useRef<{
    pointerId: number
    x: number
    y: number
    panX: number
    panY: number
    moved: boolean
  } | null>(null)
  const aliasKey = useMemo(
    () => (aliases ?? []).filter(Boolean).join('\0'),
    [aliases]
  )

  const loadScreenshots = useCallback(
    (cancelled: () => boolean) => {
      if (!screenshotsFolder || !title) return
      const extra = aliasKey ? aliasKey.split('\0') : []
      void window.api.localLibrary
        .getScreenshots({ title, steamAppId, aliases: extra })
        .then((result) => {
          if (!cancelled()) setItems(result.items)
        })
        .catch(() => {
          if (!cancelled()) setItems([])
        })
    },
    [aliasKey, screenshotsFolder, steamAppId, title]
  )

  useEffect(() => {
    let cancelled = false
    setItems([])
    setGalleryOpen(false)
    setGalleryVisibleCount(GALLERY_PAGE_SIZE)
    setViewIndex(null)
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
    setFitScreen(false)
    loadScreenshots(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [loadScreenshots])

  useEffect(
    () =>
      window.api.localLibrary.onScreenshotSaved((_event, screenshot) => {
        if (screenshot.appName !== appName || screenshot.runner !== runner)
          return
        loadScreenshots(() => false)
      }),
    [appName, loadScreenshots, runner]
  )

  const viewing = viewIndex !== null ? items[viewIndex] : undefined
  const hasMore = items.length > PREVIEW_SLOTS
  const visible = hasMore ? items.slice(0, PREVIEW_SLOTS - 1) : items
  const remaining = items.length - visible.length
  const galleryItems = items.slice(0, galleryVisibleCount)

  function resetViewTransform() {
    zoomRef.current = MIN_ZOOM
    panRef.current = { x: 0, y: 0 }
    setZoom(MIN_ZOOM)
    setPan({ x: 0, y: 0 })
  }

  useEffect(() => {
    resetViewTransform()
  }, [viewIndex])

  useEffect(() => {
    zoomRef.current = zoom
  }, [zoom])

  useEffect(() => {
    panRef.current = pan
  }, [pan])

  useEffect(() => {
    if (!galleryOpen && viewIndex === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (deleting) return
      if (event.key === 'Escape') {
        event.stopImmediatePropagation()
        if (viewIndex !== null && zoomRef.current > MIN_ZOOM) {
          resetViewTransform()
          return
        }
        if (viewIndex !== null && fitScreen) {
          setFitScreen(false)
          return
        }
        if (viewIndex !== null && galleryOpen) {
          setViewIndex(null)
          return
        }
        setViewIndex(null)
        setGalleryOpen(false)
        return
      }
      if (viewIndex === null || !items.length) return
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setViewIndex((current) =>
          current === null ? current : (current + 1) % items.length
        )
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setViewIndex((current) =>
          current === null
            ? current
            : (current - 1 + items.length) % items.length
        )
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        resetViewTransform()
        setFitScreen((current) => !current)
      }
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setFitScreen(false)
        setViewIndex(null)
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [deleting, galleryOpen, viewIndex, items.length, fitScreen])

  useEffect(() => {
    if (viewIndex === null) return
    const node = viewRef.current
    if (!node) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const current = zoomRef.current
      const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP
      const next = clampZoom(current * factor)
      if (next === current) return
      const rect = node.getBoundingClientRect()
      const originX = event.clientX - (rect.left + rect.width / 2)
      const originY = event.clientY - (rect.top + rect.height / 2)
      const currentPan = panRef.current
      const ratio = next / current
      const nextPan =
        next === MIN_ZOOM
          ? { x: 0, y: 0 }
          : {
              x: originX - (originX - currentPan.x) * ratio,
              y: originY - (originY - currentPan.y) * ratio
            }
      zoomRef.current = next
      panRef.current = nextPan
      setZoom(next)
      setPan(nextPan)
    }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  }, [viewIndex])

  function closeGallery() {
    setGalleryOpen(false)
    setGalleryVisibleCount(GALLERY_PAGE_SIZE)
    setViewIndex(null)
  }

  function closeView() {
    setFitScreen(false)
    setViewIndex(null)
  }

  function step(delta: number) {
    if (viewIndex === null || !items.length) return
    setViewIndex((viewIndex + delta + items.length) % items.length)
  }

  async function deleteViewingScreenshot() {
    if (viewIndex === null || !viewing || deleting) return
    const confirmed = window.confirm(
      t(
        'collection.focus.screenshotsDeleteConfirm',
        'Move “{{name}}” to the trash?',
        { name: viewing.name }
      )
    )
    if (!confirmed) return

    setDeleting(true)
    try {
      const result = await window.api.localLibrary.deleteScreenshot({
        url: viewing.url
      })
      if (!result.ok) {
        window.alert(
          t(
            'collection.focus.screenshotsDeleteError',
            'Could not delete the screenshot: {{error}}',
            { error: result.error }
          )
        )
        return
      }

      const nextItems = items.filter((_, index) => index !== viewIndex)
      resetViewTransform()
      setFitScreen(false)
      setItems(nextItems)
      if (!nextItems.length) {
        setViewIndex(null)
        setGalleryOpen(false)
      } else {
        setViewIndex(Math.min(viewIndex, nextItems.length - 1))
      }
    } catch (error) {
      window.alert(
        t(
          'collection.focus.screenshotsDeleteError',
          'Could not delete the screenshot: {{error}}',
          { error: String(error) }
        )
      )
    } finally {
      setDeleting(false)
    }
  }

  function onImagePointerDown(event: ReactPointerEvent<HTMLImageElement>) {
    if (zoom <= MIN_ZOOM) return
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
      moved: false
    }
  }

  function onImagePointerMove(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const dx = event.clientX - drag.x
    const dy = event.clientY - drag.y
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) drag.moved = true
    const nextPan = { x: drag.panX + dx, y: drag.panY + dy }
    panRef.current = nextPan
    setPan(nextPan)
  }

  function onImagePointerUp(event: ReactPointerEvent<HTMLImageElement>) {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    try {
      event.currentTarget.releasePointerCapture(event.pointerId)
    } catch {
      // Capture may already be released.
    }
  }

  if (!items.length) return null

  return (
    <section className="collectionScreenshots">
      <h3>{t('collection.focus.screenshots', 'Screenshots')}</h3>
      <div className="collectionFocus__panel collectionFocus__panel--facts collectionScreenshots__panel">
        <div className="collectionScreenshots__row">
          {visible.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className="collectionScreenshots__thumb"
              onClick={() => setViewIndex(index)}
              title={item.name}
            >
              <ScreenshotPreview item={item} />
            </button>
          ))}
          {remaining > 0 && (
            <button
              type="button"
              className="collectionScreenshots__thumb collectionScreenshots__more"
              onClick={() => {
                setGalleryOpen(true)
                setGalleryVisibleCount(GALLERY_PAGE_SIZE)
                setViewIndex(null)
              }}
              title={t(
                'collection.focus.screenshotsMore',
                'View all screenshots'
              )}
            >
              {items[visible.length] && (
                <ScreenshotPreview item={items[visible.length]} />
              )}
              <span>
                {t('collection.focus.screenshotsMoreCount', '+{{count}}', {
                  count: remaining
                })}
              </span>
            </button>
          )}
        </div>
      </div>

      {createPortal(
        <>
          {galleryOpen && (
            <div
              className="collectionScreenshots__overlay"
              onClick={closeGallery}
              role="presentation"
            >
              <div
                className="collectionScreenshots__modal"
                onClick={(event) => event.stopPropagation()}
                role="dialog"
                aria-modal="true"
                aria-label={t('collection.focus.screenshots', 'Screenshots')}
              >
                <header className="collectionScreenshots__modalHeader">
                  <h3>
                    {t('collection.focus.screenshots', 'Screenshots')}
                    <span>{items.length}</span>
                  </h3>
                  <button
                    type="button"
                    className="collectionFocus__iconBtn"
                    onClick={closeGallery}
                    title={t('box.close', 'Close')}
                  >
                    <Close />
                  </button>
                </header>
                <div className="collectionScreenshots__grid">
                  {galleryItems.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className="collectionScreenshots__gridItem"
                      onClick={() => setViewIndex(index)}
                      title={item.name}
                    >
                      <ScreenshotPreview item={item} />
                    </button>
                  ))}
                  {galleryVisibleCount < items.length && (
                    <button
                      type="button"
                      className="button outline collectionScreenshots__loadMore"
                      onClick={() =>
                        setGalleryVisibleCount((current) =>
                          Math.min(current + GALLERY_PAGE_SIZE, items.length)
                        )
                      }
                    >
                      {t(
                        'collection.focus.screenshotsLoadMore',
                        'Load more ({{count}} remaining)',
                        {
                          count: items.length - galleryVisibleCount
                        }
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {viewing && viewIndex !== null && (
            <div
              ref={viewRef}
              className={
                fitScreen
                  ? 'collectionScreenshots__overlay collectionScreenshots__overlay--view is-fit'
                  : 'collectionScreenshots__overlay collectionScreenshots__overlay--view'
              }
              onClick={closeView}
              role="presentation"
            >
              <div className="collectionScreenshots__tools">
                <button
                  type="button"
                  className="collectionFocus__iconBtn collectionScreenshots__delete"
                  disabled={deleting}
                  onClick={(event) => {
                    event.stopPropagation()
                    void deleteViewingScreenshot()
                  }}
                  title={t(
                    'collection.focus.screenshotsDelete',
                    'Move screenshot to trash'
                  )}
                >
                  <DeleteOutline />
                </button>
                <button
                  type="button"
                  className="collectionFocus__iconBtn"
                  onClick={(event) => {
                    event.stopPropagation()
                    resetViewTransform()
                    setFitScreen((current) => !current)
                  }}
                  title={
                    fitScreen
                      ? t(
                          'collection.focus.screenshotsFitExit',
                          'Exit fit to screen'
                        )
                      : t('collection.focus.screenshotsFit', 'Fit to screen')
                  }
                >
                  {fitScreen ? <FullscreenExit /> : <Fullscreen />}
                </button>
                <button
                  type="button"
                  className="collectionFocus__iconBtn"
                  onClick={(event) => {
                    event.stopPropagation()
                    closeView()
                  }}
                  title={t('box.close', 'Close')}
                >
                  <Close />
                </button>
              </div>
              {items.length > 1 && (
                <button
                  type="button"
                  className="collectionScreenshots__nav is-prev"
                  onClick={(event) => {
                    event.stopPropagation()
                    step(-1)
                  }}
                  title={t(
                    'collection.focus.screenshotsPrev',
                    'Previous screenshot'
                  )}
                >
                  <ChevronLeft />
                </button>
              )}
              <img
                src={viewing.url}
                alt={viewing.name}
                className={
                  fitScreen
                    ? 'collectionScreenshots__full is-fit'
                    : 'collectionScreenshots__full'
                }
                draggable={false}
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  cursor: zoom > MIN_ZOOM ? 'grab' : 'zoom-in'
                }}
                onClick={(event) => event.stopPropagation()}
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  resetViewTransform()
                }}
                onPointerDown={onImagePointerDown}
                onPointerMove={onImagePointerMove}
                onPointerUp={onImagePointerUp}
                onPointerCancel={onImagePointerUp}
              />
              {items.length > 1 && (
                <button
                  type="button"
                  className="collectionScreenshots__nav is-next"
                  onClick={(event) => {
                    event.stopPropagation()
                    step(1)
                  }}
                  title={t(
                    'collection.focus.screenshotsNext',
                    'Next screenshot'
                  )}
                >
                  <ChevronRight />
                </button>
              )}
              <p className="collectionScreenshots__caption">
                {viewIndex + 1}/{items.length}
                {zoom > MIN_ZOOM ? ` · ${Math.round(zoom * 100)}%` : ''}
              </p>
            </div>
          )}
        </>,
        document.body
      )}
    </section>
  )
}
