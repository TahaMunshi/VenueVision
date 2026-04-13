import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import './WallEditor.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import GuidedFlowStepper from '../../components/GuidedFlowStepper'
import PageNavBar from '../../components/PageNavBar'

type CornerPoint = [number, number]

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

const getDefaultCropPoints = (imgWidth: number, imgHeight: number): CornerPoint[] => {
  const pad = Math.max(20, Math.round(Math.min(imgWidth, imgHeight) * 0.06))
  return [
    [pad, pad],
    [imgWidth - pad, pad],
    [imgWidth - pad, imgHeight - pad],
    [pad, imgHeight - pad]
  ]
}

const fitCanvasToViewport = (
  canvas: HTMLCanvasElement,
  imgWidth: number,
  imgHeight: number,
  reserveBottomPx = 280
) => {
  const maxDisplayWidth = Math.max(320, window.innerWidth - 120)
  const maxDisplayHeight = Math.max(260, window.innerHeight - reserveBottomPx)
  const scale = Math.min(maxDisplayWidth / imgWidth, maxDisplayHeight / imgHeight)
  canvas.style.width = `${Math.round(imgWidth * scale)}px`
  canvas.style.height = `${Math.round(imgHeight * scale)}px`
}

const moveCorner = (
  index: number,
  x: number,
  y: number,
  points: CornerPoint[],
  imgWidth: number,
  imgHeight: number
): CornerPoint[] => {
  if (points.length !== 4) return points
  const next = [...points] as CornerPoint[]
  next[index] = [clamp(x, 0, imgWidth), clamp(y, 0, imgHeight)]
  return next
}

