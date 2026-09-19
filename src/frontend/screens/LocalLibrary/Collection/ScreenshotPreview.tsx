import { useEffect, useRef, useState } from 'react'
import type { CollectionScreenshot } from 'common/types/local-library'
import './ScreenshotPreview.css'

function screenshotPreviewUrl(item: CollectionScreenshot) {
  const version = Math.trunc(item.takenAt ?? 0)
  return `${item.url}?preview=1&v=${version}`
}

export default function ScreenshotPreview({
  item
}: {
  item: CollectionScreenshot
}) {
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
    <span ref={containerRef} className="collectionScreenshotPreview">
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
