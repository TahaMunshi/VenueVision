import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallEditor.css'
import { getApiBaseUrl } from '../../utils/api'

type CornerPoint = [number, number]

const rectFromDrag = (index: number, x: number, y: number, points: CornerPoint[]): CornerPoint[] => {
  if (points.length !== 4) return points
  const anchor = points[(index + 2) % 4] // opposite corner
  const minX = Math.min(x, anchor[0])
  const maxX = Math.max(x, anchor[0])
  const minY = Math.min(y, anchor[1])
  const maxY = Math.max(y, anchor[1])
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY]
  ]
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
            const canvas = canvasRef.current
            if (canvas) {
              // Set canvas internal size to match image (for drawing at full resolution)
              canvas.width = img.width
              canvas.height = img.height
              
              // Calculate display size to fit viewport while maintaining aspect ratio
              // Make it bigger - use 85vh for height and allow up to 90% of screen width
              const maxDisplayWidth = Math.min(window.innerWidth * 0.9, 1400)
              const maxDisplayHeight = window.innerHeight * 0.85
              
              const scaleX = maxDisplayWidth / img.width
              const scaleY = maxDisplayHeight / img.height
              const scale = Math.min(scaleX, scaleY) // Use the smaller scale to fit both dimensions
              
              // Set explicit display size to ensure full image is visible from the start
              canvas.style.width = `${img.width * scale}px`
              canvas.style.height = `${img.height * scale}px`
              
              const ctx = canvas.getContext('2d')
              if (ctx) {
            // Clear and draw the full image at full resolution
                ctx.clearRect(0, 0, canvas.width, canvas.height)
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height)

            // Initialize a full-image rectangle so the user immediately sees a crop box
            const defaultPoints: CornerPoint[] = [
              [0, 0],
              [img.width, 0],
              [img.width, img.height],
              [0, img.height]
            ]
            setCornerPoints(defaultPoints)
            drawCornersOnCanvas(defaultPoints)
            setCropMode(true)
              }
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
      
      // Recalculate and set display size if needed
      const maxDisplayWidth = Math.min(window.innerWidth * 0.9, 1400)
      const maxDisplayHeight = window.innerHeight * 0.85
      const scaleX = maxDisplayWidth / imageRef.current.width
      const scaleY = maxDisplayHeight / imageRef.current.height
      const scale = Math.min(scaleX, scaleY)
      
      canvas.style.width = `${imageRef.current.width * scale}px`
      canvas.style.height = `${imageRef.current.height * scale}px`
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
      ctx.arc(x, y, 8, 0, 2 * Math.PI)
      ctx.fill()

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
    if (imageRef.current && canvasRef.current && cornerPoints.length === 4) {
      drawCornersOnCanvas(cornerPoints)
    }
  }, [cornerPoints, imageUrl])

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

  const getPointAtPosition = (x: number, y: number, scaleX: number, scaleY: number) => {
    const threshold = 15 / Math.min(scaleX, scaleY)
    for (let i = 0; i < cornerPoints.length; i++) {
      const [px, py] = cornerPoints[i]
      const dx = x - px
      const dy = y - py
      const distance = Math.sqrt(dx * dx + dy * dy)
      if (distance < threshold) {
        return i
      }
    }
    return null
  }

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!cropMode || cornerPoints.length !== 4) return

    const coords = getScaledCoordinates(e.clientX, e.clientY)
    if (!coords) return

    const pointIndex = getPointAtPosition(coords.x, coords.y, coords.scaleX, coords.scaleY)
    if (pointIndex !== null) {
      setDraggingIndex(pointIndex)
      setIsDragging(true)
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || draggingIndex === null || !cropMode) return

    const coords = getScaledCoordinates(e.clientX, e.clientY)
    if (!coords) return

    const newPoints = rectFromDrag(draggingIndex, coords.x, coords.y, cornerPoints)
    setCornerPoints(newPoints)
    drawCornersOnCanvas(newPoints)
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(false)
    setDraggingIndex(null)
  }

  const handleReset = () => {
    if (!imageRef.current || !canvasRef.current) return
    const img = imageRef.current
    const defaultPoints: CornerPoint[] = [
      [0, 0],
      [img.width, 0],
      [img.width, img.height],
      [0, img.height]
    ]
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
      // Convert canvas to blob
      const canvas = canvasRef.current
      if (!canvas) return

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setMessage({ text: 'Failed to convert image', type: 'error' })
          setIsProcessing(false)
          return
        }

        const formData = new FormData()
        formData.append('file', blob, 'wall.jpg')
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
      }, 'image/jpeg', 0.95)
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
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            className="preview-canvas"
            style={{ 
              cursor: isDragging ? 'grabbing' : (cornerPoints.length === 4 ? 'grab' : 'crosshair')
            }}
          />
          
          {cornerPoints.length === 4 && cropMode && (
            <p className="instruction-text">
              Drag to resize the crop box. It stays rectangular.
            </p>
          )}
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
              Reset to Full Image
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

