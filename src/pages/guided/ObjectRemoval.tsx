import { useState, useRef, useCallback, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './ObjectRemoval.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import GuidedFlowStepper from '../../components/GuidedFlowStepper'
import PageNavBar from '../../components/PageNavBar'

const ObjectRemoval = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const imgRef = useRef<HTMLImageElement>(null)

  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [isRemoving, setIsRemoving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [removeElapsedSec, setRemoveElapsedSec] = useState(0)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    if (!isRemoving) {
      setRemoveElapsedSec(0)
      return
    }
    const t0 = Date.now()
    const id = window.setInterval(() => {
      setRemoveElapsedSec(Math.floor((Date.now() - t0) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [isRemoving])

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
      if (data.status === 'success') {
        if (data.inpainted === false) {
          setError(data.warning || data.message || 'Inpainting did not change the image. Check server logs and INPAINT_SPACE_URL / HF_TOKEN.')
        } else if (data.url) {
          setImageUrl(`${API_BASE_URL}${data.url}`)
          setError(null)
        } else {
          setError(data.message || 'Unexpected response from server.')
        }
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

  if (loading && !imageUrl) {
    return (
      <div className="object-removal-container">
        {venueId && (
          <PageNavBar variant="dark" venueId={venueId} title="Remove objects" backLabel="Back" />
        )}
        <div className="object-removal-loading">Loading stitched image...</div>
      </div>
    )
  }

  if (error && !imageUrl) {
    return (
      <div className="object-removal-container">
        {venueId && (
          <PageNavBar variant="dark" venueId={venueId} title="Remove objects" backLabel="Back" />
        )}
        {venueId && wallId && (
          <GuidedFlowStepper venueId={venueId} wallId={wallId} active="remove" linkCaptureToWall />
        )}
        <div className="object-removal-error">{error}</div>
        <button
          type="button"
          onClick={() => navigate(`/review/${venueId}/${wallId}`)}
          className="action-btn primary"
          title="Go back to stitch & review for this wall"
        >
          Go to stitch & review
        </button>
      </div>
    )
  }

  return (
    <div className="object-removal-container">
      {venueId && (
        <PageNavBar variant="dark" venueId={venueId} title="Remove objects" backLabel="Back" />
      )}
      {venueId && wallId && (
        <GuidedFlowStepper venueId={venueId} wallId={wallId} active="remove" linkCaptureToWall />
      )}
      <div className="object-removal-header">
        <p className="object-removal-subtitle">
          Click on furniture or objects to remove them. Then go to the corner editor when you are done.
        </p>
        <details className="object-removal-tips">
          <summary>Tips</summary>
          <ul>
            <li>
              Each click runs on a remote AI (segment + inpaint). Expect <strong>1–5 minutes</strong> if the
              Hugging Face Space was idle (cold start), or ~30–90s when warm.
            </li>
            <li>Use Wi‑Fi when possible; mobile + ngrok adds latency.</li>
            <li>You can skip to corners if no cleanup is needed.</li>
          </ul>
        </details>
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
              <span>
                Removing… {removeElapsedSec > 0 ? `${removeElapsedSec}s — ` : ''}
                remote AI can take several minutes when cold. Keep this tab open.
              </span>
            </div>
          )}
        </div>

        {error && <div className="object-removal-error">{error}</div>}

        <div className="object-removal-actions">
          <button
            type="button"
            onClick={handleProceedToCorners}
            className="action-btn primary"
            title="Open the 4-corner editor for this wall (next step after cleanup)"
          >
            Next: corner editor (4 corners)
          </button>
        </div>
      </div>
    </div>
  )
}

export default ObjectRemoval
