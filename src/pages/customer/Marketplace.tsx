import { useState, useEffect, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, getAuthHeaders, resolveApiAssetUrl } from '../../utils/api'
import { resolveTextureUrlForNgrok } from '../../utils/ngrokTextureUrl'
import './Customer.css'

interface VenueCard {
  venue_id: number
  vendor_id: number
  venue_identifier: string
  name: string
  description: string
  city: string
  country: string
  category: string
  capacity: number | null
  cover_image: string | null
  rating: number
  review_count: number
  min_price: number | null
  vendor_name: string
}

export default function Marketplace() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const API = getApiBaseUrl()

  const [venues, setVenues] = useState<VenueCard[]>([])
  const [coverUrls, setCoverUrls] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [city, setCity] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('rating')
  const [cities, setCities] = useState<string[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)

  useEffect(() => {
    fetchFilters()
  }, [])

  useEffect(() => {
    search()
  }, [query, city, category, sort, page])

  async function fetchFilters() {
    try {
      const [cRes, catRes] = await Promise.all([
        fetch(`${API}/api/v1/marketplace/cities`),
        fetch(`${API}/api/v1/marketplace/categories`),
      ])
      if (cRes.ok) { const d = await cRes.json(); setCities((d.cities || []).map((c: any) => c.city)) }
      if (catRes.ok) { const d = await catRes.json(); setCategories((d.categories || []).map((c: any) => c.category)) }
    } catch { /* */ }
  }

  const search = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (city) params.set('city', city)
    if (category) params.set('category', category)
    params.set('sort', sort)
    params.set('page', String(page))

    try {
      const res = await fetch(`${API}/api/v1/marketplace/venues?${params}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const d = await res.json()
        setVenues(d.venues || [])
        setPages(d.pages || 0)
      }
    } catch { /* */ }
    setLoading(false)
  }, [query, city, category, sort, page])

  const handleLogout = () => { logout(); navigate('/login') }

  useEffect(() => {
    let cancelled = false
    const blobUrls: string[] = []

    const resolveCovers = async () => {
      const entries = await Promise.all(
        venues
          .filter((v) => Boolean(v.cover_image))
          .map(async (v) => {
            const fullUrl = resolveApiAssetUrl(v.cover_image)
            try {
              const resolved = await resolveTextureUrlForNgrok(fullUrl)
              if (resolved.startsWith('blob:')) blobUrls.push(resolved)
              return [v.venue_id, resolved] as const
            } catch {
              return [v.venue_id, fullUrl] as const
            }
          })
      )
      if (!cancelled) setCoverUrls(Object.fromEntries(entries))
    }

    resolveCovers()
    return () => {
      cancelled = true
      blobUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [venues])

  return (
    <div className="mp-page">
      <header className="mp-header">
        <div className="mp-header__inner">
          <div className="mp-header__brand">
            <h1 className="mp-header__logo">VenueVision</h1>
            <p className="mp-header__tagline">Find the perfect venue for your event</p>
          </div>
          <div className="mp-header__nav">
            {user ? (
              <>
                {user.role === 'vendor' && <Link to="/vendor" className="mp-nav-link">Vendor Panel</Link>}
                <Link to="/bookings" className="mp-nav-link">My Bookings</Link>
                <span className="mp-nav-user">{user.full_name || user.username}</span>
                <button onClick={handleLogout} className="mp-nav-link mp-nav-link--ghost">Logout</button>
              </>
            ) : (
              <>
                <Link to="/login" className="mp-nav-link">Sign In</Link>
                <Link to="/signup" className="mp-nav-link mp-nav-link--cta">Sign Up</Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mp-hero">
        <div className="mp-hero__inner">
          <h2 className="mp-hero__title">Discover &amp; Book Venues</h2>
          <p className="mp-hero__sub">Browse venues, explore them in 3D, and book instantly.</p>
          <div className="mp-search-bar">
            <input
              type="text"
              className="mp-search-bar__input"
              placeholder="Search venues by name, location..."
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </section>

      <main className="mp-main">
        <aside className="mp-filters">
          <h3 className="mp-filters__title">Filters</h3>

          <div className="mp-filter-group">
            <label className="mp-filter-label">City</label>
            <select className="mp-filter-select" value={city} onChange={e => { setCity(e.target.value); setPage(1) }}>
              <option value="">All Cities</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="mp-filter-group">
            <label className="mp-filter-label">Category</label>
            <select className="mp-filter-select" value={category} onChange={e => { setCategory(e.target.value); setPage(1) }}>
              <option value="">All Categories</option>
              {categories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div className="mp-filter-group">
            <label className="mp-filter-label">Sort By</label>
            <select className="mp-filter-select" value={sort} onChange={e => { setSort(e.target.value); setPage(1) }}>
              <option value="rating">Top Rated</option>
              <option value="price_low">Price: Low to High</option>
              <option value="price_high">Price: High to Low</option>
              <option value="newest">Newest</option>
              <option value="capacity">Largest Capacity</option>
            </select>
          </div>
        </aside>

        <div className="mp-results">
          {loading ? (
            <div className="mp-loading"><div className="vd-spinner" /></div>
          ) : venues.length === 0 ? (
            <div className="mp-no-results">
              <h3>No venues found</h3>
              <p>Try adjusting your search or filters.</p>
            </div>
          ) : (
            <>
              <div className="mp-grid">
                {venues.map(v => (
                  <div key={v.venue_id} className="mp-card-wrap">
                    <Link to={`/venue-detail/${v.venue_identifier}`} className="mp-card">
                      <div className="mp-card__img"
                        style={{ backgroundImage: v.cover_image ? `url(${coverUrls[v.venue_id] || resolveApiAssetUrl(v.cover_image)})` : undefined }}>
                        {!v.cover_image && <div className="mp-card__img-placeholder">🏛</div>}
                        {v.category && <span className="mp-card__cat">{v.category.replace(/_/g, ' ')}</span>}
                      </div>
                      <div className="mp-card__body">
                        <h3 className="mp-card__name">{v.name}</h3>
                        <p className="mp-card__location">{[v.city, v.country].filter(Boolean).join(', ') || 'Location not set'}</p>
                        <div className="mp-card__row">
                          {v.rating > 0 && <span className="mp-card__rating">★ {v.rating.toFixed(1)} ({v.review_count})</span>}
                          {v.capacity && <span className="mp-card__cap">Up to {v.capacity}</span>}
                        </div>
                        {v.min_price != null && (
                          <p className="mp-card__price">From <strong>${v.min_price}</strong>/hr</p>
                        )}
                        <p className="mp-card__vendor">by {v.vendor_name || 'Unknown vendor'}</p>
                      </div>
                    </Link>
                    {user?.role === 'vendor' && user.user_id === v.vendor_id && (
                      <Link to={`/vendor/venues/${v.venue_id}/edit`} className="mp-card-manage">
                        Manage listing
                      </Link>
                    )}
                  </div>
                ))}
              </div>

              {pages > 1 && (
                <div className="mp-pagination">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="vd-btn vd-btn--outline vd-btn--sm">Prev</button>
                  <span className="mp-pagination__info">Page {page} of {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="vd-btn vd-btn--outline vd-btn--sm">Next</button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
