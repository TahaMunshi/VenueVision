import { useState, type FormEvent } from 'react'
import './CreateVenueModal.css'
import { getApiBaseUrl } from '../../utils/api'

interface CreateVenueModalProps {
  onClose: () => void
  onSuccess: (venueId: string) => void
}

const CreateVenueModal = ({ onClose, onSuccess }: CreateVenueModalProps) => {
  const [formData, setFormData] = useState({
    venueName: '',
    width: 40,
    height: 9,
    depth: 40
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const API_BASE_URL = getApiBaseUrl()

  const generateVenueIdentifier = (name: string) => {
    // Convert name to URL-friendly identifier
    const base = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
    
    // Add timestamp to ensure uniqueness
    const timestamp = Date.now()
    return `${base}-${timestamp}`
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.venueName.trim()) {
      setError('Venue name is required')
      return
    }

    if (formData.width < 5 || formData.width > 330) {
      setError('Width must be between 5 and 330 feet')
      return
    }

    if (formData.height < 6 || formData.height > 40) {
      setError('Height must be between 6 and 40 feet')
      return
    }

    if (formData.depth < 5 || formData.depth > 330) {
      setError('Depth must be between 5 and 330 feet')
      return
    }

    setLoading(true)

    try {
      const token = localStorage.getItem('token')
      const venueIdentifier = generateVenueIdentifier(formData.venueName)

      const response = await fetch(`${API_BASE_URL}/api/v1/venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          venue_identifier: venueIdentifier,
          venue_name: formData.venueName,
          width: formData.width,
          height: formData.height,
          depth: formData.depth
        })
      })

      const data = await response.json()

      if (response.ok) {
        onSuccess(venueIdentifier)
      } else {
        setError(data.error || 'Failed to create venue')
      }
    } catch (err) {
      console.error('Error creating venue:', err)
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="create-venue-modal" onClick={onClose}>
      <div className="create-venue-form-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create New Venue</h2>
          <p className="modal-subtitle">Enter details for your new event space</p>
        </div>

        <form onSubmit={handleSubmit} className="modal-form">
          {error && <div className="modal-error">{error}</div>}

          <div className="modal-form-group">
            <label htmlFor="venueName" className="modal-form-label">
              Venue Name *
            </label>
            <input
              id="venueName"
              type="text"
              className="modal-form-input"
              placeholder="e.g., Grand Conference Hall"
              value={formData.venueName}
              onChange={(e) => setFormData({ ...formData, venueName: e.target.value })}
              required
              disabled={loading}
              autoFocus
            />
          </div>

          <div className="modal-form-group">
            <label htmlFor="width" className="modal-form-label">
              Width (feet)
            </label>
            <input
              id="width"
              type="number"
              className="modal-form-input"
              value={formData.width}
              onChange={(e) => setFormData({ ...formData, width: parseFloat(e.target.value) || 40 })}
              min="5"
              max="330"
              step="1"
              disabled={loading}
            />
            <p className="modal-form-hint">Suggested: about 30–100 ft for typical event spaces</p>
          </div>

          <div className="modal-form-group">
            <label htmlFor="height" className="modal-form-label">
              Height (feet)
            </label>
            <input
              id="height"
              type="number"
              className="modal-form-input"
              value={formData.height}
              onChange={(e) => setFormData({ ...formData, height: parseFloat(e.target.value) || 9 })}
              min="6"
              max="40"
              step="0.5"
              disabled={loading}
            />
            <p className="modal-form-hint">Typical ceiling: about 9–16 ft</p>
          </div>

          <div className="modal-form-group">
            <label htmlFor="depth" className="modal-form-label">
              Depth (feet)
            </label>
            <input
              id="depth"
              type="number"
              className="modal-form-input"
              value={formData.depth}
              onChange={(e) => setFormData({ ...formData, depth: parseFloat(e.target.value) || 40 })}
              min="5"
              max="330"
              step="1"
              disabled={loading}
            />
            <p className="modal-form-hint">Suggested: about 30–100 ft for typical event spaces</p>
          </div>

          <div className="modal-actions">
            <button
              type="button"
              onClick={onClose}
              className="modal-button modal-button-secondary"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="modal-button modal-button-primary"
              disabled={loading}
            >
              {loading ? 'Creating...' : 'Create Venue'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default CreateVenueModal
