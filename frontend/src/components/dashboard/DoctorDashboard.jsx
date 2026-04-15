import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Alert, Button, Card, Spinner } from '../ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  appDataLabel,
  appDataRow,
  appDataValue,
  appMutedText,
  appPanelCard,
  appSectionHeading,
  authInput,
} from '../../design-system/patterns.js';
import {
  breakGlassAccess,
  getEhrRecord,
  getPatientEhr,
  uploadEhrFile,
} from '../../lib/api.js';

function truncateId(id) {
  const s = String(id ?? '');
  if (!s) return '';
  if (s.length <= 10) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function DoctorDashboard() {
  const { user } = useAuth();
  const s3Enabled = (import.meta.env.VITE_S3_ENABLED ?? 'false') === 'true';

  const [ehrId, setEhrId] = useState('');
  const [ehrRecord, setEhrRecord] = useState(null);
  const [ehrLookupError, setEhrLookupError] = useState('');

  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadNotice, setUploadNotice] = useState({ variant: '', message: '' });

  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [breakGlassPatientId, setBreakGlassPatientId] = useState('');
  const [breakGlassNotice, setBreakGlassNotice] = useState({ variant: '', message: '' });

  const doctorId = user?.sub;

  const patientsQuery = useQuery({
    queryKey: ['doctorPatientsEhr', doctorId],
    enabled: Boolean(doctorId),
    queryFn: () => getPatientEhr(doctorId),
  });

  const patientRecords = useMemo(() => {
    const rows = Array.isArray(patientsQuery.data) ? patientsQuery.data : [];
    return rows;
  }, [patientsQuery.data]);

  const ehrLookupMutation = useMutation({
    mutationFn: (id) => getEhrRecord(id),
    onSuccess: (record) => {
      setEhrRecord(record ?? null);
      setEhrLookupError('');
      setUploadNotice({ variant: '', message: '' });
    },
    onError: (err) => {
      setEhrRecord(null);
      setEhrLookupError(err?.response?.data?.error || err?.message || 'Failed to look up record');
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }) => uploadEhrFile(id, file),
    onSuccess: (result) => {
      const filename = result?.filename || selectedFile?.name || 'file';
      setUploadNotice({ variant: 'success', message: `Uploaded ${filename}` });
    },
    onError: (err) => {
      setUploadNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Upload failed',
      });
    },
  });

  const breakGlassMutation = useMutation({
    mutationFn: (patientId) => breakGlassAccess(patientId),
    onSuccess: () => {
      setBreakGlassNotice({
        variant: 'success',
        message: 'Emergency access granted. This event has been logged.',
      });
      window.setTimeout(() => {
        setBreakGlassOpen(false);
        setBreakGlassPatientId('');
      }, 2000);
    },
    onError: (err) => {
      setBreakGlassNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to grant emergency access',
      });
    },
  });

  function handleLookupSubmit(e) {
    e.preventDefault();
    const id = String(ehrId ?? '').trim();
    if (!id) {
      setEhrLookupError('Please enter an EHR ID');
      setEhrRecord(null);
      return;
    }
    ehrLookupMutation.mutate(id);
  }

  function handleUploadSubmit(e) {
    e.preventDefault();
    const id = String(ehrId ?? '').trim();
    if (!id) {
      setUploadNotice({ variant: 'error', message: 'Please enter an EHR ID first' });
      return;
    }
    if (!selectedFile) {
      setUploadNotice({ variant: 'error', message: 'Please choose a file to upload' });
      return;
    }
    setUploadNotice({ variant: '', message: '' });
    uploadMutation.mutate({ id, file: selectedFile });
  }

  function openBreakGlass() {
    setBreakGlassNotice({ variant: '', message: '' });
    setBreakGlassPatientId('');
    setBreakGlassOpen(true);
  }

  function closeBreakGlass() {
    if (breakGlassMutation.isPending) return;
    setBreakGlassOpen(false);
  }

  function confirmBreakGlass() {
    const id = String(breakGlassPatientId ?? '').trim();
    if (!id) {
      setBreakGlassNotice({ variant: 'error', message: 'patientId is required' });
      return;
    }
    setBreakGlassNotice({ variant: '', message: '' });
    breakGlassMutation.mutate(id);
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>My Patients</h2>
          <div className="mt-4">
            {patientsQuery.isLoading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading patients…</span>
              </div>
            ) : null}

            {patientsQuery.isError ? (
              <Alert variant="error" className="mt-3">
                {patientsQuery.error?.response?.data?.error ||
                  patientsQuery.error?.message ||
                  'Failed to load patients'}
              </Alert>
            ) : null}

            {!patientsQuery.isLoading && !patientsQuery.isError && patientRecords.length === 0 ? (
              <p className={`${appMutedText} mt-3`}>No patients assigned yet</p>
            ) : null}

            {!patientsQuery.isLoading && !patientsQuery.isError && patientRecords.length > 0 ? (
              <div className="mt-3">
                {patientRecords.map((r) => (
                  <div key={r?.id ?? `${r?.patientId}-${r?.updatedAt}`} className={appDataRow}>
                    <div className={appDataLabel}>{truncateId(r?.patientId) || '—'}</div>
                    <div className={`${appDataValue} text-right`}>
                      {r?.diagnosis || '—'} · {formatDate(r?.updatedAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </section>

        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>EHR Quick View</h2>

          <form className="mt-4 space-y-3" onSubmit={handleLookupSubmit}>
            <input
              className={authInput}
              value={ehrId}
              onChange={(e) => setEhrId(e.target.value)}
              placeholder="Enter EHR ID"
              aria-label="EHR ID"
            />
            <Button type="submit" variant="secondary" loading={ehrLookupMutation.isPending} spinner="dark">
              Look up record
            </Button>
          </form>

          {ehrLookupError ? (
            <Alert variant="error" className="mt-3">
              {ehrLookupError}
            </Alert>
          ) : null}

          {ehrRecord ? (
            <div className="mt-4">
              <div className={appDataRow}>
                <div className={appDataLabel}>Diagnosis</div>
                <div className={`${appDataValue} text-right`}>{ehrRecord?.diagnosis ?? '—'}</div>
              </div>
              <div className={appDataRow}>
                <div className={appDataLabel}>Vitals</div>
                <div className={`${appDataValue} max-w-[60%] text-right`}>
                  {JSON.stringify(ehrRecord?.vitals ?? {})}
                </div>
              </div>
              <div className={appDataRow}>
                <div className={appDataLabel}>Last updated</div>
                <div className={`${appDataValue} text-right`}>{formatDate(ehrRecord?.updatedAt)}</div>
              </div>
            </div>
          ) : null}
        </section>

        {s3Enabled ? (
          <section className={`${appPanelCard} md:col-span-2`}>
            <h2 className={appSectionHeading}>Upload Medical File</h2>

            <form className="mt-4 space-y-3" onSubmit={handleUploadSubmit}>
              <input
                className={authInput}
                value={ehrId}
                onChange={(e) => setEhrId(e.target.value)}
                placeholder="Enter EHR ID"
                aria-label="EHR ID for upload"
              />

              <input
                className={authInput}
                type="file"
                accept="*/*"
                onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                aria-label="Choose file to upload"
              />

              {selectedFile ? (
                <p className={appMutedText}>Selected: {selectedFile.name}</p>
              ) : (
                <p className={appMutedText}>Choose a file to upload</p>
              )}

              <Button type="submit" variant="secondary" loading={uploadMutation.isPending} spinner="dark">
                Upload
              </Button>
            </form>

            {uploadNotice.message ? (
              <Alert variant={uploadNotice.variant || 'info'} className="mt-3">
                {uploadNotice.message}
              </Alert>
            ) : null}
          </section>
        ) : null}
      </div>

      {breakGlassNotice.message ? (
        <Alert variant={breakGlassNotice.variant || 'info'}>{breakGlassNotice.message}</Alert>
      ) : null}

      <button
        type="button"
        className="w-full rounded-ds-input border-2 border-red-600 bg-transparent px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950/40 md:max-w-md"
        onClick={openBreakGlass}
      >
        Break-glass Emergency Access
      </button>

      {breakGlassOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card variant="solid" padding="p-6" className="w-full max-w-md">
            <h3 className={appSectionHeading}>Emergency Access</h3>
            <p className={`${appMutedText} mt-2`}>
              This action will be logged and reviewed by administrators.
            </p>

            <div className="mt-4 space-y-3">
              <input
                className={authInput}
                value={breakGlassPatientId}
                onChange={(e) => setBreakGlassPatientId(e.target.value)}
                placeholder="Enter patientId"
                aria-label="patientId"
              />

              {breakGlassNotice.variant === 'error' ? (
                <Alert variant="error">{breakGlassNotice.message}</Alert>
              ) : null}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={closeBreakGlass}
                disabled={breakGlassMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={confirmBreakGlass}
                loading={breakGlassMutation.isPending}
              >
                Confirm Emergency Access
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

