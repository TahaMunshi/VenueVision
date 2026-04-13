import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import ViewModeMenu from './ViewModeMenu'
import { useAuth } from '../context/AuthContext'
import './PageNavBar.css'

export type PageNavBarVariant = 'light' | 'dark'

export type PageNavBarProps = {
  /** When set, home icon goes to `/venue/:venueId`. Otherwise goes to `/venues`. */
  venueId?: string | null
  /** Shown in the center on larger screens */
  title?: string
  /** Visible label for the back control */
  backLabel?: string
  /** If set, navigates here instead of browser back */
  backTo?: string
  variant?: PageNavBarVariant
  /** Extra actions on the right (before home), e.g. logout */
  endSlot?: ReactNode
  className?: string
  /** Show layout menu (mobile vs desktop). Set false on full-screen capture. */
  showLayoutMenu?: boolean
}

export default function PageNavBar({
  venueId,
  title,
  backLabel = 'Back',
  backTo,
  variant = 'light',
  endSlot,
  className = '',
  showLayoutMenu = true,
}: PageNavBarProps) {
  const navigate = useNavigate()
  const { user } = useAuth()

  const handleBack = () => {
    if (backTo) {
      navigate(backTo)
      return
    }
    navigate(-1)
  }

  const handleHome = () => {
    if (user?.role === 'vendor') {
      navigate('/vendor')
      return
    }
    if (venueId) {
      navigate(`/venue/${venueId}`)
    } else {
      navigate('/marketplace')
    }
  }

  const homeTitle =
    user?.role === 'vendor'
      ? 'Vendor dashboard'
      : venueId
        ? 'Venue home (dashboard for this venue)'
        : 'Marketplace'

  return (
    <header
      className={`page-nav-bar page-nav-bar--${variant} ${className}`.trim()}
      role="navigation"
      aria-label="Page navigation"
    >
      <div className="page-nav-bar__inner">
        {showLayoutMenu ? <ViewModeMenu inline navVariant={variant} /> : null}
        <button
          type="button"
          className="page-nav-bar__btn page-nav-bar__btn--back"
          onClick={handleBack}
          title={`${backLabel} — go to previous page`}
        >
          <span className="page-nav-bar__icon page-nav-bar__icon--arrow" aria-hidden />
          <span className="page-nav-bar__btn-text">{backLabel}</span>
        </button>

        {title ? (
          <h1 className="page-nav-bar__title">{title}</h1>
        ) : (
          <span className="page-nav-bar__title page-nav-bar__title--placeholder" aria-hidden />
        )}

        <div className="page-nav-bar__right">
          {endSlot}
          <button
            type="button"
            className="page-nav-bar__btn page-nav-bar__btn--home"
            onClick={handleHome}
            title={homeTitle}
            aria-label={homeTitle}
          >
            <span className="page-nav-bar__icon page-nav-bar__icon--home" aria-hidden />
          </button>
        </div>
      </div>
    </header>
  )
}
