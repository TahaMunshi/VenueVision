import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import './Customer.css'

interface Booking {
  booking_id: number
  venue_name: string
  venue_identifier: string
  vendor_name: string
  event_date: string
  start_time: string
  end_time: string
  total_hours: number
  total_price: number
  status: string
  customer_notes: string
  vendor_notes: string
}

export default function CustomerBookings() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const API = getApiBaseUrl()

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const qs = filter ? `?status=${filter}` : ''
    try {
      const res = await fetch(`${API}/api/v1/bookings${qs}`, { headers: getAuthHeaders() })
      if (res.ok) { const d = await res.json(); setBookings(d.bookings || []) }
    } catch { /* */ }
    setLoading(false)
  }

  async function cancelBooking(id: number) {
    if (!confirm('Cancel this booking?')) return
    await fetch(`${API}/api/v1/bookings/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    load()
  }

  return (
    <div className="mp-page">
      <header className="mp-header">
        <div className="mp-header__inner">
          <h1 className="mp-header__logo">My Bookings</h1>
          <div className="mp-header__nav">
            <Link to="/marketplace" className="mp-nav-link">Marketplace</Link>
            {user?.role === 'vendor' && <Link to="/vendor" className="mp-nav-link">Vendor Panel</Link>}
          </div>
        </div>
      </header>

      <main className="vd-main" style={{ maxWidth: 1000, margin: '0 auto' }}>
        <div className="vd-filter-bar">
          {['', 'pending', 'confirmed', 'rejected', 'cancelled'].map(f => (
            <button key={f} className={`vd-filter-btn ${filter === f ? 'vd-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}>
              {f || 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="mp-loading"><div className="vd-spinner" /></div>
        ) : bookings.length === 0 ? (
          <div className="mp-no-results">
            <h3>No bookings yet</h3>
            <p>Browse the <Link to="/marketplace">marketplace</Link> to find and book venues.</p>
          </div>
        ) : (
          <div className="cb-list">
            {bookings.map(b => (
              <div key={b.booking_id} className="cb-card">
                <div className="cb-card__header">
                  <h3>{b.venue_name}</h3>
                  <span className={`vd-badge vd-badge--${b.status}`}>{b.status}</span>
                </div>
                <div className="cb-card__details">
                  <div><strong>Date:</strong> {b.event_date}</div>
                  <div><strong>Time:</strong> {b.start_time} — {b.end_time}</div>
                  <div><strong>Duration:</strong> {b.total_hours}h</div>
                  <div><strong>Price:</strong> ${b.total_price}</div>
                  <div><strong>Vendor:</strong> {b.vendor_name}</div>
                </div>
                {b.customer_notes && <p className="cb-card__notes">{b.customer_notes}</p>}
                {b.vendor_notes && <p className="cb-card__vendor-notes">Vendor: {b.vendor_notes}</p>}
                <div className="cb-card__actions">
                  {b.status === 'confirmed' && (
                    <button className="vd-btn vd-btn--primary vd-btn--sm"
                      onClick={() => navigate(`/view/${b.venue_identifier}`)}>
                      View 3D / Edit Layout
                    </button>
                  )}
                  {b.status === 'pending' && (
                    <button className="vd-btn vd-btn--danger vd-btn--sm"
                      onClick={() => cancelBooking(b.booking_id)}>
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
