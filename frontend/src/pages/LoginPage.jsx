import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { useAuth } from '../context/AuthContext.jsx';

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
  const { login } = useAuth();
  const [apiError, setApiError] = useState('');

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
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Hospital Zero Trust
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Secure Access Portal
          </p>
        </header>

        <form
          className="space-y-5"
          onSubmit={handleSubmit(onSubmit)}
          noValidate
        >
          <div>
            <label
              htmlFor="login-email"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none ring-slate-400 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="you@hospital.com"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900 shadow-sm outline-none ring-slate-400 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="••••••••"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1.5 text-sm text-red-600 dark:text-red-400" role="alert">
                {errors.password.message}
              </p>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {isSubmitting ? (
              <span
                className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            <span>Sign in</span>
          </button>
        </form>

        {apiError ? (
          <div
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {apiError}
          </div>
        ) : null}
      </div>
    </div>
  );
}