const WallEditor = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const stepCorners = searchParams.get('step') === 'corners'
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [cornerPoints, setCornerPoints] = useState<CornerPoint[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cropMode, setCropMode] = useState(!stepCorners)
  const [cornerAdjustMode, setCornerAdjustMode] = useState(stepCorners)
  /** Dragging works in either crop or corner-adjust mode (both show 4 handles). */
  const canDragCorners = cropMode || cornerAdjustMode
  const draggingIndexRef = useRef<number | null>(null)
  const cornerPointsRef = useRef<CornerPoint[]>([])

  const API_BASE_URL = getApiBaseUrl()

  // Load the existing captured image
  useEffect(() => {
    const loadWallImage = async () => {
      if (!venueId || !wallId) return

      try {
        // In corner adjust mode (or step=corners), load stitched/processed; otherwise original
        const useOriginal = !cornerAdjustMode && !stepCorners
        const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images?original=${useOriginal}`, {
          headers: getAuthHeaders()
        })
        const data = await response.json()
        
        if (data.status === 'success' && data.wall_images && data.wall_images[wallId]) {
          const imagePath = data.wall_images[wallId]
          const fullUrl = imagePath.startsWith('http') 
            ? imagePath 
            : `${API_BASE_URL}${imagePath}`
          setImageUrl(fullUrl)
          
          // Load image to canvas
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            imageRef.current = img
            // Important: initialize crop points even if canvas isn't mounted yet
            // (loading screen is shown until setIsLoading(false)).
            const defaultPoints: CornerPoint[] = getDefaultCropPoints(img.width, img.height)
            setCornerPoints(defaultPoints)
            if (stepCorners) {
              setCornerAdjustMode(true)
              setCropMode(false)
            } else {
              setCropMode(true)
              setCornerAdjustMode(false)
            }
            setIsLoading(false)
          }
          img.onerror = () => {
            setMessage({ text: 'Failed to load image', type: 'error' })
            setIsLoading(false)
          }
          img.src = fullUrl
        } else {
          setMessage({ text: 'No image found for this wall. Please capture an image first.', type: 'error' })
          setIsLoading(false)
        }
      } catch (error) {
        console.error('Error loading wall image:', error)
        setMessage({ text: 'Failed to load wall image', type: 'error' })
        setIsLoading(false)
      }
    }

    loadWallImage()
  }, [venueId, wallId, API_BASE_URL, cornerAdjustMode, stepCorners])


  const drawCornersOnCanvas = (points: CornerPoint[]) => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ensure canvas internal size matches image (should already be set, but double-check)
    if (canvas.width !== imageRef.current.width || canvas.height !== imageRef.current.height) {
      canvas.width = imageRef.current.width
      canvas.height = imageRef.current.height
      fitCanvasToViewport(
        canvas,
        imageRef.current.width,
        imageRef.current.height,
        stepCorners ? 220 : 280
      )
    }

    // Redraw the full image at full resolution
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)

    // Draw corner points
    ctx.fillStyle = '#ff0000'
    ctx.strokeStyle = '#ff0000'
    ctx.lineWidth = 3

    points.forEach((point, index) => {
      const [x, y] = point
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, 2 * Math.PI)
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.strokeStyle = '#ff0000'
      ctx.lineWidth = 3

      // Draw lines connecting corners
      if (index > 0) {
        ctx.beginPath()
        ctx.moveTo(points[index - 1][0], points[index - 1][1])
        ctx.lineTo(x, y)
        ctx.stroke()
      }
    })

    // Close the polygon
    if (points.length === 4) {
      ctx.beginPath()
      ctx.moveTo(points[3][0], points[3][1])
      ctx.lineTo(points[0][0], points[0][1])
      ctx.stroke()
    }
  }

  // Ensure canvas redraws when points or image change to avoid black/blank view
  useEffect(() => {
    if (imageRef.current && canvasRef.current) {
      fitCanvasToViewport(
        canvasRef.current,
        imageRef.current.width,
        imageRef.current.height,
        stepCorners ? 220 : 280
      )
      if (cornerPoints.length === 4) {
        drawCornersOnCanvas(cornerPoints)
      } else {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height)
          ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
        }
      }
    }
  }, [cornerPoints, imageUrl, stepCorners])

  useEffect(() => {
    cornerPointsRef.current = cornerPoints
  }, [cornerPoints])

  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      const img = imageRef.current
      if (!canvas || !img) return
      fitCanvasToViewport(canvas, img.width, img.height, stepCorners ? 220 : 280)
      if (cornerPoints.length === 4) {
        drawCornersOnCanvas(cornerPoints)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [cornerPoints, stepCorners])

  const getScaledCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const scaledX = x * scaleX
    const scaledY = y * scaleY

    return { x: scaledX, y: scaledY, scaleX, scaleY }
  }

  const getNearestPointIndex = (x: number, y: number) => {
    if (cornerPointsRef.current.length === 0) return null
    let nearestIndex = 0
    let nearestDistance = Number.POSITIVE_INFINITY
    for (let i = 0; i < cornerPointsRef.current.length; i++) {
      const [px, py] = cornerPointsRef.current[i]
      const dx = x - px
      const dy = y - py
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < nearestDistance) {
        nearestDistance = distance
        nearestIndex = i
      }
    }
    return nearestIndex
  }

  const startDrag = (clientX: number, clientY: number) => {
    if (!canDragCorners || cornerPointsRef.current.length !== 4) return

    const coords = getScaledCoordinates(clientX, clientY)
    if (!coords) return

    const pointIndex = getNearestPointIndex(coords.x, coords.y)
    if (pointIndex !== null) {
      draggingIndexRef.current = pointIndex
      setDraggingIndex(pointIndex)
      setIsDragging(true)
    }
  }

  const moveDrag = (clientX: number, clientY: number) => {
    if (!canDragCorners) return
    const activeDraggingIndex = draggingIndexRef.current
    if (activeDraggingIndex === null || !imageRef.current) return

    const coords = getScaledCoordinates(clientX, clientY)
    if (!coords) return

    setCornerPoints((prev) => {
      const next = moveCorner(
        activeDraggingIndex,
        coords.x,
        coords.y,
        prev,
        imageRef.current!.width,
        imageRef.current!.height
      )
      drawCornersOnCanvas(next)
      return next
    })
  }

  const stopDrag = () => {
    draggingIndexRef.current = null
    setDraggingIndex(null)
    setIsDragging(false)
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    startDrag(e.clientX, e.clientY)
  }

  const handleCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 0) return
    e.preventDefault()
    const touch = e.touches[0]
    startDrag(touch.clientX, touch.clientY)
  }

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => moveDrag(e.clientX, e.clientY)
    const onWindowMouseUp = () => stopDrag()
    const onWindowTouchMove = (e: TouchEvent) => {
      if (draggingIndexRef.current === null || e.touches.length === 0) return
      e.preventDefault()
      const touch = e.touches[0]
      moveDrag(touch.clientX, touch.clientY)
    }
    const onWindowTouchEnd = () => stopDrag()

    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    window.addEventListener('touchmove', onWindowTouchMove, { passive: false })
    window.addEventListener('touchend', onWindowTouchEnd)

    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
      window.removeEventListener('touchmove', onWindowTouchMove)
      window.removeEventListener('touchend', onWindowTouchEnd)
    }
  }, [canDragCorners])

  const handleReset = () => {
    if (!imageRef.current || !canvasRef.current) return
    const img = imageRef.current
    const defaultPoints: CornerPoint[] = getDefaultCropPoints(img.width, img.height)
    setCornerPoints(defaultPoints)
    drawCornersOnCanvas(defaultPoints)
    if (stepCorners) {
      setCornerAdjustMode(true)
      setCropMode(false)
    } else {
      setCropMode(true)
      setCornerAdjustMode(false)
    }
  }

  const handleReStitch = async () => {
    if (!venueId || !wallId) return
    setIsProcessing(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/stitch`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      })
      const data = await res.json()
      if (data.status === 'success') {
        setMessage({ text: 'Re-stitched successfully! Reloading...', type: 'success' })
        setCornerAdjustMode(true)
        window.location.reload()
      } else {
        setMessage({ text: data.message || 'Re-stitch failed', type: 'error' })
      }
    } catch (e) {
      setMessage({ text: 'Re-stitch failed. Please try again.', type: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApplyCorners = async () => {
    if (!venueId || !wallId || cornerPoints.length !== 4) return
    setIsProcessing(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('corner_points', JSON.stringify(cornerPoints))
      const res = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/apply-corners`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      })
      const data = await res.json()
      if (data.status === 'success') {
        setMessage({ text: 'Wall complete! Proceeding to next wall.', type: 'success' })
        setTimeout(() => navigate(`/capture/${venueId}`), 1200)
      } else {
        setMessage({ text: data.message || data.error || 'Apply corners failed', type: 'error' })
      }
    } catch (e) {
      setMessage({ text: 'Apply corners failed. Please try again.', type: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReStitchWithCorners = async () => {
    if (!venueId || !wallId || cornerPoints.length !== 4) return
    setIsProcessing(true)
    setMessage(null)
    try {
      const formData = new FormData()
      formData.append('corner_points', JSON.stringify(cornerPoints))
      const res = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall/${wallId}/restitch-with-corners`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      })
      const data = await res.json()
      if (data.status === 'success') {
        setMessage({ text: 'Re-stitched with perspective correction!', type: 'success' })
        setTimeout(() => navigate(`/view/${venueId}`), 1500)
      } else {
        setMessage({ text: data.message || data.error || 'Re-stitch failed', type: 'error' })
      }
    } catch (e) {
      setMessage({ text: 'Re-stitch failed. Please try again.', type: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleProcess = async () => {
    if (!imageRef.current || !venueId || !wallId) {
      setMessage({ text: 'Image not loaded or venue/wall IDs missing', type: 'error' })
      return
    }

    if (cornerPoints.length !== 4) {
      setMessage({ text: 'Please select exactly 4 corner points', type: 'error' })
      return
    }

    setIsProcessing(true)
    setMessage(null)

    try {
      // Upload original image bytes (without red overlay).
      let sourceBlob: Blob | null = null
      if (imageUrl) {
        const sourceResp = await fetch(imageUrl)
        if (sourceResp.ok) sourceBlob = await sourceResp.blob()
      }
      if (!sourceBlob && imageRef.current) {
        const off = document.createElement('canvas')
        off.width = imageRef.current.width
        off.height = imageRef.current.height
        const offCtx = off.getContext('2d')
        if (offCtx) {
          offCtx.drawImage(imageRef.current, 0, 0, off.width, off.height)
          sourceBlob = await new Promise<Blob | null>((resolve) =>
            off.toBlob((b) => resolve(b), 'image/jpeg', 0.95)
          )
        }
      }
      if (!sourceBlob) {
        setMessage({ text: 'Failed to prepare source image', type: 'error' })
        setIsProcessing(false)
        return
      }

      const formData = new FormData()
      formData.append('file', sourceBlob, 'wall.jpg')
      formData.append('venue_id', venueId)
      formData.append('wall_id', wallId)
      formData.append('corner_points', JSON.stringify(cornerPoints))

      const response = await fetch(`${API_BASE_URL}/api/v1/wall/process`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: formData
      })

      const data = await response.json()

      if (data.status === 'success') {
        setMessage({ text: 'Wall processed successfully!', type: 'success' })
        setTimeout(() => {
          navigate(`/view/${venueId}`)
        }, 2000)
      } else {
        setMessage({ text: data.message || 'Processing failed', type: 'error' })
        setIsProcessing(false)
      }
    } catch (error) {
      setMessage({ text: 'Failed to process wall. Please try again.', type: 'error' })
      setIsProcessing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="wall-editor-container">
        {venueId && <PageNavBar variant="dark" venueId={venueId} title="Edit wall" backLabel="Back" />}
        <div className="loading">Loading wall image...</div>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div className="wall-editor-container">
        {venueId && <PageNavBar venueId={venueId} title="Edit wall" backLabel="Back" />}
        <div className="wall-editor-meta">
          <p>
            Wall: {wallId}
          </p>
        </div>
        <div className="error-message">
          {message?.text || 'No image found for this wall. Please capture an image first.'}
        </div>
        <button
          type="button"
          onClick={() => navigate(`/capture/${venueId}`)}
          className="action-button primary"
          title="Open guided wall capture for this venue"
        >
          Go to guided capture
        </button>
      </div>
    )
  }

  return (
    <div className="wall-editor-container">
      {venueId && <PageNavBar variant="dark" venueId={venueId} title="Edit wall" backLabel="Back" />}
      {venueId && wallId && (
        <GuidedFlowStepper venueId={venueId} wallId={wallId} active="corners" linkCaptureToWall />
      )}
      <div className="wall-editor-header">
        <p className="wall-editor-wall-id">Wall: {wallId}</p>
      </div>

      <div className="wall-editor-content">
        <div className="preview-section">
          <canvas
            ref={canvasRef}
            onMouseDown={handleCanvasMouseDown}
            onMouseUp={stopDrag}
            onMouseLeave={stopDrag}
            onTouchStart={handleCanvasTouchStart}
            onTouchEnd={stopDrag}
            className="preview-canvas"
            style={{ 
              cursor: isDragging || draggingIndex !== null ? 'grabbing' : 'crosshair'
            }}
          />
          
          {cornerPoints.length === 4 && (
            <p className="instruction-text">
              {stepCorners
                ? 'Drag the red handles to match the wall edges. Then apply to finish this wall.'
                : 'Drag the red handles to outline the wall. Then process to save the texture.'}
            </p>
          )}
        </div>

        <div className="controls-section wall-editor-controls">
          {stepCorners ? (
            <>
              <p className="long-op-hint wall-editor-hint">
                {isProcessing
                  ? 'Saving perspective correction…'
                  : 'Runs on the server — keep this tab open until it finishes.'}
              </p>
              <div className="wall-editor-action-row">
                <button type="button" onClick={handleReset} className="action-button secondary">
                  Reset corners
                </button>
                <button
                  type="button"
                  onClick={handleApplyCorners}
                  disabled={isProcessing || cornerPoints.length !== 4}
                  className="action-button primary"
                >
                  {isProcessing ? 'Working…' : 'Apply & continue'}
                </button>
              </div>
              <button
                type="button"
                onClick={() => navigate(`/view/${venueId}`)}
                className="wall-editor-link-btn"
                title="Open 3D viewer for this venue"
              >
                Open 3D viewer
              </button>
            </>
          ) : (
            <>
              <div className="wall-editor-action-row">
                <button type="button" onClick={handleReset} className="action-button secondary">
                  Reset corners
                </button>
                <button
                  type="button"
                  onClick={handleProcess}
                  disabled={isProcessing || cornerPoints.length !== 4}
                  className="action-button primary"
                >
                  {isProcessing ? 'Processing…' : 'Process wall'}
                </button>
              </div>
              <details className="wall-editor-advanced">
                <summary>Advanced — only if stitching looks wrong</summary>
                <p className="wall-editor-advanced-hint">
                  Re-run segment alignment, then optionally apply corners. Usually not needed if you already
                  stitched on the review screen.
                </p>
                <div className="wall-editor-action-row wall-editor-action-row--stack">
                  <button
                    type="button"
                    onClick={handleReStitch}
                    disabled={isProcessing}
                    className="action-button secondary"
                  >
                    {isProcessing ? '…' : 'Re-stitch segments only'}
                  </button>
                  <button
                    type="button"
                    onClick={handleReStitchWithCorners}
                    disabled={isProcessing || cornerPoints.length !== 4}
                    className="action-button secondary"
                  >
                    {isProcessing ? '…' : 'Re-stitch + apply corners'}
                  </button>
                </div>
              </details>
              <button
                type="button"
                onClick={() => navigate(`/view/${venueId}`)}
                className="wall-editor-link-btn"
                title="Open 3D viewer for this venue"
              >
                Open 3D viewer
              </button>
            </>
          )}
        </div>

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}

export default WallEditor

