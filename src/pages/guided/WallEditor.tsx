import { useState, useRef, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallEditor.css'
import { getApiBaseUrl } from '../../utils/api'

type CornerPoint = [number, number]

const WallEditor = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [cornerPoints, setCornerPoints] = useState<CornerPoint[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [isDragging, setIsDragging] = useState(false)

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
              }
              
              console.log('Image loaded:', {
                imageWidth: img.width,
                imageHeight: img.height,
                canvasWidth: canvas.width,
                canvasHeight: canvas.height,
                displayWidth: canvas.style.width,
                displayHeight: canvas.style.height,
                scale: scale
              })
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

  const handleAutoDetect = async () => {
    if (!imageRef.current) return

    setIsDetecting(true)
    setMessage(null)

    try {
      // Use the original image directly instead of canvas to ensure full image is sent
      // Convert image to blob for upload
      const canvas = document.createElement('canvas')
      canvas.width = imageRef.current.width
      canvas.height = imageRef.current.height
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        setMessage({ text: 'Failed to create canvas context', type: 'error' })
        setIsDetecting(false)
        return
      }
      
      // Draw the full original image to the temporary canvas
      ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
      
      console.log('Auto-detect: Sending image', {
        width: canvas.width,
        height: canvas.height,
        imageWidth: imageRef.current.width,
        imageHeight: imageRef.current.height
      })

      canvas.toBlob(async (blob) => {
        if (!blob) {
          setMessage({ text: 'Failed to convert image', type: 'error' })
          setIsDetecting(false)
          return
        }

        console.log('Auto-detect: Image blob size', blob.size, 'bytes')

        const formData = new FormData()
        formData.append('file', blob, 'wall.jpg')

        const response = await fetch(`${API_BASE_URL}/api/v1/wall/auto-detect`, {
          method: 'POST',
          body: formData
        })

        const data = await response.json()

        console.log('Auto-detect: Response', data)

        if (data.status === 'success' && data.points) {
          setCornerPoints(data.points as CornerPoint[])
          drawCornersOnCanvas(data.points)
          setMessage({ text: 'Corners detected! Review and adjust if needed, then click Process.', type: 'success' })
          setMode('manual') // Switch to manual mode for adjustments
        } else {
          setMessage({ text: data.message || 'Auto-detection failed. Please select corners manually.', type: 'error' })
          setMode('manual')
        }
        setIsDetecting(false)
      }, 'image/jpeg', 0.95)
    } catch (error) {
      setMessage({ text: 'Failed to detect corners. Please select manually.', type: 'error' })
      setMode('manual')
      setIsDetecting(false)
    }
  }

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

  const getScaledCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = clientX - rect.left
    const y = clientY - rect.top

    // Scale coordinates to image size
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const scaledX = x * scaleX
    const scaledY = y * scaleY

    return { x: scaledX, y: scaledY, scaleX, scaleY }
  }

  const getPointAtPosition = (x: number, y: number, scaleX: number, scaleY: number) => {
    const threshold = 15 / Math.min(scaleX, scaleY) // 15px threshold in screen space
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
    if (mode !== 'manual') return

    const coords = getScaledCoordinates(e.clientX, e.clientY)
    if (!coords) return

    // Check if clicking on existing point
    const pointIndex = getPointAtPosition(coords.x, coords.y, coords.scaleX, coords.scaleY)
    
    if (pointIndex !== null && cornerPoints.length === 4) {
      // Start dragging existing point
      setDraggingIndex(pointIndex)
      setIsDragging(true)
    } else if (cornerPoints.length < 4) {
      // Add new point
      const newPoints = [...cornerPoints, [coords.x, coords.y] as CornerPoint]
      setCornerPoints(newPoints)
      if (newPoints.length === 4) {
        drawCornersOnCanvas(newPoints)
      } else {
        // Redraw with current points
        const canvas = canvasRef.current
        if (canvas && imageRef.current) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(imageRef.current, 0, 0)
            ctx.fillStyle = '#ff0000'
            newPoints.forEach(([px, py]) => {
              ctx.beginPath()
              ctx.arc(px, py, 8, 0, 2 * Math.PI)
              ctx.fill()
            })
          }
        }
      }
    }
  }

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || draggingIndex === null) return

    const coords = getScaledCoordinates(e.clientX, e.clientY)
    if (!coords) return

    const newPoints = [...cornerPoints]
    newPoints[draggingIndex] = [coords.x, coords.y]
    setCornerPoints(newPoints)
    drawCornersOnCanvas(newPoints)
  }

  const handleCanvasMouseUp = () => {
    setIsDragging(false)
    setDraggingIndex(null)
  }

  const handleReset = () => {
    setCornerPoints([])
    if (canvasRef.current && imageRef.current) {
      const canvas = canvasRef.current
      // Ensure canvas size is correct
      if (canvas.width !== imageRef.current.width || canvas.height !== imageRef.current.height) {
        canvas.width = imageRef.current.width
        canvas.height = imageRef.current.height
        
        // Recalculate and set display size
        const maxDisplayWidth = Math.min(window.innerWidth * 0.9, 1400)
        const maxDisplayHeight = window.innerHeight * 0.85
        const scaleX = maxDisplayWidth / imageRef.current.width
        const scaleY = maxDisplayHeight / imageRef.current.height
        const scale = Math.min(scaleX, scaleY)
        
        canvas.style.width = `${imageRef.current.width * scale}px`
        canvas.style.height = `${imageRef.current.height * scale}px`
      }
      
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(imageRef.current, 0, 0, canvas.width, canvas.height)
      }
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
            ← Back
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
        <button onClick={() => navigate(`/editor/${venueId}`)} className="back-button">
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
              cursor: isDragging ? 'grabbing' : (mode === 'manual' && cornerPoints.length === 4 ? 'grab' : mode === 'manual' ? 'crosshair' : 'default')
            }}
          />
          
          {cornerPoints.length < 4 && mode === 'manual' && (
            <p className="instruction-text">
              Click on the image to select {4 - cornerPoints.length} more corner(s)
              <br />
              Order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
            </p>
          )}
          {cornerPoints.length === 4 && mode === 'manual' && (
            <p className="instruction-text">
              Click and drag the red corner points to adjust them
            </p>
          )}
        </div>

        <div className="controls-section">
          {cornerPoints.length === 0 && (
            <button
              onClick={handleAutoDetect}
              disabled={isDetecting}
              className="action-button primary"
            >
              {isDetecting ? 'Detecting...' : 'Auto-Detect Corners'}
            </button>
          )}

          {cornerPoints.length > 0 && (
            <>
              <button
                onClick={handleReset}
                className="action-button secondary"
              >
                Reset Corners
              </button>
              <button
                onClick={handleProcess}
                disabled={isProcessing || cornerPoints.length !== 4}
                className="action-button primary"
              >
                {isProcessing ? 'Processing...' : 'Process Wall'}
              </button>
            </>
          )}

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

