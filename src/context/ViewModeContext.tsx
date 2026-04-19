import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type ViewMode = 'mobile' | 'desktop'

const STORAGE_KEY = 'venuevision-view-mode'

type Ctx = {
  viewMode: ViewMode
  setViewMode: (m: ViewMode) => void
}

const ViewModeContext = createContext<Ctx | null>(null)

function readInitialMode(): ViewMode {
  if (typeof window === 'undefined') return 'desktop'
  try {
    const s = localStorage.getItem(STORAGE_KEY)
    if (s === 'mobile' || s === 'desktop') return s
  } catch {
    /* ignore */
  }
  return window.matchMedia('(min-width: 1024px)').matches ? 'desktop' : 'mobile'
}

export function ViewModeProvider({ children }: { children: ReactNode }) {
  const [viewMode, setViewModeState] = useState<ViewMode>(readInitialMode)

  useEffect(() => {
    document.documentElement.dataset.viewMode = viewMode
    try {
      localStorage.setItem(STORAGE_KEY, viewMode)
    } catch {
      /* ignore */
    }
  }, [viewMode])

  const setViewMode = useCallback((m: ViewMode) => {
    setViewModeState(m)
  }, [])

  return (
    <ViewModeContext.Provider value={{ viewMode, setViewMode }}>
      {children}
    </ViewModeContext.Provider>
  )
}

export function useViewMode(): Ctx {
  const ctx = useContext(ViewModeContext)
  if (!ctx) {
    throw new Error('useViewMode must be used within ViewModeProvider')
  }
  return ctx
}
