import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './FloorPlanner.css'
import { getApiBaseUrl } from '../../utils/api'

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
  const [materials, setMaterials] = useState<{ floor: { type: string; color: string }; ceiling: { type: string; color?: string } }>({
    floor: { type: 'carpet', color: '#c6b39e' },
    ceiling: { type: 'plain', color: '#f5f5f5' }
  })
  const [placedAssets, setPlacedAssets] = useState<Asset[]>([])
  const [draggedAsset, setDraggedAsset] = useState<{ type: string; width: number; depth: number; file: string } | null>(null)
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [sidebarWidth, setSidebarWidth] = useState(250)
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const previewContainerRef = useRef<HTMLDivElement>(null)
  const previewStateRef = useRef<{
    initialized: boolean
    scene: any
    camera: any
    renderer: any
    controls: any
    loader: any
    modelGroup: any
    currentFile: string | null
    animationFrame: number | null
  }>({
    initialized: false,
    scene: null,
    camera: null,
    renderer: null,
    controls: null,
    loader: null,
    modelGroup: null,
    currentFile: null,
    animationFrame: null
  })

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
    
    // Cleanup preview on unmount
    return () => {
      const previewState = previewStateRef.current
      if (previewState.animationFrame !== null) {
        cancelAnimationFrame(previewState.animationFrame)
      }
      clearPreviewModel()
      if (previewState.renderer && previewContainerRef.current) {
        previewContainerRef.current.removeChild(previewState.renderer.domElement)
        previewState.renderer.dispose()
      }
    }
  }, [venueId, API_BASE_URL])

  // Sidebar resize functionality - throttled for performance
  useEffect(() => {
    if (!isResizing) return

    let rafId: number | null = null
    let lastWidth = sidebarWidth

    const handleMouseMove = (e: MouseEvent) => {
      // Throttle updates using requestAnimationFrame
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          const newWidth = Math.max(200, Math.min(600, e.clientX))
          if (Math.abs(newWidth - lastWidth) > 2) { // Only update if change is significant
            lastWidth = newWidth
            setSidebarWidth(newWidth)
          }
          rafId = null
        })
      }
    }

    const handleMouseUp = () => {
      setIsResizing(false)
    }

    window.addEventListener('mousemove', handleMouseMove, { passive: true })
    window.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    
    return () => {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
      }
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, sidebarWidth])

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

        // Use functional update to avoid dependency on placedAssets
        setPlacedAssets(prevAssets => {
          const asset = prevAssets.find(a => a.id === draggingAssetId)
          if (!asset) return prevAssets

          if (checkCollision(draggingAssetId, xM, yM, asset.width, asset.depth)) {
            return prevAssets
          }

          return prevAssets.map(a => 
            a.id === draggingAssetId ? { ...a, x: xM, y: yM } : a
          )
        })
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
  }, [draggingAssetId]) // Removed placedAssets from dependencies

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
          assets: placedAssets,
          materials
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

  const handleGenerateGlb = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/generate-glb`, {
        method: 'POST'
      })
      if (response.ok) {
        setMessage({ text: 'Server GLB generated.', type: 'success' })
        setTimeout(() => setMessage(null), 2500)
      } else {
        setMessage({ text: 'Failed to generate GLB.', type: 'error' })
        setTimeout(() => setMessage(null), 2500)
      }
    } catch (err) {
      setMessage({ text: 'Error generating GLB.', type: 'error' })
      setTimeout(() => setMessage(null), 2500)
    }
  }

  // Asset preview functions
  const initAssetPreview = () => {
    const container = previewContainerRef.current
    const previewState = previewStateRef.current
    
    if (!container || previewState.initialized || !(window as any).THREE) {
      return
    }

    const THREE = (window as any).THREE
    const width = container.clientWidth || 220
    const height = container.clientHeight || 220

    previewState.scene = new THREE.Scene()
    previewState.scene.background = new THREE.Color(0xd9bb9b)

    previewState.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100)
    previewState.camera.position.set(0, 1.5, 3)

    previewState.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    previewState.renderer.setPixelRatio(window.devicePixelRatio || 1)
    previewState.renderer.setSize(width, height)
    
    container.appendChild(previewState.renderer.domElement)

    const OrbitControls = (window as any).THREE.OrbitControls || (THREE as any).OrbitControls
    previewState.controls = new OrbitControls(previewState.camera, previewState.renderer.domElement)
    previewState.controls.enablePan = false
    previewState.controls.enableDamping = true
    previewState.controls.dampingFactor = 0.08
    previewState.controls.minDistance = 0.5
    previewState.controls.maxDistance = 6
    previewState.controls.target.set(0, 0.75, 0)

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.7)
    previewState.scene.add(ambientLight)

    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6)
    previewState.scene.add(hemiLight)

    const mainLight = new THREE.DirectionalLight(0xffffff, 1.0)
    mainLight.position.set(5, 10, 7)
    previewState.scene.add(mainLight)

    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
    fillLight.position.set(-5, 5, -5)
    previewState.scene.add(fillLight)

    const grid = new THREE.GridHelper(4, 8, 0x555555, 0x222222)
    grid.position.y = 0
    previewState.scene.add(grid)

    const GLTFLoader = (window as any).THREE?.GLTFLoader || (THREE as any).GLTFLoader
    previewState.loader = new GLTFLoader()
    previewState.initialized = true
    
    animatePreview()
  }

  const animatePreview = () => {
    const previewState = previewStateRef.current
    if (previewState.initialized && previewState.renderer && previewState.scene && previewState.camera) {
      if (previewState.controls) {
        previewState.controls.update()
      }
      previewState.renderer.render(previewState.scene, previewState.camera)
      previewState.animationFrame = requestAnimationFrame(animatePreview)
    }
  }

  const handleAssetHover = (assetFile: string, label: string) => {
    const statusEl = previewContainerRef.current?.parentElement?.querySelector('.asset-preview-status') as HTMLElement
    const titleEl = previewContainerRef.current?.parentElement?.querySelector('.asset-preview-title') as HTMLElement

    if (!assetFile || !statusEl || !titleEl) return

    // Load Three.js if not loaded
    if (!(window as any).THREE) {
      const script1 = document.createElement('script')
      script1.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
      script1.onload = () => {
        const script2 = document.createElement('script')
        script2.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
        script2.onload = () => {
          const script3 = document.createElement('script')
          script3.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
          script3.onload = () => {
            initAssetPreview()
            loadAssetPreview(assetFile, label)
          }
          document.head.appendChild(script3)
        }
        document.head.appendChild(script2)
      }
      document.head.appendChild(script1)
      return
    }

    initAssetPreview()
    loadAssetPreview(assetFile, label)
  }

  const loadAssetPreview = (assetFile: string, label: string) => {
    const previewState = previewStateRef.current
    const statusEl = previewContainerRef.current?.parentElement?.querySelector('.asset-preview-status') as HTMLElement
    const titleEl = previewContainerRef.current?.parentElement?.querySelector('.asset-preview-title') as HTMLElement

    if (!assetFile || !statusEl || !titleEl) return

    initAssetPreview()
    titleEl.textContent = `Preview: ${label}`

    if (!previewState.loader) {
      statusEl.textContent = 'Preview unavailable (Three.js missing).'
      return
    }

    if (previewState.currentFile === assetFile) {
      statusEl.textContent = 'Drag inside preview to rotate.'
      return
    }

    previewState.currentFile = assetFile
    statusEl.textContent = 'Loading...'
    clearPreviewModel()

    const modelPath = `${API_BASE_URL}/static/models/${assetFile}`
    
    // Load from server (browser will cache automatically)
    previewState.loader.load(
      modelPath,
      (gltf: any) => {
        previewState.modelGroup = normalizeAndScaleModel(gltf.scene, 1.5, 1.5)
        previewState.scene.add(previewState.modelGroup)
        statusEl.textContent = 'Drag inside preview to rotate.'
      },
      undefined,
      (error: any) => {
        console.error('Failed to load preview', error)
        statusEl.textContent = 'Preview unavailable.'
        previewState.currentFile = null
      }
    )
  }

  const clearPreviewModel = () => {
    const previewState = previewStateRef.current
    if (!previewState.modelGroup || !previewState.scene) {
      return
    }
    previewState.scene.remove(previewState.modelGroup)
    previewState.modelGroup.traverse((child: any) => {
      if (child.geometry) {
        child.geometry.dispose()
      }
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: any) => mat.dispose && mat.dispose())
        } else if (child.material.dispose) {
          child.material.dispose()
        }
      }
    })
    previewState.modelGroup = null
  }

  const normalizeAndScaleModel = (modelScene: any, targetWidth: number, targetDepth: number) => {
    const THREE = (window as any).THREE
    const box = new THREE.Box3().setFromObject(modelScene)
    const size = new THREE.Vector3()
    box.getSize(size)
    const center = new THREE.Vector3()
    box.getCenter(center)

    modelScene.position.sub(center)

    const wrapper = new THREE.Group()
    wrapper.add(modelScene)

    const scaleX = size.x > 0 ? targetWidth / size.x : 1
    const scaleZ = size.z > 0 ? targetDepth / size.z : 1
    const uniformScale = Math.min(scaleX, scaleZ)
    wrapper.scale.set(uniformScale, uniformScale, uniformScale)

    const newBox = new THREE.Box3().setFromObject(wrapper)
    const newSize = new THREE.Vector3()
    newBox.getSize(newSize)
    wrapper.position.y = newSize.y / 2

    return wrapper
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
        <div 
          className="asset-sidebar" 
          ref={sidebarRef}
          style={{ width: `${sidebarWidth}px` }}
        >
          <div 
            className="sidebar-resize-handle"
            onMouseDown={(e) => {
              e.preventDefault()
              setIsResizing(true)
            }}
          />
          <h2>Asset Library</h2>
          <div className="asset-list">
            <div
              className="asset-item"
              draggable
              onDragStart={(e) => handleDragStart(e, 'table', 4, 2, 'asset_table.glb')}
              onMouseEnter={() => handleAssetHover('asset_table.glb', 'Table (4x2m)')}
            >
              Table (4x2m)
            </div>
          </div>
          <div className="asset-preview-panel">
            <div className="asset-preview-title">Asset Preview</div>
            <div ref={previewContainerRef} className="asset-preview-canvas"></div>
            <div className="asset-preview-status">Hover an asset to load its 3D preview.</div>
          </div>
          <div className="material-panel">
            <h3>Room & Materials</h3>
            <label className="form-row">
              <span>Width (m)</span>
              <input
                type="number"
                min={5}
                value={roomDimensions.width}
                onChange={(e) => setRoomDimensions({ ...roomDimensions, width: Number(e.target.value) })}
              />
            </label>
            <label className="form-row">
              <span>Depth (m)</span>
              <input
                type="number"
                min={5}
                value={roomDimensions.depth}
                onChange={(e) => setRoomDimensions({ ...roomDimensions, depth: Number(e.target.value) })}
              />
            </label>
            <label className="form-row">
              <span>Height (m)</span>
              <input
                type="number"
                min={2}
                value={roomDimensions.height}
                onChange={(e) => setRoomDimensions({ ...roomDimensions, height: Number(e.target.value) })}
              />
            </label>
            <label className="form-row">
              <span>Floor</span>
              <select
                value={materials.floor.type}
                onChange={(e) => setMaterials({ ...materials, floor: { ...materials.floor, type: e.target.value } })}
              >
                <option value="carpet">Carpet</option>
                <option value="wood">Wood</option>
                <option value="tile">Tile</option>
              </select>
            </label>
            <label className="form-row">
              <span>Floor Color</span>
              <input
                type="color"
                value={materials.floor.color}
                onChange={(e) => setMaterials({ ...materials, floor: { ...materials.floor, color: e.target.value } })}
              />
            </label>
            <label className="form-row">
              <span>Ceiling</span>
              <select
                value={materials.ceiling.type}
                onChange={(e) => setMaterials({ ...materials, ceiling: { ...materials.ceiling, type: e.target.value } })}
              >
                <option value="plain">Plain</option>
                <option value="acoustic">Acoustic</option>
              </select>
            </label>
          </div>
          <hr />
          <button onClick={handleSave} className="action-button primary">
            💾 Save Layout
          </button>
          <button onClick={handleView3D} className="action-button secondary">
            👁️ View 3D Space
          </button>
          <button onClick={handleGenerateGlb} className="action-button secondary">
            🧊 Generate Server GLB
          </button>
        </div>

        <div className="planning-area">
          <div className="controls-bar">
            Room: {roomDimensions.width}m x {roomDimensions.depth}m x {roomDimensions.height}m (Scale: 1m = 20px) | Floor: {materials.floor.type} | Assets: {placedAssets.length}
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

