import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './VenuesList.css'
import { getApiBaseUrl } from '../../utils/api'
import CreateVenueModal from './CreateVenueModal'

interface Venue {
  venue_id: number
  venue_identifier: string
  venue_name: string
  width: number
  height: number
  depth: number
  created_at: string
  updated_at: string
}

const VenuesList = () => {
  const navigate = useNavigate()
  const [venues, setVenues] = useState<Venue[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    // Check if user is logged in
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (!token || !userData) {
      navigate('/login')
      return
    }

    setUser(JSON.parse(userData))

    // Fetch user's venues
    fetchVenues()
  }, [navigate])

  const fetchVenues = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/venues`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setVenues(data.venues || [])
      } else if (response.status === 401) {
        // Token expired or invalid
        localStorage.clear()
        navigate('/login')
      }
    } catch (err) {
      console.error('Error fetching venues:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = () => {
    localStorage.clear()
    navigate('/login')
  }

  const handleCreateVenue = () => {
    setShowCreateModal(true)
  }

  const handleCreateSuccess = (venueId: string) => {
    setShowCreateModal(false)
    // Refresh venues list
    fetchVenues()
    // Navigate to new venue
    navigate(`/venue/${venueId}`)
  }

  const handleVenueClick = (venueIdentifier: string) => {
    navigate(`/venue/${venueIdentifier}`)
  }

  const handleDeleteVenue = async (e: React.MouseEvent, venue: Venue) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${venue.venue_name}"? This will remove the venue and all its data (walls, images, layout). This cannot be undone.`)) {
      return
    }
    setDeletingId(venue.venue_identifier)
    setMessage(null)
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/venues/${venue.venue_identifier}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setMessage({ text: 'Venue deleted successfully.', type: 'success' })
        fetchVenues()
      } else {
        setMessage({ text: data.error || 'Failed to delete venue', type: 'error' })
      }
    } catch (err) {
      console.error('Delete venue error:', err)
      setMessage({ text: 'Failed to delete venue.', type: 'error' })
    } finally {
      setDeletingId(null)
    }
  }

  const getUserInitials = () => {
    if (!user) return '?'
    if (user.full_name) {
      const names = user.full_name.split(' ')
      return names.map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    }
    return user.username[0].toUpperCase()
  }

  if (loading) {
    return (
      <div className="venues-container">
        <div className="venues-header">
          <div className="venues-header-left">
            <h1>VenueVision</h1>
          </div>
        </div>
        <div className="loading-state">
          <div className="loading-spinner"></div>
          <p>Loading your venues...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="venues-container">
      {showCreateModal && (
        <CreateVenueModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}
      
      <div className="venues-header">
        <div className="venues-header-left">
          <h1>VenueVision</h1>
          <p>Create and manage your event spaces</p>
        </div>
        <div className="venues-header-right">
          <button onClick={() => navigate('/assets')} className="assets-button">
            📦 My Assets
          </button>
          {user && (
            <div className="user-info">
              <div className="user-avatar">{getUserInitials()}</div>
              <span className="user-name">{user.username}</span>
            </div>
          )}
          <button onClick={handleLogout} className="logout-button">
            Logout
          </button>
        </div>
      </div>

      <div className="venues-content">
        <div className="venues-actions">
          <h2 className="venues-title">My Venues</h2>
          <button onClick={handleCreateVenue} className="create-venue-button">
            <span>➕</span>
            Create New Venue
          </button>
        </div>

        {venues.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🏢</div>
            <h3 className="empty-title">No venues yet</h3>
            <p className="empty-subtitle">
              Create your first venue to get started
            </p>
            <button onClick={handleCreateVenue} className="create-venue-button">
              <span>➕</span>
              Create Your First Venue
            </button>
          </div>
        ) : (
          <div className="venues-grid">
            {venues.map((venue) => (
              <div
                key={venue.venue_id}
                className="venue-card"
                onClick={() => handleVenueClick(venue.venue_identifier)}
              >
                <div className="venue-card-header">
                  <div>
                    <h3 className="venue-card-title">{venue.venue_name}</h3>
                    <p className="venue-card-meta">
                      Created {new Date(venue.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="venue-card-header-actions">
                    <button
                      type="button"
                      className="venue-delete-button"
                      onClick={(e) => handleDeleteVenue(e, venue)}
                      disabled={deletingId === venue.venue_identifier}
                      title="Delete venue"
                    >
                      {deletingId === venue.venue_identifier ? '…' : '🗑️'}
                    </button>
                    <div className="venue-icon">🏢</div>
                  </div>
                </div>
                <div className="venue-card-stats">
                  <div className="venue-stat">
                    <span className="venue-stat-label">Width</span>
                    <span className="venue-stat-value">{venue.width}m</span>
                  </div>
                  <div className="venue-stat">
                    <span className="venue-stat-label">Depth</span>
                    <span className="venue-stat-value">{venue.depth}m</span>
                  </div>
                  <div className="venue-stat">
                    <span className="venue-stat-label">Height</span>
                    <span className="venue-stat-value">{venue.height}m</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {message && (
          <div className={`venues-message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}

export default VenuesList
