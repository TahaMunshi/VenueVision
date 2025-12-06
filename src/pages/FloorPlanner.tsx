import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './FloorPlanner.css'

// Auto-detect API URL
const getApiBaseUrl = () => {
  const hostname = window.location.hostname
  const protocol = window.location.protocol
  const port = window.location.port
  
  if (hostname.includes('ngrok') || hostname.includes('ngrok-free') || hostname.includes('ngrok.io') || hostname.includes('ngrok.app')) {
    return `${protocol}//${hostname}`
  }
  
  const envUrl = import.meta.env.VITE_API_BASE_URL
  if (envUrl) return envUrl
  
  if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
    if (hostname.match(/^192\.168\.|^10\.|^172\.(1[6-9]|2[0-9]|3[01])\./)) {
      return `${protocol}//${hostname}:5000`
    } else {
      return `${protocol}//${hostname}${port ? `:${port}` : ''}`
    }
  }
  
  return 'http://localhost:5000'
}

const METER_TO_PIXEL_SCALE = 20 // 1 meter = 20 pixels
const GRID_SIZE = METER_TO_PIXEL_SCALE

type Asset = {
  id: string
  type: string
  file: string
  width: number
  depth: number
  x: number
  y: number
  rotation: number
}

const FloorPlanner = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [roomDimensions, setRoomDimensions] = useState({ width: 20, height: 8, depth: 20 })
  const [placedAssets, setPlacedAssets] = useState<Asset[]>([])
  const [draggedAsset, setDraggedAsset] = useState<{ type: string; width: number; depth: number; file: string } | null>(null)
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    // Load room dimensions and layout from server
    const loadLayout = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`)
        if (response.ok) {
          const data = await response.json()
          if (data.dimensions) {
            setRoomDimensions(data.dimensions)
          }
          if (data.assets && Array.isArray(data.assets)) {
            setPlacedAssets(data.assets)
          }
        }
      } catch (error) {
        console.error('Error loading layout:', error)
      }
    }

    if (venueId) {
      loadLayout()
    }
  }, [venueId, API_BASE_URL])

  useEffect(() => {
    const handleGlobalMouseMove = (e: MouseEvent) => {
      if (draggingAssetId && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect()
        const x = e.clientX - rect.left
        const y = e.clientY - rect.top

        const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE
        const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE

        const xM = snappedX / METER_TO_PIXEL_SCALE
        const yM = snappedY / METER_TO_PIXEL_SCALE

        const asset = placedAssets.find(a => a.id === draggingAssetId)
        if (!asset) return

        if (checkCollision(draggingAssetId, xM, yM, asset.width, asset.depth)) {
          return
        }

        setPlacedAssets(placedAssets.map(a => 
          a.id === draggingAssetId ? { ...a, x: xM, y: yM } : a
        ))
      }
    }

    const handleGlobalMouseUp = () => {
      setDraggingAssetId(null)
    }

    if (draggingAssetId) {
      window.addEventListener('mousemove', handleGlobalMouseMove)
      window.addEventListener('mouseup', handleGlobalMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleGlobalMouseMove)
        window.removeEventListener('mouseup', handleGlobalMouseUp)
      }
    }
  }, [draggingAssetId, placedAssets])

  const handleDragStart = (e: React.DragEvent, assetType: string, width: number, depth: number, file: string) => {
    setDraggedAsset({ type: assetType, width, depth, file })
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (!draggedAsset || !canvasRef.current) return

    const rect = canvasRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    // Snap to grid
    const snappedX = Math.round(x / GRID_SIZE) * GRID_SIZE
    const snappedY = Math.round(y / GRID_SIZE) * GRID_SIZE

    // Convert to meters
    const xM = snappedX / METER_TO_PIXEL_SCALE
    const yM = snappedY / METER_TO_PIXEL_SCALE

    // Check for collisions
    if (checkCollision(null, xM, yM, draggedAsset.width, draggedAsset.depth)) {
      setMessage({ text: 'Cannot place asset here! Assets must maintain spacing.', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    // Create new asset
    const newAsset: Asset = {
      id: `placed-${Date.now()}`,
      type: draggedAsset.type,
      file: draggedAsset.file,
      width: draggedAsset.width,
      depth: draggedAsset.depth,
      x: xM,
      y: yM,
      rotation: 0
    }

    setPlacedAssets([...placedAssets, newAsset])
    setDraggedAsset(null)
  }

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }

  const handleAssetDragStart = (assetId: string) => {
    setDraggingAssetId(assetId)
  }

  const handleAssetRightClick = (e: React.MouseEvent, assetId: string) => {
    e.preventDefault()
    setPlacedAssets(placedAssets.map(a => 
      a.id === assetId ? { ...a, rotation: (a.rotation + 90) % 360 } : a
    ))
  }

  const handleDeleteAsset = (assetId: string) => {
    setPlacedAssets(placedAssets.filter(a => a.id !== assetId))
  }

  const checkCollision = (excludeId: string | null, x: number, y: number, width: number, depth: number): boolean => {
    const spacing = 1 // 1 meter spacing requirement
    const newLeft = x - spacing / 2
    const newRight = x + width + spacing / 2
    const newTop = y - spacing / 2
    const newBottom = y + depth + spacing / 2

    for (const asset of placedAssets) {
      if (excludeId && asset.id === excludeId) continue

      const otherLeft = asset.x - spacing / 2
      const otherRight = asset.x + asset.width + spacing / 2
      const otherTop = asset.y - spacing / 2
      const otherBottom = asset.y + asset.depth + spacing / 2

      if (!(newRight <= otherLeft || newLeft >= otherRight || 
            newBottom <= otherTop || newTop >= otherBottom)) {
        return true
      }
    }
    return false
  }

  const handleSave = async () => {
    if (placedAssets.length === 0) {
      setMessage({ text: 'Please place at least one asset before saving.', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          dimensions: roomDimensions,
          assets: placedAssets
        })
      })

      if (response.ok) {
        setMessage({ text: 'Layout saved successfully!', type: 'success' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ text: 'Failed to save layout.', type: 'error' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ text: 'Error saving layout.', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleView3D = () => {
    navigate(`/view/${venueId}`)
  }

  const canvasWidthPx = roomDimensions.width * METER_TO_PIXEL_SCALE
  const canvasHeightPx = roomDimensions.depth * METER_TO_PIXEL_SCALE

  return (
    <div className="floor-planner-container">
      <div className="planner-header">
        <button onClick={() => navigate(`/editor/${venueId}`)} className="back-button">
          ← Back
        </button>
        <h1>2D Floor Planner</h1>
        <p>Venue: {venueId} | Room: {roomDimensions.width}m x {roomDimensions.depth}m</p>
      </div>

      <div className="planner-content">
        <div className="asset-sidebar">
          <h2>Asset Library</h2>
          <div className="asset-list">
            <div
              className="asset-item"
              draggable
              onDragStart={(e) => handleDragStart(e, 'table', 4, 2, 'asset_table.glb')}
            >
              Table (4x2m)
            </div>
          </div>
          <hr />
          <button onClick={handleSave} className="action-button primary">
            💾 Save Layout
          </button>
          <button onClick={handleView3D} className="action-button secondary">
            👁️ View 3D Space
          </button>
        </div>

        <div className="planning-area">
          <div className="controls-bar">
            Room: {roomDimensions.width}m x {roomDimensions.depth}m (Scale: 1m = 20px) | Assets: {placedAssets.length}
          </div>
          <div
            ref={canvasRef}
            className="floor-plan-canvas"
            style={{
              width: `${canvasWidthPx}px`,
              height: `${canvasHeightPx}px`
            }}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
          >
            {placedAssets.map(asset => {
              const widthPx = asset.width * METER_TO_PIXEL_SCALE
              const heightPx = asset.depth * METER_TO_PIXEL_SCALE
              const leftPx = asset.x * METER_TO_PIXEL_SCALE
              const topPx = asset.y * METER_TO_PIXEL_SCALE

              return (
                <div
                  key={asset.id}
                  className="placed-asset"
                  style={{
                    position: 'absolute',
                    left: `${leftPx}px`,
                    top: `${topPx}px`,
                    width: `${widthPx}px`,
                    height: `${heightPx}px`,
                    transform: `rotate(${asset.rotation}deg)`
                  }}
                  onMouseDown={() => handleAssetDragStart(asset.id)}
                  onContextMenu={(e) => handleAssetRightClick(e, asset.id)}
                >
                  <span className="asset-label">
                    {asset.type.toUpperCase()} ({asset.width}x{asset.depth}m)
                  </span>
                  <button
                    className="delete-asset-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteAsset(asset.id)
                    }}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {message && (
        <div className={`message-toast ${message.type}`}>
          {message.text}
        </div>
      )}
    </div>
  )
}

export default FloorPlanner

