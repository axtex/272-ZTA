import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthBadge, AuthShell } from '../components/AuthShell.jsx';
import { Alert, Button, Spinner } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  authGhostLink,
  authInputMono,
  authLabel,
} from '../design-system/patterns.js';

export default function MfaSetupPage() {
  const navigate = useNavigate();
  const { setupMfa, confirmMfaSetup, logout } = useAuth();
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

  async function handleCancel() {
    await logout();
    navigate('/login');
  }

  return (
    <AuthShell
      badge={<AuthBadge>Account security</AuthBadge>}
      title="Set up two-factor authentication"
      subtitle="Add an extra layer of protection to your hospital account."
    >
      {isLoadingSetup && (
        <div className="flex justify-center py-12">
          <Spinner size="md" theme="slate" />
        </div>
      )}

      {!isLoadingSetup && loadError && (
        <div className="space-y-4">
          <Alert variant="error" role="alert">
            {loadError}
          </Alert>
          <Button
            type="button"
            variant="secondary"
            onClick={handleCancel}
          >
            Back to login
          </Button>
        </div>
      )}

      {!isLoadingSetup && !loadError && step === 1 && (
        <div className="flex flex-col gap-6">
          <p className="text-center text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Scan this QR code with Google Authenticator or Authy.
          </p>
          <div className="flex justify-center rounded-xl border border-slate-200/90 bg-white/80 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-950/50">
            {qrCode ? (
              <img
                src={qrCode}
                alt="QR code for authenticator app"
                className="max-h-56 w-56 object-contain"
              />
            ) : null}
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Manual entry key
            </p>
            <p className="break-all rounded-[10px] border border-slate-200 bg-slate-50/90 px-3.5 py-3 font-mono text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100">
              {secret}
            </p>
          </div>
          <Button type="button" variant="primary" onClick={() => setStep(2)}>
            I&apos;ve scanned it
          </Button>
        </div>
      )}

      {!isLoadingSetup && !loadError && step === 2 && (
        <form
          className="flex flex-col gap-5"
          onSubmit={handleConfirm}
          noValidate
        >
          <div>
            <label htmlFor="mfa-setup-code" className={authLabel}>
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
              className={authInputMono}
              placeholder="000000"
              value={code}
              onChange={handleCodeChange}
              aria-invalid={Boolean(submitError)}
            />
          </div>
          {submitError ? (
            <Alert variant="error" role="alert">
              {submitError}
            </Alert>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            disabled={code.length !== 6}
            loading={isSubmitting}
            spinner="light"
          >
            Enable 2FA
          </Button>
        </form>
      )}

      {!isLoadingSetup && !loadError && step === 3 && (
        <div className="flex flex-col gap-6 text-center">
          <Alert variant="success" role="status">
            Two-factor authentication is now enabled
          </Alert>
          <Button type="button" variant="primary" onClick={() => navigate('/dashboard')}>
            Go to dashboard
          </Button>
        </div>
      )}

      {!isLoadingSetup && step !== 3 && !loadError && (
        <p className="mt-8 text-center">
          <button
            type="button"
            onClick={handleCancel}
            className={authGhostLink}
          >
            Cancel
          </button>
        </p>
      )}
    </AuthShell>
  );
}