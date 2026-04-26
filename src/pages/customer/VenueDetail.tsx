import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, getAuthHeaders, resolveApiAssetUrl } from '../../utils/api'
import { resolveTextureUrlForNgrok } from '../../utils/ngrokTextureUrl'
import './Customer.css'

export default function VenueDetail() {
  const { venueIdentifier } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const API = getApiBaseUrl()

  const [venue, setVenue] = useState<any>(null)
  const [pricing, setPricing] = useState<any[]>([])
  const [packages, setPackages] = useState<any[]>([])
  const [presets, setPresets] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [showBooking, setShowBooking] = useState(false)
  const [bookForm, setBookForm] = useState({
    event_date: '', start_time: '', end_time: '', package_id: '', preset_id: '', notes: ''
  })
  const [bookError, setBookError] = useState('')
  const [bookSuccess, setBookSuccess] = useState(false)

  useEffect(() => {
    if (venueIdentifier) loadVenue()
  }, [venueIdentifier])

  async function loadVenue() {
    try {
      const res = await fetch(`${API}/api/v1/marketplace/venues/${venueIdentifier}`, { headers: getAuthHeaders() })
      if (res.ok) {
        const d = await res.json()
        setVenue(d.venue)
        setPricing(d.pricing || [])
        setPackages(d.packages || [])
        setPresets(d.presets || [])
        setReviews(d.reviews || [])
      } else {
        navigate('/marketplace')
      }
    } catch { /* */ }
    setLoading(false)
  }

  useEffect(() => {
    if (!venue?.cover_image) {
      setCoverUrl(null)
      return
    }

    let cancelled = false
    let blobUrl: string | null = null
    const fullUrl = resolveApiAssetUrl(venue.cover_image)

    resolveTextureUrlForNgrok(fullUrl)
      .then((resolved) => {
        if (resolved.startsWith('blob:')) blobUrl = resolved
        if (!cancelled) setCoverUrl(resolved)
      })
      .catch(() => {
        if (!cancelled) setCoverUrl(fullUrl)
      })

    return () => {
      cancelled = true
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [venue?.cover_image])

  async function handleBook() {
    if (!user) { navigate('/login'); return }
    if (user.role !== 'customer') { setBookError('Only customers can book'); return }
    setBookError(''); setBookSuccess(false)

    if (!bookForm.event_date || !bookForm.start_time || !bookForm.end_time) {
      setBookError('Please fill in date and time'); return
    }

    try {
      const res = await fetch(`${API}/api/v1/bookings`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          venue_id: venue.venue_id,
          event_date: bookForm.event_date,
          start_time: bookForm.start_time,
          end_time: bookForm.end_time,
          package_id: bookForm.package_id ? parseInt(bookForm.package_id) : null,
          preset_id: bookForm.preset_id ? parseInt(bookForm.preset_id) : null,
          notes: bookForm.notes,
        }),
      })
      if (res.ok) {
        setBookSuccess(true)
        setShowBooking(false)
      } else {
        const d = await res.json()
        setBookError(d.error || 'Booking failed')
      }
    } catch { setBookError('Network error') }
  }

  if (loading) return <div className="mp-loading"><div className="vd-spinner" /></div>
  if (!venue) return null

  return (
    <div className="mp-page">
      <header className="mp-header">
        <div className="mp-header__inner">
          <Link to="/marketplace" className="mp-back-link">← Back to Marketplace</Link>
          {user?.role === 'vendor' && user.user_id === venue.vendor_id && (
            <Link
              to={`/vendor/venues/${venue.venue_id}/edit`}
              className="mp-nav-link mp-nav-link--cta"
            >
              Manage venue &amp; pricing
            </Link>
          )}
        </div>
      </header>

      <div className="vd-hero-img"
        style={{ backgroundImage: venue.cover_image ? `url(${coverUrl || resolveApiAssetUrl(venue.cover_image)})` : undefined }}>
        {!venue.cover_image && <div className="vd-hero-placeholder">🏛</div>}
      </div>

      <main className="vd-detail-main">
        <div className="vd-detail-content">
          <div className="vd-detail-left">
            <h1 className="vd-detail-name">{venue.name}</h1>
            <p className="vd-detail-location">{[venue.city, venue.country].filter(Boolean).join(', ')}</p>

            {venue.rating > 0 && (
              <div className="vd-detail-rating">
                ★ {venue.rating.toFixed(1)} ({venue.review_count} review{venue.review_count !== 1 ? 's' : ''})
              </div>
            )}

            <div className="vd-detail-tags">
              <span className="vd-detail-tag">{venue.category?.replace(/_/g, ' ')}</span>
              {venue.capacity && <span className="vd-detail-tag">Capacity: {venue.capacity}</span>}
              <span className="vd-detail-tag">{venue.dimensions?.width}×{venue.dimensions?.depth} ft</span>
            </div>

            {venue.description && <p className="vd-detail-desc">{venue.description}</p>}

            {(venue.amenities?.length ?? 0) > 0 && (
              <div className="vd-detail-section">
                <h2>Amenities</h2>
                <div className="vd-detail-amenities">
                  {venue.amenities.map((a: string, i: number) => (
                    <span key={i} className="vd-detail-amenity">{a}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="vd-detail-section">
              <h2>3D Preview</h2>
              <div className="vd-detail-3d-actions">
                <button
                  className="vd-btn vd-btn--primary"
                  onClick={() => navigate(`/view/${venue.venue_identifier}`)}
                  title="Open the vendor’s floor plan and 3D demo room"
                >
                  View in 3D
                </button>
                {presets.length > 0 && (
                  <div className="vd-detail-presets">
                    <p className="vd-detail-preset-label">Layout presets:</p>
                    {presets.map(p => (
                      <span key={p.preset_id} className="vd-detail-tag">
                        {p.name} {p.capacity_label && `(${p.capacity_label})`}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="vd-detail-section">
                <h2>Reviews</h2>
                <div className="vd-reviews">
                  {reviews.map(r => (
                    <div key={r.review_id} className="vd-review">
                      <div className="vd-review__header">
                        <span className="vd-review__author">{r.author}</span>
                        <span className="vd-review__stars">{'★'.repeat(r.rating)}{'☆'.repeat(5 - r.rating)}</span>
                      </div>
                      {r.title && <h4 className="vd-review__title">{r.title}</h4>}
                      {r.body && <p className="vd-review__body">{r.body}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <aside className="vd-detail-sidebar">
            {pricing.length > 0 && (
              <div className="vd-sidebar-card">
                <h3>Pricing</h3>
                {pricing.map(p => (
                  <div key={p.pricing_id} className="vd-pricing-row">
                    <span className="vd-pricing-label">{p.label}</span>
                    <span className="vd-pricing-val">${Number(p.price_per_hour).toFixed(2)}/hr</span>
                    <span className="vd-pricing-range">{p.min_hours}-{p.max_hours}h</span>
                  </div>
                ))}
              </div>
            )}

            {packages.length > 0 && (
              <div className="vd-sidebar-card">
                <h3>Packages</h3>
                {packages.map(pk => (
                  <div key={pk.package_id} className="vd-package-row">
                    <strong>{pk.name}</strong>
                    <span>${Number(pk.flat_price).toFixed(2)} for {pk.hours_included}h</span>
                    {pk.discount_pct > 0 && <span className="vd-badge vd-badge--confirmed">{pk.discount_pct}% off</span>}
                    {pk.description && <p>{pk.description}</p>}
                  </div>
                ))}
              </div>
            )}

            <div className="vd-sidebar-card">
              {bookSuccess ? (
                <div className="success-message">
                  Booking submitted! The vendor will review your request.
                  <Link to="/bookings" className="vd-btn vd-btn--primary" style={{ marginTop: 12, display: 'block', textAlign: 'center' }}>
                    View My Bookings
                  </Link>
                </div>
              ) : showBooking ? (
                <div className="vd-book-form">
                  <h3>Book This Venue</h3>
                  {bookError && <div className="error-message">{bookError}</div>}
                  <div className="form-group">
                    <label className="form-label">Event Date</label>
                    <input type="date" className="form-input" value={bookForm.event_date}
                      onChange={e => setBookForm(p => ({ ...p, event_date: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Start Time</label>
                    <input type="time" className="form-input" value={bookForm.start_time}
                      onChange={e => setBookForm(p => ({ ...p, start_time: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">End Time</label>
                    <input type="time" className="form-input" value={bookForm.end_time}
                      onChange={e => setBookForm(p => ({ ...p, end_time: e.target.value }))} />
                  </div>
                  {packages.length > 0 && (
                    <div className="form-group">
                      <label className="form-label">Package (optional)</label>
                      <select className="form-input" value={bookForm.package_id}
                        onChange={e => setBookForm(p => ({ ...p, package_id: e.target.value }))}>
                        <option value="">No package</option>
                        {packages.map(pk => (
                          <option key={pk.package_id} value={pk.package_id}>
                            {pk.name} - ${Number(pk.flat_price).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <textarea className="form-input" rows={2} value={bookForm.notes}
                      onChange={e => setBookForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Any special requirements..." />
                  </div>
                  <div className="vd-form-actions">
                    <button className="vd-btn vd-btn--primary" onClick={handleBook}>Submit Booking</button>
                    <button className="vd-btn vd-btn--outline" onClick={() => setShowBooking(false)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button className="vd-btn vd-btn--primary" style={{ width: '100%' }}
                  onClick={() => user ? setShowBooking(true) : navigate('/login')}>
                  Book This Venue
                </button>
              )}
            </div>

            <p className="vd-sidebar-vendor">Hosted by <strong>{venue.vendor_name}</strong></p>
          </aside>
        </div>
      </main>
    </div>
  )
}
