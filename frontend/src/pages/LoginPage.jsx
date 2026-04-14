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

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { login } = useAuth();
  const [apiError, setApiError] = useState('');
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
      navigate('/dashboard');
    } catch (err) {
      const message =
        err.response?.data?.error ?? err.message ?? 'Sign in failed';
      setApiError(String(message));
    }
  }

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
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            className={authInput}
            placeholder="••••••••"
            {...register('password')}
          />
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
