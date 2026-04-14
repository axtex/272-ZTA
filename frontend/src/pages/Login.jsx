import { useState } from 'react'
import './Login.css'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)

  const registered = new URLSearchParams(window.location.search).get('registered')

  function handleSubmit(e) {
    e.preventDefault()
  }

  return (
    <div className="login-page">
      <div className="login-shell">
        <header className="login-brand">
          <div className="login-brand-badge">Secure access</div>
          <h1>Sign in</h1>
          <p>Use your hospital credentials to continue to the clinical workspace.</p>
        </header>

        <form className="login-form" onSubmit={handleSubmit} noValidate>

          {registered && (
            <div style={{
              padding: '12px 14px',
              borderRadius: '10px',
              border: '1px solid #9fe1cb',
              background: '#e1f5ee',
              color: '#0f6e56',
              fontSize: '14px',
            }} role="status">
              Account created successfully! Please sign in.
            </div>
          )}

          <div className="login-field">
            <label htmlFor="login-username">Username or email</label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              placeholder="e.g. dr_smith"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="login-row">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
              />
              Remember this device
            </label>
            <a className="login-forgot" href="#forgot">
              Forgot password?
            </a>
          </div>

          <button type="submit" className="login-submit">
            Sign in
          </button>

        </form>

        <footer className="login-footer">
          Need an account? <a href="/register">Register as patient</a>
        </footer>
      </div>
    </div>
  )
}