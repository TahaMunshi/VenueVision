import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './Space3DViewer.css'

// Type declarations for dynamically loaded Three.js
declare global {
  interface Window {
    THREE: any
  }
}

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

const Space3DViewer = () => {
  const { venueId } = useParams<{ venueId: string }>()
  const navigate = useNavigate()
  const containerRef = useRef<HTMLDivElement>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState({ width: 20, height: 8, depth: 20 })
  const [loadingAssets, setLoadingAssets] = useState<string[]>([])
  
  // Refs to prevent memory leaks
  const sceneRef = useRef<any>(null)
  const rendererRef = useRef<any>(null)
  const controlsRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const animateRef = useRef<number | null>(null)
  const roomMeshRef = useRef<any>(null)
  const materialsRef = useRef<any[]>([])
  const texturesRef = useRef<{ [key: string]: any }>({})
  const assetsRef = useRef<any[]>([])

  const API_BASE_URL = getApiBaseUrl()

  // Separate effect for initial setup
  useEffect(() => {
    if (!containerRef.current || !venueId) return

    // Dynamically load Three.js
    const loadThreeJS = async () => {
      try {
        // First, fetch wall images from API
        let wallImageUrls: { [key: string]: string } = {}
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images`)
          const data = await response.json()
          if (data.status === 'success' && data.wall_images) {
            wallImageUrls = data.wall_images
            console.log('[Space3DViewer] Wall images:', wallImageUrls)
          }
        } catch (err) {
          console.warn('[Space3DViewer] Failed to fetch wall images, will try default paths:', err)
        }

        // Load Three.js from CDN
        await Promise.all([
          new Promise<void>((resolve, reject) => {
            if (window.THREE) {
              resolve()
              return
            }
            const script = document.createElement('script')
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load Three.js'))
            document.head.appendChild(script)
          }),
          new Promise<void>((resolve, reject) => {
            if (window.THREE?.OrbitControls) {
              resolve()
              return
            }
            const script = document.createElement('script')
            script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js'
            script.onload = () => resolve()
            script.onerror = () => reject(new Error('Failed to load OrbitControls'))
            document.head.appendChild(script)
          })
        ])

        const THREE = (window as any).THREE
        if (!THREE) {
          throw new Error('Three.js not loaded')
        }

        // Setup scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0x222222)
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        camera.position.set(0, dimensions.height / 2, dimensions.depth + 5)
        cameraRef.current = camera

        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(window.innerWidth, window.innerHeight)
        renderer.setPixelRatio(window.devicePixelRatio)
        containerRef.current!.appendChild(renderer.domElement)
        rendererRef.current = renderer

        const controls = new THREE.OrbitControls(camera, renderer.domElement)
        controls.target.set(0, dimensions.height / 2, 0)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controlsRef.current = controls

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 1.5)
        scene.add(ambientLight)
        const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
        dirLight.position.set(10, 20, 15)
        scene.add(dirLight)

        // Load wall textures
        const loader = new THREE.TextureLoader()
        const cacheBuster = `?v=${Date.now()}`
        
        // Use API-provided URLs or fallback to default paths
        const textureUrls = {
          wall_north: wallImageUrls.wall_north 
            ? `${API_BASE_URL}${wallImageUrls.wall_north}${cacheBuster}`
            : `${API_BASE_URL}/static/uploads/${venueId}/wall_north/processed_wall_north.jpg${cacheBuster}`,
          wall_east: wallImageUrls.wall_east
            ? `${API_BASE_URL}${wallImageUrls.wall_east}${cacheBuster}`
            : `${API_BASE_URL}/static/uploads/${venueId}/wall_east/processed_wall_east.jpg${cacheBuster}`,
          wall_south: wallImageUrls.wall_south
            ? `${API_BASE_URL}${wallImageUrls.wall_south}${cacheBuster}`
            : `${API_BASE_URL}/static/uploads/${venueId}/wall_south/processed_wall_south.jpg${cacheBuster}`,
          wall_west: wallImageUrls.wall_west
            ? `${API_BASE_URL}${wallImageUrls.wall_west}${cacheBuster}`
            : `${API_BASE_URL}/static/uploads/${venueId}/wall_west/processed_wall_west.jpg${cacheBuster}`
        }

        const textures: { [key: string]: any | null } = {}
        texturesRef.current = textures
        let loadedCount = 0
        const totalTextures = 4

        const onTextureLoad = () => {
          loadedCount++
          if (loadedCount === totalTextures) {
            createRoom()
            setLoading(false)
          }
        }

        const onTextureError = (wall: string) => {
          console.warn(`Failed to load texture for ${wall}, using default`)
          textures[wall] = null
          loadedCount++
          if (loadedCount === totalTextures) {
            createRoom()
            setLoading(false)
          }
        }

        // Load textures
        Object.entries(textureUrls).forEach(([wall, url]) => {
          loader.load(
            url,
            (texture: any) => {
              // Optimize texture
              texture.magFilter = THREE.LinearFilter
              texture.minFilter = THREE.LinearMipmapLinearFilter
              textures[wall] = texture
              onTextureLoad()
            },
            undefined,
            () => onTextureError(wall)
          )
        })

        const createRoom = () => {
          // Clean up old room mesh
          if (roomMeshRef.current) {
            scene.remove(roomMeshRef.current)
            roomMeshRef.current.geometry.dispose()
            materialsRef.current.forEach((mat: any) => {
              if (mat.map) mat.map.dispose()
              mat.dispose()
            })
          }

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
            new THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: THREE.BackSide }), // Top (Ceiling)
            new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.BackSide }), // Bottom (Floor)
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

          const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)
          const roomMesh = new THREE.Mesh(geometry, currentMaterials)
          roomMeshRef.current = roomMesh
          scene.add(roomMesh)
        }

        // Load layout and assets
        const loadLayout = async () => {
          try {
            const layoutResponse = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`)
            const layoutData = await layoutResponse.json()
            
            if (layoutData.status === 'success' && layoutData.assets && layoutData.assets.length > 0) {
              // Update room dimensions if provided
              if (layoutData.dimensions) {
                setDimensions(layoutData.dimensions)
              }
              
              // Load GLTF loader for 3D models
              const GLTFLoader = (window as any).THREE?.GLTFLoader
              if (!GLTFLoader) {
                // Load GLTFLoader script
                await new Promise<void>((resolve, reject) => {
                  const script = document.createElement('script')
                  script.src = 'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js'
                  script.onload = () => resolve()
                  script.onerror = () => reject(new Error('Failed to load GLTFLoader'))
                  document.head.appendChild(script)
                })
              }
              
              const gltfLoader = new THREE.GLTFLoader()
              const roomWidth = layoutData.dimensions?.width || dimensions.width
              const roomDepth = layoutData.dimensions?.depth || dimensions.depth
              
              // Track loading assets
              setLoadingAssets(layoutData.assets.map((a: any) => a.id || a.file))
              
              layoutData.assets.forEach((asset: any) => {
                // Convert 2D planner coordinates to 3D world coordinates
                // Planner (0,0) is Top-Left. ThreeJS (0,0) is Center.
                const centerX2D = asset.x + (asset.width / 2)
                const centerY2D = asset.y + (asset.depth / 2)
                
                const worldX = centerX2D - (roomWidth / 2)
                const worldZ = centerY2D - (roomDepth / 2)
                
                // Create group for this asset
                const group = new THREE.Group()
                group.position.set(worldX, 0, worldZ)
                group.rotation.y = -asset.rotation * (Math.PI / 180)
                
                // Load the 3D model - use full URL for proper loading
                const modelPath = `${API_BASE_URL}/static/models/${asset.file}`
                const assetId = asset.id || asset.file
                
                // Load from server (browser will cache automatically)
                gltfLoader.load(
                  modelPath,
                  (gltf: any) => {
                    
                    // Scale model to fit dimensions
                    const box = new THREE.Box3().setFromObject(gltf.scene)
                    const size = new THREE.Vector3()
                    box.getSize(size)
                    const center = new THREE.Vector3()
                    box.getCenter(center)
                    
                    gltf.scene.position.sub(center)
                    
                    const scaleX = size.x > 0 ? asset.width / size.x : 1
                    const scaleZ = size.z > 0 ? asset.depth / size.z : 1
                    const scaleY = scaleX
                    
                    gltf.scene.scale.set(scaleX, scaleY, scaleZ)
                    // Fix: Position at floor level (y=0) instead of half height
                    // The model is already centered, so just set y to 0 to sit on floor
                    gltf.scene.position.y = 0
                    
                    group.add(gltf.scene)
                    scene.add(group)
                    assetsRef.current.push(group)
                    
                    // Update loading state
                    setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                  },
                  (progress: any) => {
                    // Loading progress callback
                    if (progress.lengthComputable) {
                      const percent = (progress.loaded / progress.total) * 100
                      console.log(`Loading ${asset.file}: ${percent.toFixed(0)}%`)
                    }
                  },
                  (error: any) => {
                    console.error(`Failed to load ${asset.file}:`, error)
                    setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                  }
                )
              })
            }
          } catch (error) {
            console.error('Error loading layout:', error)
          }
        }
        
        loadLayout()

        // Animation loop - only create one
        const animate = () => {
          animateRef.current = requestAnimationFrame(animate)
          if (controlsRef.current) controlsRef.current.update()
          if (rendererRef.current && sceneRef.current && cameraRef.current) {
            rendererRef.current.render(sceneRef.current, cameraRef.current)
          }
        }
        animate()

        // Handle resize
        const handleResize = () => {
          if (!cameraRef.current || !rendererRef.current) return
          cameraRef.current.aspect = window.innerWidth / window.innerHeight
          cameraRef.current.updateProjectionMatrix()
          rendererRef.current.setSize(window.innerWidth, window.innerHeight)
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

  // Separate effect for dimension changes - just update camera/room, don't rebuild scene
  useEffect(() => {
    if (!cameraRef.current || !roomMeshRef.current || !sceneRef.current) return

    const THREE = (window as any).THREE
    if (!THREE) return

    // Update camera position
    cameraRef.current.position.set(0, dimensions.height / 2, dimensions.depth + 5)
    if (controlsRef.current) {
      controlsRef.current.target.set(0, dimensions.height / 2, 0)
    }

    // Remove old room mesh
    sceneRef.current.remove(roomMeshRef.current)
    roomMeshRef.current.geometry.dispose()
    materialsRef.current.forEach((mat: any) => {
      if (mat.map) mat.map.dispose()
      mat.dispose()
    })

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
      new THREE.MeshBasicMaterial({ color: 0xaaaaaa, side: THREE.BackSide }),
      new THREE.MeshBasicMaterial({ color: 0x444444, side: THREE.BackSide }),
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

    const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)
    const roomMesh = new THREE.Mesh(geometry, currentMaterials)
    roomMeshRef.current = roomMesh
    sceneRef.current.add(roomMesh)
  }, [dimensions])

  return (
    <div className="space-3d-viewer">
      <div className="viewer-header">
        <button onClick={() => navigate(`/capture/${venueId}`)} className="back-button">
          ← Back
        </button>
        <h1>3D Space Viewer</h1>
        <p>Venue: {venueId}</p>
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
          <button onClick={() => navigate(`/capture/${venueId}`)}>
            Go to Capture
          </button>
        </div>
      )}

      {loadingAssets.length > 0 && (
        <div className="asset-loading-notification">
          <div className="loader" />
          <p>Loading {loadingAssets.length} asset{loadingAssets.length > 1 ? 's' : ''}...</p>
        </div>
      )}

      <div ref={containerRef} className="viewer-container" />
      
      <div className="viewer-controls">
        <div className="dimension-controls">
          <label>
            Width: <input 
              type="number" 
              value={dimensions.width} 
              onChange={(e) => setDimensions({...dimensions, width: parseFloat(e.target.value) || 20})}
              min="5" 
              max="50" 
              step="1"
            />
          </label>
          <label>
            Height: <input 
              type="number" 
              value={dimensions.height} 
              onChange={(e) => setDimensions({...dimensions, height: parseFloat(e.target.value) || 8})}
              min="2" 
              max="15" 
              step="0.5"
            />
          </label>
          <label>
            Depth: <input 
              type="number" 
              value={dimensions.depth} 
              onChange={(e) => setDimensions({...dimensions, depth: parseFloat(e.target.value) || 20})}
              min="5" 
              max="50" 
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

