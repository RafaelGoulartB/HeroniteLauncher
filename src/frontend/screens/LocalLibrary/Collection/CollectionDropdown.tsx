import { ReactNode, useEffect, useRef, useState } from 'react'
import 'frontend/components/UI/Dropdown/index.scss'
import './CollectionDropdown.css'

type Props = {
  title?: ReactNode | string
  children: ReactNode
  className?: string
  buttonClass?: string
  popUpOnHover?: boolean
}

export default function CollectionDropdown({
  title,
  children,
  className,
  buttonClass,
  popUpOnHover = false
}: Props) {
  const [isExpanded, setIsExpanded] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current)
    }
  }, [])

  function clearCloseTimer() {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current)
      closeTimer.current = null
    }
  }

  function open() {
    clearCloseTimer()
    setIsExpanded(true)
  }

  function handlePopup(state: 'enter' | 'leave') {
    if (!popUpOnHover) return
    if (state === 'enter') {
      open()
      return
    }
    clearCloseTimer()
    closeTimer.current = setTimeout(() => {
      setIsExpanded(false)
      closeTimer.current = null
    }, 180)
  }

  return (
    <div
      className={`dropdownContainer collectionDropdown ${className || ''}`}
      onMouseEnter={() => handlePopup('enter')}
      onMouseLeave={() => handlePopup('leave')}
    >
      <button
        type="button"
        className={`dropdownButton ${buttonClass ? buttonClass : ''}`}
        onClick={() => {
          if (!isExpanded) {
            void window.api.gamepadAction({ action: 'tab' })
          }
          open()
        }}
      >
        {title}
      </button>
      <div
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node)) {
            setIsExpanded(false)
          }
        }}
        onFocus={open}
        className={`dropdown ${isExpanded ? 'expanded' : 'collapsed'}`}
      >
        {children}
      </div>
    </div>
  )
}
