import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './ObjectRemoval.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'

const ObjectRemoval = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const imgRef = useRef<HTMLImageElement>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const API_BASE_URL = getApiBaseUrl()

  const loadImage = useCallback(async () => {
    if (!venueId || !wallId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall-images`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (data.status === 'success' && data.wall_images?.[wallId!]) {
        const path = data.wall_images[wallId!]
        setImageUrl(path.startsWith('http') ? path : `${API_BASE_URL}${path}`)
      } else {
        setError('No stitched image found. Stitch the wall first.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load image')
    } finally {
      setLoading(false)
    }
  }, [venueId, wallId, API_BASE_URL])

  useEffect(() => {
    loadImage()
  }, [loadImage])

  const getClickCoords = (e: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current
    if (!img) return null
    const rect = img.getBoundingClientRect()
    const scaleX = img.naturalWidth / rect.width
    const scaleY = img.naturalHeight / rect.height
    const x = Math.round((e.clientX - rect.left) * scaleX)
    const y = Math.round((e.clientY - rect.top) * scaleY)
    return { x, y }
  }

  const handleImageClick = async (e: React.MouseEvent<HTMLImageElement>) => {
    if (!venueId || !wallId || isRemoving) return
    const coords = getClickCoords(e)
    if (!coords) return

    setIsRemoving(true)
    setError(null)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/remove-object`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ x: coords.x, y: coords.y }),
        }
      )
      const data = await res.json()
      if (data.status === 'success' && data.url) {
        setImageUrl(`${API_BASE_URL}${data.url}`)
      } else {
        setError(data.message || 'Removal failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed')
    } finally {
      setIsRemoving(false)
    }
  }

  const handleProceedToCorners = () => {
    navigate(`/edit/${venueId}/${wallId}?step=corners`)
  }

  const handleBack = () => {
    navigate(`/review/${venueId}/${wallId}`)
  }

  if (loading && !imageUrl) {
    return (
      <div className="object-removal-container">
        <div className="object-removal-loading">Loading stitched image...</div>
      </div>
    )
  }

  if (error && !imageUrl) {
    return (
      <div className="object-removal-container">
        <div className="object-removal-header">
          <button onClick={() => navigate(`/capture/${venueId}`)} className="back-btn">
            ← Back
          </button>
        </div>
        <div className="object-removal-error">{error}</div>
        <button onClick={() => navigate(`/review/${venueId}/${wallId}`)} className="action-btn primary">
          Go to Segment Review
        </button>
      </div>
    )
  }

  return (
    <div className="object-removal-container">
      <div className="object-removal-header">
        <button onClick={handleBack} className="back-btn">
          ← Back
        </button>
        <h1>Remove Objects</h1>
        <p className="object-removal-subtitle">
          Click on furniture or objects to remove them. Then proceed to select the 4 corners.
        </p>
      </div>

      <div className="object-removal-content">
        <div className="object-removal-image-wrap">
          <img
            ref={imgRef}
            src={imageUrl || undefined}
            alt="Stitched wall"
            className={`object-removal-image ${isRemoving ? 'removing' : ''}`}
            onClick={handleImageClick}
            style={{ cursor: isRemoving ? 'wait' : 'crosshair' }}
          />
          {isRemoving && (
            <div className="object-removal-overlay">
              <span>Removing...</span>
            </div>
          )}
        </div>

        {error && <div className="object-removal-error">{error}</div>}

        <div className="object-removal-actions">
          <button
            onClick={handleProceedToCorners}
            className="action-btn primary"
          >
            Proceed to 4 Corners →
          </button>
          <button onClick={handleBack} className="action-btn secondary">
            Back to Segment Review
          </button>
        </div>
      </div>
    </div>
  )
}

export default ObjectRemoval
