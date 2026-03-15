import { useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './WallUpload.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'

const enforceRectangle = (points: CornerPoint[]): CornerPoint[] => {
  if (points.length < 2) return points
  const xs = points.map(p => p[0])
  const ys = points.map(p => p[1])
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ]
}

type CornerPoint = [number, number]

const WallUpload = () => {
  const { venueId, wallId } = useParams<{ venueId: string; wallId: string }>()
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [cornerPoints, setCornerPoints] = useState<CornerPoint[]>([])
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDetecting, setIsDetecting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [mode, setMode] = useState<'auto' | 'manual'>('auto')
  const [lockRectangle, setLockRectangle] = useState(true)

  const API_BASE_URL = getApiBaseUrl()

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setMessage({ text: 'Please select an image file', type: 'error' })
      return
    }

    setSelectedFile(file)
    setCornerPoints([])
    setMessage(null)

    // Load image to canvas for corner selection
    const reader = new FileReader()
    reader.onload = (e) => {
      const url = e.target?.result as string
      
      // Load image to canvas for corner selection
      const img = new Image()
      img.onload = () => {
        imageRef.current = img
        const canvas = canvasRef.current
        if (canvas) {
          canvas.width = img.width
          canvas.height = img.height
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(img, 0, 0)
          }
        }
      }
      img.src = url
    }
    reader.readAsDataURL(file)
  }

  const handleAutoDetect = async () => {
    if (!selectedFile) return

    setIsDetecting(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)

      const response = await fetch(`${API_BASE_URL}/api/v1/wall/auto-detect`, {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (data.status === 'success' && data.points) {
        const rectPoints = lockRectangle ? enforceRectangle(data.points as CornerPoint[]) : (data.points as CornerPoint[])
        setCornerPoints(rectPoints)
        drawCornersOnCanvas(rectPoints)
        setMessage({ text: 'Corners detected! Review and adjust if needed, then click Process.', type: 'success' })
        setMode('manual') // Switch to manual mode for adjustments
      } else {
        setMessage({ text: data.message || 'Auto-detection failed. Please select corners manually.', type: 'error' })
        setMode('manual')
      }
    } catch (error) {
      setMessage({ text: 'Failed to detect corners. Please select manually.', type: 'error' })
      setMode('manual')
    } finally {
      setIsDetecting(false)
    }
  }

  const drawCornersOnCanvas = (points: CornerPoint[]) => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Redraw image
    ctx.drawImage(imageRef.current, 0, 0)

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

  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (mode !== 'manual') return

    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Scale coordinates to image size
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const scaledX = x * scaleX
    const scaledY = y * scaleY

    const newPoints = [...cornerPoints, [scaledX, scaledY] as CornerPoint]
    
    if (newPoints.length <= 4) {
      const constrained = lockRectangle && newPoints.length === 4 ? enforceRectangle(newPoints) : newPoints
      setCornerPoints(constrained)
      if (constrained.length === 4) {
        drawCornersOnCanvas(constrained)
      } else {
        const canvas = canvasRef.current
        if (canvas && imageRef.current) {
          const ctx = canvas.getContext('2d')
          if (ctx) {
            ctx.drawImage(imageRef.current, 0, 0)
            ctx.fillStyle = '#ff0000'
            constrained.forEach(([px, py]) => {
              ctx.beginPath()
              ctx.arc(px, py, 8, 0, 2 * Math.PI)
              ctx.fill()
            })
          }
        }
      }
    }
  }

  const handleReset = () => {
    setCornerPoints([])
    if (canvasRef.current && imageRef.current) {
      const ctx = canvasRef.current.getContext('2d')
      if (ctx) {
        ctx.drawImage(imageRef.current, 0, 0)
      }
    }
  }

  const handleProcess = async () => {
    if (!selectedFile || !venueId || !wallId) {
      setMessage({ text: 'Please select a file and ensure venue/wall IDs are set', type: 'error' })
      return
    }

    if (cornerPoints.length !== 4) {
      setMessage({ text: 'Please select exactly 4 corner points', type: 'error' })
      return
    }

    setIsProcessing(true)
    setMessage(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
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
      }
    } catch (error) {
      setMessage({ text: 'Failed to process wall. Please try again.', type: 'error' })
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div className="wall-upload-container">
      <div className="wall-upload-header">
        <button onClick={() => navigate(`/capture/${venueId}`)} className="back-button">
          ← Back
        </button>
        <h1>Upload Wall Photo</h1>
        <p>Venue: {venueId} | Wall: {wallId}</p>
      </div>

      <div className="wall-upload-content">
        {!selectedFile ? (
          <div className="file-select-area">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="select-file-button"
            >
              Select Image File
            </button>
          </div>
        ) : (
          <div className="processing-area">
            <div className="preview-section">
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="preview-canvas"
                style={{ maxWidth: '100%', height: 'auto', cursor: mode === 'manual' ? 'crosshair' : 'default' }}
              />
              
              {cornerPoints.length < 4 && mode === 'manual' && (
                <p className="instruction-text">
                  Click on the image to select {4 - cornerPoints.length} more corner(s)
                  <br />
                  Order: Top-Left, Top-Right, Bottom-Right, Bottom-Left
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

              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                <input
                  type="checkbox"
                  checked={lockRectangle}
                  onChange={(e) => setLockRectangle(e.target.checked)}
                />
                Keep corners rectangular
              </label>

              <button
                onClick={() => {
                  setSelectedFile(null)
                  setCornerPoints([])
                  setMessage(null)
                  if (canvasRef.current) {
                    const ctx = canvasRef.current.getContext('2d')
                    if (ctx) {
                      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
                    }
                  }
                }}
                className="action-button secondary"
              >
                Select Different File
              </button>
            </div>
          </div>
        )}

        {message && (
          <div className={`message ${message.type}`}>
            {message.text}
          </div>
        )}
      </div>
    </div>
  )
}

export default WallUpload

