import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Alert, Badge, Button, Spinner } from '../ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  appDataLabel,
  appDataRow,
  appDataValue,
  appMutedText,
  appPanelCard,
  appSectionHeading,
} from '../../design-system/patterns.js';
import { getEhrFileUrl, getPatientEhr } from '../../lib/api.js';

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function filenameFromS3Key(s3Key) {
  const s = String(s3Key ?? '');
  if (!s) return '';
  const parts = s.split('/');
  return parts[parts.length - 1] || s;
}

function vitalsEntries(vitals) {
  if (!vitals || typeof vitals !== 'object') return [];
  return Object.entries(vitals);
}

export default function PatientDashboard() {
  const { user } = useAuth();
  const patientId = user?.sub;
  const s3Enabled = (import.meta.env.VITE_S3_ENABLED ?? 'false') === 'true';

  const [docError, setDocError] = useState('');
  const [docLoadingByEhrId, setDocLoadingByEhrId] = useState({});

  const recordsQuery = useQuery({
    queryKey: ['patientEhr', patientId],
    enabled: Boolean(patientId),
    queryFn: () => getPatientEhr(patientId),
  });

  const records = useMemo(() => {
    return Array.isArray(recordsQuery.data) ? recordsQuery.data : [];
  }, [recordsQuery.data]);

  const docs = useMemo(() => {
    return records.filter((r) => Boolean(r?.s3FileKey));
  }, [records]);

  async function handleViewDocument(ehrId) {
    setDocError('');
    const id = String(ehrId ?? '').trim();
    if (!id) return;
    setDocLoadingByEhrId((s) => ({ ...s, [id]: true }));
    try {
      const result = await getEhrFileUrl(id);
      const url = result?.url;
      if (!url) throw new Error('No URL returned');
      window.open(url, '_blank');
    } catch (err) {
      setDocError(err?.response?.data?.error || err?.message || 'Failed to open document');
    } finally {
      setDocLoadingByEhrId((s) => ({ ...s, [id]: false }));
    }
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className={appPanelCard}>
        <h2 className={appSectionHeading}>My Health Records</h2>

        <div className="mt-4">
          {recordsQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading records…</span>
            </div>
          ) : null}

          {recordsQuery.isError ? (
            <Alert variant="error" className="mt-3">
              {recordsQuery.error?.response?.data?.error ||
                recordsQuery.error?.message ||
                'Failed to load records'}
            </Alert>
          ) : null}

          {!recordsQuery.isLoading && !recordsQuery.isError && records.length === 0 ? (
            <p className={`${appMutedText} mt-3`}>No records found</p>
          ) : null}

          {!recordsQuery.isLoading && !recordsQuery.isError && records.length > 0 ? (
            <div className="mt-3 space-y-3">
              {records.map((r) => (
                <div key={r?.id ?? `${r?.patientId}-${r?.updatedAt}`} className={appPanelCard}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className={appDataValue}>{r?.diagnosis ?? '—'}</div>
                    {r?.id ? <Badge variant="soft">{String(r.id).slice(0, 8)}</Badge> : null}
                  </div>

                  <div className="mt-4">
                    <div className={appDataRow}>
                      <div className={appDataLabel}>Last updated</div>
                      <div className={`${appDataValue} text-right`}>{formatDate(r?.updatedAt)}</div>
                    </div>

                    {vitalsEntries(r?.vitals).length > 0 ? (
                      <div className="mt-2">
                        {vitalsEntries(r?.vitals).map(([k, v]) => (
                          <div key={k} className={appDataRow}>
                            <div className={appDataLabel}>{k}</div>
                            <div className={`${appDataValue} text-right`}>{String(v)}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className={`${appMutedText} mt-2`}>No vitals on record</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className={appPanelCard}>
        <h2 className={appSectionHeading}>My Documents</h2>

        <div className="mt-4">
          {!s3Enabled ? (
            <Alert variant="info">
              S3 file storage is not configured in this environment.
            </Alert>
          ) : null}

          {docError ? (
            <Alert variant="error" className="mt-3">
              {docError}
            </Alert>
          ) : null}

          {s3Enabled && !recordsQuery.isLoading && !recordsQuery.isError && docs.length === 0 ? (
            <p className={`${appMutedText} mt-3`}>No documents on file</p>
          ) : null}

          {s3Enabled && docs.length > 0 ? (
            <div className="mt-3">
              {docs.map((r) => {
                const eid = String(r?.id ?? '');
                const loading = Boolean(docLoadingByEhrId[eid]);
                return (
                  <div key={eid || r?.s3FileKey} className={appDataRow}>
                    <div className={appDataLabel}>{filenameFromS3Key(r?.s3FileKey)}</div>
                    <div className="flex items-center gap-2">
                      {loading ? <Spinner size="sm" /> : null}
                      <Button
                        type="button"
                        variant="ghost"
                        className="px-2 py-1 text-xs"
                        disabled={loading}
                        onClick={() => handleViewDocument(r?.id)}
                      >
                        View Document
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

