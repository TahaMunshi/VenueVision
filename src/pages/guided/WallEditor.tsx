import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallEditor.css'
import { getApiBaseUrl } from '../../utils/api'

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

const fitCanvasToViewport = (canvas: HTMLCanvasElement, imgWidth: number, imgHeight: number) => {
  // Reserve vertical space for header, instructions, and controls.
  const maxDisplayWidth = Math.max(320, window.innerWidth - 120)
  const maxDisplayHeight = Math.max(260, window.innerHeight - 360)
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
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [cornerPoints, setCornerPoints] = useState<CornerPoint[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [cropMode, setCropMode] = useState(true)
  const [dragStatus, setDragStatus] = useState('idle')
  const draggingIndexRef = useRef<number | null>(null)
  const cornerPointsRef = useRef<CornerPoint[]>([])

  const API_BASE_URL = getApiBaseUrl()

  // Load the existing captured image
  useEffect(() => {
    const loadWallImage = async () => {
      if (!venueId || !wallId) return

      try {
        // Request original captured image (not processed) for corner detection
        const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images?original=true`)
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
            setCropMode(true)
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
  }, [venueId, wallId, API_BASE_URL])


  const drawCornersOnCanvas = (points: CornerPoint[]) => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Ensure canvas internal size matches image (should already be set, but double-check)
    if (canvas.width !== imageRef.current.width || canvas.height !== imageRef.current.height) {
      canvas.width = imageRef.current.width
      canvas.height = imageRef.current.height
      fitCanvasToViewport(canvas, imageRef.current.width, imageRef.current.height)
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
      fitCanvasToViewport(canvasRef.current, imageRef.current.width, imageRef.current.height)
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
  }, [cornerPoints, imageUrl])

  useEffect(() => {
    cornerPointsRef.current = cornerPoints
  }, [cornerPoints])

  useEffect(() => {
    const onResize = () => {
      const canvas = canvasRef.current
      const img = imageRef.current
      if (!canvas || !img) return
      fitCanvasToViewport(canvas, img.width, img.height)
      if (cornerPoints.length === 4) {
        drawCornersOnCanvas(cornerPoints)
      }
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [cornerPoints])

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
    if (!cropMode || cornerPointsRef.current.length !== 4) return

    const coords = getScaledCoordinates(clientX, clientY)
    if (!coords) return

    const pointIndex = getNearestPointIndex(coords.x, coords.y)
    if (pointIndex !== null) {
      draggingIndexRef.current = pointIndex
      setDraggingIndex(pointIndex)
      setIsDragging(true)
      setDragStatus(`down: corner ${pointIndex + 1}`)
    }
  }

  const moveDrag = (clientX: number, clientY: number) => {
    if (!cropMode) return
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
      setDragStatus(`move: corner ${activeDraggingIndex + 1}`)
      return next
    })
  }

  const stopDrag = () => {
    if (draggingIndexRef.current !== null) {
      setDragStatus(`up: corner ${draggingIndexRef.current + 1}`)
    } else {
      setDragStatus('idle')
    }
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
  }, [cropMode])

  const handleReset = () => {
    if (!imageRef.current || !canvasRef.current) return
    const img = imageRef.current
    const defaultPoints: CornerPoint[] = getDefaultCropPoints(img.width, img.height)
    setCornerPoints(defaultPoints)
    drawCornersOnCanvas(defaultPoints)
    setCropMode(true)
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
        <div className="loading">Loading wall image...</div>
      </div>
    )
  }

  if (!imageUrl) {
    return (
      <div className="wall-editor-container">
        <div className="wall-editor-header">
          <button onClick={() => navigate(`/editor/${venueId}`)} className="back-button">
            ← Back to Editor
          </button>
          <h1>Edit Wall</h1>
          <p>Venue: {venueId} | Wall: {wallId}</p>
        </div>
        <div className="error-message">
          {message?.text || 'No image found for this wall. Please capture an image first.'}
        </div>
        <button onClick={() => navigate(`/capture/${venueId}`)} className="action-button primary">
          Go to Capture
        </button>
      </div>
    )
  }

  return (
    <div className="wall-editor-container">
      <div className="wall-editor-header">
        <button onClick={() => navigate(`/capture/${venueId}`)} className="back-button">
          ← Back
        </button>
        <h1>Edit Wall</h1>
        <p>Venue: {venueId} | Wall: {wallId}</p>
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
          
          {cornerPoints.length === 4 && cropMode && (
            <p className="instruction-text">
              Drag each red corner handle independently to fine-tune the wall region.
            </p>
          )}
          <p className="instruction-text" style={{ opacity: 0.6, fontSize: '0.8rem' }}>
            Drag status: {dragStatus}
          </p>
        </div>

        <div className="controls-section">
          <button
            onClick={() => setCropMode(true)}
            className="action-button primary"
            style={{ marginBottom: '0.5rem' }}
          >
            {cropMode ? 'Crop Mode: On' : 'Start Crop / Resize'}
          </button>

          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              onClick={handleReset}
              className="action-button secondary"
            >
              Reset Crop Box
            </button>
            <button
              onClick={handleProcess}
              disabled={isProcessing || cornerPoints.length !== 4}
              className="action-button primary"
            >
              {isProcessing ? 'Processing...' : 'Save / Process'}
            </button>
          </div>

          <button
            onClick={() => navigate(`/view/${venueId}`)}
            className="action-button secondary"
          >
            View 3D Space
          </button>
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

