import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom'
import { getApiBaseUrl, getAuthHeaders } from '../../utils/api'
import './Vendor.css'

const CATEGORIES = [
  'event_hall', 'conference_room', 'wedding_venue', 'banquet_hall',
  'outdoor_garden', 'rooftop', 'studio', 'restaurant', 'warehouse', 'other',
]

export default function VendorVenueEdit() {
  const { venueId: routeVenueId } = useParams<{ venueId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  /** `/vendor/venues/new` has no :venueId param — must detect from path */
  const isNew = location.pathname === '/vendor/venues/new'
  const venueId = isNew ? undefined : routeVenueId

  const API = getApiBaseUrl()

  const [form, setForm] = useState({
    name: '',
    description: '',
    address: '',
    city: '',
    country: '',
    category: 'event_hall',
    capacity: '',
    width: '40',
    height: '9',
    depth: '40',
  })
  const [venueIdentifier, setVenueIdentifier] = useState<string | null>(null)
  const [pricing, setPricing] = useState<any[]>([])
  const [packages, setPackages] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [tab, setTab] = useState<'info' | 'pricing' | 'packages' | 'setup'>('info')
  const [coverImage, setCoverImage] = useState<string | null>(null)
  const [coverRev, setCoverRev] = useState(0)
  const [coverUploading, setCoverUploading] = useState(false)
  const coverFileRef = useRef<HTMLInputElement>(null)

  const loadVenue = useCallback(async () => {
    if (!venueId) return
    setError('')
    const res = await fetch(`${API}/api/v1/vendor/venues`, { headers: getAuthHeaders() })
    if (!res.ok) return
    const data = await res.json()
    const v = data.venues?.find((x: any) => String(x.venue_id) === String(venueId))
    if (v) {
      setVenueIdentifier(v.venue_identifier)
      setCoverImage(v.cover_image ?? null)
      setForm({
        name: v.name || '',
        description: v.description || '',
        address: v.address || '',
        city: v.city || '',
        country: v.country || '',
        category: v.category || 'event_hall',
        capacity: v.capacity ? String(v.capacity) : '',
        width: String(v.dimensions?.width ?? 40),
        height: String(v.dimensions?.height ?? 9),
        depth: String(v.dimensions?.depth ?? 40),
      })
    } else if (Array.isArray(data.venues) && data.venues.length > 0) {
      setError('This venue is not in your account or the link is wrong. Use My Venues → Edit.')
      setCoverImage(null)
    }
    const pr = await fetch(`${API}/api/v1/vendor/venues/${venueId}/pricing`, {
      headers: getAuthHeaders(),
    })
    if (pr.ok) {
      const d = await pr.json()
      setPricing(d.pricing || [])
    }
    const pk = await fetch(`${API}/api/v1/vendor/venues/${venueId}/packages`, {
      headers: getAuthHeaders(),
    })
    if (pk.ok) {
      const d = await pk.json()
      setPackages(d.packages || [])
    }
  }, [API, venueId])

  useEffect(() => {
    if (!isNew && venueId) loadVenue()
    else {
      setVenueIdentifier(null)
      setCoverImage(null)
      setPricing([])
      setPackages([])
    }
  }, [isNew, venueId, loadVenue])

  async function handleSave() {
    if (!form.name.trim()) {
      setError('Name required')
      return
    }
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const body = {
        name: form.name,
        venue_name: form.name,
        description: form.description,
        address: form.address,
        city: form.city,
        country: form.country,
        category: form.category,
        capacity: form.capacity ? parseInt(form.capacity, 10) : null,
        width: parseFloat(form.width),
        height: parseFloat(form.height),
        depth: parseFloat(form.depth),
        identifier: form.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '')
          .slice(0, 80),
      }
      const url = isNew
        ? `${API}/api/v1/vendor/venues`
        : `${API}/api/v1/vendor/venues/${venueId}`
      const res = await fetch(url, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        if (isNew && data.venue_id != null) {
          setVenueIdentifier(data.venue_identifier ?? null)
          setNotice('Venue created. Add pricing, then set up the floor plan and demo assets below.')
          navigate(`/vendor/venues/${data.venue_id}/edit`, { replace: true })
        } else {
          setNotice('Saved.')
          loadVenue()
        }
        setTimeout(() => setNotice(''), 5000)
      } else {
        setError(data.error || 'Save failed')
      }
    } catch {
      setError('Network error')
    }
    setSaving(false)
  }

  async function uploadCover(file: File) {
    if (!venueId || isNew) return
    setCoverUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch(`${API}/api/v1/vendor/venues/${venueId}/cover`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: fd,
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.cover_image) {
        setCoverImage(data.cover_image)
        setCoverRev((n) => n + 1)
        setNotice('Cover photo saved. It appears on your marketplace listing.')
        setTimeout(() => setNotice(''), 5000)
      } else {
        setError(data.error || 'Could not upload image')
      }
    } catch {
      setError('Network error')
    }
    setCoverUploading(false)
  }

  async function removeCover() {
    if (!venueId || isNew || !coverImage) return
    setCoverUploading(true)
    setError('')
    try {
      const res = await fetch(`${API}/api/v1/vendor/venues/${venueId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ cover_image: null }),
      })
      if (res.ok) {
        setCoverImage(null)
        setCoverRev((n) => n + 1)
        setNotice('Cover photo removed.')
        setTimeout(() => setNotice(''), 4000)
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data.error || 'Could not remove cover')
      }
    } catch {
      setError('Network error')
    }
    setCoverUploading(false)
  }

  async function addPricing() {
    if (!venueId || isNew) {
      setError('Create and save the venue on the Info tab first.')
      setTimeout(() => setError(''), 4000)
      return
    }
    setError('')
    const res = await fetch(`${API}/api/v1/vendor/venues/${venueId}/pricing`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        label: 'Standard rate',
        min_hours: 1,
        max_hours: 24,
        price_per_hour: 100,
      }),
    })
    if (res.ok) await loadVenue()
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not add pricing')
      setTimeout(() => setError(''), 4000)
    }
  }

  async function deletePricing(id: number) {
    await fetch(`${API}/api/v1/vendor/pricing/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    loadVenue()
  }

  async function addPackage() {
    if (!venueId || isNew) {
      setError('Create and save the venue on the Info tab first.')
      setTimeout(() => setError(''), 4000)
      return
    }
    setError('')
    const res = await fetch(`${API}/api/v1/vendor/venues/${venueId}/packages`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New package',
        description: 'Describe what is included',
        hours_included: 4,
        flat_price: 500,
        discount_pct: 10,
      }),
    })
    if (res.ok) await loadVenue()
    else {
      const d = await res.json().catch(() => ({}))
      setError(d.error || 'Could not add package')
      setTimeout(() => setError(''), 4000)
    }
  }

  async function deletePackage(id: number) {
    await fetch(`${API}/api/v1/vendor/packages/${id}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    })
    loadVenue()
  }

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }))
  const hasSavedVenue = Boolean(venueId && !isNew)
  /** Slug for planner/capture URLs; falls back to numeric venue id (supported by the API). */
  const planningSlug = venueIdentifier || (venueId != null ? String(venueId) : '')

  const [pricingDraft, setPricingDraft] = useState<
    Record<number, { label: string; min_hours: string; max_hours: string; price_per_hour: string }>
  >({})
  const [packagesDraft, setPackagesDraft] = useState<
    Record<
      number,
      { name: string; description: string; hours_included: string; flat_price: string; discount_pct: string }
    >
  >({})
  const [savingPricingId, setSavingPricingId] = useState<number | null>(null)
  const [savingPackageId, setSavingPackageId] = useState<number | null>(null)

  useEffect(() => {
    const pd: typeof pricingDraft = {}
    pricing.forEach((p: any) => {
      pd[p.pricing_id] = {
        label: p.label ?? '',
        min_hours: String(p.min_hours ?? 1),
        max_hours: String(p.max_hours ?? 24),
        price_per_hour: String(p.price_per_hour ?? 0),
      }
    })
    setPricingDraft(pd)
  }, [pricing])

  useEffect(() => {
    const pk: typeof packagesDraft = {}
    packages.forEach((p: any) => {
      pk[p.package_id] = {
        name: p.name ?? '',
        description: p.description ?? '',
        hours_included: String(p.hours_included ?? 4),
        flat_price: String(p.flat_price ?? 0),
        discount_pct: String(p.discount_pct ?? 0),
      }
    })
    setPackagesDraft(pk)
  }, [packages])

  async function savePricingRow(pricingId: number) {
    const d = pricingDraft[pricingId]
    if (!d || !venueId) return
    setSavingPricingId(pricingId)
    setError('')
    try {
      const res = await fetch(`${API}/api/v1/vendor/pricing/${pricingId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          label: d.label,
          min_hours: parseInt(d.min_hours, 10),
          max_hours: parseInt(d.max_hours, 10),
          price_per_hour: parseFloat(d.price_per_hour),
        }),
      })
      if (res.ok) {
        setNotice('Pricing updated.')
        await loadVenue()
        setTimeout(() => setNotice(''), 3000)
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Could not save pricing')
      }
    } catch {
      setError('Network error')
    }
    setSavingPricingId(null)
  }

  async function savePackageRow(packageId: number) {
    const d = packagesDraft[packageId]
    if (!d || !venueId) return
    setSavingPackageId(packageId)
    setError('')
    try {
      const res = await fetch(`${API}/api/v1/vendor/packages/${packageId}`, {
        method: 'PATCH',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: d.name,
          description: d.description,
          hours_included: parseInt(d.hours_included, 10),
          flat_price: parseFloat(d.flat_price),
          discount_pct: parseFloat(d.discount_pct),
        }),
      })
      if (res.ok) {
        setNotice('Package updated.')
        await loadVenue()
        setTimeout(() => setNotice(''), 3000)
      } else {
        const j = await res.json().catch(() => ({}))
        setError(j.error || 'Could not save package')
      }
    } catch {
      setError('Network error')
    }
    setSavingPackageId(null)
  }

  return (
    <div className="vd-page">
      <header className="vd-header">
        <div className="vd-header__inner">
          <h1 className="vd-header__title">{isNew ? 'Create Venue' : 'Edit Venue'}</h1>
          <div className="vd-header__actions">
            <Link to="/vendor/venues" className="vd-btn vd-btn--outline">
              Back to Venues
            </Link>
          </div>
        </div>
      </header>

      <main className="vd-main">
        {notice && <div className="vd-flash vd-flash--ok vd-notice">{notice}</div>}
        {error && <div className="vd-flash vd-flash--err vd-notice">{error}</div>}

        <div className="vd-tabs">
          <button
            type="button"
            className={`vd-tab ${tab === 'info' ? 'vd-tab--active' : ''}`}
            onClick={() => setTab('info')}
          >
            Info
          </button>
          <button
            type="button"
            className={`vd-tab ${tab === 'pricing' ? 'vd-tab--active' : ''}`}
            onClick={() => setTab('pricing')}
            disabled={!hasSavedVenue}
            title={!hasSavedVenue ? 'Save the venue on Info first' : ''}
          >
            Pricing
          </button>
          <button
            type="button"
            className={`vd-tab ${tab === 'packages' ? 'vd-tab--active' : ''}`}
            onClick={() => setTab('packages')}
            disabled={!hasSavedVenue}
            title={!hasSavedVenue ? 'Save the venue on Info first' : ''}
          >
            Packages
          </button>
          <button
            type="button"
            className={`vd-tab ${tab === 'setup' ? 'vd-tab--active' : ''}`}
            onClick={() => setTab('setup')}
            disabled={!hasSavedVenue || !planningSlug}
            title={!hasSavedVenue ? 'Save the venue first' : 'Floor plan, capture, 3D, assets'}
          >
            Floor plan &amp; demo
          </button>
        </div>

        {tab === 'info' && (
          <div className="vd-form-card">
            <div className="vd-form-grid">
              <div className="form-group vd-form-span2">
                <label className="form-label" htmlFor="vv-name">
                  Venue name *
                </label>
                <input
                  id="vv-name"
                  className="form-input"
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="Grand Hall"
                />
              </div>
              <div className="form-group vd-form-span2">
                <label className="form-label" htmlFor="vv-desc">
                  Description
                </label>
                <textarea
                  id="vv-desc"
                  className="form-input vd-textarea"
                  value={form.description}
                  onChange={(e) => set('description', e.target.value)}
                  placeholder="Describe your venue..."
                  rows={3}
                />
              </div>
              <div className="form-group vd-form-span2 vv-cover-fieldset">
                <span className="form-label" id="vv-cover-label">
                  Marketplace cover photo
                </span>
                <p className="vv-cover-hint">
                  This image is shown at the top of your venue card for customers browsing the marketplace.
                </p>
                <div className="vv-cover-row">
                  <div
                    className="vv-cover-preview-wrap"
                    role="img"
                    aria-labelledby="vv-cover-label"
                  >
                    {coverImage ? (
                      <img
                        className="vv-cover-preview-img"
                        src={`${API}${coverImage}?v=${coverRev}`}
                        alt=""
                      />
                    ) : (
                      <div className="vv-cover-placeholder">No cover photo yet</div>
                    )}
                  </div>
                  <div className="vv-cover-actions">
                    <input
                      ref={coverFileRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      className="vv-cover-file-input"
                      aria-label="Choose cover image"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) uploadCover(f)
                        e.target.value = ''
                      }}
                    />
                    <button
                      type="button"
                      className="vd-btn vd-btn--primary vd-btn--sm"
                      disabled={!hasSavedVenue || coverUploading}
                      onClick={() => coverFileRef.current?.click()}
                    >
                      {coverUploading ? 'Uploading…' : coverImage ? 'Replace photo' : 'Upload photo'}
                    </button>
                    {coverImage && (
                      <button
                        type="button"
                        className="vd-btn vd-btn--outline vd-btn--sm"
                        disabled={coverUploading}
                        onClick={() => removeCover()}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
                {!hasSavedVenue && (
                  <p className="vv-cover-hint vv-cover-hint--muted">
                    Save the venue first, then you can add a cover photo.
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-city">
                  City
                </label>
                <input
                  id="vv-city"
                  className="form-input"
                  value={form.city}
                  onChange={(e) => set('city', e.target.value)}
                  placeholder="New York"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-country">
                  Country
                </label>
                <input
                  id="vv-country"
                  className="form-input"
                  value={form.country}
                  onChange={(e) => set('country', e.target.value)}
                  placeholder="USA"
                />
              </div>
              <div className="form-group vd-form-span2">
                <label className="form-label" htmlFor="vv-address">
                  Address
                </label>
                <input
                  id="vv-address"
                  className="form-input"
                  value={form.address}
                  onChange={(e) => set('address', e.target.value)}
                  placeholder="123 Main St"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-cat">
                  Category
                </label>
                <select
                  id="vv-cat"
                  className="form-input"
                  value={form.category}
                  onChange={(e) => set('category', e.target.value)}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-cap">
                  Capacity
                </label>
                <input
                  id="vv-cap"
                  className="form-input"
                  type="number"
                  value={form.capacity}
                  onChange={(e) => set('capacity', e.target.value)}
                  placeholder="120"
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-w">
                  Width (ft)
                </label>
                <input
                  id="vv-w"
                  className="form-input"
                  type="number"
                  value={form.width}
                  onChange={(e) => set('width', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-h">
                  Height (ft)
                </label>
                <input
                  id="vv-h"
                  className="form-input"
                  type="number"
                  value={form.height}
                  onChange={(e) => set('height', e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="vv-d">
                  Depth (ft)
                </label>
                <input
                  id="vv-d"
                  className="form-input"
                  type="number"
                  value={form.depth}
                  onChange={(e) => set('depth', e.target.value)}
                />
              </div>
            </div>
            <div className="vd-form-actions">
              <button type="button" className="vd-btn vd-btn--primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : isNew ? 'Create venue' : 'Save changes'}
              </button>
            </div>
            {isNew && (
              <p className="vd-hint">
                After you create the venue, use <strong>Pricing</strong> and <strong>Floor plan &amp; demo</strong> to
                add rates and build what customers see.
              </p>
            )}
          </div>
        )}

        {tab === 'pricing' && hasSavedVenue && (
          <div className="vd-form-card">
            <div className="vd-section__header">
              <h2>Pricing tiers</h2>
              <button type="button" className="vd-btn vd-btn--primary vd-btn--sm" onClick={addPricing}>
                + Add tier
              </button>
            </div>
            {pricing.length === 0 ? (
              <p className="vd-empty">No pricing tiers yet. Add at least one so customers can book.</p>
            ) : (
              <div className="vd-table-wrap">
                <table className="vd-table vd-table--edit">
                  <thead>
                    <tr>
                      <th>Label</th>
                      <th>Min hours</th>
                      <th>Max hours</th>
                      <th>$/hr</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pricing.map((p) => {
                      const d = pricingDraft[p.pricing_id] ?? {
                        label: p.label,
                        min_hours: String(p.min_hours),
                        max_hours: String(p.max_hours),
                        price_per_hour: String(p.price_per_hour),
                      }
                      return (
                        <tr key={p.pricing_id}>
                          <td>
                            <input
                              className="form-input vd-table-input"
                              value={d.label}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [p.pricing_id]: { ...d, label: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              className="form-input vd-table-input vd-table-input--num"
                              value={d.min_hours}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [p.pricing_id]: { ...d, min_hours: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={1}
                              className="form-input vd-table-input vd-table-input--num"
                              value={d.max_hours}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [p.pricing_id]: { ...d, max_hours: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              min={0}
                              step={0.01}
                              className="form-input vd-table-input vd-table-input--num"
                              value={d.price_per_hour}
                              onChange={(e) =>
                                setPricingDraft((prev) => ({
                                  ...prev,
                                  [p.pricing_id]: { ...d, price_per_hour: e.target.value },
                                }))
                              }
                            />
                          </td>
                          <td className="vd-table-actions">
                            <button
                              type="button"
                              className="vd-btn vd-btn--sm vd-btn--primary"
                              disabled={savingPricingId === p.pricing_id}
                              onClick={() => savePricingRow(p.pricing_id)}
                            >
                              {savingPricingId === p.pricing_id ? 'Saving…' : 'Save'}
                            </button>
                            <button
                              type="button"
                              className="vd-btn vd-btn--sm vd-btn--danger"
                              onClick={() => deletePricing(p.pricing_id)}
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'packages' && hasSavedVenue && (
          <div className="vd-form-card">
            <div className="vd-section__header">
              <h2>Packages</h2>
              <button type="button" className="vd-btn vd-btn--primary vd-btn--sm" onClick={addPackage}>
                + Add package
              </button>
            </div>
            {packages.length === 0 ? (
              <p className="vd-empty">Optional bundled deals (e.g. wedding day + hours).</p>
            ) : (
              <div className="vd-pkg-grid">
                {packages.map((pk) => {
                  const d = packagesDraft[pk.package_id] ?? {
                    name: pk.name,
                    description: pk.description || '',
                    hours_included: String(pk.hours_included),
                    flat_price: String(pk.flat_price),
                    discount_pct: String(pk.discount_pct ?? 0),
                  }
                  return (
                    <div key={pk.package_id} className="vd-pkg-card vd-pkg-card--edit">
                      <label className="form-label">Name</label>
                      <input
                        className="form-input"
                        value={d.name}
                        onChange={(e) =>
                          setPackagesDraft((prev) => ({
                            ...prev,
                            [pk.package_id]: { ...d, name: e.target.value },
                          }))
                        }
                      />
                      <label className="form-label">Description</label>
                      <textarea
                        className="form-input vd-textarea"
                        rows={2}
                        value={d.description}
                        onChange={(e) =>
                          setPackagesDraft((prev) => ({
                            ...prev,
                            [pk.package_id]: { ...d, description: e.target.value },
                          }))
                        }
                      />
                      <div className="vd-pkg-edit-row">
                        <label>
                          Hours
                          <input
                            type="number"
                            min={1}
                            className="form-input"
                            value={d.hours_included}
                            onChange={(e) =>
                              setPackagesDraft((prev) => ({
                                ...prev,
                                [pk.package_id]: { ...d, hours_included: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Flat price ($)
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            className="form-input"
                            value={d.flat_price}
                            onChange={(e) =>
                              setPackagesDraft((prev) => ({
                                ...prev,
                                [pk.package_id]: { ...d, flat_price: e.target.value },
                              }))
                            }
                          />
                        </label>
                        <label>
                          Discount %
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="form-input"
                            value={d.discount_pct}
                            onChange={(e) =>
                              setPackagesDraft((prev) => ({
                                ...prev,
                                [pk.package_id]: { ...d, discount_pct: e.target.value },
                              }))
                            }
                          />
                        </label>
                      </div>
                      <div className="vd-pkg-card__actions">
                        <button
                          type="button"
                          className="vd-btn vd-btn--sm vd-btn--primary"
                          disabled={savingPackageId === pk.package_id}
                          onClick={() => savePackageRow(pk.package_id)}
                        >
                          {savingPackageId === pk.package_id ? 'Saving…' : 'Save package'}
                        </button>
                        <button
                          type="button"
                          className="vd-btn vd-btn--sm vd-btn--danger"
                          onClick={() => deletePackage(pk.package_id)}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'setup' && hasSavedVenue && planningSlug && (
          <div className="vd-form-card vd-setup-card">
            <h2 className="vd-setup-card__title">Set up what customers see</h2>
            <p className="vd-setup-card__lead">
              Use the same tools as before: edit the <strong>2D floor plan</strong>, place assets as a demo layout,
              capture walls, and open the <strong>3D viewer</strong>. Save the layout in the planner so the marketplace
              listing can show your space.
            </p>
            <div className="vd-setup-actions">
              <Link className="vd-btn vd-btn--primary" to={`/planner/${planningSlug}`}>
                Open floor planner
              </Link>
              <Link className="vd-btn vd-btn--outline" to={`/capture/${planningSlug}`}>
                Wall capture
              </Link>
              <Link className="vd-btn vd-btn--outline" to={`/view/${planningSlug}`}>
                3D view
              </Link>
              <Link className="vd-btn vd-btn--outline" to={`/venue/${planningSlug}`}>
                Venue hub
              </Link>
              <Link className="vd-btn vd-btn--outline" to="/assets">
                Asset library
              </Link>
            </div>
            <p className="vd-hint">
              Tip: place furniture in the planner and save — that becomes a preset customers can start from after they
              book.
            </p>
          </div>
        )}
      </main>
    </div>
  )
}
