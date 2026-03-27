import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './SegmentReview.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import GuidedFlowStepper from '../../components/GuidedFlowStepper'
import PageNavBar from '../../components/PageNavBar'

const SegmentReview = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const [segments, setSegments] = useState<string[]>([])
  const [rotations, setRotations] = useState<number[]>([])
  const [manualOverlaps, setManualOverlaps] = useState<number[]>([])
  const [stitchedUrl, setStitchedUrl] = useState<string | null>(null)
  const [isStitching, setIsStitching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  /** True while overlap estimates are fetched (thumbnails already visible). */
  const [overlapLoading, setOverlapLoading] = useState(false)

  const API_BASE_URL = getApiBaseUrl()

  const fetchSegments = useCallback(async () => {
    if (!venueId || !wallId) return
    setLoading(true)
    setError(null)
    let coreOk = false
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/segments`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (data.status === 'success') {
        coreOk = true
        const segs = data.segments || []
        setSegments(segs)
        const n = segs.length
        setRotations(new Array(n).fill(0))
        if (n >= 2) {
          setManualOverlaps(new Array(n - 1).fill(200))
        } else {
          setManualOverlaps([])
        }
      } else {
        setError(data.message || 'Failed to load segments')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }

    if (!coreOk) return

    setOverlapLoading(true)
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/segments?overlaps=true`,
        { headers: getAuthHeaders() }
      )
      const data = await res.json()
      if (data.status === 'success' && data.overlap_estimates?.length) {
        setManualOverlaps([...data.overlap_estimates])
      }
    } catch {
      /* keep placeholder overlaps */
    } finally {
      setOverlapLoading(false)
    }
  }, [venueId, wallId, API_BASE_URL])

  useEffect(() => {
    fetchSegments()
  }, [fetchSegments])

  const fullUrl = (path: string) =>
    path.startsWith('http') ? path : `${API_BASE_URL}${path}`

  const handleRotate = (index: number, delta: number) => {
    if (index === 0) return
    setRotations((prev) => {
      const next = [...prev]
      next[index] = Math.max(-5, Math.min(5, (next[index] || 0) + delta))
      return next
    })
  }

  const handleOverlapChange = (seamIndex: number, value: number) => {
    setManualOverlaps((prev) => {
      const next = [...prev]
      next[seamIndex] = Math.max(0, value)
      return next
    })
  }

  const handleStitch = async () => {
    if (!venueId || !wallId || segments.length === 0) return
    setIsStitching(true)
    setError(null)
    setStitchedUrl(null)
    try {
      const body: { rotations?: number[]; manual_overlaps?: number[] } = {}
      if (rotations.some((r) => r !== 0)) body.rotations = rotations
      if (manualOverlaps.length > 0) body.manual_overlaps = manualOverlaps
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/stitch`,
        {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      )
      const data = await res.json()
      if (data.status === 'success' && data.image_url) {
        setStitchedUrl(data.image_url)
      } else {
        setError(data.message || 'Stitching failed')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Stitching failed')
    } finally {
      setIsStitching(false)
    }
  }

  if (loading) {
    return (
      <div className="segment-review-container">
        {venueId && <PageNavBar variant="dark" venueId={venueId} title="Stitch & review" backLabel="Back" />}
        <div className="segment-review-loading">Loading segments...</div>
      </div>
    )
  }

  if (error && segments.length === 0) {
    return (
      <div className="segment-review-container">
        {venueId && (
          <PageNavBar variant="dark" venueId={venueId} title="Stitch & review" backLabel="Back" />
        )}
        {venueId && wallId && (
          <GuidedFlowStepper venueId={venueId} wallId={wallId} active="review" />
        )}
        <div className="segment-review-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="segment-review-container">
      {venueId && (
        <PageNavBar variant="dark" venueId={venueId} title="Stitch & review" backLabel="Back" />
      )}
      {venueId && wallId && (
        <GuidedFlowStepper venueId={venueId} wallId={wallId} active="review" />
      )}
      <div className="segment-review-heading">
        <h1 className="segment-review-title">Wall: {wallId}</h1>
        <p className="segment-review-subtitle">
          {segments.length} photo{segments.length !== 1 ? 's' : ''} — adjust overlap and rotation, then stitch
        </p>
        {overlapLoading && (
          <p className="segment-review-overlap-hint" role="status">
            Refining overlap estimates…
          </p>
        )}
      </div>

      <div className="segment-review-content">
        {/* Side-by-side segment display */}
        <div className="segments-preview">
          <div className="segments-row">
            {segments.map((url, i) => (
              <div key={i} className="segment-cell">
                <div className="segment-label">
                  Photo {i + 1} {i === 0 ? '(full)' : '(cropped)'}
                </div>
                <div className="segment-image-wrap">
                  <img
                    src={fullUrl(url)}
                    alt={`Segment ${i + 1}`}
                    className="segment-thumb"
                  />
                  {i > 0 && (manualOverlaps[i - 1] ?? 0) > 0 && (
                    <div
                      className="crop-indicator"
                      style={{
                        width: `${Math.min(40, ((manualOverlaps[i - 1] || 0) / 400) * 100)}%`,
                      }}
                      title={`${manualOverlaps[i - 1] || 0}px overlap (cropped from left)`}
                    />
                  )}
                </div>
                {i > 0 && (
                  <div className="segment-controls">
                    <button
                      type="button"
                      onClick={() => handleRotate(i, -5)}
                      className="rot-btn"
                      title="Rotate -5°"
                    >
                      ↶ -5°
                    </button>
                    <span className="rot-value">{(rotations[i] || 0)}°</span>
                    <button
                      type="button"
                      onClick={() => handleRotate(i, 5)}
                      className="rot-btn"
                      title="Rotate +5°"
                    >
                      +5° ↷
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Overlap sliders for each seam */}
        {segments.length >= 2 && (
          <div className="overlap-controls">
            <h3>Overlap adjustment (crop from right photo)</h3>
            {manualOverlaps.map((val, i) => (
              <div key={i} className="overlap-slider-row">
                <label>Seam {i + 1}:</label>
                <input
                  type="range"
                  min="0"
                  max={Math.max(2000, val + 400)}
                  value={val}
                  onChange={(e) => handleOverlapChange(i, Number(e.target.value))}
                />
                <span>{val}px</span>
              </div>
            ))}
          </div>
        )}

        {/* Stitch button */}
        <div className="stitch-actions">
          <button
            onClick={handleStitch}
            disabled={isStitching || segments.length === 0}
            className="stitch-btn"
          >
            {isStitching ? 'Stitching…' : 'Stitch & Apply'}
          </button>
          <p className="long-op-hint">
            {isStitching
              ? 'Aligning and blending photos can take 30–90 seconds. Please keep this tab open.'
              : 'Stitching runs on the server and may take up to a minute for many segments.'}
          </p>
        </div>

        {error && <div className="segment-review-error">{error}</div>}

        {stitchedUrl && (
          <div className="stitched-result">
            <h3>Stitched result</h3>
            <img src={fullUrl(stitchedUrl)} alt="Stitched wall" className="stitched-preview" />
            <div className="stitched-actions">
              <button
                type="button"
                onClick={() => navigate(`/remove/${venueId}/${wallId}`)}
                className="action-btn primary"
                title="Next step: tap objects on the stitched image to remove them (AI inpaint)"
              >
                Next: remove objects
              </button>
              <button
                type="button"
                onClick={() => navigate(`/edit/${venueId}/${wallId}?step=corners`)}
                className="action-btn secondary"
                title="Skip cleanup — go straight to the 4-corner editor for this wall"
              >
                Skip to 4-corner editor
              </button>
              <button
                type="button"
                onClick={() => navigate(`/capture/${venueId}`)}
                className="action-btn secondary"
                title="Return to guided camera capture for this venue"
              >
                Back to guided capture
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SegmentReview
