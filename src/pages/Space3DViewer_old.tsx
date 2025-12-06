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

  const API_BASE_URL = getApiBaseUrl()

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

        const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000)
        camera.position.set(0, dimensions.height / 2, dimensions.depth + 5)

        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(window.innerWidth, window.innerHeight)
        containerRef.current!.appendChild(renderer.domElement)

        const controls = new THREE.OrbitControls(camera, renderer.domElement)
        controls.target.set(0, dimensions.height / 2, 0)
        controls.enableDamping = true
        controls.dampingFactor = 0.05

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
              textures[wall] = texture
              onTextureLoad()
            },
            undefined,
            () => onTextureError(wall)
          )
        })

        let roomMesh: any = null
        let currentMaterials: any[] = []

        const createRoom = () => {
          if (roomMesh) {
            scene.remove(roomMesh)
            roomMesh.geometry.dispose()
            currentMaterials.forEach(mat => {
              if (mat.map) mat.map.dispose()
              mat.dispose()
            })
          }

          currentMaterials = [
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

          const geometry = new THREE.BoxGeometry(dimensions.width, dimensions.height, dimensions.depth)
          roomMesh = new THREE.Mesh(geometry, currentMaterials)
          scene.add(roomMesh)
        }

        // Animation loop
        const animate = () => {
          requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        // Handle resize
        const handleResize = () => {
          camera.aspect = window.innerWidth / window.innerHeight
          camera.updateProjectionMatrix()
          renderer.setSize(window.innerWidth, window.innerHeight)
        }
        window.addEventListener('resize', handleResize)

        // Cleanup
        return () => {
          window.removeEventListener('resize', handleResize)
          if (roomMesh) {
            scene.remove(roomMesh)
            roomMesh.geometry.dispose()
            currentMaterials.forEach(mat => {
              if (mat.map) mat.map.dispose()
              mat.dispose()
            })
          }
          Object.values(textures).forEach(tex => {
            if (tex) tex.dispose()
          })
          renderer.dispose()
          if (containerRef.current && renderer.domElement.parentNode === containerRef.current) {
            containerRef.current.removeChild(renderer.domElement)
          }
        }
      } catch (err) {
        console.error('Error setting up 3D viewer:', err)
        setError('Failed to load 3D viewer. Please check if wall textures are processed.')
        setLoading(false)
      }
    }

    loadThreeJS()
  }, [venueId, dimensions])

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

