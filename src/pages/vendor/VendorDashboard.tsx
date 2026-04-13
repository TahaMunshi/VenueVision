import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import './Vendor.css'

interface Stats {
  total_venues: number
  published_venues: number
  pending_bookings: number
  confirmed_bookings: number
  total_revenue: number
  total_reviews: number
}

interface RecentBooking {
  booking_id: number
  event_date: string
  status: string
  total_price: number
  venue_name: string
  customer_name: string
}

export default function VendorDashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<RecentBooking[]>([])
  const [loading, setLoading] = useState(true)

  const API = getApiBaseUrl()

  useEffect(() => {
    fetchDashboard()
  }, [])

  async function fetchDashboard() {
    try {
      const res = await fetch(`${API}/api/v1/vendor/dashboard`, { headers: getAuthHeaders() })
      if (res.ok) {
        const data = await res.json()
        setStats(data.stats)
        setRecent(data.recent_bookings || [])
      }
    } catch { /* */ }
    setLoading(false)
  }

  const handleLogout = () => { logout(); navigate('/login') }

  if (loading) return <div className="vd-loading"><div className="vd-spinner" /></div>

  return (
    <div className="vd-page">
      <header className="vd-header">
        <div className="vd-header__inner">
          <div>
            <h1 className="vd-header__title">Vendor Dashboard</h1>
            <p className="vd-header__sub">Welcome back, {user?.business_name || user?.full_name || user?.username}</p>
          </div>
          <div className="vd-header__actions">
            <Link to="/vendor/venues" className="vd-btn vd-btn--primary">My Venues</Link>
            <Link to="/vendor/bookings" className="vd-btn vd-btn--outline">Bookings</Link>
            <Link to="/assets" className="vd-btn vd-btn--outline">Assets</Link>
            <button onClick={handleLogout} className="vd-btn vd-btn--ghost">Logout</button>
          </div>
        </div>
      </header>

      <main className="vd-main">
        {stats && (
          <div className="vd-stats">
            <div className="vd-stat-card">
              <span className="vd-stat-card__value">{stats.total_venues}</span>
              <span className="vd-stat-card__label">Total Venues</span>
            </div>
            <div className="vd-stat-card vd-stat-card--accent">
              <span className="vd-stat-card__value">{stats.published_venues}</span>
              <span className="vd-stat-card__label">Published</span>
            </div>
            <div className="vd-stat-card vd-stat-card--warn">
              <span className="vd-stat-card__value">{stats.pending_bookings}</span>
              <span className="vd-stat-card__label">Pending Bookings</span>
            </div>
            <div className="vd-stat-card vd-stat-card--success">
              <span className="vd-stat-card__value">{stats.confirmed_bookings}</span>
              <span className="vd-stat-card__label">Confirmed</span>
            </div>
            <div className="vd-stat-card vd-stat-card--revenue">
              <span className="vd-stat-card__value">${stats.total_revenue.toLocaleString()}</span>
              <span className="vd-stat-card__label">Revenue</span>
            </div>
            <div className="vd-stat-card">
              <span className="vd-stat-card__value">{stats.total_reviews}</span>
              <span className="vd-stat-card__label">Reviews</span>
            </div>
          </div>
        )}

        <div className="vd-dashboard-grid">
          <section className="vd-section">
            <div className="vd-section__header">
              <h2>Recent Bookings</h2>
              <Link to="/vendor/bookings" className="vd-link">View all</Link>
            </div>
            {recent.length === 0 ? (
              <p className="vd-empty">No bookings yet. Publish a venue to start receiving bookings.</p>
            ) : (
              <div className="vd-table-wrap">
                <table className="vd-table">
                  <thead>
                    <tr>
                      <th>Venue</th><th>Customer</th><th>Date</th><th>Price</th><th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent.map(b => (
                      <tr key={b.booking_id}>
                        <td>{b.venue_name}</td>
                        <td>{b.customer_name}</td>
                        <td>{b.event_date}</td>
                        <td>${b.total_price}</td>
                        <td><span className={`vd-badge vd-badge--${b.status}`}>{b.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="vd-section">
            <div className="vd-section__header">
              <h2>Quick Actions</h2>
            </div>
            <div className="vd-actions-grid">
              <Link to="/vendor/venues/new" className="vd-action-card">
                <span className="vd-action-card__icon">+</span>
                <span className="vd-action-card__label">Create New Venue</span>
              </Link>
              <Link to="/vendor/venues" className="vd-action-card">
                <span className="vd-action-card__icon">🏢</span>
                <span className="vd-action-card__label">Manage Venues</span>
              </Link>
              <Link to="/vendor/bookings" className="vd-action-card">
                <span className="vd-action-card__icon">📋</span>
                <span className="vd-action-card__label">View Bookings</span>
              </Link>
              <Link to="/assets" className="vd-action-card">
                <span className="vd-action-card__icon">🪑</span>
                <span className="vd-action-card__label">Asset Library</span>
              </Link>
            </div>
          </section>
        </div>
      </main>
    </div>
  )
}
