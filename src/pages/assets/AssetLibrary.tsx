import { useEffect, useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import './AssetLibrary.css'
import { getApiBaseUrl } from '../../utils/api'
import { loadThreeBundle } from '../../utils/threeLoader'
import PageNavBar from '../../components/PageNavBar'

// Type declarations for dynamically loaded Three.js
declare global {
  interface Window {
    THREE: any
  }
}

interface Asset {
  asset_id: number
  asset_name: string
  file_url: string
  file_path: string
  thumbnail_url: string | null
  source_image_url: string | null
  file_size_bytes: number
  generation_status: 'pending' | 'processing' | 'completed' | 'failed'
  generation_error: string | null
  asset_layer?: 'floor' | 'surface' | 'ceiling'
  width_m?: number
  depth_m?: number
  height_m?: number
  brightness?: number
  created_at: string
  is_preloaded?: boolean
}

type BuiltInAssetDef = {
  asset_id: number
  asset_name: string
  file: string
  asset_layer: 'floor' | 'surface' | 'ceiling'
  width_m: number
  depth_m: number
  height_m: number
}

type BuiltInAssetOverride = {
  height_m?: number
  asset_layer?: 'floor' | 'surface' | 'ceiling'
  brightness?: number
}

const BUILTIN_ASSETS: BuiltInAssetDef[] = [
  { asset_id: -1, asset_name: 'Rug', file: 'rug.glb', asset_layer: 'floor', width_m: 4, depth_m: 4, height_m: 0.02 },
  { asset_id: -2, asset_name: 'Table', file: 'asset_table.glb', asset_layer: 'surface', width_m: 4, depth_m: 2, height_m: 0.75 },
  { asset_id: -3, asset_name: 'Blue Vase', file: 'blue_vase.glb', asset_layer: 'surface', width_m: 0.4, depth_m: 0.4, height_m: 0.4 },
  { asset_id: -4, asset_name: 'Chandelier', file: 'chandelier.glb', asset_layer: 'ceiling', width_m: 1.2, depth_m: 1.2, height_m: 0.6 }
]

const BUILTIN_OVERRIDES_KEY = 'builtin_asset_overrides_v1'

export type HeightUnit = 'm' | 'ft' | 'in'
const METERS_PER_FT = 0.3048
const METERS_PER_IN = 0.0254

export function heightToMeters(value: number, unit: HeightUnit): number {
  if (unit === 'm') return value
  if (unit === 'ft') return value * METERS_PER_FT
  return value * METERS_PER_IN // 'in'
}

export function metersToHeight(meters: number, unit: HeightUnit): number {
  if (unit === 'm') return meters
  if (unit === 'ft') return meters / METERS_PER_FT
  return meters / METERS_PER_IN // 'in'
}

const getBuiltInOverrides = (): Record<string, BuiltInAssetOverride> => {
  try {
    return JSON.parse(localStorage.getItem(BUILTIN_OVERRIDES_KEY) || '{}')
  } catch {
    return {}
  }
}

const setBuiltInOverrides = (overrides: Record<string, BuiltInAssetOverride>) => {
  localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(overrides))
}

const buildBuiltInAssets = (): Asset[] => {
  const overrides = getBuiltInOverrides()
  return BUILTIN_ASSETS.map((item) => {
    const override = overrides[item.file] || {}
    const height = override.height_m ?? item.height_m
    const brightness = override.brightness ?? 1
    return {
      asset_id: item.asset_id,
      asset_name: item.asset_name,
      file_path: `models/${item.file}`,
      file_url: `/static/models/${item.file}`,
      thumbnail_url: null,
      source_image_url: null,
      file_size_bytes: 0,
      generation_status: 'completed',
      generation_error: null,
      asset_layer: override.asset_layer ?? item.asset_layer,
      width_m: item.width_m,
      depth_m: item.depth_m,
      height_m: height,
      brightness,
      created_at: new Date(0).toISOString(),
      is_preloaded: true
    }
  })
}

