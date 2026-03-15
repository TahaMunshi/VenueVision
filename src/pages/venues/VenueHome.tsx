import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './VenueHome.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'

interface Venue {
  venue_id: number
  venue_identifier: string
  venue_name: string
  width: number
  height: number
  depth: number
  wall_count?: number
  asset_count?: number
}

const VenueHome = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingWallImages, setDeletingWallImages] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }

    fetchVenue()
  }, [venueId, navigate])

  const fetchVenue = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/venues/${venueId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        setVenue(data.venue)
      } else if (response.status === 401) {
        localStorage.clear()
        navigate('/login')
      }
    } catch (err) {
      console.error('Error fetching venue:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleBack = () => {
    navigate('/venues')
  }

  const handleCapture = () => {
    navigate(`/capture/${venueId}`)
  }

  const handleEditor = () => {
    navigate(`/editor/${venueId}`)
  }

  const handlePlanner = () => {
    navigate(`/planner/${venueId}`)
  }

  const handleViewer = () => {
    navigate(`/view/${venueId}`)
  }

  const handleDeleteAllWallImages = async () => {
    if (!venueId || !window.confirm('Delete all wall images for this venue? Layout and floor plan will be kept. You can capture walls again later.')) {
      return
    }
    setDeletingWallImages(true)
    setMessage(null)
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      })
      const data = await response.json().catch(() => ({}))
      if (response.ok) {
        setMessage({ text: data.message || 'All wall images deleted.', type: 'success' })
        fetchVenue()
      } else {
        setMessage({ text: data.message || data.error || 'Failed to delete wall images', type: 'error' })
      }
    } catch (err) {
      console.error('Delete wall images error:', err)
      setMessage({ text: 'Failed to delete wall images.', type: 'error' })
    } finally {
      setDeletingWallImages(false)
    }
  }

  if (loading) {
    return (
      <div className="venue-home-container">
        <div className="venue-home-header">
          <div className="venue-home-header-left">
            <h1 className="venue-home-title">Loading...</h1>
          </div>
        </div>
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="venue-home-container">
        <div className="venue-home-header">
          <div className="venue-home-header-left">
            <button onClick={handleBack} className="back-button">
              ← Back
            </button>
            <div>
              <h1 className="venue-home-title">Venue Not Found</h1>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="venue-home-container">
      <div className="venue-home-header">
        <div className="venue-home-header-left">
          <button onClick={handleBack} className="back-button">
            ← Back to Venues
          </button>
          <div>
            <h1 className="venue-home-title">{venue.venue_name}</h1>
            <p className="venue-home-subtitle">{venue.venue_identifier}</p>
          </div>
        </div>
      </div>

      <div className="venue-home-content">
        {/* Venue Stats */}
        <div className="venue-stats">
          <div className="stat-card">
            <p className="stat-label">Dimensions</p>
            <p className="stat-value">
              {venue.width} × {venue.depth}
              <span className="stat-unit">m</span>
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Height</p>
            <p className="stat-value">
              {venue.height}
              <span className="stat-unit">m</span>
            </p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Walls</p>
            <p className="stat-value">{venue.wall_count || 0}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Assets</p>
            <p className="stat-value">{venue.asset_count || 0}</p>
          </div>
        </div>

        {/* Options */}
        <div className="options-section">
          <h2 className="section-title">What would you like to do?</h2>
          <div className="options-grid">
            
            <div className="option-card capture" onClick={handleCapture}>
              <div className="option-icon">📸</div>
              <h3 className="option-title">Guided Tour</h3>
              <p className="option-description">
                Step-by-step wall capture with camera guidance. Perfect for new venues or adding walls.
              </p>
              <button className="option-button">Start Capture</button>
            </div>

            <div className="option-card editor" onClick={handleEditor}>
              <div className="option-icon">✏️</div>
              <h3 className="option-title">Wall Editor</h3>
              <p className="option-description">
                Edit individual walls, adjust corner points, and process images for accurate detection.
              </p>
              <button className="option-button">Open Editor</button>
            </div>

            <div className="option-card planner" onClick={handlePlanner}>
              <div className="option-icon">📐</div>
              <h3 className="option-title">Floor Planner</h3>
              <p className="option-description">
                Arrange furniture and assets in 2D. Plan your event space layout with drag-and-drop.
              </p>
              <button className="option-button">Open Planner</button>
            </div>

            <div className="option-card viewer" onClick={handleViewer}>
              <div className="option-icon">🎨</div>
              <h3 className="option-title">3D Space Viewer</h3>
              <p className="option-description">
                View your venue in immersive 3D with all walls, textures, and placed assets.
              </p>
              <button className="option-button">View in 3D</button>
            </div>

          </div>
        </div>

        {/* Venue actions / Danger zone */}
        <div className="venue-actions-section">
          <h2 className="section-title">Venue actions</h2>
          <div className="venue-actions-buttons">
            <button
              type="button"
              className="delete-wall-images-button"
              onClick={handleDeleteAllWallImages}
              disabled={deletingWallImages}
            >
              {deletingWallImages ? 'Deleting…' : 'Delete all wall images'}
            </button>
          </div>
          {message && (
            <div className={`venue-home-message ${message.type}`}>{message.text}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default VenueHome
