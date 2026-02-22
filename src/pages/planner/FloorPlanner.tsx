import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './FloorPlanner.css'
import { getApiBaseUrl } from '../../utils/api'
import FloorPlanUpload from '../../components/FloorPlanUpload'

const METER_TO_PIXEL_SCALE = 30 // 1 meter = 30 pixels for a larger canvas
const GRID_SIZE = METER_TO_PIXEL_SCALE

/** Three vertical layers: floor (rugs/carpets), surface (middle: furniture + tabletop), ceiling (lights). */
export type AssetLayer = 'floor' | 'surface' | 'ceiling'

type Asset = {
  id: string
  type: string
  file: string
  width: number
  depth: number
  x: number
  y: number
  rotation: number
  /** If set, this asset is placed on top of another (e.g. vase on table). Offsets in meters from parent center. */
  parentAssetId?: string
  offsetX?: number
  offsetY?: number
  /** Vertical layer for 2D overlap and view modes. */
  layer?: AssetLayer
  /** Default height in meters (e.g. 0 = floor, 0.75 = table, 2.5 = chandelier). */
  elevation?: number
  /** Real-world height in meters (Y axis) for true-to-life scaling. */
  height?: number
}

type UserAsset = {
  asset_id: number
  asset_name: string
  file_url: string
  file_path: string
  thumbnail_url: string | null
  generation_status: string
  asset_layer?: 'floor' | 'surface' | 'ceiling'
  width_m?: number
  depth_m?: number
  height_m?: number
}

/**
 * Single source of truth for default draggable assets.
 * Layers: floor = rugs/carpets; surface = furniture + items on tables; ceiling = lights.
 */
const ASSET_CATALOG: Array<{
  type: string
  file: string
  width: number
  depth: number
  height: number
  label: string
  layer: AssetLayer
  elevation: number
  placeOnTable?: boolean
}> = [
  { type: 'rug', file: 'rug.glb', width: 4, depth: 4, height: 0.02, label: 'Rug (4×4m)', layer: 'floor', elevation: 0 },
  { type: 'table', file: 'asset_table.glb', width: 4, depth: 2, height: 0.75, label: 'Table (4×2m)', layer: 'surface', elevation: 0.75 },
  { type: 'vase', file: 'blue_vase.glb', width: 0.4, depth: 0.4, height: 0.4, label: 'Blue Vase (on table)', layer: 'surface', elevation: 0.8, placeOnTable: true },
  { type: 'chandelier', file: 'chandelier.glb', width: 1.2, depth: 1.2, height: 0.6, label: 'Chandelier (ceiling)', layer: 'ceiling', elevation: 2.5 },
]

type CatalogItem = (typeof ASSET_CATALOG)[number]
type BuiltInAssetOverride = {
  height_m?: number
  asset_layer?: AssetLayer
}
const BUILTIN_OVERRIDES_KEY = 'builtin_asset_overrides_v1'

const getBuiltInOverrides = (): Record<string, BuiltInAssetOverride> => {
  try {
    return JSON.parse(localStorage.getItem(BUILTIN_OVERRIDES_KEY) || '{}')
  } catch {
    return {}
  }
}

const withCatalogOverrides = (item: CatalogItem): CatalogItem => {
  const override = getBuiltInOverrides()[item.file]
  if (!override) return item
  const targetHeight = typeof override.height_m === 'number' && override.height_m > 0 ? override.height_m : item.height
  const ratio = item.height > 0 ? targetHeight / item.height : 1
  return {
    ...item,
    height: targetHeight,
    width: item.width * ratio,
    depth: item.depth * ratio,
    layer: (override.asset_layer as AssetLayer) || item.layer,
    elevation: ((override.asset_layer as AssetLayer) || item.layer) === 'ceiling'
      ? 2.5
      : ((override.asset_layer as AssetLayer) || item.layer) === 'floor'
        ? 0
        : item.elevation * ratio,
    label: `${item.label.split(' (')[0]} (${(item.width * ratio).toFixed(2)}×${(item.depth * ratio).toFixed(2)}m)`
  }
}

type WallSpec = {
  id: string
  name: string
  type: 'straight' | 'curved'
  length: number
  height: number
  radius?: number
  sweep?: number
  coordinates?: [number, number, number, number] // normalized 0-100 in planner space
}

/** Resolve layer for an asset (saved layout or catalog by file). */
function getAssetLayer(asset: Asset): AssetLayer {
  if (asset.layer) return asset.layer
  const catalog = ASSET_CATALOG.find((c) => c.file === asset.file)
  return catalog?.layer ?? 'surface'
}

/** Resolve elevation in meters for an asset. */
function getAssetElevation(asset: Asset, roomHeight: number): number {
  if (asset.elevation != null) return asset.elevation
  const catalog = ASSET_CATALOG.find((c) => c.file === asset.file)
  if (catalog?.layer === 'ceiling') return Math.max(0, roomHeight - 0.5)
  return catalog?.elevation ?? 0.75
}

const LAYER_ORDER: AssetLayer[] = ['floor', 'surface', 'ceiling']
type LightingPreset = 'dim' | 'warm' | 'neutral' | 'bright' | 'cool'
const WALL_ID_ORDER: Record<string, number> = {
  wall_north: 0,
  wall_east: 1,
  wall_south: 2,
  wall_west: 3
}

const orderWallsClockwise = (walls: WallSpec[]): WallSpec[] => {
  return [...walls].sort((a, b) => {
    const ai = WALL_ID_ORDER[a.id] ?? 999
    const bi = WALL_ID_ORDER[b.id] ?? 999
    return ai - bi
  })
}

