import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function MfaSetupPage() {
  const navigate = useNavigate();
  const { setupMfa, confirmMfaSetup } = useAuth();
  const inputRef = useRef(null);

  const [step, setStep] = useState(1);
  const [secret, setSecret] = useState('');
  const [qrCode, setQrCode] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isLoadingSetup, setIsLoadingSetup] = useState(true);

  const [code, setCode] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadError('');
      setIsLoadingSetup(true);
      try {
        const result = await setupMfa();
        if (!cancelled) {
          setSecret(result.secret);
          setQrCode(result.qrCode);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(
            err.response?.data?.error ??
              err.message ??
              'Failed to load MFA setup',
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoadingSetup(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [setupMfa]);

  useEffect(() => {
    if (step === 2) {
      inputRef.current?.focus();
    }
  }, [step]);

  function handleCodeChange(e) {
    const next = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(next);
    if (submitError) setSubmitError('');
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setSubmitError('');
    setIsSubmitting(true);
    try {
      await confirmMfaSetup(code);
      setStep(3);
    } catch (err) {
      const message =
        err.response?.data?.error ?? err.message ?? 'Could not enable 2FA';
      setSubmitError(String(message));
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
            Set up two-factor authentication
          </h1>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Add an extra layer of security to your account
          </p>
        </header>

        {isLoadingSetup && (
          <div className="flex justify-center py-12">
            <span
              className="inline-block size-10 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700 dark:border-slate-600 dark:border-t-slate-200"
              aria-label="Loading"
            />
          </div>
        )}

        {!isLoadingSetup && loadError && (
          <div className="space-y-4">
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
              role="alert"
            >
              {loadError}
            </div>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {!isLoadingSetup && !loadError && step === 1 && (
          <div className="space-y-6">
            <p className="text-center text-sm text-slate-600 dark:text-slate-400">
              Scan this QR code with Google Authenticator or Authy
            </p>
            <div className="flex justify-center rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700">
              {qrCode ? (
                <img
                  src={qrCode}
                  alt="QR code for authenticator app"
                  className="max-h-56 w-56 object-contain"
                />
              ) : null}
            </div>
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Manual entry key
              </p>
              <p className="break-all rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
                {secret}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              I&apos;ve scanned it
            </button>
          </div>
        )}

        {!isLoadingSetup && !loadError && step === 2 && (
          <form className="space-y-5" onSubmit={handleConfirm} noValidate>
            <div>
              <label
                htmlFor="mfa-setup-code"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Enter the code from your app to confirm
              </label>
              <input
                ref={inputRef}
                id="mfa-setup-code"
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
                aria-invalid={Boolean(submitError)}
              />
            </div>
            {submitError ? (
              <div
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200"
                role="alert"
              >
                {submitError}
              </div>
            ) : null}
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
              <span>Enable 2FA</span>
            </button>
          </form>
        )}

        {!isLoadingSetup && !loadError && step === 3 && (
          <div className="space-y-6 text-center">
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">
              Two-factor authentication is now enabled
            </p>
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              Back to dashboard
            </button>
          </div>
        )}

        {!isLoadingSetup && step !== 3 && !loadError && (
          <p className="mt-8 text-center text-sm">
            <button
              type="button"
              onClick={() => navigate('/dashboard')}
              className="font-medium text-slate-600 underline-offset-2 hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-white"
            >
              Cancel
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
