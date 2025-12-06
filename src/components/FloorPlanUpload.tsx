import { useRef, useState } from 'react'
import './FloorPlanUpload.css'

type FloorPlanUploadProps = {
  venueId: string
  onUploadComplete: (floorPlanUrl: string) => void
}

const FloorPlanUpload = ({ venueId, onUploadComplete }: FloorPlanUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000'

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file')
      return
    }

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => {
      setPreview(e.target?.result as string)
    }
    reader.readAsDataURL(file)
    setError(null)
  }

  const handleUpload = async () => {
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setError('Please select a file first')
      return
    }

    setIsUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('venue_id', venueId)

      const response = await fetch(`${API_BASE_URL}/api/v1/venue/${venueId}/floor-plan`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to upload floor plan')
      }

      const data = await response.json()
      onUploadComplete(data.floor_plan_url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.')
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="floor-plan-upload">
      <div className="upload-container">
        <h2>Upload Floor Plan</h2>
        <p className="upload-description">
          Upload a 2D floor plan image to guide your wall capture session.
          The floor plan will show which wall to photograph next.
        </p>

        <div className="upload-area">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="file-input"
            id="floor-plan-input"
          />
          <label htmlFor="floor-plan-input" className="file-label">
            {preview ? (
              <img src={preview} alt="Floor plan preview" className="preview-image" />
            ) : (
              <div className="upload-placeholder">
                <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <p>Tap to select floor plan image</p>
              </div>
            )}
          </label>
        </div>

        {error && <div className="upload-error">{error}</div>}

        <button
          onClick={handleUpload}
          disabled={!preview || isUploading}
          className="upload-button"
        >
          {isUploading ? 'Uploading...' : 'Upload Floor Plan'}
        </button>
      </div>
    </div>
  )
}

export default FloorPlanUpload

