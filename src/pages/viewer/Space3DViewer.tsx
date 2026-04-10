import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './Space3DViewer.css'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import { loadThreeBundle } from '../../utils/threeLoader'
import PageNavBar from '../../components/PageNavBar'
import { metersToFeet } from '../../constants/roomUnits'

/** Epsilon above room box bottom so decorative floor/ceiling planes avoid z-fighting; same Y used for asset floor contact. */
const FLOOR_CONTACT_EPS = 0.002

function floorContactY(roomHeightFt: number): number {
  return -roomHeightFt / 2 + FLOOR_CONTACT_EPS
}

function ceilingContactY(roomHeightFt: number): number {
  return roomHeightFt / 2 - FLOOR_CONTACT_EPS
}

/** Set `VITE_USE_DECORATIVE_FLOOR_CEILING=false` to disable textured floor/ceiling planes and isolate placement vs. visuals. */
const USE_DECORATIVE_FLOOR_CEILING =
  import.meta.env.VITE_USE_DECORATIVE_FLOOR_CEILING !== 'false'

// Type declarations for dynamically loaded Three.js
declare global {
  interface Window {
    THREE: any
  }
}

type LayoutMaterials = {
  floor: { type: string; color: string }
  ceiling: { type: string; color?: string }
}

const DEFAULT_LAYOUT_MATERIALS: LayoutMaterials = {
  floor: { type: 'oak_wood', color: '#c6b39e' },
  ceiling: { type: 'flat_white', color: '#f5f5f5' }
}

const parseColorHex = (value: unknown, fallback: string): string => {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) return `#${trimmed}`
  return fallback
}

const getLayoutMaterials = (layoutData: any): LayoutMaterials => {
  const raw = layoutData?.materials || {}
  return {
    floor: {
      type: String(raw.floor?.type || DEFAULT_LAYOUT_MATERIALS.floor.type),
      color: parseColorHex(raw.floor?.color, DEFAULT_LAYOUT_MATERIALS.floor.color)
    },
    ceiling: {
      type: String(raw.ceiling?.type || DEFAULT_LAYOUT_MATERIALS.ceiling.type),
      color: parseColorHex(raw.ceiling?.color, DEFAULT_LAYOUT_MATERIALS.ceiling.color || '#f5f5f5')
    }
  }
}

