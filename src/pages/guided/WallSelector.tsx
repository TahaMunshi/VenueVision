import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallSelector.css'
import { getApiBaseUrl } from '../../utils/api'

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
        const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/progress`)
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
    navigate(`/upload/${venueId}/${wallId}`)
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
      <div className="wall-selector-header">
        <button onClick={() => navigate(`/venue/${venueId}`)} className="back-button">
          ← Back to Venue
        </button>
        <h1>Wall Editor</h1>
        <p>Venue: {venueId}</p>
      </div>

      <div className="wall-selector-content">
        <div className="walls-grid">
          {walls.map((wall) => (
            <div key={wall.id} className="wall-card">
              <h3>{wall.name}</h3>
              <p>Wall ID: {wall.id}</p>
              <button
                onClick={() => handleWallSelect(wall.id)}
                className="wall-button"
                style={{ marginBottom: '0.5rem' }}
              >
                Edit Wall
              </button>
              <button
                onClick={() => navigate(`/edit/${venueId}/${wall.id}`)}
                className="wall-button"
                style={{ background: '#FF9800' }}
              >
                Adjust Corners
              </button>
            </div>
          ))}
        </div>

        <div className="actions-section">
          <button
            onClick={() => navigate(`/planner/${venueId}`)}
            className="action-button primary"
            style={{ marginBottom: '0.5rem' }}
          >
            📐 2D Floor Planner
          </button>
          <button
            onClick={handleView3D}
            className="action-button primary"
          >
            Generate & View 3D Space
          </button>
        </div>
      </div>
    </div>
  )
}

export default WallSelector

