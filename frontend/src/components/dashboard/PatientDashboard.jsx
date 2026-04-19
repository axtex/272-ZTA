import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
import {
  getEhrFileUrl,
  getMyPatientEhr,
  getPatientMyLoginActivity,
  getPatientProfileMe,
} from '../../lib/api.js';

const LIST_PAGE_SIZE = 10;
const LOGIN_ACTIVITY_PAGE_SIZE = 10;
/** Static demo past visits for appointments tab (paginated client-side). */
const PAST_APPOINTMENTS_PAGE_SIZE = 5;
const DEMO_PAST_APPOINTMENTS = [
  { id: 'p1', date: 'November 15, 2024', type: 'Follow-up' },
  { id: 'p2', date: 'October 3, 2024', type: 'Initial consultation' },
  { id: 'p3', date: 'September 12, 2024', type: 'Annual check-up' },
  { id: 'p4', date: 'August 1, 2024', type: 'Lab results review' },
  { id: 'p5', date: 'July 18, 2024', type: 'Follow-up' },
  { id: 'p6', date: 'June 5, 2024', type: 'Cardiology consult' },
  { id: 'p7', date: 'May 22, 2024', type: 'Vaccination' },
];
const DEMO_HOSPITAL = 'Demo General Hospital';
const DEMO_DOB = 'March 12, 1978';
const DEMO_BLOOD = 'O+';
const DEMO_FALLBACK_DOCTOR = 'Dr. Sarah Chen';
const DEMO_FALLBACK_DEPT = 'Cardiology';
const DEMO_FALLBACK_MRN = 'MRN-10042';

function TabButton({ id, label, active, onClick }) {
  return (
    <button
      id={id}
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={[
        'px-4 py-2.5 text-sm font-medium rounded-t-lg border-b-2 transition-colors',
        active
          ? 'border-ds-primary text-ds-primary dark:text-ds-primary-soft dark:border-ds-primary-soft bg-ds-surface dark:bg-slate-900'
          : 'border-transparent text-ds-text-muted hover:text-ds-text dark:text-slate-400 dark:hover:text-slate-200',
      ].join(' ')}
    >
      {label}
    </button>
  );
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatLongDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
}

function formatShortDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function filenameFromStoragePath(storagePath) {
  const s = String(storagePath ?? '');
  if (!s) return '';
  const parts = s.split('/');
  return parts[parts.length - 1] || s;
}

function sortByUpdatedDesc(rows) {
  return [...rows].sort((a, b) => {
    const ta = new Date(a?.updatedAt ?? 0).getTime();
    const tb = new Date(b?.updatedAt ?? 0).getTime();
    return tb - ta;
  });
}

/** Display name for demo: prefer profile names, else derive from email local part. */
function fullNameFromProfileAndEmail(profile, email) {
  const fn = String(profile?.firstName ?? '').trim();
  const ln = String(profile?.lastName ?? '').trim();
  if (fn || ln) return [fn, ln].filter(Boolean).join(' ') || 'Patient';
  const em = String(email ?? '').trim();
  if (!em.includes('@')) return 'Patient';
  const local = em.split('@')[0];
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }
  const one = parts[0] || local;
  return one ? one.charAt(0).toUpperCase() + one.slice(1).toLowerCase() : 'Patient';
}

function normalizePatientVitals(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const bpObj = o.bp && typeof o.bp === 'object' ? o.bp : {};
  const sys = o.systolic ?? o.bpSystolic ?? bpObj.systolic ?? null;
  const dia = o.diastolic ?? o.bpDiastolic ?? bpObj.diastolic ?? null;
  let bpStr = null;
  if (typeof o.bp === 'string' && o.bp.trim()) bpStr = o.bp.trim();
  else if (sys != null && dia != null) bpStr = `${sys} / ${dia}`;
  return {
    bpStr,
    systolic: typeof sys === 'number' ? sys : sys != null ? Number(sys) : null,
    diastolic: typeof dia === 'number' ? dia : dia != null ? Number(dia) : null,
    heartRate: o.heartRate ?? o.hr ?? o.pulse ?? null,
    temperature: o.temperature ?? o.temp ?? null,
    o2: o.o2Saturation ?? o.spo2 ?? o.o2 ?? null,
    respiratoryRate: o.respiratoryRate ?? o.rr ?? o.respRate ?? null,
    pain: o.pain ?? o.painScale ?? null,
    notes: o.notes ?? o.clinicalNotes ?? null,
  };
}

