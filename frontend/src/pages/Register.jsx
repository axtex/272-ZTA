import { useState } from 'react'
import axios from 'axios'
import './Login.css'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
})

export default function Register() {
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  })
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
    setError('')
    setSuccess('')
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Client-side validation
    if (form.username.trim().length < 3) {
      return setError('Username must be at least 3 characters')
    }
    if (!form.email.includes('@')) {
      return setError('Please enter a valid email address')
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters')
    }
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match')
    }

    setLoading(true)
    try {
      const { data } = await api.post('/api/auth/register', {
        username: form.username.trim(),
        email:    form.email.trim(),
        password: form.password,
        roleName: 'Patient',
      })

      // Show success message then redirect to login
      setSuccess(`Account created for ${data.user.username}! Redirecting to login…`)
      setTimeout(() => {
        window.location.href = '/login?registered=true'
      }, 2500)

    } catch (err) {
      setError(err.response?.data?.error || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <div className="login-shell">

        <header className="login-brand">
          <div className="login-brand-badge">Patient portal</div>
          <h1>Create account</h1>
          <p>Register to access your medical records and appointments.</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {error && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #f5c4b3',
              background: '#faece7',
              color: '#993c1d',
              fontSize: '14px',
            }} role="alert">
              {error}
            </div>
          )}

          {success && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #9fe1cb',
              background: '#e1f5ee',
              color: '#0f6e56',
              fontSize: '14px',
            }} role="status">
              {success}
            </div>
          )}

          <div className="login-field">
            <label htmlFor="reg-username">Username</label>
            <input
              id="reg-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. john_doe"
              value={form.username}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="reg-email">Email address</label>
            <input
              id="reg-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="reg-password">Password</label>
            <input
              id="reg-password"
              name="password"
              type="password"
              autoComplete="new-password"
              placeholder="Min. 8 characters"
              value={form.password}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <div className="login-field">
            <label htmlFor="reg-confirm">Confirm password</label>
            <input
              id="reg-confirm"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder="Repeat your password"
              value={form.confirmPassword}
              onChange={handleChange}
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

        </form>

        <footer className="login-footer">
          Already have an account?{' '}
          <a href="/login">Sign in</a>
        </footer>

      </div>
    </div>
  )
}