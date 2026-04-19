import { useState, type FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import './Auth.css'
import { useAuth } from '../../context/AuthContext'
import PageNavBar from '../../components/PageNavBar'

const Login = () => {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [formData, setFormData] = useState({ username: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const result = await login(formData.username, formData.password)
    setLoading(false)

    if (result.ok) {
      const cached = localStorage.getItem('user')
      let role = 'customer'
      if (cached) {
        try { role = JSON.parse(cached).role || 'customer' } catch { /* */ }
      }
      navigate(role === 'vendor' ? '/vendor' : '/marketplace')
    } else {
      setError(result.error || 'Login failed')
    }
  }

  return (
    <div className="auth-container">
      <PageNavBar title="Sign in" backLabel="Back" />
      <div className="auth-main">
        <div className="auth-card">
          <div className="auth-header">
            <h1 className="auth-title">Welcome Back</h1>
            <p className="auth-subtitle">Sign in to continue to VenueVision</p>
          </div>

          <form onSubmit={handleSubmit} className="auth-form">
            {error && <div className="error-message">{error}</div>}

            <div className="form-group">
              <label htmlFor="username" className="form-label">Username or Email</label>
              <input id="username" type="text" className="form-input"
                placeholder="Enter your username or email"
                value={formData.username}
                onChange={e => setFormData({ ...formData, username: e.target.value })}
                required disabled={loading} />
            </div>

            <div className="form-group">
              <label htmlFor="password" className="form-label">Password</label>
              <input id="password" type="password" className="form-input"
                placeholder="Enter your password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
                required disabled={loading} />
            </div>

            <button type="submit" className="submit-button" disabled={loading}>
              {loading && <span className="loading-spinner" />}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <div className="auth-footer">
            <p className="auth-footer-text">
              Don't have an account?{' '}
              <Link to="/signup" className="auth-link">Create an account</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Login