function parseBpFromRecord(vitals) {
  const v = normalizePatientVitals(vitals);
  if (v.systolic != null && v.diastolic != null && !Number.isNaN(v.systolic) && !Number.isNaN(v.diastolic)) {
    return { sys: v.systolic, dia: v.diastolic, label: `${v.systolic} / ${v.diastolic}` };
  }
  const s = v.bpStr;
  if (!s) return { sys: null, dia: null, label: null };
  const m = String(s).replace(/\s+/g, '').match(/^(\d+)\/(\d+)/);
  if (!m) return { sys: null, dia: null, label: s };
  return { sys: Number(m[1]), dia: Number(m[2]), label: `${m[1]} / ${m[2]}` };
}

function bpTrend(sys, dia) {
  if (sys == null || dia == null || Number.isNaN(sys) || Number.isNaN(dia)) {
    return { dot: 'bg-slate-400', label: 'Unknown', text: 'text-slate-600 dark:text-slate-400' };
  }
  if (sys < 120 && dia < 80) {
    return { dot: 'bg-emerald-500', label: 'Normal', text: 'text-emerald-700 dark:text-emerald-300' };
  }
  if (sys < 140 && dia < 90) {
    return { dot: 'bg-amber-500', label: 'Elevated', text: 'text-amber-700 dark:text-amber-300' };
  }
  return { dot: 'bg-red-500', label: 'High', text: 'text-red-700 dark:text-red-300' };
}

function fileTypeBadge(filename) {
  const lower = String(filename ?? '').toLowerCase();
  if (lower.endsWith('.pdf')) return 'PDF';
  if (/\.(png|jpg|jpeg|gif|webp)$/.test(lower)) return 'Image';
  return 'Document';
}

function FileIcon({ filename }) {
  const lower = String(filename ?? '').toLowerCase();
  const isPdf = lower.endsWith('.pdf');
  if (isPdf) {
    return (
      <span
        className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-red-200 bg-red-50 text-xs font-bold text-red-700 dark:border-red-900/50 dark:bg-red-950/50 dark:text-red-200"
        aria-hidden
      >
        PDF
      </span>
    );
  }
  return (
    <span
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-ds-border bg-ds-surface-muted text-ds-text-muted dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
      aria-hidden
    >
      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
    </span>
  );
}

