import React, { useEffect, useState } from 'react'
import classNames from 'classnames'

interface CachedImageProps {
  src: string
  fallback?: string | string[]
  className?: string
  onLoad?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void
  onError?: (e: React.SyntheticEvent<HTMLImageElement, Event>) => void
}

type Props = React.ImgHTMLAttributes<HTMLImageElement> & CachedImageProps

const CachedImage = (props: Props) => {
  const { fallback, ...imgProps } = props
  const fallbacks = (Array.isArray(fallback) ? fallback : [fallback]).filter(
    (item): item is string => Boolean(item)
  )
  const [useCache, setUseCache] = useState(
    props.src?.startsWith('http') || false
  )
  const [loaded, setLoaded] = useState(false)
  const [fallbackIndex, setFallbackIndex] = useState(-1)

  useEffect(() => {
    setLoaded(false)
    setFallbackIndex(-1)
    setUseCache(props.src?.startsWith('http') || false)
  }, [props.src])

  const onError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // if not cached, tried with the real
    if (useCache) {
      setUseCache(false)
    } else {
      // if not cached and can't access real, walk down the fallbacks
      const next = fallbacks[fallbackIndex + 1]
      if (next) {
        setFallbackIndex(fallbackIndex + 1)
        setUseCache(next.startsWith('http'))
      }
    }
    props.onError?.(e)
  }

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    setLoaded(true)
    props.onLoad?.(e)
  }

  let src = fallbackIndex < 0 ? props.src : fallbacks[fallbackIndex]
  src = useCache && src ? `imagecache://${encodeURIComponent(src)}` : src

  return (
    <img
      loading="lazy"
      {...imgProps}
      src={src}
      onLoad={handleLoad}
      onError={onError}
      className={classNames(props.className, {
        loaded,
        loading: !loaded
      })}
    />
  )
}

export default CachedImage
