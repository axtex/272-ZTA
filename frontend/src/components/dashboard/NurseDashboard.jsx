import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Alert, Badge, Button, Spinner } from '../ui/index.js';
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
import { getPatientEhr, updateEhrRecord } from '../../lib/api.js';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function vitalsToString(vitals) {
  if (vitals == null) return '—';
  if (typeof vitals === 'object') return JSON.stringify(vitals);
  return String(vitals);
}

export default function NurseDashboard() {
  useAuth(); // ensures we read user from auth context (even if unused)

  const [patientIdInput, setPatientIdInput] = useState('');
  const [activePatientId, setActivePatientId] = useState('');

  const [selectedEhrId, setSelectedEhrId] = useState('');
  const [vitalsInput, setVitalsInput] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [updateNotice, setUpdateNotice] = useState({ variant: '', message: '' });

  const vitalsQuery = useQuery({
    queryKey: ['nursePatientEhr', activePatientId],
    enabled: Boolean(activePatientId),
    queryFn: () => getPatientEhr(activePatientId),
  });

  const records = useMemo(() => {
    return Array.isArray(vitalsQuery.data) ? vitalsQuery.data : [];
  }, [vitalsQuery.data]);

  const updateMutation = useMutation({
    mutationFn: ({ ehrId, vitals }) => updateEhrRecord(ehrId, { vitals }),
    onSuccess: () => {
      setUpdateNotice({ variant: 'success', message: 'Vitals updated successfully.' });
      setJsonError('');
      vitalsQuery.refetch();
    },
    onError: (err) => {
      setUpdateNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to update vitals',
      });
    },
  });

  function handleLookupSubmit(e) {
    e.preventDefault();
    const pid = String(patientIdInput ?? '').trim();
    setUpdateNotice({ variant: '', message: '' });
    setJsonError('');
    setSelectedEhrId('');
    setVitalsInput('');
    setActivePatientId(pid);
  }

  function handleUpdateSubmit(e) {
    e.preventDefault();
    setUpdateNotice({ variant: '', message: '' });

    const ehrId = String(selectedEhrId ?? '').trim();
    if (!ehrId) {
      setUpdateNotice({ variant: 'error', message: 'Select a record to update.' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(String(vitalsInput ?? '').trim() || 'null');
    } catch {
      setJsonError('Invalid JSON. Please fix the input before submitting.');
      return;
    }

    setJsonError('');
    updateMutation.mutate({ ehrId, vitals: parsed });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className={appPanelCard}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={appSectionHeading}>Patient Vitals</h2>
          {activePatientId ? <Badge variant="soft">{activePatientId}</Badge> : null}
        </div>

        <form className="mt-4 flex flex-wrap gap-2" onSubmit={handleLookupSubmit}>
          <input
            className={`${authInput} flex-1`}
            value={patientIdInput}
            onChange={(e) => setPatientIdInput(e.target.value)}
            placeholder="Enter patientId"
            aria-label="patientId"
          />
          <Button type="submit" variant="secondary" loading={vitalsQuery.isFetching} spinner="dark">
            Look up
          </Button>
        </form>

        <div className="mt-4">
          {vitalsQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading vitals…</span>
            </div>
          ) : null}

          {vitalsQuery.isError ? (
            <Alert variant="error" className="mt-3">
              {vitalsQuery.error?.response?.data?.error ||
                vitalsQuery.error?.message ||
                'Failed to load records'}
            </Alert>
          ) : null}

          {!vitalsQuery.isLoading && !vitalsQuery.isError && activePatientId && records.length === 0 ? (
            <p className={`${appMutedText} mt-3`}>No records found for this patient.</p>
          ) : null}

          {!vitalsQuery.isLoading && !vitalsQuery.isError && records.length > 0 ? (
            <div className="mt-3">
              {records.map((r) => (
                <button
                  key={r?.id ?? `${r?.patientId}-${r?.updatedAt}`}
                  type="button"
                  onClick={() => {
                    setSelectedEhrId(String(r?.id ?? ''));
                    setVitalsInput(
                      typeof r?.vitals === 'object'
                        ? JSON.stringify(r?.vitals ?? {}, null, 2)
                        : JSON.stringify({ vitals: r?.vitals }, null, 2),
                    );
                    setUpdateNotice({ variant: '', message: '' });
                    setJsonError('');
                  }}
                  className={`${appDataRow} w-full text-left`}
                >
                  <div className={appDataLabel}>{vitalsToString(r?.vitals)}</div>
                  <div className={`${appDataValue} flex shrink-0 items-center gap-2`}>
                    <span>{formatDate(r?.updatedAt)}</span>
                    {r?.id ? (
                      <Badge variant={String(r?.id) === String(selectedEhrId) ? 'solid' : 'soft'}>
                        {String(r.id).slice(0, 8)}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={appPanelCard}>
        <h2 className={appSectionHeading}>Update Vitals</h2>

        {!selectedEhrId ? (
          <p className={`${appMutedText} mt-3`}>Look up a patient and select a record to update.</p>
        ) : (
          <>
            <p className={`${appMutedText} mt-2`}>
              Updating record <span className="font-medium text-ds-text dark:text-slate-200">{selectedEhrId}</span>
            </p>

            <form className="mt-4 space-y-3" onSubmit={handleUpdateSubmit}>
              <label className={appDataLabel} htmlFor="vitals-json">
                Vitals (JSON)
              </label>
              <textarea
                id="vitals-json"
                className={`${authInput} min-h-[140px] font-mono text-sm`}
                value={vitalsInput}
                onChange={(e) => setVitalsInput(e.target.value)}
                placeholder='{"bp":"120/80","hr":"72","temp":"98.6"}'
              />

              {jsonError ? <p className="text-sm text-red-600 dark:text-red-400">{jsonError}</p> : null}

              <Button type="submit" variant="primary" loading={updateMutation.isPending}>
                Update Vitals
              </Button>
            </form>

            {updateNotice.message ? (
              <Alert variant={updateNotice.variant || 'info'} className="mt-3">
                {updateNotice.message}
              </Alert>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}