export default function PatientDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isPatient = String(user?.role ?? '').toLowerCase() === 'patient';

  const [activeTab, setActiveTab] = useState('summary');
  const [medicalPage, setMedicalPage] = useState(1);
  const [docsPage, setDocsPage] = useState(1);
  const [loginActivityPage, setLoginActivityPage] = useState(1);
  const [pastAppointmentsPage, setPastAppointmentsPage] = useState(1);
  const [docError, setDocError] = useState('');
  const [docLoadingByEhrId, setDocLoadingByEhrId] = useState({});

  const profileQuery = useQuery({
    queryKey: ['patientProfileMe'],
    enabled: isPatient,
    queryFn: getPatientProfileMe,
  });

  const recordsQuery = useQuery({
    queryKey: ['myPatientEhr'],
    enabled: isPatient,
    queryFn: getMyPatientEhr,
  });

  const loginActivitySkip = (Math.max(1, loginActivityPage) - 1) * LOGIN_ACTIVITY_PAGE_SIZE;
  const loginActivityQuery = useQuery({
    queryKey: ['patientMyLoginActivity', loginActivityPage],
    enabled: isPatient && activeTab === 'privacy',
    queryFn: () =>
      getPatientMyLoginActivity({ skip: loginActivitySkip, take: LOGIN_ACTIVITY_PAGE_SIZE }),
    placeholderData: (previousData) => previousData,
  });

  const profile = profileQuery.data ?? null;
  /** Avoid flashing “not configured” before profile loads; backend sets this from Supabase env. */
  const filesStorageReady = profileQuery.isSuccess && profile?.filesStorageAvailable === true;

  const records = useMemo(() => {
    return Array.isArray(recordsQuery.data) ? recordsQuery.data : [];
  }, [recordsQuery.data]);

  const recordsSorted = useMemo(() => sortByUpdatedDesc(records), [records]);

  const latestRecord = recordsSorted[0] ?? null;
  const latestVitals = useMemo(() => normalizePatientVitals(latestRecord?.vitals), [latestRecord]);

  const bpParsed = useMemo(() => parseBpFromRecord(latestRecord?.vitals), [latestRecord]);
  const trend = useMemo(() => bpTrend(bpParsed.sys, bpParsed.dia), [bpParsed.sys, bpParsed.dia]);

  const docs = useMemo(() => recordsSorted.filter((r) => Boolean(r?.s3FileKey)), [recordsSorted]);

  const lastVisitAt = useMemo(() => {
    let maxMs = null;
    for (const r of records) {
      const t = r?.updatedAt ? new Date(r.updatedAt).getTime() : NaN;
      if (!Number.isNaN(t) && (maxMs === null || t > maxMs)) maxMs = t;
    }
    return maxMs != null ? new Date(maxMs).toISOString() : null;
  }, [records]);

  const mrnDisplay = profile?.medicalRecordNumber?.trim() || DEMO_FALLBACK_MRN;
  const careDoctor =
    profile?.assignedDoctorDisplayName?.trim() ||
    user?.assignedDoctorName?.trim() ||
    DEMO_FALLBACK_DOCTOR;
  const careDept = profile?.assignedDoctorDepartment?.trim() || DEMO_FALLBACK_DEPT;
  const displayFullName = fullNameFromProfileAndEmail(profile, user?.email);

  const assignedDoctorDisplay = user?.assignedDoctorName?.trim()
    ? user.assignedDoctorName.trim()
    : profile?.assignedDoctorDisplayName?.trim() || 'Unassigned';

  const medicalTotalPages = Math.max(1, Math.ceil(recordsSorted.length / LIST_PAGE_SIZE));
  const medicalPageSafe = Math.min(Math.max(1, medicalPage), medicalTotalPages);
  const medicalPageRows = useMemo(() => {
    const start = (medicalPageSafe - 1) * LIST_PAGE_SIZE;
    return recordsSorted.slice(start, start + LIST_PAGE_SIZE);
  }, [recordsSorted, medicalPageSafe]);

  const docsTotalPages = Math.max(1, Math.ceil(docs.length / LIST_PAGE_SIZE));
  const docsPageSafe = Math.min(Math.max(1, docsPage), docsTotalPages);
  const docsPageRows = useMemo(() => {
    const start = (docsPageSafe - 1) * LIST_PAGE_SIZE;
    return docs.slice(start, start + LIST_PAGE_SIZE);
  }, [docs, docsPageSafe]);

  const pastAppointmentsTotalPages = Math.max(
    1,
    Math.ceil(DEMO_PAST_APPOINTMENTS.length / PAST_APPOINTMENTS_PAGE_SIZE),
  );
  const pastAppointmentsPageSafe = Math.min(
    Math.max(1, pastAppointmentsPage),
    pastAppointmentsTotalPages,
  );
  const pastAppointmentsPageRows = useMemo(() => {
    const start = (pastAppointmentsPageSafe - 1) * PAST_APPOINTMENTS_PAGE_SIZE;
    return DEMO_PAST_APPOINTMENTS.slice(start, start + PAST_APPOINTMENTS_PAGE_SIZE);
  }, [pastAppointmentsPageSafe]);

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

  const attendingName = (r) =>
    r?.doctorDisplayName?.trim() || user?.assignedDoctorName?.trim() || DEMO_FALLBACK_DOCTOR;

  const loginActivityPayload = loginActivityQuery.data;
  const loginLogs = useMemo(
    () => (Array.isArray(loginActivityPayload?.logs) ? loginActivityPayload.logs : []),
    [loginActivityPayload],
  );
  const loginActivityTotal =
    typeof loginActivityPayload?.total === 'number' ? loginActivityPayload.total : 0;

  return (
    <div>
      {(recordsQuery.isError || profileQuery.isError) && (
        <Alert variant="error" className="mb-4">
          {recordsQuery.isError
            ? recordsQuery.error?.response?.data?.error ||
              recordsQuery.error?.message ||
              'Failed to load health records.'
            : profileQuery.error?.response?.data?.error ||
                profileQuery.error?.message ||
                'Failed to load profile.'}
        </Alert>
      )}

      <div className="mb-4">
        <h2 className={appSectionHeading}>System Overview</h2>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>My Records</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {recordsQuery.isLoading ? '—' : records.length}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>My Files</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {recordsQuery.isLoading ? '—' : docs.length}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Assigned Doctor</p>
          <p
            className={
              assignedDoctorDisplay !== 'Unassigned'
                ? 'mt-1 text-sm font-semibold leading-snug text-ds-text dark:text-white'
                : 'mt-1 text-sm font-semibold leading-snug text-ds-text-muted dark:text-slate-400'
            }
          >
            {assignedDoctorDisplay}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Last Visit</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-ds-text dark:text-white">
            {recordsQuery.isLoading ? '—' : formatDateTime(lastVisitAt)}
          </p>
        </div>
      </div>

      <div
        className="mb-6 flex flex-wrap gap-1 border-b border-ds-border dark:border-slate-700"
        role="tablist"
        aria-label="Patient dashboard sections"
      >
        <TabButton
          id="tab-patient-summary"
          label="My Health Summary"
          active={activeTab === 'summary'}
          onClick={() => setActiveTab('summary')}
        />
        <TabButton
          id="tab-patient-medical"
          label="My Medical Records"
          active={activeTab === 'medical'}
          onClick={() => setActiveTab('medical')}
        />
        <TabButton
          id="tab-patient-files"
          label="My Files"
          active={activeTab === 'documents'}
          onClick={() => setActiveTab('documents')}
        />
        <TabButton
          id="tab-patient-appointments"
          label="My Appointments"
          active={activeTab === 'appointments'}
          onClick={() => setActiveTab('appointments')}
        />
        <TabButton
          id="tab-patient-security-logs"
          label="My Security Logs"
          active={activeTab === 'privacy'}
          onClick={() => setActiveTab('privacy')}
        />
      </div>

      {activeTab === 'summary' ? (
        <div className="space-y-4" role="tabpanel" aria-labelledby="tab-patient-summary">
          <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2">
            <section className={`${appPanelCard} flex h-full min-h-0 flex-col`}>
              <h2 className={appSectionHeading}>Personal Info</h2>
              <dl className="mt-4 space-y-3">
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Full name</dt>
                  <dd className={`${appDataValue} text-right`}>{displayFullName}</dd>
                </div>
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Medical Record Number</dt>
                  <dd className={`${appDataValue} text-right`}>{mrnDisplay}</dd>
                </div>
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Date of Birth</dt>
                  <dd className={`${appDataValue} text-right`}>{DEMO_DOB}</dd>
                </div>
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Blood Type</dt>
                  <dd className={`${appDataValue} text-right`}>{DEMO_BLOOD}</dd>
                </div>
              </dl>
              <div className="min-h-0 flex-1" aria-hidden />
            </section>

            <section className={`${appPanelCard} flex h-full min-h-0 flex-col`}>
              <h2 className={appSectionHeading}>Care Team</h2>
              <dl className="mt-4 space-y-3">
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Assigned Doctor</dt>
                  <dd className={`${appDataValue} text-right`}>{careDoctor}</dd>
                </div>
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Department</dt>
                  <dd className={`${appDataValue} text-right`}>{careDept}</dd>
                </div>
                <div className={appDataRow}>
                  <dt className={appDataLabel}>Hospital</dt>
                  <dd className={`${appDataValue} text-right`}>{DEMO_HOSPITAL}</dd>
                </div>
              </dl>
              <div className="min-h-0 flex-1" aria-hidden />
              <p className={`${appMutedText} pt-4 text-sm`}>
                Contact the hospital reception to reach your care team.
              </p>
            </section>
          </div>

          <section className={`${appPanelCard} w-full`}>
            <h2 className={appSectionHeading}>Latest Vitals</h2>
            {recordsQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading…</span>
              </div>
            ) : null}
            {!recordsQuery.isLoading && !latestRecord ? (
              <p className={`${appMutedText} mt-4`}>No vitals recorded yet.</p>
            ) : null}
            {!recordsQuery.isLoading && latestRecord ? (
              <div className="mt-4">
                {bpParsed.label ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className={`size-2.5 shrink-0 rounded-full ${trend.dot}`} aria-hidden />
                    <span className={`text-sm font-semibold ${trend.text}`}>Blood pressure: {trend.label}</span>
                    <span className={`${appMutedText} text-xs`}>
                      (Reading {bpParsed.label} mmHg)
                    </span>
                  </div>
                ) : null}
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>Blood Pressure</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.bpStr
                        ? `${latestVitals.bpStr.replace(/\s*\/\s*/, ' / ')} mmHg`
                        : bpParsed.label
                          ? `${bpParsed.label} mmHg`
                          : '—'}
                    </dd>
                  </div>
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>Heart Rate</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.heartRate != null ? `${latestVitals.heartRate} bpm` : '—'}
                    </dd>
                  </div>
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>Temperature</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.temperature != null ? `${latestVitals.temperature} °F` : '—'}
                    </dd>
                  </div>
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>O2 Saturation</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.o2 != null ? `${latestVitals.o2} %` : '—'}
                    </dd>
                  </div>
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>Respiratory Rate</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.respiratoryRate != null ? `${latestVitals.respiratoryRate} breaths/min` : '—'}
                    </dd>
                  </div>
                  <div className={appDataRow}>
                    <dt className={appDataLabel}>Pain Scale</dt>
                    <dd className={`${appDataValue} text-right`}>
                      {latestVitals.pain != null ? `${latestVitals.pain} / 10` : '—'}
                    </dd>
                  </div>
                </dl>
                <div className={`${appMutedText} mt-4 space-y-1 text-sm`}>
                  <p>Recorded: {formatLongDate(latestRecord?.updatedAt)}</p>
                  <p>Recorded by: {attendingName(latestRecord)}</p>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {activeTab === 'medical' ? (
        <section className={appPanelCard} role="tabpanel" aria-labelledby="tab-patient-medical">
          <h2 className={appSectionHeading}>My Medical Records</h2>
          <div className="mt-4">
            {recordsQuery.isLoading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading records…</span>
              </div>
            ) : null}
            {!recordsQuery.isLoading && !recordsQuery.isError && records.length === 0 ? (
              <div className={`${appPanelCard} mt-2 border-dashed`}>
                <p className="text-sm font-medium text-ds-text dark:text-slate-200">No medical records found.</p>
                <p className={`${appMutedText} mt-2 text-sm`}>
                  Your records will appear here after your first visit.
                </p>
              </div>
            ) : null}
            {!recordsQuery.isLoading && records.length > 0 ? (
              <div className="mt-4 space-y-4">
                {medicalPageRows.map((r) => {
                  const v = normalizePatientVitals(r?.vitals);
                  const bp = parseBpFromRecord(r?.vitals);
                  return (
                    <article key={r?.id ?? `${r?.patientId}-${r?.updatedAt}`} className={appPanelCard}>
                      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-ds-border/60 pb-3 dark:border-slate-700/60">
                        <div>
                          <p className="text-sm font-semibold text-ds-text dark:text-white">
                            {formatLongDate(r?.updatedAt)}
                          </p>
                          <p className={`${appMutedText} mt-1 text-xs`}>
                            Attending: {attendingName(r)} · Visit type: Follow-up
                          </p>
                        </div>
                      </header>
                      <div className="mt-4">
                        <p className={appDataLabel}>Diagnosis</p>
                        <p className="mt-1 text-sm leading-relaxed text-ds-text dark:text-slate-100">
                          {r?.diagnosis ?? '—'}
                        </p>
                      </div>
                      <div className="mt-4">
                        <p className={appDataLabel}>Vitals</p>
                        <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                          <div>
                            <span className={appMutedText}>BP: </span>
                            <span className={appDataValue}>{bp.label ?? v.bpStr ?? '—'}</span>
                          </div>
                          <div>
                            <span className={appMutedText}>HR: </span>
                            <span className={appDataValue}>{v.heartRate ?? '—'}</span>
                          </div>
                          <div>
                            <span className={appMutedText}>Temp: </span>
                            <span className={appDataValue}>{v.temperature != null ? `${v.temperature}°F` : '—'}</span>
                          </div>
                          <div>
                            <span className={appMutedText}>O2: </span>
                            <span className={appDataValue}>{v.o2 != null ? `${v.o2}%` : '—'}</span>
                          </div>
                          <div>
                            <span className={appMutedText}>RR: </span>
                            <span className={appDataValue}>{v.respiratoryRate ?? '—'}</span>
                          </div>
                          <div>
                            <span className={appMutedText}>Pain: </span>
                            <span className={appDataValue}>{v.pain != null ? `${v.pain}/10` : '—'}</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-4">
                        <p className={appDataLabel}>Notes</p>
                        <p className={`mt-1 text-sm ${v.notes ? 'text-ds-text dark:text-slate-100' : appMutedText}`}>
                          {v.notes ? String(v.notes) : ''}
                        </p>
                      </div>
                    </article>
                  );
                })}
                <div className="flex items-center justify-end gap-2">
                  <span className={`${appMutedText} text-xs`}>
                    Page {medicalPageSafe} of {medicalTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={medicalPageSafe <= 1}
                    onClick={() => setMedicalPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={medicalPageSafe >= medicalTotalPages}
                    onClick={() => setMedicalPage((p) => Math.min(medicalTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'documents' ? (
        <section className={appPanelCard} role="tabpanel" aria-labelledby="tab-patient-files">
          <h2 className={appSectionHeading}>My Files</h2>
          <div className="mt-4">
            {profileQuery.isSuccess && !filesStorageReady ? (
              <Alert variant="info">
                Supabase Storage is not configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
                (optional: SUPABASE_STORAGE_BUCKET — defaults to bucket 272).
              </Alert>
            ) : null}
            {docError ? (
              <Alert variant="error" className="mt-3">
                {docError}
              </Alert>
            ) : null}
            {recordsQuery.isLoading ? (
              <div className="mt-3 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading…</span>
              </div>
            ) : null}
            {filesStorageReady &&
            !recordsQuery.isLoading &&
            !recordsQuery.isError &&
            records.length > 0 &&
            docs.length === 0 ? (
              <p className={`${appMutedText} mt-3`}>No files on profile yet.</p>
            ) : null}
            {filesStorageReady && !recordsQuery.isLoading && docs.length > 0 ? (
              <div className="mt-3 space-y-3">
                {docsPageRows.map((r) => {
                  const name = filenameFromStoragePath(r?.s3FileKey) || 'Document';
                  const eid = String(r?.id ?? '');
                  const loading = Boolean(docLoadingByEhrId[eid]);
                  return (
                    <div
                      key={eid || r?.s3FileKey}
                      className="flex flex-wrap items-center gap-3 rounded-ds-card border border-ds-border/70 bg-ds-surface/80 p-3 dark:border-slate-700 dark:bg-slate-900/60"
                    >
                      <FileIcon filename={name} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium text-ds-text dark:text-slate-100">{name}</span>
                          <Badge variant="soft">{fileTypeBadge(name)}</Badge>
                        </div>
                        <p className={`${appMutedText} mt-1 text-xs`}>
                          Uploaded by {attendingName(r)} · {formatDate(r?.updatedAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {loading ? <Spinner size="sm" /> : null}
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-8 !text-xs"
                          disabled={loading}
                          onClick={() => handleViewDocument(r?.id)}
                        >
                          View Document
                        </Button>
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-end gap-2 pt-2">
                  <span className={`${appMutedText} text-xs`}>
                    Page {docsPageSafe} of {docsTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={docsPageSafe <= 1}
                    onClick={() => setDocsPage((p) => Math.max(1, p - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={docsPageSafe >= docsTotalPages}
                    onClick={() => setDocsPage((p) => Math.min(docsTotalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
                <p className={`${appMutedText} mt-4 text-xs leading-relaxed`}>
                  Document links expire after 15 minutes for your security. If a link stops working, click View
                  Document again.
                </p>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'appointments' ? (
        <section className={appPanelCard} role="tabpanel" aria-labelledby="tab-patient-appointments">
          <h2 className={appSectionHeading}>My Appointments</h2>
          <div className="mt-6 space-y-6">
            <div>
              <h3 className="text-sm font-semibold text-ds-text dark:text-white">Upcoming</h3>
              <ul className="mt-3 space-y-3">
                <li className={appPanelCard}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ds-text dark:text-white">December 3, 2024</p>
                      <p className={`${appMutedText} text-sm`}>10:30 AM</p>
                    </div>
                    <Badge
                      variant="soft"
                      className="!border !border-emerald-200/80 !bg-emerald-100 !text-emerald-800 dark:!border-emerald-900/50 dark:!bg-emerald-950/60 dark:!text-emerald-200"
                    >
                      Confirmed
                    </Badge>
                  </div>
                  <dl className={`${appMutedText} mt-3 space-y-1 text-sm`}>
                    <div>Doctor: {DEMO_FALLBACK_DOCTOR}</div>
                    <div>Type: Follow-up consultation</div>
                    <div>Location: Cardiology Clinic, Room 204</div>
                  </dl>
                </li>
                <li className={appPanelCard}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ds-text dark:text-white">January 15, 2025</p>
                      <p className={`${appMutedText} text-sm`}>2:00 PM</p>
                    </div>
                    <Badge
                      variant="soft"
                      className="!border !border-amber-200/80 !bg-amber-100 !text-amber-900 dark:!border-amber-900/50 dark:!bg-amber-950/60 dark:!text-amber-100"
                    >
                      Scheduled
                    </Badge>
                  </div>
                  <dl className={`${appMutedText} mt-3 space-y-1 text-sm`}>
                    <div>Doctor: {DEMO_FALLBACK_DOCTOR}</div>
                    <div>Type: Blood panel review</div>
                    <div>Location: Lab Services, Floor 2</div>
                  </dl>
                </li>
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ds-text dark:text-white">Past</h3>
              <ul className="mt-3 space-y-3">
                {pastAppointmentsPageRows.map((appt) => (
                  <li key={appt.id} className={appPanelCard}>
                    <p className="font-medium text-ds-text dark:text-white">{appt.date}</p>
                    <p className={`${appMutedText} mt-1 text-sm`}>{appt.type}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex items-center justify-end gap-2">
                <span className={`${appMutedText} text-xs`}>
                  Page {pastAppointmentsPageSafe} of {pastAppointmentsTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={pastAppointmentsPageSafe <= 1}
                  onClick={() => setPastAppointmentsPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={pastAppointmentsPageSafe >= pastAppointmentsTotalPages}
                  onClick={() =>
                    setPastAppointmentsPage((p) => Math.min(pastAppointmentsTotalPages, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
            <p className={`${appMutedText} text-sm leading-relaxed`}>
              To schedule or cancel appointments, please contact the hospital reception at (555) 000-0000.
            </p>
          </div>
        </section>
      ) : null}

      {activeTab === 'privacy' ? (
        <div className="space-y-6" role="tabpanel" aria-labelledby="tab-patient-security-logs">
          <section className={appPanelCard}>
            <h2 className={appSectionHeading}>Two-factor authentication</h2>
            {user?.mfaEnabled ? (
              <div className="mt-4">
                <Badge
                  variant="soft"
                  className="!border !border-emerald-200/80 !bg-emerald-100 !text-emerald-800 dark:!border-emerald-900/50 dark:!bg-emerald-950/60 dark:!text-emerald-200"
                >
                  Two-factor authentication is active
                </Badge>
                <p className={`${appMutedText} mt-3 text-sm`}>
                  Your account is protected with an authenticator app.
                </p>
                <div className="mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    className="!gap-1 !rounded-md !px-2.5 !py-1 !text-xs !font-medium !shadow-none"
                    onClick={() => navigate('/mfa-setup')}
                  >
                    Manage 2FA
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <Badge
                  variant="soft"
                  className="!border !border-amber-200/80 !bg-amber-100 !text-amber-900 dark:!border-amber-900/50 dark:!bg-amber-950/60 dark:!text-amber-100"
                >
                  Two-factor authentication is not set up
                </Badge>
                <p className={`${appMutedText} mt-3 text-sm`}>
                  We strongly recommend enabling 2FA to protect your health records.
                </p>
                <div className="mt-4">
                  <Button
                    type="button"
                    variant="primary"
                    className="!text-sm"
                    onClick={() => navigate('/mfa-setup')}
                  >
                    Enable 2FA
                  </Button>
                </div>
              </div>
            )}
          </section>

          <section className={appPanelCard}>
            <h2 className={appSectionHeading}>My login activity</h2>
            <p className={`${appMutedText} mt-1 text-sm`}>Recent sign-in activity for your account.</p>
            <div className="mt-4">
              {loginActivityQuery.isLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span className={appMutedText}>Loading activity…</span>
                </div>
              ) : null}

              {loginActivityQuery.isError ? (
                <Alert variant="error" className="mt-1">
                  {loginActivityQuery.error?.response?.data?.error ||
                    loginActivityQuery.error?.message ||
                    'Failed to load sign-in activity. Try again later.'}
                </Alert>
              ) : null}

              {!loginActivityQuery.isLoading && !loginActivityQuery.isError && loginActivityTotal > 0 ? (
                <p className={`${appMutedText} mb-3`}>
                  Showing {loginLogs.length} of {loginActivityTotal} sign-in
                  {loginActivityTotal === 1 ? '' : 's'}
                </p>
              ) : null}

              {!loginActivityQuery.isLoading && !loginActivityQuery.isError && loginActivityTotal === 0 ? (
                <p className={`${appMutedText} text-sm`}>
                  No sign-in history yet. Successful sign-ins will appear here after your next login.
                </p>
              ) : null}

              {!loginActivityQuery.isLoading && !loginActivityQuery.isError && loginActivityTotal > 0 ? (
                <div className="mt-1 overflow-x-auto rounded-lg border border-ds-border/70 dark:border-slate-700/80">
                  <table className="min-w-full border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-ds-border/80 bg-ds-surface/90 dark:border-slate-700 dark:bg-slate-900/80">
                        <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Date/Time</th>
                        <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Action</th>
                        <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>IP Address</th>
                        <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Device</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loginLogs.map((row) => (
                        <tr
                          key={row.id}
                          className="border-b border-ds-border/50 last:border-0 dark:border-slate-800/80"
                        >
                          <td className={`${appDataValue} px-3 py-2 align-top`}>
                            {formatShortDateTime(row.timestamp)}
                          </td>
                          <td className={`${appDataValue} px-3 py-2 align-top`}>{row.actionLabel}</td>
                          <td className="px-3 py-2 align-top font-mono text-xs text-ds-text dark:text-slate-200">
                            {row.ipAddress ?? '—'}
                          </td>
                          <td className={`${appDataValue} px-3 py-2 align-top`}>{row.deviceLabel}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {(() => {
                    const totalPages = Math.max(1, Math.ceil(loginActivityTotal / LOGIN_ACTIVITY_PAGE_SIZE));
                    const pageSafe = Math.min(Math.max(1, loginActivityPage), totalPages);
                    return (
                      <div className="flex items-center justify-end gap-2 border-t border-ds-border/60 px-3 py-2.5 dark:border-slate-800/80">
                        <span className={`${appMutedText} text-xs`}>
                          Page {pageSafe} of {totalPages}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                          disabled={pageSafe <= 1 || loginActivityQuery.isFetching}
                          onClick={() => setLoginActivityPage((p) => Math.max(1, p - 1))}
                        >
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                          disabled={pageSafe >= totalPages || loginActivityQuery.isFetching}
                          onClick={() => setLoginActivityPage((p) => Math.min(totalPages, p + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    );
                  })()}
                </div>
              ) : null}
            </div>
            <p className={`${appMutedText} mt-4 text-xs leading-relaxed`}>
              If you see activity you don&apos;t recognise, contact the hospital IT security team immediately.
            </p>
          </section>
        </div>
      ) : null}
    </div>
  );
}
