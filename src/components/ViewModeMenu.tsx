import { useEffect, useRef, useState } from 'react'
import { useViewMode } from '../context/ViewModeContext'
import './ViewModeMenu.css'

type Props = {
  /** Sits in the nav bar (default). When false, use fixed top-right for pages without PageNavBar. */
  inline?: boolean
  /** Match PageNavBar dark/light for trigger styling */
  navVariant?: 'light' | 'dark'
}

export default function ViewModeMenu({ inline = true, navVariant = 'light' }: Props) {
  const { viewMode, setViewMode } = useViewMode()
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const rootClass =
    `view-mode-menu view-mode-menu--${inline ? 'inline' : 'fixed'} view-mode-menu--nav-${navVariant}`.trim()

  return (
    <div className={rootClass} ref={rootRef}>
      <button
        type="button"
        className="view-mode-menu__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Display & layout — choose mobile or desktop view"
      >
        <span className="view-mode-menu__trigger-icon" aria-hidden />
        <span className="view-mode-menu__trigger-label">Layout</span>
      </button>

      {open && (
        <div className="view-mode-menu__panel" role="dialog" aria-label="Layout options">
          <p className="view-mode-menu__heading">Page layout</p>
          <p className="view-mode-menu__hint">
            This only changes spacing and columns — not your device.
          </p>
          <div className="view-mode-menu__options">
            <button
              type="button"
              className={`view-mode-menu__option ${viewMode === 'mobile' ? 'is-active' : ''}`}
              onClick={() => {
                setViewMode('mobile')
                setOpen(false)
              }}
            >
              <span className="view-mode-menu__option-title">Mobile view</span>
              <span className="view-mode-menu__option-desc">
                Narrow column, stacked lists — best on phones or focused reading.
              </span>
            </button>
            <button
              type="button"
              className={`view-mode-menu__option ${viewMode === 'desktop' ? 'is-active' : ''}`}
              onClick={() => {
                setViewMode('desktop')
                setOpen(false)
              }}
            >
              <span className="view-mode-menu__option-title">Desktop view</span>
              <span className="view-mode-menu__option-desc">
                Wide canvas and multi-column grids on large screens.
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
