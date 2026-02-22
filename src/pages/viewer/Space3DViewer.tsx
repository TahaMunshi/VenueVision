import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import './Space3DViewer.css'
import { getApiBaseUrl } from '../../utils/api'

// Type declarations for dynamically loaded Three.js
declare global {
  interface Window {
    THREE: any
  }
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
  const floorPlaneRef = useRef<any>(null)
  const ceilingPlaneRef = useRef<any>(null)
  const materialsRef = useRef<any[]>([])
  const texturesRef = useRef<{ [key: string]: any }>({})
  const assetsRef = useRef<any[]>([])
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
        // Fetch wall images and layout (for materials / generated glb)
        let wallImageUrls: { [key: string]: string } = {}
        let generatedGlb: string | null = null
        try {
          const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/wall-images`)
          const data = await response.json()
          if (data.status === 'success' && data.wall_images) {
            wallImageUrls = data.wall_images
          }
        } catch (err) {
          console.warn('[Space3DViewer] Failed to fetch wall images, will try default paths:', err)
        }
        try {
          const layoutResponse = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`)
          const layoutData = await layoutResponse.json()
          if (layoutData.status === 'success' && layoutData.generated_glb) {
            generatedGlb = `${API_BASE_URL}${layoutData.generated_glb}`
          }
          if (layoutData.status === 'success' && layoutData.dimensions) {
            setDimensions(layoutData.dimensions)
          }
        } catch (err) {
          console.warn('[Space3DViewer] Failed to fetch layout for GLB info:', err)
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

        // Calculate actual floor level (room box is centered, so floor is at -height/2)
        const floorY = -dimensions.height / 2
        const ceilingY = dimensions.height / 2

        // Add a dedicated floor plane (beige) so the floor is always visible
        const addWhiteFloorPlane = () => {
          if (floorPlaneRef.current) {
            scene.remove(floorPlaneRef.current)
            floorPlaneRef.current.geometry?.dispose()
            floorPlaneRef.current.material?.dispose()
            floorPlaneRef.current = null
          }
          const floorGeo = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
          const floorMat = new THREE.MeshBasicMaterial({ color: 0xc6b39e, side: THREE.DoubleSide })
          const plane = new THREE.Mesh(floorGeo, floorMat)
          plane.rotation.x = -Math.PI / 2
          plane.position.y = floorY + 0.002
          plane.renderOrder = 1
          scene.add(plane)
          floorPlaneRef.current = plane
        }

        // Add a translucent horizontal plane at the ceiling so the chandelier is visible
        const addCeilingPlane = () => {
          if (ceilingPlaneRef.current) {
            scene.remove(ceilingPlaneRef.current)
            ceilingPlaneRef.current.geometry?.dispose()
            ceilingPlaneRef.current.material?.dispose()
            ceilingPlaneRef.current = null
          }
          const ceilingGeo = new THREE.PlaneGeometry(dimensions.width, dimensions.depth)
          const ceilingMat = new THREE.MeshBasicMaterial({
            color: 0xeeeeee,
            transparent: true,
            opacity: 0.22,
            side: THREE.DoubleSide,
            depthWrite: false
          })
          const plane = new THREE.Mesh(ceilingGeo, ceilingMat)
          plane.rotation.x = -Math.PI / 2
          plane.position.y = ceilingY - 0.002
          plane.renderOrder = 0
          scene.add(plane)
          ceilingPlaneRef.current = plane
        }

        // Optional: Add visible floor grid at actual floor level for debugging
        // Uncomment these lines if you want to see the floor plane
        /*
        const floorGrid = new THREE.GridHelper(Math.max(dimensions.width, dimensions.depth) * 2, 20, 0x00ff00, 0x444444)
        floorGrid.position.y = floorY
        scene.add(floorGrid)
        
        const floorPlaneGeometry = new THREE.PlaneGeometry(dimensions.width * 2, dimensions.depth * 2)
        const floorPlaneMaterial = new THREE.MeshBasicMaterial({ 
          color: 0xff0000, 
          opacity: 0.3, 
          transparent: true,
          side: THREE.DoubleSide
        })
        const floorPlane = new THREE.Mesh(floorPlaneGeometry, floorPlaneMaterial)
        floorPlane.rotation.x = -Math.PI / 2
        floorPlane.position.y = floorY
        scene.add(floorPlane)
        */

        // If a server-generated GLB exists, try to load it first
        if (generatedGlb) {
          try {
            const gltfLoader = new THREE.GLTFLoader()
            await new Promise<void>((resolve, reject) => {
              gltfLoader.load(
                generatedGlb!,
                (gltf: any) => {
                  scene.add(gltf.scene)
                  addWhiteFloorPlane()
                  addCeilingPlane()
                  setLoading(false)
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

        const tryCreateWalls = () => {
          // Try to create walls if we have layout data and all textures are loaded
          if (layoutData && layoutData.walls && Array.isArray(layoutData.walls) && layoutData.walls.length > 0) {
            if (loadedCount === totalTextures && totalTextures > 0) {
              create3DWalls(layoutData.walls)
              addWhiteFloorPlane()
              addCeilingPlane()
              setLoading(false)
            }
          } else if (loadedCount === totalTextures && totalTextures > 0) {
            // Only create generic room box if NO custom walls from floor plan
            createRoom()
            addWhiteFloorPlane()
            addCeilingPlane()
            setLoading(false)
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
        fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`)
          .then(res => res.json())
          .then(data => {
            layoutData = data

            if (!data.walls || data.walls.length === 0) {
              createRoom()
              addWhiteFloorPlane()
              addCeilingPlane()
              setLoading(false)
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
          .catch(err => {
            console.error('[3D Viewer] Error loading layout:', err)
            createRoom()
            setLoading(false)
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

          // Get floor color from layout materials if available
          let floorColor = 0x444444
          if (layoutData?.materials?.floor?.color) {
            const colorStr = layoutData.materials.floor.color
            if (colorStr.startsWith('#')) {
              floorColor = parseInt(colorStr.substring(1), 16)
            } else if (typeof colorStr === 'string') {
              floorColor = parseInt(colorStr, 16)
            }
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
            new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.18, side: THREE.BackSide }), // Top (Ceiling) – very translucent so chandelier is visible
            new THREE.MeshBasicMaterial({ color: floorColor, side: THREE.BackSide }), // Bottom (Floor) - beige
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

        // Create 3D walls from floor plan wall data
        const create3DWalls = (wallsData: any[]) => {
          if (!wallsData || wallsData.length === 0) return

          const wallHeight = dimensions.height
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
            
            const x1World = (x1Norm / 100) * dimensions.width - dimensions.width / 2
            const z1World = (y1Norm / 100) * dimensions.depth - dimensions.depth / 2
            const x2World = (x2Norm / 100) * dimensions.width - dimensions.width / 2
            const z2World = (y2Norm / 100) * dimensions.depth - dimensions.depth / 2

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
            const layoutResponse = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/layout`)
            const data = await layoutResponse.json()
            
            // Store layout data - it will be used once textures are loaded
            layoutData = data

            if (data.status === 'success' && data.assets && data.assets.length > 0) {
              // Update room dimensions if provided
              if (data.dimensions) {
                setDimensions(data.dimensions)
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
              const layoutW = data.dimensions?.width || dimensions.width
              const layoutD = data.dimensions?.depth || dimensions.depth
              const layoutH = data.dimensions?.height || dimensions.height

              layoutDataRef.current = {
                layoutDimensions: { width: layoutW, height: layoutH, depth: layoutD },
                assetPlacements: []
              }

              // Calculate actual floor and ceiling (room box is centered: floor at -height/2, ceiling at +height/2)
              const floorY = -layoutH / 2
              const ceilingY = layoutH / 2
              const isCeilingAsset = (a: any) => a.layer === 'ceiling' || a.file === 'chandelier.glb'
              const rootAssets = data.assets.filter((a: any) => !(a.parentAssetId ?? a.parent_asset_id))
              const childAssets = data.assets.filter((a: any) => !!(a.parentAssetId ?? a.parent_asset_id))
              const parentSurfaceByAssetId: Record<string, { topY: number; centerX: number; centerZ: number }> = {}
              setLoadingAssets(data.assets.map((a: any) => a.id || a.file))

              const loadOneAsset = (asset: any, worldX: number, worldY: number, worldZ: number, isRoot: boolean, onCeiling: boolean, parentId?: string): Promise<void> =>
                new Promise((resolve, reject) => {
                  const group = new THREE.Group()
                  group.position.set(worldX, worldY, worldZ)
                  group.rotation.y = -asset.rotation * (Math.PI / 180)

                // Load the 3D model - handle both default assets and user assets
                // User assets have paths like 'user_assets/1/user_1_xxx.glb'
                // Default assets have paths like 'asset_table.glb'
                const modelPath = asset.file.includes('/') 
                  ? `${API_BASE_URL}/static/${asset.file}` 
                  : `${API_BASE_URL}/static/models/${asset.file}`
                const assetId = asset.id || asset.file

                fetch(modelPath, { method: 'HEAD' })
                  .then((headCheck) => {
                    if (!headCheck.ok) {
                      setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                      resolve()
                      return
                    }
                    const loadTimer = setTimeout(() => {
                      setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                    }, 20000)
                    gltfLoader.load(
                  modelPath,
                  (gltf: any) => {
                    clearTimeout(loadTimer)

                    // Compute initial bounds BEFORE any transformations
                    const box = new THREE.Box3().setFromObject(gltf.scene)
                    const size = new THREE.Vector3()
                    box.getSize(size)
                    const center = new THREE.Vector3()
                    box.getCenter(center)

                    // STEP 1: Floor assets BOTTOM at y=0; ceiling assets (chandelier) TOP at y=0 so it hangs down
                    if (onCeiling) {
                      gltf.scene.position.y = -box.max.y
                    } else {
                      gltf.scene.position.y = -box.min.y
                    }

                    // STEP 2: Uniform scale from height - all axes scale proportionally
                    const heightM = asset.height ?? asset.height_m
                    const isFloorAsset = asset.layer === 'floor' || asset.file === 'rug.glb'
                    const sizeBoost = onCeiling ? 1.4 : (isFloorAsset ? 1.5 : 1)
                    let scale: number
                    if (size.y > 0 && heightM != null && heightM > 0) {
                      scale = (heightM / size.y) * sizeBoost
                    } else {
                      scale = (size.x > 0 ? asset.width / size.x : 1) * sizeBoost
                    }
                    gltf.scene.scale.set(scale, scale, scale)

                    // STEP 3: Center the model horizontally (X and Z only)
                    // Recompute center after scaling to ensure accurate centering
                    const scaledBox = new THREE.Box3().setFromObject(gltf.scene)
                    const scaledCenter = new THREE.Vector3()
                    scaledBox.getCenter(scaledCenter)
                    
                    gltf.scene.position.x = -scaledCenter.x
                    gltf.scene.position.z = -scaledCenter.z

                    // STEP 4: Verify final bounds - floor: bottom at y=0; ceiling: top at y=0
                    const finalBox = new THREE.Box3().setFromObject(gltf.scene)
                    const minY = finalBox.min.y
                    const maxY = finalBox.max.y

                    if (onCeiling) {
                      if (Math.abs(maxY) > 0.001) gltf.scene.position.y -= maxY
                    } else if (Math.abs(minY) > 0.001) {
                      gltf.scene.position.y -= minY
                    }

                    const verifyBox = new THREE.Box3().setFromObject(gltf.scene)
                    if (onCeiling) {
                      if (Math.abs(verifyBox.max.y) > 0.001) gltf.scene.position.y -= verifyBox.max.y
                    } else {
                      if (Math.abs(verifyBox.min.y) > 0.001) gltf.scene.position.y -= verifyBox.min.y
                    }

                    group.add(gltf.scene)
                    group.updateMatrixWorld(true)
                    const groupBox = new THREE.Box3().setFromObject(group)
                    if (onCeiling) {
                      if (Math.abs(groupBox.max.y - worldY) > 0.001) {
                        gltf.scene.position.y += worldY - groupBox.max.y
                      }
                    } else {
                      if (Math.abs(groupBox.min.y - worldY) > 0.001) {
                        gltf.scene.position.y += worldY - groupBox.min.y
                      }
                    }
                    scene.add(group)
                    assetsRef.current.push(group)
                    if (layoutDataRef.current) {
                      layoutDataRef.current.assetPlacements.push({
                        group,
                        asset,
                        isRoot,
                        isCeiling: onCeiling,
                        parentId
                      })
                    }
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
                    resolve()
                  },
                  undefined,
                  (err: any) => {
                    clearTimeout(loadTimer)
                    setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                    reject(err)
                  }
                )
                  })
                  .catch(() => {
                    setLoadingAssets((prev) => prev.filter(id => id !== assetId))
                    resolve()
                  })
                })
              
              // Plane technique: same X/Z from 2D grid; Y = floor or ceiling. Floor assets slightly above floor plane so they sit on top (no z-fight).
              const FLOOR_ASSET_OFFSET = 0.005
              const getRootWorldPosition = (a: any) => {
                const centerX2D = a.x + (a.width / 2)
                const centerY2D = a.y + (a.depth / 2)
                const worldY = isCeilingAsset(a) ? ceilingY : floorY + FLOOR_ASSET_OFFSET
                return {
                  worldX: centerX2D - (layoutW / 2),
                  worldY,
                  worldZ: centerY2D - (layoutD / 2)
                }
              }
              await Promise.all(
                rootAssets.map((asset: any) => {
                  const { worldX, worldY, worldZ } = getRootWorldPosition(asset)
                  return loadOneAsset(asset, worldX, worldY, worldZ, true, isCeilingAsset(asset), undefined)
                })
              ).catch(() => {})
              for (const asset of childAssets) {
                const parentId = String(asset.parentAssetId ?? asset.parent_asset_id ?? '')
                const surface = parentSurfaceByAssetId[parentId]
                const ox = asset.offsetX ?? asset.offset_x ?? 0
                const oy = asset.offsetY ?? asset.offset_y ?? 0
                const worldX = surface ? surface.centerX + ox : (asset.x + asset.width / 2) - layoutW / 2
                const worldY = surface ? surface.topY : (isCeilingAsset(asset) ? ceilingY : floorY + FLOOR_ASSET_OFFSET)
                const worldZ = surface ? surface.centerZ + oy : (asset.y + asset.depth / 2) - layoutD / 2
                await loadOneAsset(asset, worldX, worldY, worldZ, false, isCeilingAsset(asset), parentId).catch(() => {})
              }
            }
          } catch (error) {
            console.error('Error loading layout:', error)
          }
        }
        
        // Layout loading is now handled both here and in the texture loading logic above
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
    const floorY = -ch / 2
    const ceilingY = ch / 2
    const FLOOR_ASSET_OFFSET = 0.005

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
      new THREE.MeshBasicMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.18, side: THREE.BackSide }), // Ceiling – translucent
      new THREE.MeshBasicMaterial({ color: 0xc6b39e, side: THREE.BackSide }), // Floor: beige
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

    // Recreate floor and ceiling planes with new dimensions (keeps floor/ceiling consistent with room)
    if (floorPlaneRef.current) {
      sceneRef.current.remove(floorPlaneRef.current)
      floorPlaneRef.current.geometry?.dispose()
      floorPlaneRef.current.material?.dispose()
      floorPlaneRef.current = null
    }
    const floorGeo = new THREE.PlaneGeometry(cw, cd)
    const floorMat = new THREE.MeshBasicMaterial({ color: 0xc6b39e, side: THREE.DoubleSide })
    const floorPlane = new THREE.Mesh(floorGeo, floorMat)
    floorPlane.rotation.x = -Math.PI / 2
    floorPlane.position.y = floorY + 0.002
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
    const ceilingMat = new THREE.MeshBasicMaterial({
      color: 0xeeeeee,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    })
    const ceilingPlane = new THREE.Mesh(ceilingGeo, ceilingMat)
    ceilingPlane.rotation.x = -Math.PI / 2
    ceilingPlane.position.y = ceilingY - 0.002
    ceilingPlane.renderOrder = 0
    sceneRef.current.add(ceilingPlane)
    ceilingPlaneRef.current = ceilingPlane

    // Reposition all assets using normalized layout coords so meter scale stays in sync
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
          worldY = onCeiling ? ceilingY : floorY + FLOOR_ASSET_OFFSET
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
            worldY = onCeiling ? ceilingY : floorY + FLOOR_ASSET_OFFSET
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
  }, [dimensions])

  return (
    <div className="space-3d-viewer">
      <div className="viewer-header">
        {/* Back should always take the user to the mobile home screen */}
        <button onClick={() => navigate('/')} className="back-button">
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
          {/* On error, also send users back to the home page */}
          <button onClick={() => navigate('/')}>
            Go to Home
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
      
      {/* Back button */}
      <button 
        onClick={() => navigate(`/venue/${venueId}`)}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          padding: '12px 24px',
          background: 'rgba(255, 255, 255, 0.9)',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: '600',
          zIndex: 1000,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}
      >
        ← Back to Venue
      </button>
      
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