const createProceduralTexture = (THREE: any, preset: string, tintHex: string, size = 1024) => {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const rand = (min: number, max: number) => Math.random() * (max - min) + min
  const drawNoiseDots = (count: number, alpha: number, color = '#000000') => {
    ctx.fillStyle = color
    ctx.globalAlpha = alpha
    for (let i = 0; i < count; i++) {
      const x = rand(0, size)
      const y = rand(0, size)
      const r = rand(0.5, 1.6)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  if (preset === 'oak_wood') {
    ctx.fillStyle = tintHex || '#b88a5a'
    ctx.fillRect(0, 0, size, size)
    const plankH = Math.round(size / 10)
    for (let y = 0; y < size; y += plankH) {
      ctx.fillStyle = y / plankH % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.07)'
      ctx.fillRect(0, y, size, plankH)
      ctx.strokeStyle = 'rgba(60,35,15,0.25)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(size, y)
      ctx.stroke()
      for (let g = 0; g < 8; g++) {
        ctx.strokeStyle = 'rgba(80,45,20,0.12)'
        ctx.lineWidth = rand(1, 2)
        const gy = y + rand(4, plankH - 4)
        ctx.beginPath()
        ctx.moveTo(0, gy)
        ctx.bezierCurveTo(size * 0.3, gy + rand(-4, 4), size * 0.7, gy + rand(-4, 4), size, gy)
        ctx.stroke()
      }
    }
  } else if (preset === 'light_marble') {
    // Black marble with gold veining.
    ctx.fillStyle = '#131313'
    ctx.fillRect(0, 0, size, size)
    drawNoiseDots(14000, 0.05, '#2a2a2a')
    drawNoiseDots(5000, 0.03, '#8f7a3b')
    for (let i = 0; i < 30; i++) {
      const x1 = rand(0, size)
      const y1 = rand(0, size)
      const x2 = x1 + rand(-size * 0.5, size * 0.5)
      const y2 = y1 + rand(-size * 0.5, size * 0.5)
      ctx.strokeStyle = i % 3 === 0 ? 'rgba(214,175,86,0.42)' : 'rgba(172,135,53,0.28)'
      ctx.lineWidth = rand(1.2, 3.6)
      ctx.beginPath()
      ctx.moveTo(x1, y1)
      ctx.quadraticCurveTo((x1 + x2) / 2 + rand(-30, 30), (y1 + y2) / 2 + rand(-30, 30), x2, y2)
      ctx.stroke()
    }
  } else if (preset === 'concrete') {
    ctx.fillStyle = '#b9b9b9'
    ctx.fillRect(0, 0, size, size)
    drawNoiseDots(17000, 0.08, '#5f5f5f')
    drawNoiseDots(9000, 0.05, '#e7e7e7')
  } else if (preset === 'wood_slats') {
    ctx.fillStyle = '#e6dccd'
    ctx.fillRect(0, 0, size, size)
    const slatW = Math.round(size / 18)
    for (let x = 0; x < size; x += slatW) {
      ctx.fillStyle = x / slatW % 2 === 0 ? 'rgba(142,102,66,0.38)' : 'rgba(122,82,46,0.48)'
      ctx.fillRect(x, 0, slatW - 2, size)
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.fillRect(x + slatW - 2, 0, 2, size)
    }
  } else if (preset === 'coffered') {
    ctx.fillStyle = '#f5f5f5'
    ctx.fillRect(0, 0, size, size)
    const cell = Math.round(size / 6)
    for (let y = 0; y < size; y += cell) {
      for (let x = 0; x < size; x += cell) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.fillRect(x + 8, y + 8, cell - 16, cell - 16)
        ctx.strokeStyle = 'rgba(180,180,180,0.75)'
        ctx.lineWidth = 4
        ctx.strokeRect(x + 8, y + 8, cell - 16, cell - 16)
      }
    }
  } else {
    ctx.fillStyle = tintHex || '#f5f5f5'
    ctx.fillRect(0, 0, size, size)
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.wrapS = THREE.RepeatWrapping
  texture.wrapT = THREE.RepeatWrapping
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/** Get texture for floor/ceiling: procedural preset or load custom image from server/static/textures/ */
const getFloorOrCeilingTexture = (
  THREE: any,
  loader: any,
  apiBase: string,
  type: string,
  tintHex: string
): Promise<any | null> => {
  if (type.startsWith('texture:')) {
    const path = type.replace('texture:', '')
    const url = `${apiBase}/static/textures/${path}`
    return new Promise((resolve) => {
      loader.load(
        url,
        (tex: any) => {
          if (tex) {
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
            tex.anisotropy = 4
          }
          resolve(tex)
        },
        undefined,
        () => {
          console.warn(`[3D Viewer] Failed to load floor/ceiling texture: ${url}`)
          resolve(null)
        }
      )
    })
  }
  return Promise.resolve(createProceduralTexture(THREE, type, tintHex))
}

const Space3DViewer = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 40, height: 9, depth: 40 })
  const [loadingAssets, setLoadingAssets] = useState<string[]>([])
  
  // Refs to prevent memory leaks
  const sceneRef = useRef<any>(null)
  const rendererRef = useRef<any>(null)
  const controlsRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const animateRef = useRef<number | null>(null)
  const roomMeshRef = useRef<any>(null)
  const floorPlaneRef = useRef<any>(null)
  const ceilingPlaneRef = useRef<any>(null)
  const materialSettingsRef = useRef<LayoutMaterials>(DEFAULT_LAYOUT_MATERIALS)
  const materialsRef = useRef<any[]>([])
  const texturesRef = useRef<{ [key: string]: any }>({})
  const assetsRef = useRef<any[]>([])
  const renderRequestRef = useRef<(() => void) | null>(null)
  /** Layout dimensions and asset placement data - used to reposition assets when user changes room dimensions */
  const layoutDataRef = useRef<{
    layoutDimensions: { width: number; height: number; depth: number }
    assetPlacements: Array<{
      group: any
      asset: any
      isRoot: boolean
      isCeiling: boolean
      parentId?: string
    }>
  } | null>(null)

  const API_BASE_URL = getApiBaseUrl()

  // Separate effect for initial setup
  useEffect(() => {
    if (!containerRef.current || !venueId) return

    // Dynamically load Three.js
    const loadThreeJS = async () => {
      try {
        /**
         * Live room size used for all meshes in this init path. Must NOT rely on `dimensions`
         * from the React render closure — `setDimensions` does not update that binding.
         * Asset placement uses API layout dims; walls/floor/planes must use the same values.
         */
        let sceneDims = {
          width: dimensions.width,
          height: dimensions.height,
          depth: dimensions.depth
        }
        const applyLayoutDimensions = (d: { width?: number; height?: number; depth?: number } | undefined) => {
          if (!d) return
          const w = Number(d.width)
          const h = Number(d.height)
          const dep = Number(d.depth)
          if (!Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(dep)) return
          sceneDims = { width: w, height: h, depth: dep }
          setDimensions({ width: w, height: h, depth: dep })
        }

        // Fetch wall images and layout (for materials / generated glb)
        let wallImageUrls: { [key: string]: string } = {}
        let generatedGlb: string | null = null
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images`, {
            headers: getAuthHeaders()
          })
          const data = await response.json()
          if (data.status === 'success' && data.wall_images) {
            wallImageUrls = data.wall_images
          }
        } catch (err) {
          console.warn('[Space3DViewer] Failed to fetch wall images, will try default paths:', err)
        }
        try {
          const layoutResponse = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`, {
            headers: getAuthHeaders()
          })
          const bootstrapLayout = await layoutResponse.json()
          materialSettingsRef.current = getLayoutMaterials(bootstrapLayout)
          if (bootstrapLayout.status === 'success' && bootstrapLayout.generated_glb) {
            generatedGlb = `${API_BASE_URL}${bootstrapLayout.generated_glb}`
          }
          if (bootstrapLayout.status === 'success' && bootstrapLayout.dimensions) {
            applyLayoutDimensions(bootstrapLayout.dimensions)
          }
        } catch (err) {
          console.warn('[Space3DViewer] Failed to fetch layout for GLB info:', err)
        }

        await loadThreeBundle()

        const THREE = (window as any).THREE
        if (!THREE) {
          throw new Error('Three.js not loaded')
        }

        // Setup scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x222222)
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        camera.position.set(0, sceneDims.height / 2, sceneDims.depth + 5)
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.0
        containerRef.current!.appendChild(renderer.domElement)
        rendererRef.current = renderer

        const controls = new THREE.OrbitControls(camera, renderer.domElement)
        controls.target.set(0, sceneDims.height / 2, 0)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controlsRef.current = controls

        let renderRequested = false
        const requestRender = () => { renderRequested = true }
        renderRequestRef.current = requestRender

        // Original darker light rig.
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
        scene.add(ambientLight)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
        dirLight.position.set(10, 20, 15)
        scene.add(dirLight)
        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
        fillLight.position.set(-8, 8, -8)
        scene.add(fillLight)

        // Texture loader for floor/ceiling (created early for custom image textures)
        const textureLoader = new THREE.TextureLoader()

        // Add a dedicated floor plane (beige) so the floor is always visible
        const addWhiteFloorPlane = async () => {
          if (!USE_DECORATIVE_FLOOR_CEILING) {
            if (floorPlaneRef.current) {
              scene.remove(floorPlaneRef.current)
              floorPlaneRef.current.geometry?.dispose()
              floorPlaneRef.current.material?.dispose()
              floorPlaneRef.current = null
            }
            return
          }
          if (floorPlaneRef.current) {
            scene.remove(floorPlaneRef.current)
            floorPlaneRef.current.geometry?.dispose()
            floorPlaneRef.current.material?.dispose()
            floorPlaneRef.current = null
          }
          const floorGeo = new THREE.PlaneGeometry(sceneDims.width, sceneDims.depth)
          const floorTexture = await getFloorOrCeilingTexture(
            THREE,
            textureLoader,
            API_BASE_URL,
            materialSettingsRef.current.floor.type,
            materialSettingsRef.current.floor.color
          )
          if (floorTexture) floorTexture.repeat.set(4, 4)
          const floorMat = new THREE.MeshBasicMaterial({
            map: floorTexture || undefined,
            color: floorTexture ? 0xffffff : parseInt(materialSettingsRef.current.floor.color.replace('#', ''), 16),
            side: THREE.DoubleSide
          })
          const plane = new THREE.Mesh(floorGeo, floorMat)
          plane.rotation.x = -Math.PI / 2
          plane.position.y = floorContactY(sceneDims.height)
          plane.renderOrder = 1
          scene.add(plane)
          floorPlaneRef.current = plane
        }

        // Add a translucent horizontal plane at the ceiling so the chandelier is visible
        const addCeilingPlane = async () => {
          if (!USE_DECORATIVE_FLOOR_CEILING) {
            if (ceilingPlaneRef.current) {
              scene.remove(ceilingPlaneRef.current)
              ceilingPlaneRef.current.geometry?.dispose()
              ceilingPlaneRef.current.material?.dispose()
              ceilingPlaneRef.current = null
            }
            return
          }
          if (ceilingPlaneRef.current) {
            scene.remove(ceilingPlaneRef.current)
            ceilingPlaneRef.current.geometry?.dispose()
            ceilingPlaneRef.current.material?.dispose()
            ceilingPlaneRef.current = null
          }
          const ceilingGeo = new THREE.PlaneGeometry(sceneDims.width, sceneDims.depth)
          const ceilingTexture = await getFloorOrCeilingTexture(
            THREE,
            textureLoader,
            API_BASE_URL,
            materialSettingsRef.current.ceiling.type,
            materialSettingsRef.current.ceiling.color || '#f5f5f5'
          )
          if (ceilingTexture) ceilingTexture.repeat.set(3, 3)
          const ceilingMat = new THREE.MeshBasicMaterial({
            map: ceilingTexture || undefined,
            color: ceilingTexture ? 0xffffff : parseInt((materialSettingsRef.current.ceiling.color || '#f5f5f5').replace('#', ''), 16),
            side: THREE.DoubleSide
          })
          const plane = new THREE.Mesh(ceilingGeo, ceilingMat)
          plane.rotation.x = -Math.PI / 2
          plane.position.y = ceilingContactY(sceneDims.height)
          plane.renderOrder = 0
          scene.add(plane)
          ceilingPlaneRef.current = plane
        }

        // Optional: Add visible floor grid at actual floor level for debugging
        // Uncomment these lines if you want to see the floor plane
        /*
        const floorGrid = new THREE.GridHelper(Math.max(sceneDims.width, sceneDims.depth) * 2, 20, 0x00ff00, 0x444444)
        floorGrid.position.y = -sceneDims.height / 2
        scene.add(floorGrid)
        
        const floorPlaneGeometry = new THREE.PlaneGeometry(sceneDims.width * 2, sceneDims.depth * 2)
        const floorPlaneMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xff0000, 
          opacity: 0.3, 
          transparent: true,
          side: THREE.DoubleSide
        })
        const floorPlane = new THREE.Mesh(floorPlaneGeometry, floorPlaneMaterial)
        floorPlane.rotation.x = -Math.PI / 2
        floorPlane.position.y = -sceneDims.height / 2
        scene.add(floorPlane)
        */

        // If a server-generated GLB exists, try to load it first
        if (generatedGlb) {
          try {
            // Ensure GLTFLoader is available (may not be loaded yet on this page)
            if (!(window as any).THREE?.GLTFLoader) {
              await new Promise<void>((resolve, reject) => {
                const script = document.createElement('script')
                script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
                script.onload = () => resolve()
                script.onerror = () => reject(new Error('Failed to load GLTFLoader'))
                document.head.appendChild(script)
              })
            }

            const gltfLoader = new THREE.GLTFLoader()
            await new Promise<void>((resolve, reject) => {
              gltfLoader.load(
                generatedGlb!,
                async (gltf: any) => {
                  scene.add(gltf.scene)
                  await addWhiteFloorPlane()
                  await addCeilingPlane()
                  setLoading(false)
                  requestRender()
                  resolve()
                },
                undefined,
                (err: any) => reject(err)
              )
            })
          } catch (err) {
            console.warn('[Space3DViewer] Failed to load generated GLB, falling back to textured room:', err)
          }
        }

        // Load wall textures (fallback / enhancement)
        const loader = new THREE.TextureLoader()
        const cacheBuster = `?v=${Date.now()}`
        
        const textures: { [key: string]: any | null } = {}
        texturesRef.current = textures
        let loadedCount = 0
        let totalTextures = 0
        let layoutData: any = null // Store layout data until textures are loaded

        const tryCreateWalls = async () => {
          if (layoutData && layoutData.walls && Array.isArray(layoutData.walls) && layoutData.walls.length > 0) {
            if (loadedCount === totalTextures && totalTextures > 0) {
              materialSettingsRef.current = getLayoutMaterials(layoutData)
              create3DWalls(layoutData.walls)
              await addWhiteFloorPlane()
              await addCeilingPlane()
              setLoading(false)
              requestRender()
            }
          } else if (loadedCount === totalTextures && totalTextures > 0) {
            await createRoom()
            await addWhiteFloorPlane()
            await addCeilingPlane()
            setLoading(false)
            requestRender()
          }
        }

        const onTextureLoad = () => {
          loadedCount++
          tryCreateWalls()
        }

        const onTextureError = (wall: string) => {
          console.warn(`[3D Viewer] Failed to load texture for ${wall}, using default`)
          textures[wall] = null
          loadedCount++
          tryCreateWalls()
        }

        // Start by fetching layout to know which walls to load textures for
        fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`, {
          headers: getAuthHeaders()
        })
          .then(res => res.json())
          .then(async (data) => {
            layoutData = data
            applyLayoutDimensions(data.dimensions)

            if (!data.walls || data.walls.length === 0) {
              await createRoom()
              await addWhiteFloorPlane()
              await addCeilingPlane()
              setLoading(false)
              requestRender()
              return
            }

            totalTextures = data.walls.length

            data.walls.forEach((wall: any) => {
              const wallId = wall.id || wall.name
              const imageUrl = wallImageUrls[wallId]

              if (imageUrl) {
                const fullUrl = `${API_BASE_URL}${imageUrl}${cacheBuster}`

                loader.load(
                  fullUrl,
                  (texture: any) => {
                    // Optimize texture
                    texture.magFilter = THREE.LinearFilter
                    texture.minFilter = THREE.LinearMipmapLinearFilter
                    textures[wallId] = texture
                    onTextureLoad()
                  },
                  undefined,
                  () => {
                    console.warn(`[3D Viewer] ✗ Failed to load texture for ${wallId}`)
                    onTextureError(wallId)
                  }
                )
              } else {
                textures[wallId] = null
                onTextureLoad()
              }
            })
          })
          .catch(async (err) => {
            console.error('[3D Viewer] Error loading layout:', err)
            await createRoom()
            setLoading(false)
            requestRender()
          })

        const createRoom = async () => {
          // Clean up old room mesh
          if (roomMeshRef.current) {
            scene.remove(roomMeshRef.current)
            roomMeshRef.current.geometry.dispose()
            materialsRef.current.forEach((mat: any) => {
              if (mat.map) mat.map.dispose()
              mat.dispose()
            })
          }

          const resolvedMaterials = getLayoutMaterials(layoutData)
          materialSettingsRef.current = resolvedMaterials
          const [floorTexture, ceilingTexture] = await Promise.all([
            getFloorOrCeilingTexture(THREE, textureLoader, API_BASE_URL, resolvedMaterials.floor.type, resolvedMaterials.floor.color),
            getFloorOrCeilingTexture(THREE, textureLoader, API_BASE_URL, resolvedMaterials.ceiling.type, resolvedMaterials.ceiling.color || '#f5f5f5')
          ])
          if (floorTexture) floorTexture.repeat.set(4, 4)
          if (ceilingTexture) ceilingTexture.repeat.set(3, 3)

          const currentMaterials = [
            new THREE.MeshBasicMaterial({ 
              map: textures.wall_east || undefined,
              color: textures.wall_east ? 0xffffff : 0x999999,
              side: THREE.BackSide 
            }), // Right wall (+X)
            new THREE.MeshBasicMaterial({ 
              map: textures.wall_west || undefined,
              color: textures.wall_west ? 0xffffff : 0x999999,
              side: THREE.BackSide 
            }), // Left wall (-X)
            new THREE.MeshBasicMaterial({
              map: ceilingTexture || undefined,
              color: ceilingTexture ? 0xffffff : parseInt((resolvedMaterials.ceiling.color || '#f5f5f5').replace('#', ''), 16),
              side: THREE.BackSide
            }), // Top (Ceiling)
            new THREE.MeshBasicMaterial({
              map: floorTexture || undefined,
              color: floorTexture ? 0xffffff : parseInt(resolvedMaterials.floor.color.replace('#', ''), 16),
              side: THREE.BackSide
            }), // Bottom (Floor)
            new THREE.MeshBasicMaterial({ 
              map: textures.wall_south || undefined,
              color: textures.wall_south ? 0xffffff : 0x999999,
              side: THREE.BackSide 
            }), // Front wall (+Z)
            new THREE.MeshBasicMaterial({ 
              map: textures.wall_north || undefined,
              color: textures.wall_north ? 0xffffff : 0x999999,
              side: THREE.BackSide 
            }) // Back wall (-Z)
          ]
          materialsRef.current = currentMaterials

          const geometry = new THREE.BoxGeometry(sceneDims.width, sceneDims.height, sceneDims.depth)
          const roomMesh = new THREE.Mesh(geometry, currentMaterials)
          roomMeshRef.current = roomMesh
          scene.add(roomMesh)
        }

        // Create 3D walls from floor plan wall data
        const create3DWalls = (wallsData: any[]) => {
          if (!wallsData || wallsData.length === 0) return

          const wallHeight = sceneDims.height
          const wallThickness = 0.05 // Ultra-thin walls (5cm) to eliminate gaps between connected walls

          wallsData.forEach((wall: any, idx: number) => {
            if (!wall.coordinates) {
              console.warn(`[3D Viewer] Wall ${idx} has no coordinates`)
              return
            }

            const [x1Norm, y1Norm, x2Norm, y2Norm] = wall.coordinates
            
            // Coordinate conversion from 2D (normalized 0-100) to 3D world coordinates
            // 2D Planner: origin at top-left, y increases downward
            // 3D World: origin at center, z increases from back to front
            // Conversion: world = (normalized / 100) * dimension - dimension/2
            
            const x1World = (x1Norm / 100) * sceneDims.width - sceneDims.width / 2
            const z1World = (y1Norm / 100) * sceneDims.depth - sceneDims.depth / 2
            const x2World = (x2Norm / 100) * sceneDims.width - sceneDims.width / 2
            const z2World = (y2Norm / 100) * sceneDims.depth - sceneDims.depth / 2

            // Calculate wall vector
            const dx = x2World - x1World
            const dz = z2World - z1World
            const wallLength = Math.sqrt(dx * dx + dz * dz)
            
            if (wallLength < 0.1) {
              console.warn(`[3D Viewer] Wall ${idx} too short (${wallLength}m)`)
              return
            }

            // Wall geometry: length x height x thickness
            const wallGeometry = new THREE.BoxGeometry(wallLength, wallHeight, wallThickness)
            
            // Apply texture to wall if available (based on wall name)
            const wallTexture = textures[wall.id] || textures[wall.name] || null
            const wallMaterial = new THREE.MeshPhongMaterial({ 
              map: wallTexture || undefined,
              color: wallTexture ? 0xffffff : 0xcccccc,
              shininess: 30,
              side: THREE.FrontSide
            })
            const wallMesh = new THREE.Mesh(wallGeometry, wallMaterial)

            // Position at center of wall - use EXACT normalized coordinates to avoid rounding gaps
            const centerX = (x1World + x2World) / 2
            const centerZ = (z1World + z2World) / 2
            wallMesh.position.set(centerX, 0, centerZ)
            
            // Rotation: angle from x-axis in xz plane
            // Note: negate dz to compensate for the direct z-axis mapping (no negation in coordinate conversion)
            const angle = Math.atan2(-dz, dx)
            wallMesh.rotation.y = angle
            
            // Cast and receive shadows for better lighting
            wallMesh.castShadow = true
            wallMesh.receiveShadow = true

            scene.add(wallMesh)
          })
        }

        // Load layout and assets
        const loadLayout = async () => {
          try {
            const layoutResponse = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`, {
              headers: getAuthHeaders()
            })
            const data = await layoutResponse.json()
            
            // Store layout data - it will be used once textures are loaded
            layoutData = data
            materialSettingsRef.current = getLayoutMaterials(data)
            applyLayoutDimensions(data.dimensions)

            if (data.status === 'success' && data.assets && data.assets.length > 0) {
              const gltfLoader = new THREE.GLTFLoader()

              // Draco decompression for compressed GLB files
              if (THREE.DRACOLoader) {
                const dracoLoader = new THREE.DRACOLoader()
                dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')
                dracoLoader.preload()
                gltfLoader.setDRACOLoader(dracoLoader)
              }

              const layoutW = data.dimensions?.width ?? sceneDims.width
              const layoutD = data.dimensions?.depth ?? sceneDims.depth
              const layoutH = data.dimensions?.height ?? sceneDims.height

              layoutDataRef.current = {
                layoutDimensions: { width: layoutW, height: layoutH, depth: layoutD },
                assetPlacements: []
              }

              const floorContact = floorContactY(layoutH)
              const ceilingContact = ceilingContactY(layoutH)
              const isCeilingAsset = (a: any) => a.layer === 'ceiling' || a.file === 'chandelier.glb'
              const rootAssets = data.assets.filter((a: any) => !(a.parentAssetId ?? a.parent_asset_id))
              const childAssets = data.assets.filter((a: any) => !!(a.parentAssetId ?? a.parent_asset_id))
              const parentSurfaceByAssetId: Record<string, { topY: number; centerX: number; centerZ: number }> = {}
              setLoadingAssets(data.assets.map((a: any) => a.id || a.file))

              // Model cache: load each unique GLB once, clone for duplicates
              const modelCache: Map<string, Promise<any>> = new Map()
              const loadGltfCached = (url: string): Promise<any> => {
                if (modelCache.has(url)) return modelCache.get(url)!
                const promise = new Promise<any>((resolve, reject) => {
                  gltfLoader.load(url, resolve, undefined, reject)
                })
                modelCache.set(url, promise)
                return promise
              }

              const cloneGltfScene = (original: any): any => {
                const cloned = original.scene.clone()
                cloned.traverse((child: any) => {
                  if (child.isMesh && child.material) {
                    child.material = Array.isArray(child.material)
                      ? child.material.map((m: any) => m.clone())
                      : child.material.clone()
                  }
                })
                return cloned
              }

              const placeAsset = (model: any, asset: any, worldX: number, worldY: number, worldZ: number, isRoot: boolean, onCeiling: boolean, parentId?: string) => {
                const group = new THREE.Group()
                group.position.set(worldX, worldY, worldZ)
                group.rotation.y = -asset.rotation * (Math.PI / 180)

                const box = new THREE.Box3().setFromObject(model)
                const size = new THREE.Vector3()
                box.getSize(size)

                if (onCeiling) {
                  model.position.y = -box.max.y
                } else {
                  model.position.y = -box.min.y
                }

                const assetType = String(asset.type ?? asset.asset_type ?? '').toLowerCase()
                const isRug = assetType === 'rug' || asset.file === 'rug.glb'
                const isFloorAsset = asset.layer === 'floor' || isRug

                let targetWidth = Number(asset.width ?? 0)
                let targetDepth = Number(asset.depth ?? 0)
                let targetHeight = Number(asset.height ?? 0)
                if (targetWidth <= 0 && asset.width_m != null) targetWidth = metersToFeet(Number(asset.width_m))
                if (targetDepth <= 0 && asset.depth_m != null) targetDepth = metersToFeet(Number(asset.depth_m))
                if (targetHeight <= 0 && asset.height_m != null) targetHeight = metersToFeet(Number(asset.height_m))

                const scaleFromHeight = size.y > 0 && targetHeight > 0 ? targetHeight / size.y : null
                const scaleX = size.x > 0 && targetWidth > 0 ? targetWidth / size.x : null
                const scaleZ = size.z > 0 && targetDepth > 0 ? targetDepth / size.z : null

                let scale = 1
                if (isFloorAsset && (scaleX != null || scaleZ != null)) {
                  scale = Math.min(scaleX ?? Number.POSITIVE_INFINITY, scaleZ ?? Number.POSITIVE_INFINITY)
                } else if (scaleFromHeight != null) {
                  scale = scaleFromHeight
                }
                model.scale.set(scale, scale, scale)

                // Derive centered position mathematically from the single box computation
                const scaledCenterX = (box.min.x + box.max.x) / 2 * scale
                const scaledCenterZ = (box.min.z + box.max.z) / 2 * scale
                model.position.x = -scaledCenterX
                model.position.z = -scaledCenterZ

                // Single corrective pass for floor/ceiling contact
                const postBox = new THREE.Box3().setFromObject(model)
                if (onCeiling) {
                  if (Math.abs(postBox.max.y) > 0.001) model.position.y -= postBox.max.y
                } else if (Math.abs(postBox.min.y) > 0.001) {
                  model.position.y -= postBox.min.y
                }

                const assetBrightness = Number(asset.brightness ?? 1)
                if (Math.abs(assetBrightness - 1) > 0.01) {
                  model.traverse((child: any) => {
                    if (child.isMesh && child.material) {
                      const mats = Array.isArray(child.material) ? child.material : [child.material]
                      mats.forEach((m: any) => {
                        if (m.color) m.color.multiplyScalar(assetBrightness)
                      })
                    }
                  })
                }

                group.add(model)
                group.updateMatrixWorld(true)
                const groupBox = new THREE.Box3().setFromObject(group)
                const anchorY = onCeiling ? groupBox.max.y : groupBox.min.y
                group.position.y += worldY - anchorY

                scene.add(group)
                assetsRef.current.push(group)
                requestRender()

                if (layoutDataRef.current) {
                  layoutDataRef.current.assetPlacements.push({ group, asset, isRoot, isCeiling: onCeiling, parentId })
                }

                const assetId = asset.id || asset.file
                if (isRoot) {
                  group.updateMatrixWorld(true)
                  const worldBox = new THREE.Box3().setFromObject(group)
                  parentSurfaceByAssetId[assetId] = {
                    topY: worldBox.max.y,
                    centerX: (worldBox.min.x + worldBox.max.x) / 2,
                    centerZ: (worldBox.min.z + worldBox.max.z) / 2
                  }
                }

                setLoadingAssets((prev) => prev.filter(id => id !== assetId))
              }

              const loadOneAsset = async (asset: any, worldX: number, worldY: number, worldZ: number, isRoot: boolean, onCeiling: boolean, parentId?: string): Promise<void> => {
                const modelPath = asset.file.includes('/')
                  ? `${API_BASE_URL}/static/${asset.file}`
                  : `${API_BASE_URL}/static/models/${asset.file}`
                const assetId = asset.id || asset.file

                try {
                  const gltf = await loadGltfCached(modelPath)
                  const model = cloneGltfScene(gltf)
                  placeAsset(model, asset, worldX, worldY, worldZ, isRoot, onCeiling, parentId)
                } catch {
                  setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                }
              }

              const getRootWorldPosition = (a: any) => {
                const centerX2D = a.x + (a.width / 2)
                const centerY2D = a.y + (a.depth / 2)
                const worldY = isCeilingAsset(a) ? ceilingContact : floorContact
                return {
                  worldX: centerX2D - (layoutW / 2),
                  worldY,
                  worldZ: centerY2D - (layoutD / 2)
                }
              }

              // Load all root assets in parallel
              await Promise.all(
                rootAssets.map((asset: any) => {
                  const { worldX, worldY, worldZ } = getRootWorldPosition(asset)
                  return loadOneAsset(asset, worldX, worldY, worldZ, true, isCeilingAsset(asset), undefined)
                })
              ).catch(() => {})

              // Load all child assets in parallel (parent surfaces are already computed)
              await Promise.all(
                childAssets.map((asset: any) => {
                  const parentId = String(asset.parentAssetId ?? asset.parent_asset_id ?? '')
                  const surface = parentSurfaceByAssetId[parentId]
                  const ox = asset.offsetX ?? asset.offset_x ?? 0
                  const oy = asset.offsetY ?? asset.offset_y ?? 0
                  const worldX = surface ? surface.centerX + ox : (asset.x + asset.width / 2) - layoutW / 2
                  const worldY = surface ? surface.topY : (isCeilingAsset(asset) ? ceilingContact : floorContact)
                  const worldZ = surface ? surface.centerZ + oy : (asset.y + asset.depth / 2) - layoutD / 2
                  return loadOneAsset(asset, worldX, worldY, worldZ, false, isCeilingAsset(asset), parentId)
                })
              ).catch(() => {})
            }
          } catch (error) {
            console.error('Error loading layout:', error)
          }
        }
        
        // Layout loading is now handled both here and in the texture loading logic above
        loadLayout()

        controls.addEventListener('change', requestRender)

        const animate = () => {
          animateRef.current = requestAnimationFrame(animate)
          if (controlsRef.current) controlsRef.current.update()
          if (renderRequested && rendererRef.current && sceneRef.current && cameraRef.current) {
            renderRequested = false
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }
        }
        animate()
        requestRender()

        const handleResize = () => {
          if (!cameraRef.current || !rendererRef.current) return
          cameraRef.current.aspect = window.innerWidth / window.innerHeight
          cameraRef.current.updateProjectionMatrix()
          rendererRef.current.setSize(window.innerWidth, window.innerHeight)
          requestRender()
        }
        window.addEventListener('resize', handleResize)

        // Cleanup function
        const cleanup = () => {
          window.removeEventListener('resize', handleResize)
          
          // Cancel animation loop
          if (animateRef.current !== null) {
            cancelAnimationFrame(animateRef.current)
            animateRef.current = null
          }
          
          // Clean up assets
          assetsRef.current.forEach(asset => {
            if (sceneRef.current) {
              sceneRef.current.remove(asset)
            }
          })
          assetsRef.current = []
          layoutDataRef.current = null
          
          // Clean up room mesh
          if (roomMeshRef.current && sceneRef.current) {
            sceneRef.current.remove(roomMeshRef.current)
            roomMeshRef.current.geometry.dispose()
            materialsRef.current.forEach((mat: any) => {
              if (mat.map) mat.map.dispose()
              mat.dispose()
            })
            materialsRef.current = []
          }
          // Clean up white floor plane
          if (floorPlaneRef.current && sceneRef.current) {
            sceneRef.current.remove(floorPlaneRef.current)
            floorPlaneRef.current.geometry?.dispose()
            floorPlaneRef.current.material?.dispose()
            floorPlaneRef.current = null
          }
          // Clean up translucent ceiling plane
          if (ceilingPlaneRef.current && sceneRef.current) {
            sceneRef.current.remove(ceilingPlaneRef.current)
            ceilingPlaneRef.current.geometry?.dispose()
            ceilingPlaneRef.current.material?.dispose()
            ceilingPlaneRef.current = null
          }
          
          // Clean up textures
          Object.values(texturesRef.current).forEach((tex: any) => {
            if (tex) tex.dispose()
          })
          texturesRef.current = {}
          
          // Dispose renderer
          if (rendererRef.current) {
            rendererRef.current.dispose()
            if (containerRef.current && rendererRef.current.domElement.parentNode === containerRef.current) {
              containerRef.current.removeChild(rendererRef.current.domElement)
            }
            rendererRef.current = null
          }
        }

        return cleanup
      } catch (err) {
        console.error('Error setting up 3D viewer:', err)
        setError('Failed to load 3D viewer. Please check if wall textures are processed.')
        setLoading(false)
      }
    }

    loadThreeJS()
  }, [venueId])

  // Separate effect for dimension changes - update camera, room, floor/ceiling planes, and reposition assets
  useEffect(() => {
    if (!cameraRef.current || !roomMeshRef.current || !sceneRef.current) return

    const THREE = (window as any).THREE
    if (!THREE) return

    const cw = dimensions.width
    const cd = dimensions.depth
    const ch = dimensions.height
    const floorContact = floorContactY(ch)
    const ceilingContact = ceilingContactY(ch)

    if (layoutDataRef.current) {
      layoutDataRef.current.layoutDimensions = { width: cw, height: ch, depth: cd }
    }

    // Update camera position
    cameraRef.current.position.set(0, ch / 2, cd + 5)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, ch / 2, 0)
    }

    // Remove old room mesh
    sceneRef.current.remove(roomMeshRef.current)
    roomMeshRef.current.geometry.dispose()
    materialsRef.current.forEach((mat: any) => {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    })

    const activeMaterials = materialSettingsRef.current
    const floorTexture = createProceduralTexture(THREE, activeMaterials.floor.type, activeMaterials.floor.color)
    const ceilingTexture = createProceduralTexture(
      THREE,
      activeMaterials.ceiling.type,
      activeMaterials.ceiling.color || '#f5f5f5'
    )
    if (floorTexture) floorTexture.repeat.set(4, 4)
    if (ceilingTexture) ceilingTexture.repeat.set(3, 3)

    // Create new room with updated dimensions
    const currentMaterials = [
      new THREE.MeshBasicMaterial({ 
        map: texturesRef.current.wall_east || undefined,
        color: texturesRef.current.wall_east ? 0xffffff : 0x999999,
        side: THREE.BackSide 
      }),
      new THREE.MeshBasicMaterial({ 
        map: texturesRef.current.wall_west || undefined,
        color: texturesRef.current.wall_west ? 0xffffff : 0x999999,
        side: THREE.BackSide 
      }),
      new THREE.MeshBasicMaterial({
        map: ceilingTexture || undefined,
        color: ceilingTexture ? 0xffffff : parseInt((activeMaterials.ceiling.color || '#f5f5f5').replace('#', ''), 16),
        side: THREE.BackSide
      }),
      new THREE.MeshBasicMaterial({
        map: floorTexture || undefined,
        color: floorTexture ? 0xffffff : parseInt(activeMaterials.floor.color.replace('#', ''), 16),
        side: THREE.BackSide
      }),
      new THREE.MeshBasicMaterial({ 
        map: texturesRef.current.wall_south || undefined,
        color: texturesRef.current.wall_south ? 0xffffff : 0x999999,
        side: THREE.BackSide 
      }),
      new THREE.MeshBasicMaterial({ 
        map: texturesRef.current.wall_north || undefined,
        color: texturesRef.current.wall_north ? 0xffffff : 0x999999,
        side: THREE.BackSide 
      })
    ]
    materialsRef.current = currentMaterials

    const geometry = new THREE.BoxGeometry(cw, ch, cd)
    const roomMesh = new THREE.Mesh(geometry, currentMaterials)
    roomMeshRef.current = roomMesh
    sceneRef.current.add(roomMesh)

    // Recreate decorative floor/ceiling planes (optional; disable via VITE_USE_DECORATIVE_FLOOR_CEILING=false)
    if (USE_DECORATIVE_FLOOR_CEILING) {
      if (floorPlaneRef.current) {
        sceneRef.current.remove(floorPlaneRef.current)
        floorPlaneRef.current.geometry?.dispose()
        floorPlaneRef.current.material?.dispose()
        floorPlaneRef.current = null
      }
      const floorGeo = new THREE.PlaneGeometry(cw, cd)
      const floorPlaneTexture = createProceduralTexture(THREE, activeMaterials.floor.type, activeMaterials.floor.color)
      if (floorPlaneTexture) floorPlaneTexture.repeat.set(4, 4)
      const floorMat = new THREE.MeshBasicMaterial({
        map: floorPlaneTexture || undefined,
        color: floorPlaneTexture ? 0xffffff : parseInt(activeMaterials.floor.color.replace('#', ''), 16),
        side: THREE.DoubleSide
      })
      const floorPlane = new THREE.Mesh(floorGeo, floorMat)
      floorPlane.rotation.x = -Math.PI / 2
      floorPlane.position.y = floorContact
      floorPlane.renderOrder = 1
      sceneRef.current.add(floorPlane)
      floorPlaneRef.current = floorPlane

      if (ceilingPlaneRef.current) {
        sceneRef.current.remove(ceilingPlaneRef.current)
        ceilingPlaneRef.current.geometry?.dispose()
        ceilingPlaneRef.current.material?.dispose()
        ceilingPlaneRef.current = null
      }
      const ceilingGeo = new THREE.PlaneGeometry(cw, cd)
      const ceilingPlaneTexture = createProceduralTexture(
        THREE,
        activeMaterials.ceiling.type,
        activeMaterials.ceiling.color || '#f5f5f5'
      )
      if (ceilingPlaneTexture) ceilingPlaneTexture.repeat.set(3, 3)
      const ceilingMat = new THREE.MeshBasicMaterial({
        map: ceilingPlaneTexture || undefined,
        color: ceilingPlaneTexture ? 0xffffff : parseInt((activeMaterials.ceiling.color || '#f5f5f5').replace('#', ''), 16),
        side: THREE.DoubleSide
      })
      const ceilingPlane = new THREE.Mesh(ceilingGeo, ceilingMat)
      ceilingPlane.rotation.x = -Math.PI / 2
      ceilingPlane.position.y = ceilingContact
      ceilingPlane.renderOrder = 0
      sceneRef.current.add(ceilingPlane)
      ceilingPlaneRef.current = ceilingPlane
    } else {
      if (floorPlaneRef.current) {
        sceneRef.current.remove(floorPlaneRef.current)
        floorPlaneRef.current.geometry?.dispose()
        floorPlaneRef.current.material?.dispose()
        floorPlaneRef.current = null
      }
      if (ceilingPlaneRef.current) {
        sceneRef.current.remove(ceilingPlaneRef.current)
        ceilingPlaneRef.current.geometry?.dispose()
        ceilingPlaneRef.current.material?.dispose()
        ceilingPlaneRef.current = null
      }
    }

    // Reposition all assets using normalized layout coords (planner coords and world are both feet)
    const layout = layoutDataRef.current
    if (layout && layout.assetPlacements.length > 0) {
      const lw = layout.layoutDimensions.width
      const ld = layout.layoutDimensions.depth
      const parentSurfaceByAssetId: Record<string, { topY: number; centerX: number; centerZ: number }> = {}

      for (const { group, asset, isRoot, isCeiling: onCeiling } of layout.assetPlacements) {
        let worldX: number
        let worldY: number
        let worldZ: number

        if (isRoot) {
          const normX = lw > 0 ? (asset.x + (asset.width || 0) / 2) / lw : 0.5
          const normZ = ld > 0 ? (asset.y + (asset.depth || 0) / 2) / ld : 0.5
          worldX = normX * cw - cw / 2
          worldZ = normZ * cd - cd / 2
          worldY = onCeiling ? ceilingContact : floorContact
        } else {
          const parentId = String(asset.parentAssetId ?? asset.parent_asset_id ?? '')
          const surface = parentSurfaceByAssetId[parentId]
          const ox = asset.offsetX ?? asset.offset_x ?? 0
          const oy = asset.offsetY ?? asset.offset_y ?? 0
          if (surface) {
            worldX = surface.centerX + ox
            worldY = surface.topY
            worldZ = surface.centerZ + oy
          } else {
            const normX = lw > 0 ? (asset.x + (asset.width || 0) / 2) / lw : 0.5
            const normZ = ld > 0 ? (asset.y + (asset.depth || 0) / 2) / ld : 0.5
            worldX = normX * cw - cw / 2
            worldZ = normZ * cd - cd / 2
            worldY = onCeiling ? ceilingContact : floorContact
          }
        }

        group.position.set(worldX, worldY, worldZ)

        if (isRoot) {
          group.updateMatrixWorld(true)
          const worldBox = new THREE.Box3().setFromObject(group)
          const assetId = asset.id || asset.file
          parentSurfaceByAssetId[assetId] = {
            topY: worldBox.max.y,
            centerX: (worldBox.min.x + worldBox.max.x) / 2,
            centerZ: (worldBox.min.z + worldBox.max.z) / 2
          }
        }
      }
    }

    renderRequestRef.current?.()
  }, [dimensions])

  return (
    <div className="space-3d-viewer">
      {venueId && (
        <PageNavBar variant="dark" venueId={venueId} title="3D viewer" backLabel="Back" />
      )}
      <div className="viewer-subheader">
        <p className="viewer-subheader-line">Venue: {venueId}</p>
        <details className="viewer-tips">
          <summary>Quick tips</summary>
          <ul>
            <li>Drag to orbit; scroll to zoom. Walls use textures from your guided capture flow.</li>
            <li>Large venues or many assets may take a moment to load.</li>
            <li>Update layout or materials in the floor planner, then refresh this page if needed.</li>
          </ul>
        </details>
      </div>

      {loading && (
        <div className="loading-overlay">
          <div className="loader" />
          <p>Loading 3D space...</p>
        </div>
      )}

      {error && (
        <div className="error-overlay">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => (venueId ? navigate(`/venue/${venueId}`) : navigate('/venues'))}
            title={venueId ? 'Go to this venue’s dashboard (hub)' : 'Go to my venues list'}
          >
            {venueId ? 'Go to venue home' : 'Go to my venues'}
          </button>
        </div>
      )}

      {loadingAssets.length > 0 && (
        <div className="asset-loading-notification">
          <div className="loader" />
          <p>Loading {loadingAssets.length} asset{loadingAssets.length > 1 ? 's' : ''}...</p>
          <button 
            onClick={() => setLoadingAssets([])} 
            style={{ 
              marginLeft: 12, background: 'rgba(255,255,255,0.3)', border: 'none', 
              color: 'white', borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
              fontSize: '12px'
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <div ref={containerRef} className="viewer-container" />

      <div className="viewer-controls">
        <div className="dimension-controls">
          <label>
            Width (ft):{' '}
            <input
              type="number"
              value={dimensions.width}
              onChange={(e) => setDimensions({ ...dimensions, width: parseFloat(e.target.value) || 40 })}
              min="5"
              max="330"
              step="1"
            />
          </label>
          <label>
            Height (ft):{' '}
            <input
              type="number"
              value={dimensions.height}
              onChange={(e) => setDimensions({ ...dimensions, height: parseFloat(e.target.value) || 9 })}
              min="6"
              max="40"
              step="0.5"
            />
          </label>
          <label>
            Depth (ft):{' '}
            <input
              type="number"
              value={dimensions.depth}
              onChange={(e) => setDimensions({ ...dimensions, depth: parseFloat(e.target.value) || 40 })}
              min="5"
              max="330"
              step="1"
            />
          </label>
        </div>
        <p className="instructions">Drag to rotate • Scroll to zoom</p>
      </div>
    </div>
  )
}

export default Space3DViewer

