import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { AuthBadge, AuthShell } from '../components/AuthShell.jsx';
import { Alert, Button, TextLink } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  authFieldError,
  authFooter,
  authInput,
  authLabel,
} from '../design-system/patterns.js';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Enter a valid email'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

function EyeIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login } = useAuth();
  const [apiError, setApiError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const justRegistered = searchParams.get('registered') === 'true';

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values) {
    setApiError('');
    if (justRegistered) {
      const next = new URLSearchParams(searchParams);
      next.delete('registered');
      setSearchParams(next, { replace: true });
    }
    try {
      const result = await login(
        values.email,
        values.password,
        Intl.DateTimeFormat().resolvedOptions().timeZone,
      );
      if (result.mfaRequired) {
        navigate('/mfa-verify', { state: { tempToken: result.tempToken } });
        return;
      }
      // Force MFA setup if not yet enabled
      if (!result.mfaEnabled) {
        navigate('/mfa-setup');
        return;
      }
      navigate('/dashboard');
    } catch (err) {
      const message =
        err.response?.data?.error ?? err.message ?? 'Sign in failed';
      setApiError(String(message));
    }
  }

  const eyeButtonStyle = {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--color-text-secondary)',
    padding: '0',
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <AuthShell
      badge={<AuthBadge>Secure access</AuthBadge>}
      title="Hospital Zero Trust"
      subtitle="Use your hospital credentials to continue to the clinical workspace."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit(onSubmit)}
        noValidate
      >
        <div>
          <label htmlFor="login-email" className={authLabel}>
            Email
          </label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            className={authInput}
            placeholder="you@hospital.com"
            {...register('email')}
          />
          {errors.email ? (
            <p className={authFieldError} role="alert">
              {errors.email.message}
            </p>
          ) : null}
        </div>

        <div>
          <label htmlFor="login-password" className={authLabel}>
            Password
          </label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className={authInput}
              style={{ paddingRight: '42px' }}
              placeholder="••••••••"
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              style={eyeButtonStyle}
              tabIndex={-1}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {errors.password ? (
            <p className={authFieldError} role="alert">
              {errors.password.message}
            </p>
          ) : null}
        </div>

        <Button
          type="submit"
          variant="primary"
          loading={isSubmitting}
          spinner="light"
        >
          Sign in
        </Button>
      </form>

      {apiError ? (
        <Alert variant="error" className="mt-6" role="alert">
          {apiError}
        </Alert>
      ) : null}

      {justRegistered && !apiError ? (
        <Alert variant="success" className="mt-6" role="status">
          Account created. Sign in with your email and password.
        </Alert>
      ) : null}

      <div className={authFooter}>
        Need an account?{' '}
        <TextLink to="/register" variant="accent">
          Register as patient
        </TextLink>
      </div>
    </AuthShell>
  );
}