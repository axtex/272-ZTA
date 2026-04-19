import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert, Badge, Button, Card, Spinner } from '../ui/index.js';
import { useAuth } from '../../context/AuthContext.jsx';
import {
  appDataLabel,
  appDataValue,
  appDecisionAllow,
  appDecisionDeny,
  appDecisionStepUp,
  appMutedText,
  appPanelCard,
  appSectionHeading,
  authInput,
} from '../../design-system/patterns.js';
import {
  getDoctorAccessLog,
  getDoctorAssignedPatients,
  getEhrFileUrl,
  getEhrRecord,
  requestDoctorBreakGlass,
  updateEhrRecord,
  uploadEhrFile,
} from '../../lib/api.js';

const BREAK_GLASS_REASONS = [
  { value: '', label: 'Select reason' },
  { value: 'Medical emergency', label: 'Medical emergency' },
  { value: 'Patient incapacitated', label: 'Patient incapacitated' },
  { value: 'On-call coverage', label: 'On-call coverage' },
  { value: 'Other', label: 'Other' },
];

function TabButton({ id, label, active, onClick }) {
  return (
    <button
      id={id}
      type="button"
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

const DOCTOR_PATIENT_TABLE_HEAD =
  'grid grid-cols-[minmax(11rem,1.45fr)_minmax(6.5rem,0.65fr)_minmax(7rem,0.55fr)_minmax(9rem,0.85fr)] gap-x-3 items-center';

const PATIENTS_PAGE_SIZE = 10;
const ACCESS_LOG_PAGE_SIZE = 10;

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatDateOnly(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function normalizeVitals(v) {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const bp = o.bp && typeof o.bp === 'object' ? o.bp : {};
  return {
    systolic: o.systolic ?? o.bpSystolic ?? bp.systolic ?? null,
    diastolic: o.diastolic ?? o.bpDiastolic ?? bp.diastolic ?? null,
    heartRate: o.heartRate ?? o.hr ?? o.pulse ?? null,
    temperature: o.temperature ?? o.temp ?? null,
    o2: o.o2Saturation ?? o.spo2 ?? o.o2 ?? null,
  };
}

function filenameFromStoragePath(key) {
  const s = String(key ?? '');
  if (!s) return 'file';
  const seg = s.split('/').pop() || s;
  const idx = seg.indexOf('-');
  return idx >= 0 ? seg.slice(idx + 1) : seg;
}

function actionDisplay(action) {
  const a = String(action ?? '');
  if (a === 'BREAK_GLASS') return 'Break-glass';
  if (a === 'READ_EHR') return 'EHR accessed';
  if (a === 'WRITE_EHR') return 'EHR updated';
  if (a.includes('LOGIN')) return 'Login';
  return a || '—';
}

function decisionPill(log) {
  const d = String(log?.decision ?? '');
  const a = String(log?.action ?? '');
  if (a === 'BREAK_GLASS' && d === 'ALLOW') {
    return <span className={appDecisionStepUp}>OVERRIDE</span>;
  }
  if (d === 'ALLOW') return <span className={appDecisionAllow}>ALLOW</span>;
  if (d === 'DENY') return <span className={appDecisionDeny}>DENY</span>;
  if (d === 'STEP_UP') return <span className={appDecisionStepUp}>STEP_UP</span>;
  return <span className={appMutedText}>{d || '—'}</span>;
}

export default function DoctorDashboard() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const doctorId = user?.sub ?? user?.id;

  const [activeTab, setActiveTab] = useState('patients');
  /** Patient selected on EHR + Medical Files tabs (assigned list only). */
  const [chartPatientId, setChartPatientId] = useState('');
  const [patientsPage, setPatientsPage] = useState(1);
  const [accessLogPage, setAccessLogPage] = useState(1);

  const [ehrEditMode, setEhrEditMode] = useState(false);
  const [editDiagnosis, setEditDiagnosis] = useState('');
  const [editVitals, setEditVitals] = useState({
    systolic: '',
    diastolic: '',
    heartRate: '',
    temperature: '',
    o2: '',
  });
  const [ehrSaveNotice, setEhrSaveNotice] = useState({ variant: '', message: '' });

  const [filesSelected, setFilesSelected] = useState(null);
  const [filesNotice, setFilesNotice] = useState({ variant: '', message: '' });

  const [bgPatientId, setBgPatientId] = useState('');
  const [bgReason, setBgReason] = useState('');
  const [bgDetail, setBgDetail] = useState('');
  const [bgModalOpen, setBgModalOpen] = useState(false);
  const [bgNotice, setBgNotice] = useState({ variant: '', message: '' });

  const dashboardQuery = useQuery({
    queryKey: ['doctorAssignedPatients', doctorId],
    enabled: Boolean(doctorId),
    queryFn: () => getDoctorAssignedPatients(),
  });

  const patients = useMemo(() => {
    const p = dashboardQuery.data?.patients;
    return Array.isArray(p) ? p : [];
  }, [dashboardQuery.data]);

  const patientsTotalPages = Math.max(1, Math.ceil(patients.length / PATIENTS_PAGE_SIZE));
  const patientsPageSafe = Math.min(Math.max(1, patientsPage), patientsTotalPages);

  const patientsPageRows = useMemo(() => {
    const start = (patientsPageSafe - 1) * PATIENTS_PAGE_SIZE;
    return patients.slice(start, start + PATIENTS_PAGE_SIZE);
  }, [patients, patientsPageSafe]);

  const stats = dashboardQuery.data?.stats;
  const filesStorageAvailable = dashboardQuery.data?.filesStorageAvailable === true;

  const patientById = useMemo(() => {
    const m = new Map();
    patients.forEach((p) => m.set(p.patientId, p));
    return m;
  }, [patients]);

  const selectedPatient = chartPatientId ? patientById.get(chartPatientId) : null;
  const selectedEhrId = selectedPatient?.latestEhr?.id ?? null;

  const ehrQuery = useQuery({
    queryKey: ['ehrRecord', selectedEhrId],
    enabled: Boolean(selectedEhrId) && (activeTab === 'ehr' || activeTab === 'files'),
    queryFn: () => getEhrRecord(selectedEhrId),
  });

  const ehrRecord = ehrQuery.data ?? null;

  function beginEhrEdit() {
    if (!ehrRecord) return;
    setEditDiagnosis(String(ehrRecord.diagnosis ?? ''));
    const v = normalizeVitals(ehrRecord.vitals);
    setEditVitals({
      systolic: v.systolic != null ? String(v.systolic) : '',
      diastolic: v.diastolic != null ? String(v.diastolic) : '',
      heartRate: v.heartRate != null ? String(v.heartRate) : '',
      temperature: v.temperature != null ? String(v.temperature) : '',
      o2: v.o2 != null ? String(v.o2) : '',
    });
    setEhrEditMode(true);
  }

  const updateEhrMutation = useMutation({
    mutationFn: ({ id, payload }) => updateEhrRecord(id, payload),
    onSuccess: () => {
      setEhrSaveNotice({ variant: 'success', message: 'Record saved successfully.' });
      setEhrEditMode(false);
      queryClient.invalidateQueries({ queryKey: ['doctorAssignedPatients', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['ehrRecord', selectedEhrId] });
    },
    onError: (err) => {
      setEhrSaveNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Save failed',
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: ({ id, file }) => uploadEhrFile(id, file),
    onSuccess: () => {
      setFilesNotice({ variant: 'success', message: 'File uploaded successfully' });
      setFilesSelected(null);
      queryClient.invalidateQueries({ queryKey: ['doctorAssignedPatients', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['ehrRecord', selectedEhrId] });
    },
    onError: (err) => {
      setFilesNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Upload failed',
      });
    },
  });

  const breakGlassMutation = useMutation({
    mutationFn: (body) => requestDoctorBreakGlass(body),
    onSuccess: (data, variables) => {
      const ts = new Date().toLocaleString();
      setBgNotice({
        variant: 'success',
        message: [
          `Emergency access granted for patient ${data.patientId ?? variables.patientIdentifier}.`,
          'This event has been logged and your supervisor notified.',
          `Reason: ${data.reason ?? variables.reason} — ${ts}`,
        ].join(' '),
      });
      setBgModalOpen(false);
      setBgPatientId('');
      setBgReason('');
      setBgDetail('');
      queryClient.invalidateQueries({ queryKey: ['doctorBreakGlassHistory', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['doctorAccessLog', doctorId] });
    },
    onError: (err) => {
      setBgNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Request failed',
      });
    },
  });

  const breakGlassHistoryQuery = useQuery({
    queryKey: ['doctorBreakGlassHistory', doctorId],
    enabled: Boolean(doctorId) && activeTab === 'breakglass',
    queryFn: () => getDoctorAccessLog({ take: 5, action: 'BREAK_GLASS' }),
  });

  const accessLogQuery = useQuery({
    queryKey: ['doctorAccessLog', doctorId, accessLogPage],
    enabled: Boolean(doctorId) && activeTab === 'accesslog',
    queryFn: async () => {
      let body = await getDoctorAccessLog({
        take: ACCESS_LOG_PAGE_SIZE,
        skip: (accessLogPage - 1) * ACCESS_LOG_PAGE_SIZE,
      });
      const total = typeof body.total === 'number' ? body.total : (body.logs?.length ?? 0);
      const tp = Math.max(1, Math.ceil(total / ACCESS_LOG_PAGE_SIZE));
      if (accessLogPage > tp) {
        body = await getDoctorAccessLog({
          take: ACCESS_LOG_PAGE_SIZE,
          skip: (tp - 1) * ACCESS_LOG_PAGE_SIZE,
        });
        queueMicrotask(() => setAccessLogPage(tp));
      }
      return body;
    },
  });

  const accessLogTotal = accessLogQuery.data?.total ?? 0;
  const accessLogTotalPages = Math.max(1, Math.ceil(accessLogTotal / ACCESS_LOG_PAGE_SIZE));
  const accessLogPageSafe = Math.min(Math.max(1, accessLogPage), accessLogTotalPages);

  const goToEhrForPatient = useCallback((patientId) => {
    setChartPatientId(patientId);
    setActiveTab('ehr');
    setEhrEditMode(false);
    setEhrSaveNotice({ variant: '', message: '' });
  }, []);

  const goToFilesForPatient = useCallback((patientId) => {
    setChartPatientId(patientId);
    setActiveTab('files');
    setFilesNotice({ variant: '', message: '' });
    setFilesSelected(null);
  }, []);

  function handleSaveEhr() {
    if (!selectedEhrId) return;
    setEhrSaveNotice({ variant: '', message: '' });
    const vitals = {
      systolic: editVitals.systolic ? Number(editVitals.systolic) : null,
      diastolic: editVitals.diastolic ? Number(editVitals.diastolic) : null,
      heartRate: editVitals.heartRate ? Number(editVitals.heartRate) : null,
      temperature: editVitals.temperature ? Number(editVitals.temperature) : null,
      o2Saturation: editVitals.o2 ? Number(editVitals.o2) : null,
    };
    const cleaned = Object.fromEntries(Object.entries(vitals).filter(([, val]) => val != null && !Number.isNaN(val)));
    updateEhrMutation.mutate({
      id: selectedEhrId,
      payload: { diagnosis: editDiagnosis, vitals: cleaned },
    });
  }

  function handleOpenFile() {
    if (!selectedEhrId) return;
    getEhrFileUrl(selectedEhrId)
      .then((data) => {
        if (data?.url) window.open(data.url, '_blank', 'noopener,noreferrer');
      })
      .catch(() => {
        setFilesNotice({ variant: 'error', message: 'Could not open file URL' });
      });
  }

  function handleFilesUpload(e) {
    e.preventDefault();
    if (!selectedEhrId) {
      setFilesNotice({ variant: 'error', message: 'No EHR record to attach a file to.' });
      return;
    }
    if (!filesSelected) {
      setFilesNotice({ variant: 'error', message: 'Choose a file first.' });
      return;
    }
    setFilesNotice({ variant: '', message: '' });
    uploadMutation.mutate({ id: selectedEhrId, file: filesSelected });
  }

  const vDisplay = ehrRecord ? normalizeVitals(ehrRecord.vitals) : normalizeVitals(null);

  const bgHistoryRows = useMemo(() => {
    const logs = breakGlassHistoryQuery.data?.logs ?? [];
    return logs.slice(0, 5);
  }, [breakGlassHistoryQuery.data?.logs]);

  const bgFormValid =
    String(bgPatientId).trim().length > 0 && String(bgReason).trim().length > 0 && bgReason !== '';

  return (
    <div>
      {dashboardQuery.isError ? (
        <Alert variant="error" className="mb-4">
          {dashboardQuery.error?.response?.data?.error ||
            dashboardQuery.error?.message ||
            'Failed to load dashboard.'}
        </Alert>
      ) : null}

      <div className="mb-4">
        <h2 className={appSectionHeading}>System Overview</h2>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>My Patients</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {dashboardQuery.isLoading ? '—' : (stats?.myPatients ?? 0)}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>EHR Records</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {dashboardQuery.isLoading ? '—' : (stats?.ehrRecords ?? 0)}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Pending Files</p>
          <p
            className={[
              'mt-1 text-2xl font-semibold',
              (stats?.pendingFiles ?? 0) > 0
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-ds-text dark:text-white',
            ].join(' ')}
          >
            {dashboardQuery.isLoading ? '—' : (stats?.pendingFiles ?? 0)}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Last Access</p>
          <p className={`mt-1 text-sm font-semibold leading-snug text-ds-text dark:text-white`}>
            {dashboardQuery.isLoading ? '—' : formatDateTime(stats?.lastAccessAt)}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-ds-border dark:border-slate-700">
        <TabButton id="tab-patients" label="My Patients" active={activeTab === 'patients'} onClick={() => setActiveTab('patients')} />
        <TabButton id="tab-ehr" label="EHR Records" active={activeTab === 'ehr'} onClick={() => setActiveTab('ehr')} />
        <TabButton id="tab-files" label="Medical Files" active={activeTab === 'files'} onClick={() => setActiveTab('files')} />
        <TabButton id="tab-bg" label="Break-glass Access" active={activeTab === 'breakglass'} onClick={() => setActiveTab('breakglass')} />
        <TabButton id="tab-access" label="My Access Log" active={activeTab === 'accesslog'} onClick={() => setActiveTab('accesslog')} />
      </div>

      {activeTab === 'patients' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>My Patients</h2>

          {dashboardQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading…</span>
            </div>
          ) : null}

          {!dashboardQuery.isLoading && patients.length === 0 ? (
            <div className="rounded-ds-card border border-ds-border/70 bg-ds-surface-muted/40 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-sm font-medium text-ds-text dark:text-slate-200">No patients assigned yet.</p>
              <p className={`${appMutedText} mt-2 text-sm`}>Contact an administrator to be assigned patients.</p>
            </div>
          ) : null}

          {!dashboardQuery.isLoading && patients.length > 0 ? (
            <div className="mt-2 overflow-x-auto">
              <div className="min-w-[560px]">
                <div className={`${DOCTOR_PATIENT_TABLE_HEAD} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                  <div className={appDataLabel}>Patient</div>
                  <div className={appDataLabel}>MRN</div>
                  <div className={appDataLabel}>Last visit</div>
                  <div className={`${appDataLabel} text-right`}>Actions</div>
                </div>
                <div className="divide-y divide-ds-border/60 dark:divide-slate-700/60">
                  {patientsPageRows.map((p) => (
                    <div key={p.patientId} className={`${DOCTOR_PATIENT_TABLE_HEAD} py-3`}>
                      <div>
                        <div className={appDataValue}>{p.displayName}</div>
                        <div className={`${appMutedText} truncate text-xs`}>{p.email ?? '—'}</div>
                      </div>
                      <div className={appDataValue}>{p.mrn ?? '—'}</div>
                      <div className={appDataValue}>{formatDateOnly(p.latestEhr?.updatedAt)}</div>
                      <div className="flex flex-wrap justify-end gap-1">
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-0 !max-h-7 !rounded-md !border !px-2 !py-0 !text-xs !font-medium !leading-none !shadow-none !gap-0"
                          disabled={!p.latestEhr?.id}
                          onClick={() => goToEhrForPatient(p.patientId)}
                        >
                          View EHR
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-0 !max-h-7 !rounded-md !border !px-2 !py-0 !text-xs !font-medium !leading-none !shadow-none !gap-0"
                          disabled={!p.latestEhr?.id}
                          onClick={() => goToFilesForPatient(p.patientId)}
                        >
                          View Files
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex items-center justify-end gap-2">
                  <span className={`${appMutedText} text-xs`}>
                    Page {patientsPageSafe} of {patientsTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={patientsPageSafe <= 1}
                    onClick={() =>
                      setPatientsPage((p) => {
                        const tp = Math.max(1, Math.ceil(patients.length / PATIENTS_PAGE_SIZE));
                        return Math.min(tp, Math.max(1, p - 1));
                      })
                    }
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={patientsPageSafe >= patientsTotalPages}
                    onClick={() =>
                      setPatientsPage((p) => {
                        const tp = Math.max(1, Math.ceil(patients.length / PATIENTS_PAGE_SIZE));
                        return Math.min(tp, Math.max(1, p + 1));
                      })
                    }
                  >
                    Next
                  </Button>
                </div>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'ehr' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>EHR Records</h2>
          <p className={`${appMutedText} mt-1 mb-4 text-sm`}>Select a patient to view or update their chart.</p>

          <label className="mb-4 flex max-w-md flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
            Patient
            <select
              className={authInput}
              value={chartPatientId}
              onChange={(e) => {
                const v = e.target.value;
                setChartPatientId(v);
                setEhrEditMode(false);
                setEhrSaveNotice({ variant: '', message: '' });
              }}
            >
              <option value="">— Select patient —</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.displayName} ({p.mrn})
                </option>
              ))}
            </select>
          </label>

          {!chartPatientId ? (
            <p className={`${appMutedText} rounded-ds-card border border-ds-border/60 bg-ds-surface-muted/30 p-6 text-sm dark:border-slate-700`}>
              Select a patient to view their record.
            </p>
          ) : null}

          {chartPatientId && !selectedEhrId ? (
            <Alert variant="info" className="mt-2">
              No EHR record exists for this patient yet. An administrator or you (via API) can create one before
              editing.
            </Alert>
          ) : null}

          {chartPatientId && selectedEhrId ? (
            <div className="mt-4 space-y-4">
              {ehrQuery.isLoading ? (
                <div className="flex items-center gap-2">
                  <Spinner size="sm" />
                  <span className={appMutedText}>Loading record…</span>
                </div>
              ) : null}
              {ehrQuery.isError ? (
                <Alert variant="error">
                  {ehrQuery.error?.response?.data?.error || ehrQuery.error?.message || 'Failed to load EHR'}
                </Alert>
              ) : null}

              {ehrRecord ? (
                <>
                  <div className="rounded-ds-input border border-ds-border/70 bg-ds-surface-muted/20 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/30">
                    <span className="font-semibold text-ds-text dark:text-white">{selectedPatient?.displayName}</span>
                    <span className="text-ds-text-muted"> · </span>
                    <span className="text-ds-text dark:text-slate-200">MRN {selectedPatient?.mrn ?? '—'}</span>
                    <span className="text-ds-text-muted"> · </span>
                    <span className={appMutedText}>
                      Assigned since {formatDateTime(selectedPatient?.assignedSince)}
                    </span>
                  </div>

                  <Card variant="solid" padding="p-5" className="border border-ds-border/60 dark:border-slate-700">
                    <div className="space-y-3 text-sm">
                      {ehrEditMode ? (
                        <label className="flex flex-col gap-1 font-medium text-ds-text dark:text-slate-200">
                          Diagnosis
                          <textarea
                            className={`${authInput} min-h-[5rem] resize-y`}
                            value={editDiagnosis}
                            onChange={(e) => setEditDiagnosis(e.target.value)}
                          />
                        </label>
                      ) : (
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                          <span className={appDataLabel}>Diagnosis</span>
                          <span className={`${appDataValue} sm:flex-1`}>{ehrRecord.diagnosis ?? '—'}</span>
                        </div>
                      )}

                      <div>
                        <div className={appDataLabel}>Vitals</div>
                        {ehrEditMode ? (
                          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <label className="flex flex-col gap-1 text-xs text-ds-text-muted dark:text-slate-400">
                              Systolic
                              <input
                                className={authInput}
                                inputMode="numeric"
                                value={editVitals.systolic}
                                onChange={(e) => setEditVitals((s) => ({ ...s, systolic: e.target.value }))}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ds-text-muted dark:text-slate-400">
                              Diastolic
                              <input
                                className={authInput}
                                inputMode="numeric"
                                value={editVitals.diastolic}
                                onChange={(e) => setEditVitals((s) => ({ ...s, diastolic: e.target.value }))}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ds-text-muted dark:text-slate-400">
                              Heart rate (bpm)
                              <input
                                className={authInput}
                                inputMode="numeric"
                                value={editVitals.heartRate}
                                onChange={(e) => setEditVitals((s) => ({ ...s, heartRate: e.target.value }))}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ds-text-muted dark:text-slate-400">
                              Temperature (°F)
                              <input
                                className={authInput}
                                inputMode="decimal"
                                value={editVitals.temperature}
                                onChange={(e) => setEditVitals((s) => ({ ...s, temperature: e.target.value }))}
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs text-ds-text-muted dark:text-slate-400">
                              O₂ saturation (%)
                              <input
                                className={authInput}
                                inputMode="numeric"
                                value={editVitals.o2}
                                onChange={(e) => setEditVitals((s) => ({ ...s, o2: e.target.value }))}
                              />
                            </label>
                          </div>
                        ) : (
                          <ul className={`${appMutedText} mt-2 list-inside list-disc space-y-1`}>
                            <li>
                              Blood Pressure:{' '}
                              {vDisplay.systolic != null && vDisplay.diastolic != null
                                ? `${vDisplay.systolic} / ${vDisplay.diastolic} mmHg`
                                : '—'}
                            </li>
                            <li>Heart Rate: {vDisplay.heartRate != null ? `${vDisplay.heartRate} bpm` : '—'}</li>
                            <li>Temperature: {vDisplay.temperature != null ? `${vDisplay.temperature} °F` : '—'}</li>
                            <li>O₂ Saturation: {vDisplay.o2 != null ? `${vDisplay.o2} %` : '—'}</li>
                          </ul>
                        )}
                      </div>

                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className={appDataLabel}>Last Updated</span>
                        <span className={appDataValue}>{formatDateTime(ehrRecord.updatedAt)}</span>
                      </div>
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
                        <span className={appDataLabel}>Attending</span>
                        <span className={appDataValue}>Dr. {ehrRecord.doctor?.email ?? user?.email ?? '—'}</span>
                      </div>
                    </div>

                    <p className={`${appMutedText} mt-4 font-mono text-xs`}>EHR ID: {ehrRecord.id}</p>

                    {ehrSaveNotice.message ? (
                      <Alert variant={ehrSaveNotice.variant || 'info'} className="mt-4">
                        {ehrSaveNotice.message}
                      </Alert>
                    ) : null}

                    <div className="mt-4 flex flex-wrap gap-2">
                      {!ehrEditMode ? (
                        <Button type="button" variant="secondary" onClick={beginEhrEdit}>
                          Edit Record
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            variant="primary"
                            loading={updateEhrMutation.isPending}
                            onClick={handleSaveEhr}
                          >
                            Save Changes
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={updateEhrMutation.isPending}
                            onClick={() => {
                              setEhrEditMode(false);
                              setEhrSaveNotice({ variant: '', message: '' });
                              ehrQuery.refetch();
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </Card>
                </>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'files' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Medical Files</h2>
          <p className={`${appMutedText} mt-1 mb-1 text-sm`}>
            Files are stored in Supabase Storage (private bucket; short-lived signed URLs for download).
          </p>
          {!filesStorageAvailable ? (
            <Alert variant="error" className="mb-4">
              Supabase Storage is not configured on the server. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to
              enable uploads and signed URLs (bucket defaults to 272 unless SUPABASE_STORAGE_BUCKET is set).
            </Alert>
          ) : null}

          <label className="mb-4 flex max-w-md flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
            Patient
            <select
              className={authInput}
              value={chartPatientId}
              onChange={(e) => {
                const v = e.target.value;
                setChartPatientId(v);
                setFilesNotice({ variant: '', message: '' });
              }}
            >
              <option value="">— Select patient —</option>
              {patients.map((p) => (
                <option key={p.patientId} value={p.patientId}>
                  {p.displayName} ({p.mrn})
                </option>
              ))}
            </select>
          </label>

          {!chartPatientId ? (
            <p className={`${appMutedText} rounded-ds-card border border-ds-border/60 bg-ds-surface-muted/30 p-6 text-sm dark:border-slate-700`}>
              Select a patient from My Patients to manage their files.
            </p>
          ) : null}

          {chartPatientId && !selectedEhrId ? (
            <Alert variant="info">This patient does not have an EHR record yet; files attach to an EHR record.</Alert>
          ) : null}

          {chartPatientId && selectedEhrId ? (
            <div className="mt-4 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-ds-text dark:text-white">Current files</h3>
                {ehrRecord?.s3FileKey ? (
                  <div className="mt-2 rounded-ds-input border border-ds-border/60 px-4 py-3 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className={appDataValue}>{filenameFromStoragePath(ehrRecord.s3FileKey)}</div>
                        <div className={`${appMutedText} text-xs`}>Uploaded (key last modified): {formatDateTime(ehrRecord.updatedAt)}</div>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-8 !min-h-0 !px-3 !py-0 !text-xs"
                        disabled={!filesStorageAvailable}
                        onClick={handleOpenFile}
                      >
                        View
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className={`${appMutedText} mt-2`}>No files uploaded for this patient yet.</p>
                )}
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ds-text dark:text-white">Upload new file</h3>
                <form className="mt-3 max-w-lg space-y-3" onSubmit={handleFilesUpload}>
                  <label className="text-sm font-medium text-ds-text dark:text-slate-200">Upload Medical Document</label>
                  <input
                    type="file"
                    className={authInput}
                    onChange={(e) => setFilesSelected(e.target.files?.[0] ?? null)}
                  />
                  <p className={appMutedText}>{filesSelected ? `Selected: ${filesSelected.name}` : 'No file selected'}</p>
                  <Button type="submit" variant="secondary" loading={uploadMutation.isPending} spinner="dark" disabled={!filesStorageAvailable}>
                    Upload
                  </Button>
                  {uploadMutation.isPending ? (
                    <div className="flex items-center gap-2 text-sm text-ds-text-muted">
                      <Spinner size="sm" />
                      Uploading…
                    </div>
                  ) : null}
                </form>
                {filesNotice.message ? (
                  <Alert variant={filesNotice.variant || 'info'} className="mt-3">
                    {filesNotice.message}
                  </Alert>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'breakglass' ? (
        <div className="space-y-6">
          <div className="rounded-ds-card border-2 border-amber-300/90 bg-amber-50/80 p-5 text-sm text-amber-950 dark:border-amber-700/80 dark:bg-amber-950/35 dark:text-amber-100">
            <p className="font-semibold">Break-glass access</p>
            <p className="mt-2 leading-relaxed">
              Break-glass access allows you to view records of patients not assigned to you in a genuine medical
              emergency. Every use of this feature is permanently logged and reviewed by administrators.
            </p>
            <p className="mt-3 text-xs leading-relaxed opacity-90">
              Your name, the patient accessed, timestamp, and IP address will be recorded in the security audit log.
            </p>
          </div>

          {bgNotice.message ? (
            <Alert variant={bgNotice.variant || 'info'}>{bgNotice.message}</Alert>
          ) : null}

          <section className={appPanelCard}>
            <h2 className={appSectionHeading}>Request emergency access</h2>
            <div className="mt-4 max-w-lg space-y-4">
              <label className="flex flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
                Patient ID or MRN
                <input
                  className={authInput}
                  value={bgPatientId}
                  onChange={(e) => setBgPatientId(e.target.value)}
                  placeholder="UUID or medical record number"
                />
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
                Reason
                <select className={authInput} value={bgReason} onChange={(e) => setBgReason(e.target.value)}>
                  {BREAK_GLASS_REASONS.map((o) => (
                    <option key={o.label} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
                Additional details (optional)
                <textarea
                  className={`${authInput} min-h-[4rem]`}
                  value={bgDetail}
                  onChange={(e) => setBgDetail(e.target.value)}
                  placeholder="Additional details (optional)"
                />
              </label>
              <button
                type="button"
                disabled={!bgFormValid || breakGlassMutation.isPending}
                onClick={() => {
                  setBgNotice({ variant: '', message: '' });
                  setBgModalOpen(true);
                }}
                className="w-full max-w-md rounded-ds-input border-2 border-red-600 bg-transparent px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-50 dark:border-red-500 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                Request Emergency Access
              </button>
            </div>
          </section>

          <section className={appPanelCard}>
            <h2 className={appSectionHeading}>Your recent emergency access events</h2>
            {breakGlassHistoryQuery.isLoading ? (
              <div className="mt-3 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading…</span>
              </div>
            ) : null}
            {!breakGlassHistoryQuery.isLoading && bgHistoryRows.length === 0 ? (
              <p className={`${appMutedText} mt-3`}>No emergency access events recorded.</p>
            ) : null}
            {!breakGlassHistoryQuery.isLoading && bgHistoryRows.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ds-border/70 dark:border-slate-600">
                      <th className={`${appDataLabel} py-2 pr-3`}>Patient</th>
                      <th className={`${appDataLabel} py-2 pr-3`}>Reason</th>
                      <th className={`${appDataLabel} py-2 pr-3`}>Timestamp</th>
                      <th className={`${appDataLabel} py-2`}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bgHistoryRows.map((row) => {
                      const det = row.details && typeof row.details === 'object' ? row.details : {};
                      return (
                        <tr key={row.id} className="border-b border-ds-border/40 dark:border-slate-800">
                          <td className={`${appDataValue} py-2 pr-3`}>{row.patientLabel}</td>
                          <td className={`${appDataValue} py-2 pr-3`}>{det.reason ?? '—'}</td>
                          <td className={`${appMutedText} py-2 pr-3`}>{formatDateTime(row.timestamp)}</td>
                          <td className="py-2">{decisionPill(row)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          {bgModalOpen ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
              role="presentation"
              onKeyDown={(e) => {
                if (e.key === 'Escape' && !breakGlassMutation.isPending) setBgModalOpen(false);
              }}
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default bg-transparent"
                aria-label="Close overlay"
                onClick={() => {
                  if (!breakGlassMutation.isPending) setBgModalOpen(false);
                }}
              />
              <Card variant="solid" padding="p-6" className="relative z-10 w-full max-w-md shadow-ds-card">
                <div className="flex items-start gap-3">
                  <div
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-red-600 text-lg font-bold text-red-600 dark:border-red-400 dark:text-red-400"
                    aria-hidden
                  >
                    !
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-ds-text dark:text-white">Confirm Emergency Access</h3>
                    <p className={`${appMutedText} mt-2 text-sm`}>
                      You are about to access records for patient{' '}
                      <span className="font-mono text-ds-text dark:text-slate-200">{String(bgPatientId).trim()}</span>.
                    </p>
                    <p className={`${appMutedText} mt-2 text-sm`}>
                      Reason: <span className="text-ds-text dark:text-slate-200">{bgReason}</span>
                    </p>
                    <p className={`${appMutedText} mt-2 text-sm`}>This action cannot be undone and will be logged.</p>
                  </div>
                </div>
                <div className="mt-6 flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={breakGlassMutation.isPending} onClick={() => setBgModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    className="!bg-gradient-to-br !from-red-600 !to-red-800 !shadow-none hover:!opacity-95"
                    loading={breakGlassMutation.isPending}
                    onClick={() => {
                      breakGlassMutation.mutate({
                        patientIdentifier: String(bgPatientId).trim(),
                        reason: bgReason,
                        reasonDetail: bgDetail.trim() || undefined,
                      });
                    }}
                  >
                    Confirm Emergency Access
                  </Button>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === 'accesslog' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>My Access Log</h2>
          <p className={`${appMutedText} mt-1 mb-4 text-sm`}>
            Your personal access log shows every EHR-related policy event recorded for your account. Administrators can
            see the full audit stream.
          </p>
          {accessLogQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading…</span>
            </div>
          ) : null}
          {accessLogQuery.isError ? (
            <Alert variant="error">
              {accessLogQuery.error?.response?.data?.error || accessLogQuery.error?.message || 'Failed to load log'}
            </Alert>
          ) : null}
          {!accessLogQuery.isLoading && !accessLogQuery.isError ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ds-border/70 dark:border-slate-600">
                    <th className={`${appDataLabel} py-2 pr-3`}>Timestamp</th>
                    <th className={`${appDataLabel} py-2 pr-3`}>Patient</th>
                    <th className={`${appDataLabel} py-2 pr-3`}>Action</th>
                    <th className={`${appDataLabel} py-2 pr-3`}>Decision</th>
                    <th className={`${appDataLabel} py-2`}>IP Address</th>
                  </tr>
                </thead>
                <tbody>
                  {(accessLogQuery.data?.logs ?? []).map((row) => (
                    <tr key={row.id} className="border-b border-ds-border/40 dark:border-slate-800">
                      <td className={`${appMutedText} py-2 pr-3 whitespace-nowrap`}>{formatDateTime(row.timestamp)}</td>
                      <td className={`${appDataValue} py-2 pr-3`}>{row.patientLabel}</td>
                      <td className={`${appDataValue} py-2 pr-3`}>{actionDisplay(row.action)}</td>
                      <td className="py-2 pr-3">{decisionPill(row)}</td>
                      <td className={`${appMutedText} py-2 font-mono text-xs`}>{row.ipAddress ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {(accessLogQuery.data?.logs ?? []).length === 0 ? (
                <p className={`${appMutedText} mt-3`}>No entries yet.</p>
              ) : null}

              <div className="mt-3 flex items-center justify-end gap-2 border-t border-ds-border/60 pt-3 dark:border-slate-800/80">
                <span className={`${appMutedText} text-xs`}>
                  Page {accessLogPageSafe} of {accessLogTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={accessLogPageSafe <= 1 || accessLogQuery.isLoading}
                  onClick={() =>
                    setAccessLogPage((p) => {
                      const total = accessLogQuery.data?.total ?? 0;
                      const tp = Math.max(1, Math.ceil(total / ACCESS_LOG_PAGE_SIZE));
                      return Math.min(tp, Math.max(1, p - 1));
                    })
                  }
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={accessLogPageSafe >= accessLogTotalPages || accessLogQuery.isLoading}
                  onClick={() =>
                    setAccessLogPage((p) => {
                      const total = accessLogQuery.data?.total ?? 0;
                      const tp = Math.max(1, Math.ceil(total / ACCESS_LOG_PAGE_SIZE));
                      return Math.min(tp, Math.max(1, p + 1));
                    })
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
