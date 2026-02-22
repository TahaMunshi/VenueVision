import { useCallback, useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './SegmentReview.css'
import { getApiBaseUrl } from '../../utils/api'

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

  const API_BASE_URL = getApiBaseUrl()

  const fetchSegments = useCallback(async () => {
    if (!venueId || !wallId) return
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/segments?overlaps=true`
      )
      const data = await res.json()
      if (data.status === 'success') {
        setSegments(data.segments || [])
        const est = data.overlap_estimates || []
        setManualOverlaps(est.length ? [...est] : [])
        setRotations(new Array(data.segments?.length || 0).fill(0))
      } else {
        setError(data.message || 'Failed to load segments')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
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
          headers: { 'Content-Type': 'application/json' },
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
        <div className="segment-review-loading">Loading segments...</div>
      </div>
    )
  }

  if (error && segments.length === 0) {
    return (
      <div className="segment-review-container">
        <div className="segment-review-header">
          <button onClick={() => navigate(`/capture/${venueId}`)} className="back-btn">
            ← Back
          </button>
        </div>
        <div className="segment-review-error">{error}</div>
      </div>
    )
  }

  return (
    <div className="segment-review-container">
      <div className="segment-review-header">
        <button onClick={() => navigate(`/capture/${venueId}`)} className="back-btn">
          ← Back
        </button>
        <h1>Segment Review: {wallId}</h1>
        <p className="segment-review-subtitle">
          {segments.length} photo{segments.length !== 1 ? 's' : ''} • Adjust regions and rotation for seamless stitching
        </p>
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
                  max="600"
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
            {isStitching ? 'Stitching...' : 'Stitch & Apply'}
          </button>
        </div>

        {error && <div className="segment-review-error">{error}</div>}

        {stitchedUrl && (
          <div className="stitched-result">
            <h3>Stitched result</h3>
            <img src={fullUrl(stitchedUrl)} alt="Stitched wall" className="stitched-preview" />
            <div className="stitched-actions">
              <button
                onClick={() => navigate(`/edit/${venueId}/${wallId}`)}
                className="action-btn primary"
              >
                Edit corners
              </button>
              <button
                onClick={() => navigate(`/capture/${venueId}`)}
                className="action-btn secondary"
              >
                Continue capture
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default SegmentReview
