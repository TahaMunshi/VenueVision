import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { getApiBaseUrl } from '../utils/api'

export type UserRole = 'vendor' | 'customer'

export interface AuthUser {
  user_id: number
  username: string
  email: string
  full_name?: string
  role: UserRole
  business_name?: string
  phone?: string
  city?: string
  country?: string
}

interface AuthCtx {
  user: AuthUser | null
  token: string | null
  loading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  signup: (fields: Record<string, string>) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthCtx | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const API = getApiBaseUrl()

  useEffect(() => {
    const stored = localStorage.getItem('token')
    if (stored) {
      setToken(stored)
      fetchMe(stored)
    } else {
      setLoading(false)
    }
  }, [])

  async function fetchMe(t: string) {
    try {
      const res = await fetch(`${API}/api/v1/me`, {
        headers: { Authorization: `Bearer ${t}` },
      })
      if (res.ok) {
        const data = await res.json()
        setUser(data.user as AuthUser)
        setToken(t)
      } else {
        localStorage.removeItem('token')
        localStorage.removeItem('user')
        setToken(null)
        setUser(null)
      }
    } catch {
      /* network error — keep cached user if any */
      const cached = localStorage.getItem('user')
      if (cached) {
        try { setUser(JSON.parse(cached)) } catch { /* ignore */ }
      }
    } finally {
      setLoading(false)
    }
  }

  async function login(username: string, password: string) {
    try {
      const res = await fetch(`${API}/api/v1/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        return { ok: true }
      }
      return { ok: false, error: data.error || 'Login failed' }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }

  async function signup(fields: Record<string, string>) {
    try {
      const res = await fetch(`${API}/api/v1/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (res.ok) {
        localStorage.setItem('token', data.token)
        localStorage.setItem('user', JSON.stringify(data.user))
        setToken(data.token)
        setUser(data.user)
        return { ok: true }
      }
      return { ok: false, error: data.error || 'Registration failed' }
    } catch {
      return { ok: false, error: 'Network error' }
    }
  }

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
  }

  async function refreshUser() {
    if (token) await fetchMe(token)
  }

  return (
    <AuthContext.Provider value={{ user, token, loading, login, signup, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