const FloorPlanner = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [venueName, setVenueName] = useState<string>('')
  const [roomDimensions, setRoomDimensions] = useState({ width: 20, height: 8, depth: 20 })
  const [materials, setMaterials] = useState<{ floor: { type: string; color: string }; ceiling: { type: string; color?: string } }>({
    floor: { type: 'oak_wood', color: '#c6b39e' },
    ceiling: { type: 'flat_white', color: '#f5f5f5' }
  })
  const [lightingPreset, setLightingPreset] = useState<LightingPreset>('neutral')
  // Start with no walls by default; user draws or adds rectangle manually
  const defaultWalls: WallSpec[] = []
  const [walls, setWalls] = useState<WallSpec[]>(defaultWalls)
  const [floorPlanUrl, setFloorPlanUrl] = useState<string | null>(null)
  const [planMode, setPlanMode] = useState<'upload' | 'manual'>('manual')
  const [placedAssets, setPlacedAssets] = useState<Asset[]>([])
  const [viewMode, setViewMode] = useState<'all' | 'floor' | 'middle' | 'ceiling'>('all')
  const [draggedAsset, setDraggedAsset] = useState<{
    type: string
    width: number
    depth: number
    height?: number
    file: string
    layer: AssetLayer
    elevation: number
    placeOnTable?: boolean
  } | null>(null)
  const [draggingAssetId, setDraggingAssetId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [userAssets, setUserAssets] = useState<UserAsset[]>([])
  const [loadingUserAssets, setLoadingUserAssets] = useState(false)
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
  const [isDrawingWall, setIsDrawingWall] = useState(false)
  const [draftWall, setDraftWall] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null)
  const [draggingWallId, setDraggingWallId] = useState<string | null>(null)
  const dragWallStartRef = useRef<{ x: number; y: number } | null>(null)
  const [draggingEndpoint, setDraggingEndpoint] = useState<{ wallId: string; handle: 'start' | 'end' } | null>(null)

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
          if (data.name) {
            setVenueName(data.name)
          }
          if (data.materials) {
            setMaterials(data.materials)
          }
          if (data.lighting?.preset) {
            setLightingPreset(data.lighting.preset as LightingPreset)
          }
          if (data.walls && Array.isArray(data.walls) && data.walls.length > 0) {
            setWalls(orderWallsClockwise(data.walls as WallSpec[]))
          } else {
            setWalls(defaultWalls)
          }
          if (data.assets && Array.isArray(data.assets)) {
            setPlacedAssets(data.assets)
          }
          if (data.floor_plan_url) {
            setFloorPlanUrl(data.floor_plan_url)
            setPlanMode('upload')
          }
        } else {
          console.error(`[FloorPlanner] Failed to load layout: ${response.status} ${response.statusText}`)
        }
      } catch (error) {
        console.error('Error loading layout:', error)
      }
    }

    // Fetch user's custom assets from the asset library
    const fetchUserAssets = async () => {
      setLoadingUserAssets(true)
      try {
        const token = localStorage.getItem('token')
        if (!token) {
          setLoadingUserAssets(false)
          return
        }
        const response = await fetch(`${API_BASE_URL}/api/v1/assets`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        
        if (response.ok) {
          const data = await response.json()
          // Only include completed assets
          const completedAssets = (data.assets || []).filter(
            (a: UserAsset) => a.generation_status === 'completed'
          )
          setUserAssets(completedAssets)
        }
      } catch (error) {
        console.error('Error fetching user assets:', error)
      } finally {
        setLoadingUserAssets(false)
      }
    }

    if (venueId) {
      loadLayout()
      fetchUserAssets()
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

  // Keyboard shortcuts: Delete selected wall, Escape to deselect, etc.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if focus is not in an input/textarea
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      // Delete (Del/Backspace) - remove selected wall
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedWallId) {
        e.preventDefault()
        setWalls(walls.filter(w => w.id !== selectedWallId))
        setSelectedWallId(null)
        setMessage({ text: 'Wall deleted', type: 'success' })
        setTimeout(() => setMessage(null), 2000)
        return
      }

      // Escape - deselect
      if (e.key === 'Escape') {
        e.preventDefault()
        setSelectedWallId(null)
        setDraggingEndpoint(null)
        setDraggingWallId(null)
        setIsDrawingWall(false)
        setDraftWall(null)
        return
      }

      // Ctrl/Cmd + Z - undo (basic: remove last wall)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        if (walls.length > 0) {
          setWalls(walls.slice(0, -1))
          setMessage({ text: 'Undo: wall removed', type: 'success' })
          setTimeout(() => setMessage(null), 2000)
        }
        return
      }

      // Ctrl/Cmd + A - select all walls
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault()
        // Not implemented for now, but placeholder for future
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [walls, selectedWallId])

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

          if (checkCollision(draggingAssetId, xM, yM, asset.width, asset.depth, getAssetLayer(asset))) {
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

  const handleDragStart = (
    e: React.DragEvent,
    catalogItem: CatalogItem
  ) => {
    setDraggedAsset({
      type: catalogItem.type,
      width: catalogItem.width,
      depth: catalogItem.depth,
      height: catalogItem.height,
      file: catalogItem.file,
      layer: catalogItem.layer,
      elevation: catalogItem.elevation,
      placeOnTable: catalogItem.placeOnTable
    })
    e.dataTransfer.effectAllowed = 'copy'
  }

  const handleDragStartUserAsset = (e: React.DragEvent, asset: UserAsset) => {
    const layer = asset.asset_layer || 'surface'
    const elevation = layer === 'ceiling' ? 2.5 : layer === 'floor' ? 0 : 0.75
    setDraggedAsset({
      type: asset.asset_name.toLowerCase().replace(/\s+/g, '_'),
      width: asset.width_m ?? 1,
      depth: asset.depth_m ?? 1,
      height: asset.height_m ?? 1,
      file: asset.file_path || (asset.file_url?.replace(/^\/static\//, '') ?? ''),
      layer: layer as AssetLayer,
      elevation
    })
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

    // If dropping a place-on-table asset (e.g. vase), check if drop is inside a table
    let placedOnTable: Asset | null = null
    if (draggedAsset.placeOnTable) {
      for (const a of placedAssets) {
        if (a.file !== 'asset_table.glb') continue
        const halfW = draggedAsset.width / 2
        const halfD = draggedAsset.depth / 2
        const dropCenterX = xM
        const dropCenterY = yM
        if (
          dropCenterX - halfW >= a.x &&
          dropCenterX + halfW <= a.x + a.width &&
          dropCenterY - halfD >= a.y &&
          dropCenterY + halfD <= a.y + a.depth
        ) {
          placedOnTable = a
          break
        }
      }
    }

    if (placedOnTable) {
      const tableCenterX = placedOnTable.x + placedOnTable.width / 2
      const tableCenterY = placedOnTable.y + placedOnTable.depth / 2
      const offsetX = xM - tableCenterX
      const offsetY = yM - tableCenterY
      const newAsset: Asset = {
        id: `placed-${Date.now()}`,
        type: draggedAsset.type,
        file: draggedAsset.file,
        width: draggedAsset.width,
        depth: draggedAsset.depth,
        height: draggedAsset.height,
        x: tableCenterX + offsetX - draggedAsset.width / 2,
        y: tableCenterY + offsetY - draggedAsset.depth / 2,
        rotation: 0,
        parentAssetId: placedOnTable.id,
        offsetX,
        offsetY,
        layer: draggedAsset.layer,
        elevation: draggedAsset.elevation
      }
      setPlacedAssets([...placedAssets, newAsset])
      setDraggedAsset(null)
      return
    }

    // Same-layer collision only (different layers can share X/Y)
    if (checkCollision(null, xM, yM, draggedAsset.width, draggedAsset.depth, draggedAsset.layer)) {
      setMessage({ text: 'Cannot place asset here! Assets must maintain spacing on this layer.', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
      return
    }

    const newAsset: Asset = {
      id: `placed-${Date.now()}`,
      type: draggedAsset.type,
      file: draggedAsset.file,
      width: draggedAsset.width,
      depth: draggedAsset.depth,
      height: draggedAsset.height,
      x: xM,
      y: yM,
      rotation: 0,
      layer: draggedAsset.layer,
      elevation: draggedAsset.elevation
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

  const hitTestWall = (xPx: number, yPx: number, tolerancePx = 10): WallSpec | null => {
    const cw = canvasRef.current
    if (!cw) return null
    const widthPx = cw.clientWidth
    const heightPx = cw.clientHeight
    let closestWall: WallSpec | null = null
    let closestDist = Infinity
    walls.forEach((wall) => {
      if (!wall.coordinates) return
      const x1 = (wall.coordinates[0] / 100) * widthPx
      const y1 = (wall.coordinates[1] / 100) * heightPx
      const x2 = (wall.coordinates[2] / 100) * widthPx
      const y2 = (wall.coordinates[3] / 100) * heightPx
      const dx = x2 - x1
      const dy = y2 - y1
      const len2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((xPx - x1) * dx + (yPx - y1) * dy) / len2))
      const projX = x1 + t * dx
      const projY = y1 + t * dy
      const dist = Math.hypot(xPx - projX, yPx - projY)
      if (dist < closestDist) {
        closestDist = dist
        closestWall = wall
      }
    })
    if (closestWall && closestDist <= tolerancePx) return closestWall
    return null
  }

  /** Check collision only with assets on the same layer (different layers can share X/Y). */
  const checkCollision = (
    excludeId: string | null,
    x: number,
    y: number,
    width: number,
    depth: number,
    layer?: AssetLayer
  ): boolean => {
    const spacing = 1 // 1 meter spacing requirement

    if (
      x < 0 ||
      y < 0 ||
      x + width > roomDimensions.width ||
      y + depth > roomDimensions.depth
    ) {
      return true
    }

    if (walls.length > 0) {
      const assetInWalls = checkAssetWithinWalls(x, y, width, depth)
      if (!assetInWalls) return true
    }

    const newLeft = x - spacing / 2
    const newRight = x + width + spacing / 2
    const newTop = y - spacing / 2
    const newBottom = y + depth + spacing / 2

    for (const asset of placedAssets) {
      if (excludeId && asset.id === excludeId) continue
      // Only collide with same layer
      const assetLayer = getAssetLayer(asset)
      if (layer != null && assetLayer !== layer) continue

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

  // Check if asset bounding box is within the walls
  const checkAssetWithinWalls = (assetX: number, assetY: number, assetWidth: number, assetDepth: number): boolean => {
    // If no walls defined, prevent placement (must have bounding walls)
    if (walls.length === 0) return false
    
    const MIN_WALL_DISTANCE = 0.1 // 10cm minimum distance from walls
    const assetRight = assetX + assetWidth
    const assetBottom = assetY + assetDepth
    
    // Check if asset is within the bounding box formed by walls
    let minX = Infinity, maxX = -Infinity
    let minY = Infinity, maxY = -Infinity
    
    // Find bounding box of all walls
    walls.forEach(wall => {
      if (!wall.coordinates) return
      const [x1, y1, x2, y2] = wall.coordinates
      const pctX = (val: number) => (val / 100) * roomDimensions.width
      const pctY = (val: number) => (val / 100) * roomDimensions.depth
      
      const x1M = pctX(x1)
      const x2M = pctX(x2)
      const y1M = pctY(y1)
      const y2M = pctY(y2)
      
      minX = Math.min(minX, x1M, x2M)
      maxX = Math.max(maxX, x1M, x2M)
      minY = Math.min(minY, y1M, y2M)
      maxY = Math.max(maxY, y1M, y2M)
    })
    
    // Asset must be within wall bounds with minimum clearance
    const isWithinBounds = 
      assetX >= minX + MIN_WALL_DISTANCE &&
      assetRight <= maxX - MIN_WALL_DISTANCE &&
      assetY >= minY + MIN_WALL_DISTANCE &&
      assetBottom <= maxY - MIN_WALL_DISTANCE
    
    return isWithinBounds
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
          name: venueName || venueId,
          dimensions: roomDimensions,
          assets: placedAssets,
          materials,
          lighting: { preset: lightingPreset },
          walls,
          floor_plan_url: floorPlanUrl
        })
      })

      if (response.ok) {
        setMessage({ text: 'Layout saved! Opening guided tour to capture wall photos...', type: 'success' })
        setTimeout(() => {
          // Redirect to guided tour after saving
          navigate(`/mobile/capture/${venueId}`)
        }, 1500)
      } else {
        setMessage({ text: 'Failed to save layout.', type: 'error' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      setMessage({ text: 'Error saving layout.', type: 'error' })
      setTimeout(() => setMessage(null), 3000)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Are you sure you want to reset everything? This will delete all walls, photos, and layout data. This cannot be undone.')) {
      return
    }

    try {
      const resetUrl = `${API_BASE_URL}/api/v1/venue/${venueId}/reset`
      const response = await fetch(resetUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const responseData = await response.json()

      if (response.ok) {
        setMessage({ text: 'Venue reset successfully! Starting fresh...', type: 'success' })
        // Reset local state
        setWalls([])
        setPlacedAssets([])
        setFloorPlanUrl(null)
        setVenueName('')
        setRoomDimensions({ width: 20, height: 8, depth: 20 })
        setLightingPreset('neutral')
        setTimeout(() => setMessage(null), 2000)
      } else {
        console.error(`[FloorPlanner] Reset failed: ${responseData.message}`)
        setMessage({ text: `Failed to reset venue: ${responseData.message}`, type: 'error' })
        setTimeout(() => setMessage(null), 3000)
      }
    } catch (error) {
      console.error(`[FloorPlanner] Error resetting venue:`, error)
      setMessage({ text: 'Error resetting venue.', type: 'error' })
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

    // Handle both default assets (in /static/models/) and user assets (full path in /static/)
    const modelPath = assetFile.includes('/') 
      ? `${API_BASE_URL}/static/${assetFile}` 
      : `${API_BASE_URL}/static/models/${assetFile}`
    
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
        <button onClick={() => navigate(`/venue/${venueId}`)} className="back-button">
          ← Back to Venue
        </button>
        <h1>2D Floor Planner</h1>
        <p>Venue: {venueName || venueId} | Room: {roomDimensions.width}m x {roomDimensions.depth}m</p>
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
            <div className="asset-section-title">Default Assets</div>
            {ASSET_CATALOG.map((baseItem) => {
              const item = withCatalogOverrides(baseItem)
              return (
              <div
                key={item.file}
                className="asset-item"
                draggable
                onDragStart={(e) => handleDragStart(e, item)}
                onMouseEnter={() => handleAssetHover(item.file, item.label)}
                data-layer={item.layer}
                data-elevation={item.elevation}
              >
                {item.label}
              </div>
            )})}
            <div className="asset-section-title" style={{ marginTop: '16px' }}>
              My Custom Assets
              <button
                className="refresh-assets-btn"
                onClick={() => {
                  const token = localStorage.getItem('token')
                  if (!token) return
                  setLoadingUserAssets(true)
                  fetch(`${API_BASE_URL}/api/v1/assets`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                  })
                    .then(res => res.json())
                    .then(data => {
                      const completed = (data.assets || []).filter((a: UserAsset) => a.generation_status === 'completed')
                      setUserAssets(completed)
                    })
                    .finally(() => setLoadingUserAssets(false))
                }}
                title="Refresh assets"
              >
                🔄
              </button>
            </div>
            {loadingUserAssets ? (
              <div className="asset-loading">Loading assets...</div>
            ) : userAssets.length === 0 ? (
              <div className="asset-empty">
                <span>No custom assets yet</span>
                <button
                  className="create-asset-link"
                  onClick={() => navigate('/assets')}
                >
                  + Create Asset
                </button>
              </div>
            ) : (
              userAssets.map(asset => {
                const filePathForPreview = asset.file_path || (asset.file_url?.replace(/^\/static\//, '') ?? '')
                return (
                <div
                  key={asset.asset_id}
                  className="asset-item user-asset"
                  draggable
                  onDragStart={(e) => handleDragStartUserAsset(e, asset)}
                  onMouseEnter={() => filePathForPreview && handleAssetHover(filePathForPreview, asset.asset_name)}
                >
                  {asset.thumbnail_url && (
                    <img
                      src={`${API_BASE_URL}${asset.thumbnail_url}`}
                      alt={asset.asset_name}
                      className="asset-thumbnail"
                    />
                  )}
                  <span className="asset-name">{asset.asset_name}</span>
                  <span className="asset-size">{(asset.height_m ?? 1)}m tall</span>
                </div>
              )})
            )}
          </div>
          <div className="asset-preview-panel">
            <div className="asset-preview-title">Asset Preview</div>
            <div ref={previewContainerRef} className="asset-preview-canvas"></div>
            <div className="asset-preview-status">Hover an asset to load its 3D preview.</div>
          </div>
          <div className="material-panel">
            <h3>Room & Materials</h3>
          <div className="plan-mode-toggle">
            <label>
              <input
                type="radio"
                name="planMode"
                value="manual"
                checked={planMode === 'manual'}
                onChange={() => setPlanMode('manual')}
              />
              Create floor plan here
            </label>
            <label>
              <input
                type="radio"
                name="planMode"
                value="upload"
                checked={planMode === 'upload'}
                onChange={() => setPlanMode('upload')}
              />
              Upload floor plan image
            </label>
          </div>

          {planMode === 'upload' && (
            <div className="upload-wrapper">
              <FloorPlanUpload
                venueId={venueId || 'demo-venue'}
                onUploadComplete={(url) => {
                  setFloorPlanUrl(url.startsWith('http') ? url : `${API_BASE_URL}${url}`)
                  setMessage({ text: 'Floor plan uploaded.', type: 'success' })
                  setTimeout(() => setMessage(null), 2000)
                }}
              />
              {floorPlanUrl && (
                <div className="upload-preview">
                  <p>Current floor plan:</p>
                  <img src={floorPlanUrl.startsWith('http') ? floorPlanUrl : `${API_BASE_URL}${floorPlanUrl}`} alt="Floor plan" />
                </div>
              )}
            </div>
          )}

            <label className="form-row">
              <span>Venue Name</span>
              <input
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder="My Venue"
              />
            </label>
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
                <option value="oak_wood">Oak Wood</option>
                <option value="light_marble">Light Marble</option>
                <option value="concrete">Concrete</option>
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
                <option value="flat_white">Flat White</option>
                <option value="wood_slats">Wood Slats</option>
                <option value="coffered">Coffered Panels</option>
              </select>
            </label>
            <label className="form-row">
              <span>Lighting</span>
              <select
                value={lightingPreset}
                onChange={(e) => setLightingPreset(e.target.value as LightingPreset)}
              >
                <option value="dim">Dim</option>
                <option value="warm">Warm</option>
                <option value="neutral">Neutral</option>
                <option value="bright">Bright</option>
                <option value="cool">Cool</option>
              </select>
            </label>
            <div className="walls-editor">
              <div className="walls-editor-header">
                <h4>Walls</h4>
                <button
                  className="action-button secondary"
                  onClick={() => {
                    const rectWalls: WallSpec[] = [
                      {
                        id: 'wall_north',
                        name: 'North Wall',
                        type: 'straight',
                        length: roomDimensions.width,
                        height: roomDimensions.height,
                        coordinates: [0, 0, 100, 0],
                      },
                      {
                        id: 'wall_east',
                        name: 'East Wall',
                        type: 'straight',
                        length: roomDimensions.depth,
                        height: roomDimensions.height,
                        coordinates: [100, 0, 100, 100],
                      },
                      {
                        id: 'wall_south',
                        name: 'South Wall',
                        type: 'straight',
                        length: roomDimensions.width,
                        height: roomDimensions.height,
                        coordinates: [0, 100, 100, 100],
                      },
                      {
                        id: 'wall_west',
                        name: 'West Wall',
                        type: 'straight',
                        length: roomDimensions.depth,
                        height: roomDimensions.height,
                        coordinates: [0, 0, 0, 100],
                      },
                    ]
                    setWalls(rectWalls)
                    setSelectedWallId('wall_north')
                  }}
                >
                  Add rectangle
                </button>
              </div>
              {walls.map((wall, idx) => (
                <div key={wall.id} className={`wall-row ${selectedWallId === wall.id ? 'selected' : ''}`}>
                  <div className="wall-row-title">
                    {wall.name}
                    <div className="wall-row-actions">
                      <button
                        className="select-wall-btn"
                        onClick={() => setSelectedWallId(wall.id)}
                      >
                        {selectedWallId === wall.id ? 'Selected' : 'Select'}
                      </button>
                      <button
                        className="delete-wall-btn"
                        onClick={() => {
                          setWalls(walls.filter((w) => w.id !== wall.id))
                          if (selectedWallId === wall.id) setSelectedWallId(null)
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  <label className="form-row compact">
                    <span>Type</span>
                    <select
                      value={wall.type}
                      onChange={(e) => {
                        const type = e.target.value as 'straight' | 'curved'
                        const next = [...walls]
                        next[idx] = { ...wall, type }
                        setWalls(next)
                      }}
                    >
                      <option value="straight">Straight</option>
                      <option value="curved">Curved</option>
                    </select>
                  </label>
                  <label className="form-row compact">
                    <span>Length (m)</span>
                    <input
                      type="number"
                      min={1}
                      value={wall.length}
                      onChange={(e) => {
                        const next = [...walls]
                        next[idx] = { ...wall, length: Number(e.target.value) }
                        setWalls(next)
                      }}
                    />
                  </label>
                  <label className="form-row compact">
                    <span>Height (m)</span>
                    <input
                      type="number"
                      min={1}
                      value={wall.height}
                      onChange={(e) => {
                        const next = [...walls]
                        next[idx] = { ...wall, height: Number(e.target.value) }
                        setWalls(next)
                      }}
                    />
                  </label>
                  {wall.type === 'curved' && (
                    <>
                      <label className="form-row compact">
                        <span>Radius (m)</span>
                        <input
                          type="number"
                          min={1}
                          value={wall.radius ?? 5}
                          onChange={(e) => {
                            const next = [...walls]
                            next[idx] = { ...wall, radius: Number(e.target.value) }
                            setWalls(next)
                          }}
                        />
                      </label>
                      <label className="form-row compact">
                        <span>Sweep (deg)</span>
                        <input
                          type="number"
                          min={5}
                          max={180}
                          value={wall.sweep ?? 45}
                          onChange={(e) => {
                            const next = [...walls]
                            next[idx] = { ...wall, sweep: Number(e.target.value) }
                            setWalls(next)
                          }}
                        />
                      </label>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>
          <hr />
          <button onClick={handleSave} className="action-button primary">
            💾 Save Layout
          </button>
          <button onClick={() => navigate(`/mobile/capture/${venueId}`)} className="action-button" style={{ backgroundColor: '#3498db', color: 'white' }}>
            📸 Proceed to Guided Image Tour
          </button>
          <button onClick={handleView3D} className="action-button secondary">
            👁️ View 3D Space
          </button>
          <button onClick={handleGenerateGlb} className="action-button secondary">
            🧊 Generate Server GLB
          </button>
          <hr />
          <button onClick={handleReset} className="action-button" style={{ backgroundColor: '#e74c3c', color: 'white' }}>
            🔄 Reset Everything
          </button>
        </div>

        <div className="planning-area">
          <div className="controls-bar">
            <span className="controls-bar-info">
              Room: {roomDimensions.width}m × {roomDimensions.depth}m × {roomDimensions.height}m (1m = 20px) | Floor: {materials.floor.type} | Assets: {placedAssets.length}
            </span>
            <div className="view-mode-toggle" role="group" aria-label="Layer view mode">
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'all' ? 'active' : ''}`}
                onClick={() => setViewMode('all')}
                title="Show all layers"
              >
                All Layers
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'floor' ? 'active' : ''}`}
                onClick={() => setViewMode('floor')}
                title="Focus on floor: rugs and carpets"
              >
                Floor (rugs)
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'middle' ? 'active' : ''}`}
                onClick={() => setViewMode('middle')}
                title="Focus on middle: furniture on ground and items on tables"
              >
                Middle (furniture)
              </button>
              <button
                type="button"
                className={`view-mode-btn ${viewMode === 'ceiling' ? 'active' : ''}`}
                onClick={() => setViewMode('ceiling')}
                title="Focus on ceiling: lights and fans"
              >
                Ceiling (lights)
              </button>
            </div>
          </div>
          <div
            ref={canvasRef}
            className="floor-plan-canvas"
          style={{
              width: `${canvasWidthPx}px`,
              height: `${canvasHeightPx}px`,
              background: 'transparent',
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 20px),' +
                'repeating-linear-gradient(90deg, rgba(255,255,255,0.04) 0, rgba(255,255,255,0.04) 1px, transparent 1px, transparent 20px)',
              border: 'none'
            }}
            onDrop={handleCanvasDrop}
            onDragOver={handleCanvasDragOver}
            onMouseDown={(e) => {
              if (planMode !== 'manual' || draggingAssetId || draggedAsset) return
              if (e.button !== 0) return
              const target = e.target as HTMLElement
              if (target.closest('.placed-asset')) return
              const rect = canvasRef.current?.getBoundingClientRect()
              if (!rect) return
              const xPx = e.clientX - rect.left
              const yPx = e.clientY - rect.top

              // Check endpoint handles first
              const snapHandle = (x: number, y: number): { wallId: string; handle: 'start' | 'end' } | null => {
                let found: { wallId: string; handle: 'start' | 'end' } | null = null
                let closestDist = Infinity
                walls.forEach((w) => {
                  if (!w.coordinates) return
                  const [x1, y1, x2, y2] = w.coordinates
                  const toPx = (val: number, maxPx: number) => (val / 100) * maxPx
                  const hx1 = toPx(x1, canvasWidthPx)
                  const hy1 = toPx(y1, canvasHeightPx)
                  const hx2 = toPx(x2, canvasWidthPx)
                  const hy2 = toPx(y2, canvasHeightPx)
                  const distStart = Math.hypot(x - hx1, y - hy1)
                  const distEnd = Math.hypot(x - hx2, y - hy2)
                  const tol = 25 // Increased from 10px to 25px for easier endpoint selection
                  if (distStart <= tol && distStart < closestDist) {
                    found = { wallId: w.id, handle: 'start' }
                    closestDist = distStart
                  }
                  if (distEnd <= tol && distEnd < closestDist) {
                    found = { wallId: w.id, handle: 'end' }
                    closestDist = distEnd
                  }
                })
                return found
              }
              const handleHit: { wallId: string; handle: 'start' | 'end' } | null = snapHandle(xPx, yPx)
              if (handleHit) {
                setSelectedWallId(handleHit.wallId)
                setDraggingEndpoint(handleHit)
                return
              }

              // If clicked near an existing wall, select/drag it
              const hit = hitTestWall(xPx, yPx)
              if (hit) {
                setSelectedWallId(hit.id)
                setDraggingWallId(hit.id)
                dragWallStartRef.current = { x: xPx, y: yPx }
                return
              }

              const xM = xPx / METER_TO_PIXEL_SCALE
              const yM = yPx / METER_TO_PIXEL_SCALE
              setIsDrawingWall(true)
              setDraftWall({ x1: xM, y1: yM, x2: xM, y2: yM })
              setSelectedWallId(null)
            }}
            onMouseMove={(e) => {
              if (planMode !== 'manual') return
              const rect = canvasRef.current?.getBoundingClientRect()
              if (!rect) return
              const xPx = e.clientX - rect.left
              const yPx = e.clientY - rect.top

              const toNormX = (valPx: number) => {
                const norm = (valPx / canvasWidthPx) * 100
                // Round to nearest 0.5% for consistency (avoids rounding errors)
                return Math.max(0, Math.min(100, Math.round(norm * 2) / 2))
              }
              const toNormY = (valPx: number) => {
                const norm = (valPx / canvasHeightPx) * 100
                // Round to nearest 0.5% for consistency (avoids rounding errors)
                return Math.max(0, Math.min(100, Math.round(norm * 2) / 2))
              }
              
              // Increased snap tolerance from 10px to 25px for much easier snapping
              const snapPx = 25

              if (draggingEndpoint) {
                const endpoint = draggingEndpoint
                setWalls((prevWalls) => {
                  const nextWalls: WallSpec[] = prevWalls.map((w) => {
                    if (w.id !== endpoint.wallId || !w.coordinates) return w
                    const [x1, y1, x2, y2] = w.coordinates

                    let targetX = xPx
                    let targetY = yPx
                    let snappedDistance = Infinity
                    
                    // Find the closest endpoint to snap to
                    prevWalls.forEach((other) => {
                      if (!other.coordinates) return
                      const [ox1, oy1, ox2, oy2] = other.coordinates
                      const endpoints = [
                        { x: ox1, y: oy1 },
                        { x: ox2, y: oy2 },
                      ]
                      
                      endpoints.forEach(({ x: oxNorm, y: oyNorm }) => {
                        const cx = (oxNorm / 100) * canvasWidthPx
                        const cy = (oyNorm / 100) * canvasHeightPx
                        const dist = Math.hypot(cx - xPx, cy - yPx)
                        
                        // Snap to closest endpoint within tolerance
                        if (dist <= snapPx && dist < snappedDistance) {
                          targetX = cx
                          targetY = cy
                          snappedDistance = dist
                        }
                      })
                    })

                    if (endpoint.handle === 'start') {
                      const coords: [number, number, number, number] = [toNormX(targetX), toNormY(targetY), x2, y2]
                      return { ...w, coordinates: coords }
                    }
                    const coords: [number, number, number, number] = [x1, y1, toNormX(targetX), toNormY(targetY)]
                    return { ...w, coordinates: coords }
                  })
                  return nextWalls
                })
                return
              }

              if (draggingWallId && dragWallStartRef.current && !draggingEndpoint) {
                const start = dragWallStartRef.current
                const dxPx = xPx - start.x
                const dyPx = yPx - start.y
                const dxNorm = (dxPx / canvasWidthPx) * 100
                const dyNorm = (dyPx / canvasHeightPx) * 100
                setWalls((prev) =>
                  prev.map((w) => {
                    if (w.id !== draggingWallId || !w.coordinates) return w
                    const [x1, y1, x2, y2] = w.coordinates
                    const clamp = (v: number) => Math.max(0, Math.min(100, v))
                    const coords: [number, number, number, number] = [
                      clamp(x1 + dxNorm),
                      clamp(y1 + dyNorm),
                      clamp(x2 + dxNorm),
                      clamp(y2 + dyNorm),
                    ]
                    return {
                      ...w,
                      coordinates: coords,
                    }
                  })
                )
                dragWallStartRef.current = { x: xPx, y: yPx }
                return
              }

              if (isDrawingWall && draftWall) {
                const xM = xPx / METER_TO_PIXEL_SCALE
                const yM = yPx / METER_TO_PIXEL_SCALE
                setDraftWall({ ...draftWall, x2: xM, y2: yM })
              }
            }}
            onMouseUp={() => {
              if (draggingEndpoint) {
                setDraggingEndpoint(null)
              }
              if (draggingWallId) {
                setDraggingWallId(null)
                dragWallStartRef.current = null
              }
              if (!isDrawingWall || !draftWall) return
              setIsDrawingWall(false)
              const { x1, y1, x2, y2 } = draftWall
              const dx = x2 - x1
              const dy = y2 - y1
              const length = Math.sqrt(dx * dx + dy * dy)
              if (length < 0.5) {
                setDraftWall(null)
                return
              }
              const norm = (val: number, max: number) =>
                max > 0 ? Math.max(0, Math.min(100, (val / max) * 100)) : 0
              const coords: [number, number, number, number] = [
                norm(x1, roomDimensions.width),
                norm(y1, roomDimensions.depth),
                norm(x2, roomDimensions.width),
                norm(y2, roomDimensions.depth)
              ]
              const newWall: WallSpec = {
                id: `wall_${Date.now()}`,
                name: `Wall ${walls.length + 1}`,
                type: 'straight',
                length,
                height: roomDimensions.height,
                coordinates: coords
              }
              setWalls([...walls, newWall])
              setSelectedWallId(newWall.id)
              setDraftWall(null)
            }}
          >
            {/* Draw interactive walls */}
            {planMode === 'manual' &&
              walls.map((wall) => {
                const coords = wall.coordinates
                let x1Px: number
                let y1Px: number
                let x2Px: number
                let y2Px: number
                if (coords) {
                  x1Px = (coords[0] / 100) * canvasWidthPx
                  y1Px = (coords[1] / 100) * canvasHeightPx
                  x2Px = (coords[2] / 100) * canvasWidthPx
                  y2Px = (coords[3] / 100) * canvasHeightPx
                } else {
                  // Fallback approximate rectangle around room if no coordinates
                  switch (wall.id) {
                    case 'wall_north':
                      x1Px = 0
                      y1Px = 0
                      x2Px = canvasWidthPx
                      y2Px = 0
                      break
                    case 'wall_south':
                      x1Px = 0
                      y1Px = canvasHeightPx
                      x2Px = canvasWidthPx
                      y2Px = canvasHeightPx
                      break
                    case 'wall_east':
                      x1Px = canvasWidthPx
                      y1Px = 0
                      x2Px = canvasWidthPx
                      y2Px = canvasHeightPx
                      break
                    case 'wall_west':
                      x1Px = 0
                      y1Px = 0
                      x2Px = 0
                      y2Px = canvasHeightPx
                      break
                    default:
                      return null
                  }
                }
                const dx = x2Px - x1Px
                const dy = y2Px - y1Px
                const lengthPx = Math.sqrt(dx * dx + dy * dy)
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
                const left = x1Px
                const top = y1Px
                return (
                  <div key={wall.id}>
                    <div
                      className="drawn-wall"
                      style={{
                        position: 'absolute',
                        left,
                        top,
                        width: lengthPx,
                        height: 4,
                        background: wall.id === selectedWallId ? '#4CAF50' : '#ffffff',
                        transform: `rotate(${angleDeg}deg)`,
                        transformOrigin: '0 50%',
                        borderRadius: 4,
                        pointerEvents: 'none',
                        opacity: 0.9,
                        boxShadow: wall.id === selectedWallId ? '0 0 8px rgba(76, 175, 80, 0.8)' : 'none',
                        transition: 'all 0.2s ease'
                      }}
                    />
                    {/* Endpoints as draggable handles */}
                    <div
                      className="wall-endpoint-handle"
                      style={{
                        position: 'absolute',
                        left: x1Px - 6,
                        top: y1Px - 6,
                        width: 12,
                        height: 12,
                        background: '#4CAF50',
                        border: '2px solid white',
                        borderRadius: '50%',
                        cursor: draggingEndpoint?.handle === 'start' && draggingEndpoint?.wallId === wall.id ? 'grabbing' : 'grab',
                        zIndex: draggingEndpoint?.handle === 'start' && draggingEndpoint?.wallId === wall.id ? 12 : 10,
                        opacity: 0.8,
                        transition: 'all 0.1s'
                      }}
                      onMouseDown={() => {}}
                    />
                    <div
                      className="wall-endpoint-handle"
                      style={{
                        position: 'absolute',
                        left: x2Px - 6,
                        top: y2Px - 6,
                        width: 12,
                        height: 12,
                        background: '#4CAF50',
                        border: '2px solid white',
                        borderRadius: '50%',
                        cursor: draggingEndpoint?.handle === 'end' && draggingEndpoint?.wallId === wall.id ? 'grabbing' : 'grab',
                        zIndex: draggingEndpoint?.handle === 'end' && draggingEndpoint?.wallId === wall.id ? 12 : 10,
                        opacity: 0.8,
                        transition: 'all 0.1s'
                      }}
                      onMouseDown={() => {}}
                    />
                  </div>
                )
              })}

            {planMode === 'manual' && draftWall && (
              (() => {
                const x1Px = draftWall.x1 * METER_TO_PIXEL_SCALE
                const y1Px = draftWall.y1 * METER_TO_PIXEL_SCALE
                const x2Px = draftWall.x2 * METER_TO_PIXEL_SCALE
                const y2Px = draftWall.y2 * METER_TO_PIXEL_SCALE
                const dx = x2Px - x1Px
                const dy = y2Px - y1Px
                const lengthPx = Math.sqrt(dx * dx + dy * dy)
                const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI
                return (
                  <div
                    className="drawn-wall draft"
                    style={{
                      position: 'absolute',
                      left: x1Px,
                      top: y1Px,
                      width: lengthPx,
                      height: 3,
                      background: '#4CAF50',
                      transform: `rotate(${angleDeg}deg)`,
                      transformOrigin: '0 50%',
                      borderRadius: 4,
                      opacity: 0.7,
                      pointerEvents: 'none'
                    }}
                  />
                )
              })()
            )}
            {(() => {
              // Smart z-order: by layer (floor → surface → ceiling), then by area descending (smaller on top)
              const layerRank = (l: AssetLayer) => LAYER_ORDER.indexOf(l)
              const sorted = [...placedAssets].sort((a, b) => {
                const la = getAssetLayer(a)
                const lb = getAssetLayer(b)
                if (layerRank(la) !== layerRank(lb)) return layerRank(la) - layerRank(lb)
                const areaA = a.width * a.depth
                const areaB = b.width * b.depth
                return areaB - areaA // larger first → smaller items get higher z-index
              })
              const baseZ = 20
              return sorted.map((asset, index) => {
                const widthPx = asset.width * METER_TO_PIXEL_SCALE
                const heightPx = asset.depth * METER_TO_PIXEL_SCALE
                const leftPx = asset.x * METER_TO_PIXEL_SCALE
                const topPx = asset.y * METER_TO_PIXEL_SCALE
                const layer = getAssetLayer(asset)
                const elevation = getAssetElevation(asset, roomDimensions.height)
                const isGhost =
                  (viewMode === 'floor' && (layer === 'surface' || layer === 'ceiling')) ||
                  (viewMode === 'middle' && (layer === 'floor' || layer === 'ceiling')) ||
                  (viewMode === 'ceiling' && (layer === 'floor' || layer === 'surface'))
                return (
                  <div
                    key={asset.id}
                    className={`placed-asset ${isGhost ? 'placed-asset-ghost' : ''}`}
                    data-layer={layer}
                    data-elevation={elevation}
                    style={{
                      position: 'absolute',
                      left: `${leftPx}px`,
                      top: `${topPx}px`,
                      width: `${widthPx}px`,
                      height: `${heightPx}px`,
                      transform: `rotate(${asset.rotation}deg)`,
                      zIndex: baseZ + index,
                      ...(isGhost ? { opacity: 0.3, pointerEvents: 'none' as const } : {})
                    }}
                    onMouseDown={isGhost ? undefined : () => handleAssetDragStart(asset.id)}
                    onContextMenu={isGhost ? undefined : (e) => handleAssetRightClick(e, asset.id)}
                  >
                    <span className="asset-label">
                      {asset.type.toUpperCase()} ({asset.width}×{asset.depth}m)
                    </span>
                    {!isGhost && (
                      <button
                        className="delete-asset-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDeleteAsset(asset.id)
                        }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                )
              })
            })()}
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

