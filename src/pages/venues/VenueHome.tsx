import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './VenueHome.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import PageNavBar from '../../components/PageNavBar'

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

type ProgressPayload = {
  total_walls: number
  completed_walls: string[]
  is_complete: boolean
}

type LayoutPayload = {
  status?: string
  /** True when layout.json exists on the server (user saved from floor planner at least once). */
  layout_file_exists?: boolean
  polygon?: unknown[] | null
  walls?: unknown[] | null
  assets?: unknown[] | null
  generated_glb?: string | null
}

/** Derive recommended-workflow checkmarks from saved layout + venue stats + capture progress. */
function computeWorkflowSteps(
  layout: LayoutPayload | null,
  venue: Venue | null,
  progress: ProgressPayload | null
): { floorPlan: boolean; guided: boolean; planner3d: boolean } {
  const poly = layout?.polygon
  const walls = layout?.walls
  const assets = layout?.assets
  const fromFile = layout?.layout_file_exists

  const floorPlan =
    Boolean(fromFile) ||
    (Array.isArray(poly) && poly.length >= 3) ||
    (Array.isArray(walls) && walls.length > 0)

  const guided = Boolean(progress?.is_complete)

  const glb = layout?.generated_glb
  const assetN = Number(venue?.asset_count ?? 0) || 0
  const planner3d =
    assetN > 0 ||
    (Array.isArray(assets) && assets.length > 0) ||
    (typeof glb === 'string' && glb.length > 0)

  return { floorPlan, guided, planner3d }
}

