import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallSelector.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import PageNavBar from '../../components/PageNavBar'

type Wall = {
  id: string
  name: string
}

const WallSelector = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const [walls, setWalls] = useState<Wall[]>([])
  const [loading, setLoading] = useState(true)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    const fetchWalls = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/progress`, {
          headers: getAuthHeaders()
        })
        const data = await response.json()
        
        if (data.walls && Array.isArray(data.walls)) {
          setWalls(data.walls)
        } else {
          // Default walls if API doesn't return them
          setWalls([
            { id: 'wall_north', name: 'North Wall' },
            { id: 'wall_east', name: 'East Wall' },
            { id: 'wall_south', name: 'South Wall' },
            { id: 'wall_west', name: 'West Wall' }
          ])
        }
      } catch (err) {
        console.error('Error fetching walls:', err)
        // Use default walls on error
        setWalls([
          { id: 'wall_north', name: 'North Wall' },
          { id: 'wall_east', name: 'East Wall' },
          { id: 'wall_south', name: 'South Wall' },
          { id: 'wall_west', name: 'West Wall' }
        ])
      } finally {
        setLoading(false)
      }
    }

    if (venueId) {
      fetchWalls()
    }
  }, [venueId, API_BASE_URL])

  const handleWallSelect = (wallId: string) => {
    navigate(`/edit/${venueId}/${wallId}`)
  }

  const handleView3D = () => {
    // Navigate to 3D viewer - it will handle missing textures gracefully
    navigate(`/view/${venueId}`)
  }

  if (loading) {
    return (
      <div className="wall-selector-container">
        <div className="loading">Loading walls...</div>
      </div>
    )
  }

  return (
    <div className="wall-selector-container">
      <PageNavBar variant="dark" venueId={venueId} title="Wall editor — choose a wall" backLabel="Back" />
      <p className="wall-selector-lead">Venue: {venueId} — open a wall to adjust texture corners</p>

      <div className="wall-selector-content">
        <div className="walls-grid">
          {walls.map((wall) => (
            <div key={wall.id} className="wall-card">
              <h3>{wall.name}</h3>
              <p>Wall ID: {wall.id}</p>
              <div className="wall-card-actions">
                <button
                  type="button"
                  onClick={() => navigate(`/capture/${venueId}?wall=${encodeURIComponent(wall.id)}`)}
                  className="wall-button"
                  title="Open guided capture with this wall selected"
                >
                  Capture / camera
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/upload/${venueId}/${wall.id}`)}
                  className="wall-button"
                  title="Upload photos from files for this wall"
                >
                  Upload images
                </button>
                <button
                  type="button"
                  onClick={() => navigate(`/review/${venueId}/${wall.id}`)}
                  className="wall-button"
                  title="Stitch captured segments"
                >
                  Stitch
                </button>
                <button
                  type="button"
                  onClick={() => handleWallSelect(wall.id)}
                  className="wall-button"
                  title={`Open corner & crop editor for ${wall.name}`}
                >
                  Edit corners
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="actions-section">
          <button
            type="button"
            onClick={() => navigate(`/planner/${venueId}`)}
            className="action-button primary"
            style={{ marginBottom: '0.5rem' }}
            title="Go to 2D floor planner for this venue"
          >
            Open 2D floor planner
          </button>
          <button
            type="button"
            onClick={handleView3D}
            className="action-button primary"
            title="Open 3D viewer for this venue"
          >
            Open 3D space viewer
          </button>
        </div>
      </div>
    </div>
  )
}

export default WallSelector