const AssetLibrary = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const viewerCleanupRef = useRef<(() => void) | null>(null)
  const viewerStateRef = useRef<{ model: any; applyBrightness: (b: number) => void } | null>(null)
  const [previewBrightness, setPreviewBrightness] = useState(1)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [assetName, setAssetName] = useState('')
  const [assetLayer, setAssetLayer] = useState<'floor' | 'surface' | 'ceiling'>('surface')
  const [heightM, setHeightM] = useState(1)
  const [heightUnit, setHeightUnit] = useState<HeightUnit>('m')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<Asset | null>(null)
  const [viewerLoading, setViewerLoading] = useState(false)
  const [viewerError, setViewerError] = useState<string | null>(null)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [editHeight, setEditHeight] = useState(1)
  const [editHeightUnit, setEditHeightUnit] = useState<HeightUnit>('m')
  const [editBrightness, setEditBrightness] = useState(1)
  const [editLayer, setEditLayer] = useState<'floor' | 'surface' | 'ceiling'>('surface')
  const [savingEdit, setSavingEdit] = useState(false)
  const [savingBrightness, setSavingBrightness] = useState(false)

  const API_BASE_URL = getApiBaseUrl()

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      navigate('/login')
      return
    }
    fetchAssets()
  }, [navigate])

  const fetchAssets = async () => {
    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/assets?include_failed=true`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        const data = await response.json()
        const userAssets = data.assets || []
        const builtInAssets = buildBuiltInAssets()
        setAssets([...builtInAssets, ...userAssets])
      } else if (response.status === 401) {
        localStorage.clear()
        navigate('/login')
      }
    } catch (err) {
      console.error('Error fetching assets:', err)
      setError('Failed to load assets')
    } finally {
      setLoading(false)
    }
  }

  const VIEW_LABELS = ['Front (required)', 'Right', 'Back', 'Left']

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length === 0) return
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    const valid: File[] = []
    for (const file of files) {
      if (!validTypes.includes(file.type) || file.size > 10 * 1024 * 1024) continue
      valid.push(file)
    }
    if (valid.length === 0) {
      setError('Please select image files (JPG, PNG, WebP), each under 10MB')
      return
    }
    setError(null)
    setSelectedFiles(valid)
    setSelectedFile(valid[0])
    const urls: string[] = []
    let loaded = 0
    valid.forEach((file, i) => {
      const reader = new FileReader()
      reader.onloadend = () => {
        urls[i] = reader.result as string
        loaded++
        if (loaded === valid.length) setPreviewUrls(urls)
      }
      reader.readAsDataURL(file)
    })
    if (!assetName && valid[0]) {
      setAssetName(valid[0].name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleGenerateAsset = async () => {
    const filesToSend = selectedFiles.length > 0 ? selectedFiles : (selectedFile ? [selectedFile] : [])
    if (filesToSend.length === 0) {
      setError('Please select at least one image')
      return
    }

    setUploading(true)
    setUploadProgress(filesToSend.length > 1 ? 'Uploading images...' : 'Uploading image...')
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      filesToSend.forEach((file) => formData.append('files', file))
      formData.append('asset_name', assetName || 'Untitled Asset')
      formData.append('asset_layer', assetLayer)
      formData.append('height_m', String(heightM))

      setUploadProgress(
        filesToSend.length > 1
          ? 'Generating 3D model from multiple views (Tripo3D)... This may take 1–2 minutes.'
          : 'Generating 3D model... This may take 30–60 seconds.'
      )
      const progressTimer = setTimeout(() => {
        setUploadProgress('Still generating... AI is processing your image(s) into a 3D model.')
      }, 20000)

      const response = await fetch(`${API_BASE_URL}/api/v1/assets/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      const data = await response.json()

      clearTimeout(progressTimer)
      
      if (response.ok && data.status === 'success') {
        setUploadProgress('Asset created successfully!')
        setSelectedFile(null)
        setSelectedFiles([])
        setPreviewUrls([])
        setAssetName('')
        setAssetLayer('surface')
        setHeightM(1)
        setShowUploadModal(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        // Refresh assets list, then auto-open the new asset in 3D viewer
        try {
          const token2 = localStorage.getItem('token')
          const refreshResponse = await fetch(`${API_BASE_URL}/api/v1/assets?include_failed=true`, {
            headers: { 'Authorization': `Bearer ${token2}` }
          })
          if (refreshResponse.ok) {
            const refreshData = await refreshResponse.json()
            const refreshedAssets = [...buildBuiltInAssets(), ...(refreshData.assets || [])]
            setAssets(refreshedAssets)
            // Auto-open the newest completed asset in the 3D viewer
            if (data.asset && data.asset.asset_id) {
              const newAsset = refreshedAssets.find((a: Asset) => a.asset_id === data.asset.asset_id)
              if (newAsset && newAsset.generation_status === 'completed') {
                setPreviewAsset(newAsset)
                setViewerLoading(true)
              }
            }
          }
        } catch {
          fetchAssets()
        }
      } else {
        setError(data.error || 'Failed to generate 3D model')
      }
    } catch (err) {
      console.error('Error generating asset:', err)
      setError('Failed to connect to server. The generation may take longer than expected.')
    } finally {
      setUploading(false)
      setUploadProgress('')
    }
  }

  const handleDeleteAsset = async (assetId: number) => {
    const target = assets.find(a => a.asset_id === assetId)
    if (target?.is_preloaded) {
      setError('Built-in assets cannot be deleted')
      return
    }
    if (!confirm('Are you sure you want to delete this asset?')) {
      return
    }

    try {
      const token = localStorage.getItem('token')
      const response = await fetch(`${API_BASE_URL}/api/v1/assets/detail/${assetId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })

      if (response.ok) {
        fetchAssets()
      } else {
        const data = await response.json()
        setError(data.error || 'Failed to delete asset')
      }
    } catch (err) {
      console.error('Error deleting asset:', err)
      setError('Failed to delete asset')
    }
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const loadThreeJS = useCallback(() => loadThreeBundle(), [])

  // Open 3D preview for an asset
  const handlePreviewAsset = (asset: Asset) => {
    if (asset.generation_status !== 'completed') return
    setPreviewAsset(asset)
    setPreviewBrightness(asset.brightness ?? 1)
    setViewerError(null)
    setViewerLoading(true)
  }

  const handleSavePreviewBrightness = async () => {
    if (!previewAsset) return
    setSavingBrightness(true)
    try {
      if (previewAsset.is_preloaded) {
        const overrides = getBuiltInOverrides()
        const fileKey = previewAsset.file_path.replace(/^models\//, '')
        overrides[fileKey] = { ...(overrides[fileKey] || {}), brightness: previewBrightness }
        setBuiltInOverrides(overrides)
        setAssets((prev) =>
          prev.map((a) =>
            a.asset_id === previewAsset.asset_id ? { ...a, brightness: previewBrightness } : a
          )
        )
        setPreviewAsset((a) => (a ? { ...a, brightness: previewBrightness } : null))
      } else {
        const token = localStorage.getItem('token')
        const res = await fetch(`${API_BASE_URL}/api/v1/assets/detail/${previewAsset.asset_id}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ brightness: previewBrightness })
        })
        if (res.ok) {
          await fetchAssets()
          setPreviewAsset((a) => (a ? { ...a, brightness: previewBrightness } : null))
        }
      }
    } finally {
      setSavingBrightness(false)
    }
  }

  const openEditAsset = (asset: Asset) => {
    setEditingAsset(asset)
    setEditHeight(asset.height_m ?? 1)
    setEditBrightness(asset.brightness ?? 1)
    setEditLayer((asset.asset_layer as 'floor' | 'surface' | 'ceiling') ?? 'surface')
  }

  const handleSaveAssetEdit = async () => {
    if (!editingAsset) return
    setSavingEdit(true)
    try {
      if (editingAsset.is_preloaded) {
        const overrides = getBuiltInOverrides()
        const fileKey = editingAsset.file_path.replace(/^models\//, '')
        overrides[fileKey] = {
          ...(overrides[fileKey] || {}),
          height_m: editHeight,
          asset_layer: editLayer,
          brightness: editBrightness
        }
        setBuiltInOverrides(overrides)
        setAssets(prev =>
          prev.map(a =>
            a.asset_id === editingAsset.asset_id
              ? { ...a, height_m: editHeight, asset_layer: editLayer, brightness: editBrightness }
              : a
          )
        )
        setEditingAsset(null)
        return
      }
      const token = localStorage.getItem('token')
      const res = await fetch(`${API_BASE_URL}/api/v1/assets/detail/${editingAsset.asset_id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          height_m: editHeight,
          asset_layer: editLayer,
          brightness: editBrightness
        })
      })
      if (res.ok) {
        await fetchAssets()
        setEditingAsset(null)
      } else {
        const data = await res.json()
        setError(data.error || 'Failed to update')
      }
    } catch (err) {
      setError('Failed to update asset')
    } finally {
      setSavingEdit(false)
    }
  }

  // Close 3D preview
  const closePreview = useCallback(() => {
    if (viewerCleanupRef.current) {
      viewerCleanupRef.current()
      viewerCleanupRef.current = null
    }
    setPreviewAsset(null)
    setViewerLoading(false)
    setViewerError(null)
  }, [])

  // Initialize 3D viewer when previewAsset changes
  useEffect(() => {
    if (!previewAsset || !viewerRef.current) return

    let cancelled = false

    const init3DViewer = async () => {
      try {
        await loadThreeJS()
        if (cancelled || !viewerRef.current) return

        const THREE = window.THREE
        const container = viewerRef.current
        const width = container.clientWidth
        const height = container.clientHeight

        // Scene
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(0xffffff)

        // Camera
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100)
        camera.position.set(2, 1.5, 2)

        // Renderer
        const renderer = new THREE.WebGLRenderer({ antialias: true })
        renderer.setSize(width, height)
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.shadowMap.enabled = true
        renderer.shadowMap.type = THREE.PCFSoftShadowMap
        renderer.outputEncoding = THREE.sRGBEncoding
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.0
        container.appendChild(renderer.domElement)

        // Orbit Controls
        const controls = new THREE.OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.08
        controls.autoRotate = true
        controls.autoRotateSpeed = 2.0
        controls.maxPolarAngle = Math.PI / 1.5
        controls.minDistance = 0.5
        controls.maxDistance = 10

        // Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6)
        scene.add(ambientLight)

        const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8)
        directionalLight.position.set(5, 10, 5)
        directionalLight.castShadow = true
        scene.add(directionalLight)

        const fillLight = new THREE.DirectionalLight(0xffffff, 0.3)
        fillLight.position.set(-5, 5, -5)
        scene.add(fillLight)

        // Grid helper (subtle)
        const gridHelper = new THREE.GridHelper(4, 20, 0xe0e0e0, 0xf0f0f0)
        scene.add(gridHelper)

        // Load GLB model
        const loader = new THREE.GLTFLoader()
        const modelUrl = `${API_BASE_URL}${previewAsset.file_url}`

        // Set a timeout for loading
        const loadTimeout = setTimeout(() => {
          if (!cancelled) {
            setViewerLoading(false)
            setViewerError('Model loading timed out. The file may be corrupted.')
          }
        }, 30000)

        loader.load(
          modelUrl,
          (gltf: any) => {
            clearTimeout(loadTimeout)
            if (cancelled) return

            const model = gltf.scene

            // Compute bounding box and center/scale the model
            const box = new THREE.Box3().setFromObject(model)
            const size = new THREE.Vector3()
            box.getSize(size)
            const center = new THREE.Vector3()
            box.getCenter(center)

            // Scale to fit within a 2-unit cube
            const maxDim = Math.max(size.x, size.y, size.z)
            const scale = maxDim > 0 ? 2 / maxDim : 1
            model.scale.setScalar(scale)

            // Recompute after scaling
            const scaledBox = new THREE.Box3().setFromObject(model)
            const scaledCenter = new THREE.Vector3()
            scaledBox.getCenter(scaledCenter)

            // Center horizontally and place on ground
            model.position.x = -scaledCenter.x
            model.position.z = -scaledCenter.z
            model.position.y = -scaledBox.min.y // Place bottom on ground

            // Store original material colors and apply brightness (so we can change it in real time)
            const initialBrightness = previewAsset.brightness ?? 1
            const applyBrightness = (b: number) => {
              model.traverse((child: any) => {
                if (child.isMesh && child.material) {
                  const mats = Array.isArray(child.material) ? child.material : [child.material]
                  mats.forEach((m: any) => {
                    if (m.userData.originalColor) {
                      m.color.copy(m.userData.originalColor).multiplyScalar(b)
                    }
                  })
                }
              })
            }
            model.traverse((child: any) => {
              if (child.isMesh && child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material]
                mats.forEach((m: any) => {
                  if (m.color) {
                    m.userData.originalColor = m.color.clone();
                    (m as any).color.multiplyScalar(initialBrightness)
                  }
                })
              }
            })
            viewerStateRef.current = { model, applyBrightness }

            scene.add(model)

            // Adjust camera to fit the model
            const scaledSize = new THREE.Vector3()
            scaledBox.getSize(scaledSize)
            const dist = Math.max(scaledSize.x, scaledSize.y, scaledSize.z) * 1.8
            camera.position.set(dist, dist * 0.7, dist)
            controls.target.set(0, scaledSize.y * 0.3, 0)
            controls.update()

            setViewerLoading(false)
          },
          undefined,
          (err: any) => {
            clearTimeout(loadTimeout)
            if (cancelled) return
            console.error('Failed to load GLB:', err)
            setViewerLoading(false)
            setViewerError('Failed to load 3D model. The file may be corrupted or unavailable.')
          }
        )

        // Animation loop
        let animFrameId: number
        const animate = () => {
          animFrameId = requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

        // Handle resize
        const handleResize = () => {
          if (!container) return
          const w = container.clientWidth
          const h = container.clientHeight
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          renderer.setSize(w, h)
        }
        window.addEventListener('resize', handleResize)

        // Store cleanup
        viewerCleanupRef.current = () => {
          cancelled = true
          viewerStateRef.current = null
          window.removeEventListener('resize', handleResize)
          cancelAnimationFrame(animFrameId)
          controls.dispose()
          renderer.dispose()
          if (container.contains(renderer.domElement)) {
            container.removeChild(renderer.domElement)
          }
          // Dispose scene objects
          scene.traverse((obj: any) => {
            if (obj.geometry) obj.geometry.dispose()
            if (obj.material) {
              if (Array.isArray(obj.material)) {
                obj.material.forEach((m: any) => m.dispose())
              } else {
                obj.material.dispose()
              }
            }
          })
        }

      } catch (err) {
        console.error('Error initializing 3D viewer:', err)
        if (!cancelled) {
          setViewerLoading(false)
          setViewerError('Failed to initialize 3D viewer')
        }
      }
    }

    init3DViewer()

    return () => {
      cancelled = true
      if (viewerCleanupRef.current) {
        viewerCleanupRef.current()
        viewerCleanupRef.current = null
      }
    }
  }, [previewAsset, API_BASE_URL, loadThreeJS])

  if (loading) {
    return (
      <div className="asset-library-container">
        <PageNavBar title="My asset library" backLabel="Back" />
      </div>
    )
  }

  return (
    <div className="asset-library-container">
      <PageNavBar
        title="My asset library"
        backLabel="Back"
        endSlot={
          <button
            type="button"
            className="create-asset-button"
            onClick={() => setShowUploadModal(true)}
            title="Upload a photo to generate a new 3D model"
          >
            + Create 3D asset
          </button>
        }
      />
      <div className="asset-library-subheader">
        <p className="page-subtitle">{assets.length} 3D assets</p>
      </div>

      <div className="asset-library-content">
        {error && (
          <div className="error-banner">
            {error}
            <button onClick={() => setError(null)}>×</button>
          </div>
        )}

        {/* Upload Modal */}
        {showUploadModal && (
          <div className="modal-overlay" onClick={() => !uploading && setShowUploadModal(false)}>
            <div className="upload-modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <h2>Create 3D Asset from Photo</h2>
                {!uploading && (
                  <button className="close-button" onClick={() => setShowUploadModal(false)}>×</button>
                )}
              </div>

              <div className="modal-body">
                <p className="modal-description">
                  Upload a photo of an object and we'll convert it into a 3D model you can use in your venues.
                </p>

                <div className="form-group">
                  <label>Asset Name</label>
                  <input
                    type="text"
                    value={assetName}
                    onChange={(e) => setAssetName(e.target.value)}
                    placeholder="e.g., Red Chair, Coffee Table"
                    disabled={uploading}
                  />
                </div>

                <div className="form-group">
                  <label>Category (Layer)</label>
                  <select
                    value={assetLayer}
                    onChange={(e) => setAssetLayer(e.target.value as 'floor' | 'surface' | 'ceiling')}
                    disabled={uploading}
                  >
                    <option value="floor">Floor (rugs, carpets)</option>
                    <option value="surface">Surface (furniture, objects)</option>
                    <option value="ceiling">Ceiling (lights, chandeliers)</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Height (object height for true-to-size scaling)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      min={heightUnit === 'in' ? 1 : 0.1}
                      step={heightUnit === 'in' ? 1 : 0.1}
                      value={metersToHeight(heightM, heightUnit)}
                      onChange={(e) => setHeightM(heightToMeters(parseFloat(e.target.value) || 0, heightUnit))}
                      disabled={uploading}
                      placeholder={heightUnit === 'm' ? 'e.g. 0.75' : heightUnit === 'ft' ? 'e.g. 2.5' : 'e.g. 30'}
                      style={{ flex: '1 1 120px' }}
                    />
                    <select
                      value={heightUnit}
                      onChange={(e) => setHeightUnit(e.target.value as HeightUnit)}
                      disabled={uploading}
                      style={{ minWidth: 80 }}
                    >
                      <option value="m">m</option>
                      <option value="ft">ft</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                  <p style={{ fontSize: '0.85em', color: '#888', marginTop: 4 }}>
                    Real-world height of the object. The 3D model is scaled to this size in the room.
                  </p>
                </div>

                <div className="form-group">
                  <label>Photos (multiview for best quality)</label>
                  <p className="modal-description" style={{ marginTop: 0, marginBottom: 8 }}>
                    Add 1–4 images: front view required; add right, back, and left for better 3D. Order = Front, Right, Back, Left.
                  </p>
                  <div 
                    className={`upload-area ${previewUrls.length > 0 ? 'has-preview' : ''}`}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    {previewUrls.length > 0 ? (
                      <div className="multiview-previews">
                        {previewUrls.map((url, i) => (
                          <div key={i} className="multiview-preview-item">
                            <img src={url} alt={VIEW_LABELS[i] || `View ${i + 1}`} />
                            <span className="multiview-label">{VIEW_LABELS[i] || `View ${i + 1}`}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="upload-placeholder">
                        <span className="upload-icon">📷</span>
                        <span>Click to select one or more images</span>
                        <span className="upload-hint">JPG, PNG, WebP • Max 10MB each • Order: Front, Right, Back, Left</span>
                      </div>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    disabled={uploading}
                    multiple
                  />
                </div>

                {uploadProgress && (
                  <div className="progress-indicator">
                    <div className="spinner"></div>
                    <span>{uploadProgress}</span>
                  </div>
                )}

                {error && <div className="form-error">{error}</div>}
              </div>

              <div className="modal-footer">
                <button 
                  className="cancel-button" 
                  onClick={() => setShowUploadModal(false)}
                  disabled={uploading}
                >
                  Cancel
                </button>
                <button 
                  className="generate-button"
                  onClick={handleGenerateAsset}
                  disabled={(selectedFiles.length === 0 && !selectedFile) || uploading}
                >
                  {uploading ? 'Generating...' : 'Generate 3D Model'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Edit dimensions modal */}
        {editingAsset && (
          <div className="modal-overlay" onClick={() => !savingEdit && setEditingAsset(null)}>
            <div className="upload-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
              <div className="modal-header">
                <h2>Edit dimensions: {editingAsset.asset_name}</h2>
                {!savingEdit && (
                  <button className="close-button" onClick={() => setEditingAsset(null)}>×</button>
                )}
              </div>
              <div className="modal-body">
                <p className="modal-description">Set the real-world height. The object is scaled to this height (true to room size).</p>
                <div className="form-group">
                  <label>Height</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="number"
                      min={editHeightUnit === 'in' ? 1 : 0.1}
                      step={editHeightUnit === 'in' ? 1 : 0.1}
                      value={metersToHeight(editHeight, editHeightUnit)}
                      onChange={(e) => setEditHeight(heightToMeters(parseFloat(e.target.value) || 0, editHeightUnit))}
                      style={{ flex: '1 1 120px' }}
                    />
                    <select
                      value={editHeightUnit}
                      onChange={(e) => setEditHeightUnit(e.target.value as HeightUnit)}
                      style={{ minWidth: 80 }}
                    >
                      <option value="m">m</option>
                      <option value="ft">ft</option>
                      <option value="in">in</option>
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label>Brightness</label>
                  <div className="edit-brightness-row">
                    <input
                      type="range"
                      min={0.3}
                      max={2.5}
                      step={0.1}
                      value={editBrightness}
                      onChange={(e) => setEditBrightness(parseFloat(e.target.value))}
                      disabled={savingEdit}
                      className="edit-brightness-slider"
                    />
                    <span className="edit-brightness-value" aria-live="polite">{editBrightness.toFixed(1)}</span>
                    <button
                      type="button"
                      onClick={() => setEditBrightness((b) => Math.max(0.3, Math.round((b - 0.1) * 10) / 10))}
                      disabled={savingEdit || editBrightness <= 0.3}
                      className="edit-brightness-btn"
                      aria-label="Decrease brightness"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditBrightness((b) => Math.min(2.5, Math.round((b + 0.1) * 10) / 10))}
                      disabled={savingEdit || editBrightness >= 2.5}
                      className="edit-brightness-btn"
                      aria-label="Increase brightness"
                    >
                      +
                    </button>
                  </div>
                  <p className="edit-brightness-hint">0.3 = darker, 1 = normal, 2.5 = brighter</p>
                </div>
                <div className="form-group">
                  <label>Layer</label>
                  <select value={editLayer} onChange={(e) => setEditLayer(e.target.value as 'floor' | 'surface' | 'ceiling')}>
                    <option value="floor">Floor</option>
                    <option value="surface">Surface</option>
                    <option value="ceiling">Ceiling</option>
                  </select>
                </div>
                <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                  <button className="generate-button" onClick={handleSaveAssetEdit} disabled={savingEdit}>
                    {savingEdit ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={() => setEditingAsset(null)} disabled={savingEdit}>Cancel</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Assets Grid */}
        {assets.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📦</div>
            <h3>No Assets Yet</h3>
            <p>Create your first 3D asset by uploading a photo of an object.</p>
            <button 
              className="create-first-button"
              onClick={() => setShowUploadModal(true)}
            >
              + Create Your First Asset
            </button>
          </div>
        ) : (
          <div className="assets-grid">
            {assets.map(asset => (
              <div 
                key={asset.asset_id} 
                className={`asset-card ${asset.generation_status} ${asset.generation_status === 'completed' ? 'clickable' : ''}`}
                onClick={() => handlePreviewAsset(asset)}
              >
                <div className="asset-thumbnail">
                  {asset.thumbnail_url ? (
                    <img src={`${API_BASE_URL}${asset.thumbnail_url}`} alt={asset.asset_name} />
                  ) : asset.source_image_url ? (
                    <img src={`${API_BASE_URL}${asset.source_image_url}`} alt={asset.asset_name} />
                  ) : (
                    <div className="no-thumbnail">
                      <span>📦</span>
                    </div>
                  )}
                  {asset.generation_status === 'processing' && (
                    <div className="status-overlay processing">
                      <div className="spinner"></div>
                      <span>Processing...</span>
                    </div>
                  )}
                  {asset.generation_status === 'failed' && (
                    <div className="status-overlay failed">
                      <span>Failed</span>
                    </div>
                  )}
                  {asset.generation_status === 'completed' && (
                    <div className="view-3d-badge">View 3D</div>
                  )}
                </div>
                <div className="asset-info">
                  <h3 className="asset-name">{asset.asset_name}</h3>
                  <p className="asset-meta">
                    {asset.is_preloaded ? 'Built-in asset' : `${formatFileSize(asset.file_size_bytes)} • ${formatDate(asset.created_at)}`}
                  </p>
                  {asset.generation_error && (
                    <p className="asset-error">{asset.generation_error}</p>
                  )}
                </div>
                <div className="asset-actions">
                  {asset.generation_status === 'completed' && (
                    <>
                      <button
                        className="action-button"
                        onClick={(e) => { e.stopPropagation(); openEditAsset(asset) }}
                        title="Edit dimensions"
                      >
                        Edit size
                      </button>
                      <a
                        href={`${API_BASE_URL}${asset.file_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-button download"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Download
                      </a>
                    </>
                  )}
                  {!asset.is_preloaded && (
                    <button
                      className="action-button delete"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAsset(asset.asset_id) }}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* 3D Preview Modal */}
        {previewAsset && (
          <div className="modal-overlay viewer-modal-overlay" onClick={closePreview}>
            <div className="viewer-modal" onClick={e => e.stopPropagation()}>
              <div className="viewer-modal-header">
                <h2>{previewAsset.asset_name}</h2>
                <div className="viewer-modal-actions">
                  <a 
                    href={`${API_BASE_URL}${previewAsset.file_url}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="viewer-download-btn"
                  >
                    Download GLB
                  </a>
                  <button className="close-button" onClick={closePreview}>x</button>
                </div>
              </div>
              <div className="viewer-modal-body">
                <div ref={viewerRef} className="glb-viewer-container">
                  {viewerLoading && (
                    <div className="viewer-loading">
                      <div className="spinner"></div>
                      <span>Loading 3D model...</span>
                    </div>
                  )}
                  {viewerError && (
                    <div className="viewer-error">
                      <span>{viewerError}</span>
                    </div>
                  )}
                </div>
                <div className="viewer-brightness-control">
                  <label className="viewer-brightness-label">Brightness</label>
                  <div className="viewer-brightness-row">
                    <input
                      type="range"
                      min={0.3}
                      max={2.5}
                      step={0.1}
                      value={previewBrightness}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        setPreviewBrightness(v)
                        viewerStateRef.current?.applyBrightness(v)
                      }}
                      className="viewer-brightness-slider"
                    />
                    <span className="viewer-brightness-value">{previewBrightness.toFixed(1)}</span>
                  </div>
                  <p className="viewer-brightness-hint">Adjust in real time • 0.3 = darker, 1 = normal, 2.5 = brighter</p>
                  <button
                    type="button"
                    onClick={handleSavePreviewBrightness}
                    disabled={savingBrightness}
                    className="viewer-save-brightness-btn"
                  >
                    {savingBrightness ? 'Saving...' : 'Save brightness'}
                  </button>
                </div>
                <div className="viewer-modal-info">
                  <span>Size: {formatFileSize(previewAsset.file_size_bytes)}</span>
                  <span>Created: {formatDate(previewAsset.created_at)}</span>
                  <span className="viewer-hint">Drag to rotate | Scroll to zoom</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default AssetLibrary
