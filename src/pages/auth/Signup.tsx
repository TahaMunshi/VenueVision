import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Auth.css'
import { useAuth } from '../../context/AuthContext'
import PageNavBar from '../../components/PageNavBar'

const Signup = () => {
  const navigate = useNavigate()
  const { signup } = useAuth()
  const [role, setRole] = useState<'customer' | 'vendor'>('customer')
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    full_name: '',
    business_name: '',
    phone: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match'); return
    }
    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters'); return
    }
    if (formData.username.length < 3) {
      setError('Username must be at least 3 characters'); return
    }
    if (role === 'vendor' && !formData.business_name.trim()) {
      setError('Business name is required for venue vendors'); return
    }

    setLoading(true)
    const result = await signup({
      username: formData.username,
      email: formData.email,
      password: formData.password,
      full_name: formData.full_name || '',
      role,
      business_name: formData.business_name || '',
      phone: formData.phone || '',
    })
    setLoading(false)

    if (result.ok) {
      navigate(role === 'vendor' ? '/vendor' : '/marketplace')
    } else {
      setError(result.error || 'Registration failed')
    }
  }

  const set = (key: string, val: string) => setFormData(p => ({ ...p, [key]: val }))

  return (
    <div className="auth-container">
      <PageNavBar title="Create account" backLabel="Back" />
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Create Account</h1>
            <p className="auth-subtitle">Join VenueVision as a vendor or customer</p>
          </div>

          <div className="role-toggle">
            <button
              type="button"
              className={`role-toggle__btn ${role === 'customer' ? 'role-toggle__btn--active' : ''}`}
              onClick={() => setRole('customer')}
            >
              Customer
            </button>
            <button
              type="button"
              className={`role-toggle__btn ${role === 'vendor' ? 'role-toggle__btn--active' : ''}`}
              onClick={() => setRole('vendor')}
            >
              Venue Vendor
            </button>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="username" className="form-label">Username *</label>
              <input id="username" type="text" className="form-input" placeholder="Choose a username"
                value={formData.username} onChange={e => set('username', e.target.value)}
                required disabled={loading} />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="form-label">Email *</label>
              <input id="email" type="email" className="form-input" placeholder="your@email.com"
                value={formData.email} onChange={e => set('email', e.target.value)}
                required disabled={loading} />
            </div>

            <div className="form-group">
              <label htmlFor="full_name" className="form-label">Full Name</label>
              <input id="full_name" type="text" className="form-input" placeholder="John Doe"
                value={formData.full_name} onChange={e => set('full_name', e.target.value)}
                disabled={loading} />
            </div>

            {role === 'vendor' && (
              <>
                <div className="form-group">
                  <label htmlFor="business_name" className="form-label">Business Name *</label>
                  <input id="business_name" type="text" className="form-input"
                    placeholder="Your venue business name"
                    value={formData.business_name} onChange={e => set('business_name', e.target.value)}
                    required disabled={loading} />
                </div>
                <div className="form-group">
                  <label htmlFor="phone" className="form-label">Phone</label>
                  <input id="phone" type="tel" className="form-input" placeholder="+1 234 567 8900"
                    value={formData.phone} onChange={e => set('phone', e.target.value)}
                    disabled={loading} />
                </div>
              </>
            )}

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password *</label>
              <input id="password" type="password" className="form-input" placeholder="At least 6 characters"
                value={formData.password} onChange={e => set('password', e.target.value)}
                required disabled={loading} />
            </div>

            <div className="form-group">
              <label htmlFor="confirmPassword" className="form-label">Confirm Password *</label>
              <input id="confirmPassword" type="password" className="form-input"
                placeholder="Re-enter your password"
                value={formData.confirmPassword} onChange={e => set('confirmPassword', e.target.value)}
                required disabled={loading} />
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading && <span className="loading-spinner" />}
              {loading ? 'Creating account...' : `Create ${role === 'vendor' ? 'Vendor' : 'Customer'} Account`}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-footer-text">
              Already have an account?{' '}
              <Link to="/login" className="auth-link">Sign in instead</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Signup
