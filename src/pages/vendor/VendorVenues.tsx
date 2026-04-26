import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getApiBaseUrl, getAuthHeaders, resolveApiAssetUrl } from '../../utils/api'
import { resolveTextureUrlForNgrok } from '../../utils/ngrokTextureUrl'
import './Vendor.css'

interface VenueRow {
  venue_id: number
  venue_identifier: string
  name: string
  description: string
  city: string
  category: string
  capacity: number | null
  cover_image: string | null
  is_published: boolean
  status: string
  rating: number
  review_count: number
  min_price: number | null
  total_bookings: number
  created_at: string
}

export default function VendorVenues() {
  const navigate = useNavigate()
  const [venues, setVenues] = useState<VenueRow[]>([])
  const [coverUrls, setCoverUrls] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(true)
  const API = getApiBaseUrl()

  useEffect(() => { load() }, [])

  async function load() {
    try {
      const res = await fetch(`${API}/api/v1/vendor/venues`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setVenues(data.venues || [])
      }
    } catch { /* */ }
    setLoading(false)
  }

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

  async function togglePublish(v: VenueRow) {
    await fetch(`${API}/api/v1/vendor/venues/${v.venue_id}/publish`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ publish: !v.is_published }),
    })
    load()
  }

  async function deleteVenue(v: VenueRow) {
    if (!confirm(`Delete "${v.name}"? This cannot be undone.`)) return
    await fetch(`${API}/api/v1/vendor/venues/${v.venue_id}`, {
      method: 'DELETE', headers: getAuthHeaders(),
    })
    load()
  }

  if (loading) return <div className="vd-loading"><div className="vd-spinner" /></div>

  return (
    <div className="vd-page">
      <header className="vd-header">
        <div className="vd-header__inner">
          <div>
            <h1 className="vd-header__title">My Venues</h1>
            <p className="vd-header__sub">{venues.length} venue{venues.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="vd-header__actions">
            <Link to="/vendor/venues/new" className="vd-btn vd-btn--primary">+ New Venue</Link>
            <Link to="/vendor" className="vd-btn vd-btn--outline">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="vd-main">
        {venues.length === 0 ? (
          <div className="vd-empty-hero">
            <h2>No venues yet</h2>
            <p>Create your first venue to get started.</p>
            <Link to="/vendor/venues/new" className="vd-btn vd-btn--primary">Create Venue</Link>
          </div>
        ) : (
          <div className="vd-venue-grid">
            {venues.map(v => (
              <div key={v.venue_id} className="vd-venue-card">
                <div className="vd-venue-card__img"
                  style={{ backgroundImage: v.cover_image ? `url(${coverUrls[v.venue_id] || resolveApiAssetUrl(v.cover_image)})` : undefined }}>
                  {!v.cover_image && <span className="vd-venue-card__placeholder">🏢</span>}
                  <span className={`vd-badge vd-badge--${v.is_published ? 'confirmed' : 'pending'} vd-venue-card__status`}>
                    {v.is_published ? 'Published' : 'Draft'}
                  </span>
                </div>
                <div className="vd-venue-card__body">
                  <h3>{v.name}</h3>
                  <p className="vd-venue-card__meta">
                    {v.city || 'No location'} · {v.category} · {v.capacity ? `${v.capacity} capacity` : 'No capacity set'}
                  </p>
                  {v.min_price != null && (
                    <p className="vd-venue-card__price">From ${v.min_price}/hr</p>
                  )}
                  <p className="vd-venue-card__stats">
                    {v.rating > 0 ? `★ ${v.rating.toFixed(1)} (${v.review_count})` : 'No reviews'} ·
                    {' '}{v.total_bookings} booking{v.total_bookings !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="vd-venue-card__actions">
                  <button className="vd-btn vd-btn--sm" onClick={() => navigate(`/vendor/venues/${v.venue_id}/edit`)}>Edit</button>
                  <button className="vd-btn vd-btn--sm" onClick={() => navigate(`/planner/${v.venue_identifier}`)}>Floor Plan</button>
                  <button className="vd-btn vd-btn--sm" onClick={() => navigate(`/capture/${v.venue_identifier}`)}>Capture</button>
                  <button className="vd-btn vd-btn--sm" onClick={() => navigate(`/view/${v.venue_identifier}`)}>3D View</button>
                  <button className="vd-btn vd-btn--sm vd-btn--outline"
                    onClick={() => togglePublish(v)}>
                    {v.is_published ? 'Unpublish' : 'Publish'}
                  </button>
                  <button className="vd-btn vd-btn--sm vd-btn--danger" onClick={() => deleteVenue(v)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
