import { useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AuthBadge, AuthShell } from '../components/AuthShell.jsx';
import { Alert, Button, TextLink } from '../components/ui/index.js';
import { authFooter, authInput, authLabel } from '../design-system/patterns.js';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000',
});

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError('');
    setSuccess('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (form.username.trim().length < 3) {
      return setError('Username must be at least 3 characters');
    }
    if (!form.email.includes('@')) {
      return setError('Please enter a valid email address');
    }
    if (form.password.length < 8) {
      return setError('Password must be at least 8 characters');
    }
    if (form.password !== form.confirmPassword) {
      return setError('Passwords do not match');
    }

    setLoading(true);
    try {
      const { data } = await api.post('/auth/register', {
        username: form.username.trim(),
        email: form.email.trim(),
        password: form.password,
        roleName: 'Patient',
      });

      setSuccess(
        `Account created for ${data.user.username}! Redirecting to login…`,
      );
      setTimeout(() => {
        navigate('/login?registered=true');
      }, 2500);
    } catch (err) {
      setError(
        err.response?.data?.error || 'Registration failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      badge={<AuthBadge>Patient portal</AuthBadge>}
      title="Hospital Zero Trust"
      subtitle="Create a patient account to access your records and appointments."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
        noValidate
      >
        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert variant="success" role="status">
            {success}
          </Alert>
        ) : null}

        <div>
          <label htmlFor="reg-username" className={authLabel}>
            Username
          </label>
          <input
            id="reg-username"
            name="username"
            type="text"
            autoComplete="username"
            placeholder="e.g. john_doe"
            className={authInput}
            value={form.username}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="reg-email" className={authLabel}>
            Email
          </label>
          <input
            id="reg-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            className={authInput}
            value={form.email}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="reg-password" className={authLabel}>
            Password
          </label>
          <input
            id="reg-password"
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder="Min. 8 characters"
            className={authInput}
            value={form.password}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <div>
          <label htmlFor="reg-confirm" className={authLabel}>
            Confirm password
          </label>
          <input
            id="reg-confirm"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            placeholder="Repeat your password"
            className={authInput}
            value={form.confirmPassword}
            onChange={handleChange}
            disabled={loading}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={loading}
          spinner="light"
        >
          Create account
        </Button>
      </form>

      <div className={authFooter}>
        Already have an account?{' '}
        <TextLink to="/login" variant="accent">
          Sign in
        </TextLink>
      </div>
    </AuthShell>
  );
}
