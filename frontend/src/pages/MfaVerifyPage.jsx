import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AuthBadge, AuthShell } from '../components/AuthShell.jsx';
import { Alert, Button, TextLink } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import {
  authInputMono,
  authLabel,
} from '../design-system/patterns.js';

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
    <AuthShell
      badge={<AuthBadge>Two-step sign-in</AuthBadge>}
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app."
    >
      <form
        className="flex flex-col gap-5"
        onSubmit={handleSubmit}
        noValidate
      >
        <div>
          <label htmlFor="mfa-code" className={authLabel}>
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
            className={authInputMono}
            placeholder="000000"
            value={code}
            onChange={handleCodeChange}
            aria-invalid={Boolean(error)}
          />
        </div>

        <Button
          type="submit"
          variant="primary"
          disabled={isSubmitting || code.length !== 6}
          loading={isSubmitting}
          spinner="light"
        >
          Verify
        </Button>
      </form>

      {error ? (
        <Alert variant="error" className="mt-6" role="alert">
          {error}
        </Alert>
      ) : null}

      <p className="mt-8 text-center">
        <TextLink to="/login" variant="muted">
          Back to login
        </TextLink>
      </p>
    </AuthShell>
  );
}
