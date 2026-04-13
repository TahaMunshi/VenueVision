import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import './Vendor.css'

interface Booking {
  booking_id: number
  venue_name: string
  customer_name: string
  event_date: string
  start_time: string
  end_time: string
  total_hours: number
  total_price: number
  status: string
  customer_notes: string
}

export default function VendorBookings() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [filter, setFilter] = useState('')
  const [loading, setLoading] = useState(true)
  const API = getApiBaseUrl()

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    const qs = filter ? `?status=${filter}` : ''
    const res = await fetch(`${API}/api/v1/bookings${qs}`, { headers: getAuthHeaders() })
    if (res.ok) { const d = await res.json(); setBookings(d.bookings || []) }
    setLoading(false)
  }

  async function updateStatus(id: number, status: string) {
    await fetch(`${API}/api/v1/bookings/${id}`, {
      method: 'PATCH',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    load()
  }

  return (
    <div className="vd-page">
      <header className="vd-header">
        <div className="vd-header__inner">
          <h1 className="vd-header__title">Bookings</h1>
          <div className="vd-header__actions">
            <Link to="/vendor" className="vd-btn vd-btn--outline">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="vd-main">
        <div className="vd-filter-bar">
          {['', 'pending', 'confirmed', 'rejected', 'cancelled'].map(f => (
            <button key={f} className={`vd-filter-btn ${filter === f ? 'vd-filter-btn--active' : ''}`}
              onClick={() => setFilter(f)}>
              {f || 'All'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="vd-loading"><div className="vd-spinner" /></div>
        ) : bookings.length === 0 ? (
          <p className="vd-empty">No bookings found.</p>
        ) : (
          <div className="vd-table-wrap">
            <table className="vd-table">
              <thead>
                <tr>
                  <th>Venue</th><th>Customer</th><th>Date</th><th>Time</th>
                  <th>Hours</th><th>Price</th><th>Status</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map(b => (
                  <tr key={b.booking_id}>
                    <td>{b.venue_name}</td>
                    <td>{b.customer_name}</td>
                    <td>{b.event_date}</td>
                    <td>{b.start_time} - {b.end_time}</td>
                    <td>{b.total_hours}h</td>
                    <td>${b.total_price}</td>
                    <td><span className={`vd-badge vd-badge--${b.status}`}>{b.status}</span></td>
                    <td>
                      {b.status === 'pending' && (
                        <div className="vd-action-btns">
                          <button className="vd-btn vd-btn--sm vd-btn--primary" onClick={() => updateStatus(b.booking_id, 'confirmed')}>Confirm</button>
                          <button className="vd-btn vd-btn--sm vd-btn--danger" onClick={() => updateStatus(b.booking_id, 'rejected')}>Reject</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
