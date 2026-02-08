import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import './AssetLibrary.css'
import { getApiBaseUrl } from '../../utils/api'

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
  created_at: string
}

const AssetLibrary = () => {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [assets, setAssets] = useState<Asset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState('')
  const [assetName, setAssetName] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showUploadModal, setShowUploadModal] = useState(false)

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
        setAssets(data.assets || [])
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

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Validate file type
      const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
      if (!validTypes.includes(file.type)) {
        setError('Please select a valid image file (JPG, PNG, or WebP)')
        return
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('Image must be smaller than 10MB')
        return
      }

      setSelectedFile(file)
      setError(null)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string)
      }
      reader.readAsDataURL(file)

      // Default asset name from filename
      if (!assetName) {
        const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '')
        setAssetName(nameWithoutExt)
      }
    }
  }

  const handleGenerateAsset = async () => {
    if (!selectedFile) {
      setError('Please select an image first')
      return
    }

    setUploading(true)
    setUploadProgress('Uploading image...')
    setError(null)

    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('file', selectedFile)
      formData.append('asset_name', assetName || 'Untitled Asset')

      setUploadProgress('Generating 3D model... This may take 30-60 seconds.')
      
      // Set a longer timeout message
      const progressTimer = setTimeout(() => {
        setUploadProgress('Still generating... AI is processing your image into a 3D model.')
      }, 15000)

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
        // Reset form
        setSelectedFile(null)
        setPreviewUrl(null)
        setAssetName('')
        setShowUploadModal(false)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        // Refresh assets list
        fetchAssets()
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

  const handleBack = () => {
    navigate('/venues')
  }

  if (loading) {
    return (
      <div className="asset-library-container">
        <div className="asset-library-header">
          <div className="header-left">
            <h1 className="page-title">Loading...</h1>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="asset-library-container">
      <div className="asset-library-header">
        <div className="header-left">
          <button onClick={handleBack} className="back-button">
            ← Back
          </button>
          <div>
            <h1 className="page-title">My Asset Library</h1>
            <p className="page-subtitle">{assets.length} 3D assets</p>
          </div>
        </div>
        <button 
          className="create-asset-button"
          onClick={() => setShowUploadModal(true)}
        >
          + Create 3D Asset
        </button>
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
                  <label>Photo</label>
                  <div 
                    className={`upload-area ${previewUrl ? 'has-preview' : ''}`}
                    onClick={() => !uploading && fileInputRef.current?.click()}
                  >
                    {previewUrl ? (
                      <img src={previewUrl} alt="Preview" className="preview-image" />
                    ) : (
                      <div className="upload-placeholder">
                        <span className="upload-icon">📷</span>
                        <span>Click to select an image</span>
                        <span className="upload-hint">JPG, PNG, WebP • Max 10MB</span>
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
                  disabled={!selectedFile || uploading}
                >
                  {uploading ? 'Generating...' : 'Generate 3D Model'}
                </button>
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
              <div key={asset.asset_id} className={`asset-card ${asset.generation_status}`}>
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
                      <span>⚠️ Failed</span>
                    </div>
                  )}
                </div>
                <div className="asset-info">
                  <h3 className="asset-name">{asset.asset_name}</h3>
                  <p className="asset-meta">
                    {formatFileSize(asset.file_size_bytes)} • {formatDate(asset.created_at)}
                  </p>
                  {asset.generation_error && (
                    <p className="asset-error">{asset.generation_error}</p>
                  )}
                </div>
                <div className="asset-actions">
                  {asset.generation_status === 'completed' && (
                    <a 
                      href={`${API_BASE_URL}${asset.file_url}`} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="action-button download"
                    >
                      Download GLB
                    </a>
                  )}
                  <button 
                    className="action-button delete"
                    onClick={() => handleDeleteAsset(asset.asset_id)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default AssetLibrary
