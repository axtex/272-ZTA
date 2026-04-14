import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function MfaVerifyPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { verifyMfa } = useAuth();
  const tempToken = location.state?.tempToken;

  const inputRef = useRef(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (tempToken) {
      inputRef.current?.focus();
    }
  }, [tempToken]);

  if (!tempToken) {
    return <Navigate to="/login" replace />;
  }

  function handleCodeChange(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (error) setError('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      await verifyMfa(tempToken, code);
      navigate('/dashboard');
    } catch (err) {
      const message =
        err.response?.data?.error ?? err.message ?? 'Verification failed';
      setError(String(message));
      setCode('');
      inputRef.current?.focus();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 py-12 dark:bg-slate-950">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
        <header className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Two-factor authentication
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Enter the 6-digit code from your authenticator app
          </p>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit} noValidate>
          <div>
            <label
              htmlFor="mfa-code"
              className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              Authentication code
            </label>
            <input
              ref={inputRef}
              id="mfa-code"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              pattern="[0-9]*"
              className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-center font-mono text-lg tracking-[0.35em] text-slate-900 shadow-sm outline-none ring-slate-400 placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-400/30 dark:border-slate-600 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              placeholder="000000"
              value={code}
              onChange={handleCodeChange}
              aria-invalid={Boolean(error)}
            />
          </div>

          <button
            type="submit"
            disabled={isSubmitting || code.length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
          >
            {isSubmitting ? (
              <span
                className="inline-block size-4 animate-spin rounded-full border-2 border-current border-t-transparent"
                aria-hidden
              />
            ) : null}
            <span>Verify</span>
          </button>
        </form>

        {error ? (
          <div
            className="mt-6 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <p className="mt-6 text-center text-sm">
          <Link
            to="/login"
            className="font-medium text-slate-700 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-300 dark:hover:text-white"
          >
            Back to login
          </Link>
        </p>
      </div>
    </div>
  );
}