const VenueHome = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const [venue, setVenue] = useState<Venue | null>(null)
  const [loading, setLoading] = useState(true)
  const [deletingWallImages, setDeletingWallImages] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [progress, setProgress] = useState<ProgressPayload | null>(null)
  const [layoutData, setLayoutData] = useState<LayoutPayload | null>(null)
  const [hubLoading, setHubLoading] = useState(true)

  const workflow = useMemo(
    () => computeWorkflowSteps(layoutData, venue, progress),
    [layoutData, venue, progress]
  )

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
    setHubLoading(true)
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
        const vid = (venueId || data.venue?.venue_identifier) as string | undefined
        if (vid) {
          try {
            const [progRes, layoutRes] = await Promise.all([
              fetch(`${API_BASE_URL}/api/v1/venue/${vid}/progress`, { headers: getAuthHeaders() }),
              fetch(`${API_BASE_URL}/api/v1/venue/${vid}/layout`, { headers: getAuthHeaders() }),
            ])
            if (progRes.ok) {
              const p = await progRes.json()
              setProgress({
                total_walls: p.total_walls ?? 0,
                completed_walls: p.completed_walls ?? [],
                is_complete: Boolean(p.is_complete),
              })
            }
            if (layoutRes.ok) {
              const layout: LayoutPayload = await layoutRes.json()
              setLayoutData(layout)
            }
          } catch (e) {
            console.warn('Venue hub extra fetch:', e)
          }
        }
      } else if (response.status === 401) {
        localStorage.clear()
        navigate('/login')
      }
    } catch (err) {
      console.error('Error fetching venue:', err)
    } finally {
      setLoading(false)
      setHubLoading(false)
    }
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
        <PageNavBar venueId={venueId} title="Loading venue…" backLabel="Back" />
        <div className="venue-home-content">
          <div className="venue-home-skeleton-grid">
            <div className="venue-home-skeleton stat-skel" />
            <div className="venue-home-skeleton stat-skel" />
            <div className="venue-home-skeleton stat-skel" />
            <div className="venue-home-skeleton stat-skel" />
          </div>
        </div>
      </div>
    )
  }

  if (!venue) {
    return (
      <div className="venue-home-container">
        <PageNavBar title="Venue not found" backLabel="Back" backTo="/venues" />
      </div>
    )
  }

  return (
    <div className="venue-home-container">
      <PageNavBar
        venueId={venueId}
        title={venue.venue_name}
        backLabel="Back"
      />
      <div className="venue-home-meta">
        <p className="venue-home-subtitle">{venue.venue_identifier}</p>
      </div>

      <div className="venue-home-content">
        {/* Recommended path + primary CTA */}
        <section className="venue-workflow-section" aria-labelledby="workflow-heading">
          <h2 id="workflow-heading" className="section-title">
            Recommended workflow
          </h2>
          <p className="venue-workflow-intro">
            For a first-time setup, follow these steps in order. You can still open any tool below when you need it.
          </p>
          <ol className="venue-workflow-steps">
            <li className={workflow.floorPlan ? 'done' : ''}>
              <span className="venue-workflow-step-num">{workflow.floorPlan ? '✓' : '1'}</span>
              <span className="venue-workflow-step-text">
                <strong>Floor plan</strong> — Draw your space in the 2D planner (walls and layout).
              </span>
            </li>
            <li className={workflow.guided ? 'done' : ''}>
              <span className="venue-workflow-step-num">{workflow.guided ? '✓' : '2'}</span>
              <span className="venue-workflow-step-text">
                <strong>Guided tour</strong> — Capture each wall with the camera; then stitch, clean up, and set corners per wall.
              </span>
            </li>
            <li className={workflow.planner3d ? 'done' : ''}>
              <span className="venue-workflow-step-num">{workflow.planner3d ? '✓' : '3'}</span>
              <span className="venue-workflow-step-text">
                <strong>Floor planner &amp; 3D</strong> — Place assets or generate the 3D room, then preview in the viewer.
              </span>
            </li>
          </ol>
          <div className="venue-primary-cta">
            {hubLoading ? (
              <div className="venue-home-skeleton venue-home-skeleton-cta" />
            ) : workflow.floorPlan && workflow.guided && workflow.planner3d ? (
              <p className="venue-workflow-all-done">All recommendations completed</p>
            ) : (
              <button
                type="button"
                className="venue-primary-button"
                title={
                  !workflow.floorPlan
                    ? 'Open 2D floor planner for this venue'
                    : !workflow.guided
                      ? 'Continue with guided wall capture'
                      : 'Open floor planner — place assets or generate 3D'
                }
                onClick={() => {
                  if (!workflow.floorPlan) {
                    navigate(`/planner/${venueId}`)
                  } else if (!workflow.guided) {
                    navigate(`/capture/${venueId}`)
                  } else {
                    navigate(`/planner/${venueId}`)
                  }
                }}
              >
                {!workflow.floorPlan
                  ? 'Start with floor plan'
                  : !workflow.guided
                    ? 'Proceed to guided tour'
                    : 'Proceed to 2D planner'}
              </button>
            )}
          </div>
        </section>

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
            
            <div
              className="option-card capture"
              onClick={handleCapture}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleCapture()
              }}
              title="Go to guided wall capture (camera) for this venue"
            >
              <div className="option-icon">📸</div>
              <h3 className="option-title">Guided tour</h3>
              <p className="option-description">
                Step-by-step wall capture with camera guidance. Perfect for new venues or adding walls.
              </p>
              <span className="option-button">Start capture</span>
            </div>

            <div
              className="option-card editor"
              onClick={handleEditor}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleEditor()
              }}
              title="Open wall list — choose a wall to edit corners and crop"
            >
              <div className="option-icon">✏️</div>
              <h3 className="option-title">Wall Editor</h3>
              <p className="option-description">
                Edit individual walls, adjust corner points, and process images for accurate detection.
              </p>
              <span className="option-button">Open wall editor</span>
              <button
                type="button"
                className="delete-wall-images-button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteAllWallImages()
                }}
                disabled={deletingWallImages}
                style={{ marginTop: '10px', width: '100%' }}
              >
                {deletingWallImages ? 'Deleting…' : 'Delete all wall images'}
              </button>
              {message && (
                <div className={`venue-home-message ${message.type}`}>{message.text}</div>
              )}
            </div>

            <div
              className="option-card planner"
              onClick={handlePlanner}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handlePlanner()
              }}
              title="Open 2D floor planner — place assets and draw layout"
            >
              <div className="option-icon">📐</div>
              <h3 className="option-title">Floor Planner</h3>
              <p className="option-description">
                Arrange furniture and assets in 2D. Plan your event space layout with drag-and-drop.
              </p>
              <span className="option-button">Open floor planner</span>
            </div>

            <div
              className="option-card viewer"
              onClick={handleViewer}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') handleViewer()
              }}
              title="Open 3D viewer — walk through your venue"
            >
              <div className="option-icon">🎨</div>
              <h3 className="option-title">3D Space Viewer</h3>
              <p className="option-description">
                View your venue in immersive 3D with all walls, textures, and placed assets.
              </p>
              <span className="option-button">View in 3D</span>
            </div>

          </div>
        </div>

      </div>
    </div>
  )
}

export default VenueHome
