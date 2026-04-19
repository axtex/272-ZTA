import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { Alert, Badge, Button, Spinner } from '../ui/index.js';
import {
  appDataLabel,
  appDataValue,
  appDecisionAllow,
  appDecisionDeny,
  appMutedText,
  appPanelCard,
  appSectionHeading,
  authInput,
} from '../../design-system/patterns.js';
import {
  getNurseAccessLog,
  getNurseDashboardSummary,
  getNursePatients,
  getPatientEhr,
  updateEhrRecord,
} from '../../lib/api.js';
import { ToolbarSelectDropdown } from './ToolbarSelectDropdown.jsx';
import { toolbarDropdownTriggerClass } from './toolbarDropdownPrimitives.jsx';

const STAT_CARD =
  'rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60';

const PATIENT_TABLE_ROW =
  'grid grid-cols-[minmax(8rem,1.1fr)_minmax(5rem,0.55fr)_minmax(7rem,0.85fr)_minmax(7rem,0.75fr)_minmax(4rem,0.35fr)_minmax(9rem,0.95fr)] gap-x-3 items-center';

const VITALS_HISTORY_ROW =
  'grid grid-cols-[minmax(6.5rem,0.75fr)_repeat(5,minmax(4rem,0.55fr))] gap-x-2 items-center';

const MED_TABLE_ROW =
  'grid grid-cols-[minmax(7rem,1fr)_minmax(6.5rem,0.85fr)_minmax(7rem,0.9fr)_minmax(7rem,0.85fr)_minmax(5.5rem,0.55fr)_minmax(7rem,0.75fr)] gap-x-3 items-center';

const ACTIVITY_TABLE_ROW =
  'grid grid-cols-[minmax(5rem,0.55fr)_minmax(7rem,0.85fr)_minmax(7rem,0.85fr)_minmax(5rem,0.45fr)] gap-x-3 items-center';

/** Nurse vitals tab: tighter fields + smaller placeholder copy than `authInput` defaults. */
const NURSE_VITALS_INPUT = [
  authInput,
  '!px-2.5 !py-1.5 !text-sm !leading-snug',
  'placeholder:text-[11px] placeholder:leading-tight placeholder:text-ds-text-muted/90 dark:placeholder:text-slate-500',
].join(' ');

const NURSE_VITALS_FIELD_LABEL =
  'flex flex-col gap-1.5 text-xs font-medium leading-snug text-ds-text-muted dark:text-slate-400';

const PATIENTS_PAGE_SIZE = 8;
const RECORDS_PAGE_SIZE = 10;
const ACTIVITY_PAGE_SIZE = 10;

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

const patientClearBtnClass = [
  toolbarDropdownTriggerClass,
  'h-10 w-10 min-h-10 min-w-10 shrink-0 justify-center gap-0 p-0 text-ds-text-muted hover:text-ds-text dark:text-slate-500 dark:hover:text-slate-200',
].join(' ');

function PatientClearButton({ onClick }) {
  return (
    <button
      type="button"
      className={patientClearBtnClass}
      aria-label="Clear selected patient"
      title="Clear patient"
      onClick={onClick}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="size-[15px] opacity-90"
        aria-hidden
      >
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
    </button>
  );
}

function nursePatientFullName(p) {
  if (!p) return '—';
  const fn = typeof p.firstName === 'string' ? p.firstName.trim() : '';
  const ln = typeof p.lastName === 'string' ? p.lastName.trim() : '';
  const fromParts = [fn, ln].filter(Boolean).join(' ');
  if (fromParts) return fromParts;
  const dn = typeof p.displayName === 'string' ? p.displayName.trim() : '';
  if (dn) return dn;
  return typeof p.email === 'string' && p.email.trim() ? p.email.trim() : '—';
}

function formatDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

function formatTimeShort(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function vitalsStatus(lastAt) {
  if (!lastAt) return 'red';
  const t = new Date(lastAt).getTime();
  if (Number.isNaN(t)) return 'red';
  const hours = (Date.now() - t) / (1000 * 60 * 60);
  if (hours < 4) return 'green';
  if (hours < 12) return 'amber';
  return 'red';
}

function StatusDot({ status }) {
  const map = {
    green: 'bg-emerald-500 shadow-emerald-500/40',
    amber: 'bg-amber-500 shadow-amber-500/40',
    red: 'bg-red-500 shadow-red-500/40',
  };
  return (
    <span
      className={`inline-block size-2.5 shrink-0 rounded-full shadow ${map[status] || map.red}`}
      title={status === 'green' ? 'Updated < 4h' : status === 'amber' ? '4–12h ago' : '12h+ or none'}
      aria-hidden
    />
  );
}

function readVitals(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function formatBP(v) {
  const o = readVitals(v);
  if (o.bloodPressureSystolic != null && o.bloodPressureDiastolic != null) {
    return `${o.bloodPressureSystolic}/${o.bloodPressureDiastolic}`;
  }
  if (o.bp) return String(o.bp);
  return '—';
}

function formatNum(v, key, suffix = '') {
  const o = readVitals(v);
  if (o[key] == null || o[key] === '') return '—';
  return `${o[key]}${suffix}`;
}

function actionLabel(action) {
  if (action === 'WRITE_EHR') return 'Vitals updated';
  if (action === 'READ_EHR') return 'Record viewed';
  return String(action ?? '—').replace(/_/g, ' ');
}

function demoMedications(patientId) {
  if (!patientId) return [];
  const digits = parseInt(String(patientId).replace(/\D/g, '').slice(-2), 10) || 0;
  if (digits % 7 === 0) return [];
  const n = String(patientId).charCodeAt(0) % 2;
  const rows = [
    {
      id: 'm1',
      name: 'Lisinopril 10mg',
      prescribedBy: 'Dr. Sarah Chen',
      schedule: '08:00, 14:00, 20:00',
      initialStatus: n === 0 ? 'Overdue' : 'Pending',
    },
    {
      id: 'm2',
      name: 'Metformin 500mg',
      prescribedBy: 'Dr. Sarah Chen',
      schedule: '07:00, 19:00',
      initialStatus: 'Pending',
    },
  ];
  return rows;
}

function medStatusBadge(status) {
  const s = String(status ?? '');
  if (s === 'Administered') {
    return (
      <Badge
        variant="soft"
        className="!border !border-emerald-200/80 !bg-emerald-100 !text-emerald-800 dark:!border-emerald-900/50 dark:!bg-emerald-950/60 dark:!text-emerald-200"
      >
        Administered
      </Badge>
    );
  }
  if (s === 'Overdue') {
    return (
      <Badge
        variant="soft"
        className="!border !border-red-200/80 !bg-red-100 !text-red-800 dark:!border-red-900/50 dark:!bg-red-950/60 dark:!text-red-200"
      >
        Overdue
      </Badge>
    );
  }
  return (
    <Badge
      variant="soft"
      className="!border !border-amber-200/80 !bg-amber-100 !text-amber-900 dark:!border-amber-900/50 dark:!bg-amber-950/60 dark:!text-amber-200"
    >
      Pending
    </Badge>
  );
}

function mergeVitalsPayload(existing, form) {
  const base = readVitals(existing);
  const num = (x) => {
    if (x === '' || x == null) return undefined;
    const n = Number(x);
    return Number.isFinite(n) ? n : undefined;
  };
  const next = {
    ...base,
    bloodPressureSystolic: num(form.bloodPressureSystolic),
    bloodPressureDiastolic: num(form.bloodPressureDiastolic),
    heartRate: num(form.heartRate),
    temperatureF: num(form.temperatureF),
    o2Saturation: num(form.o2Saturation),
    respiratoryRate: num(form.respiratoryRate),
  };
  delete next.painScale;
  if (form.notes != null && String(form.notes).trim()) {
    next.notes = String(form.notes).trim();
  } else {
    delete next.notes;
  }
  Object.keys(next).forEach((k) => {
    if (next[k] === undefined) delete next[k];
  });
  return next;
}

function emptyVitalsForm() {
  return {
    bloodPressureSystolic: '',
    bloodPressureDiastolic: '',
    heartRate: '',
    temperatureF: '',
    o2Saturation: '',
    respiratoryRate: '',
    notes: '',
  };
}

function initialVitalsFormFromRecord() {
  return emptyVitalsForm();
}

function NurseVitalsFormPanel({ latestRecord, selectedPatient, selectedPatientId }) {
  const queryClient = useQueryClient();
  const latestVitals = readVitals(latestRecord?.vitals);
  const placeholders = useMemo(
    () => ({
      bloodPressureSystolic:
        latestVitals.bloodPressureSystolic != null ? String(latestVitals.bloodPressureSystolic) : '',
      bloodPressureDiastolic:
        latestVitals.bloodPressureDiastolic != null ? String(latestVitals.bloodPressureDiastolic) : '',
      heartRate: latestVitals.heartRate != null ? String(latestVitals.heartRate) : '',
      temperatureF: latestVitals.temperatureF != null ? String(latestVitals.temperatureF) : '',
      o2Saturation: latestVitals.o2Saturation != null ? String(latestVitals.o2Saturation) : '',
      respiratoryRate: latestVitals.respiratoryRate != null ? String(latestVitals.respiratoryRate) : '',
    }),
    [latestVitals],
  );

  const [vitalsForm, setVitalsForm] = useState(() => initialVitalsFormFromRecord());
  const [vitalsNotice, setVitalsNotice] = useState({ variant: '', message: '' });

  const vitalsMutation = useMutation({
    mutationFn: ({ ehrId, vitals }) => updateEhrRecord(ehrId, { vitals }),
    onSuccess: (record) => {
      const who = nursePatientFullName(selectedPatient);
      setVitalsNotice({
        variant: 'success',
        message: `Vitals recorded for ${who} at ${new Date().toLocaleString()}`,
      });
      setVitalsForm(initialVitalsFormFromRecord());
      queryClient.invalidateQueries({ queryKey: ['nurseDashboardSummary'] });
      queryClient.invalidateQueries({ queryKey: ['nursePatients'] });
      queryClient.invalidateQueries({ queryKey: ['nursePatientEhr', selectedPatientId] });
      queryClient.invalidateQueries({ queryKey: ['nurseAccessLog'] });
    },
    onError: (err) => {
      setVitalsNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to save vitals',
      });
    },
  });

  function handleRecordVitals(e) {
    e.preventDefault();
    setVitalsNotice({ variant: '', message: '' });
    if (!latestRecord?.id) {
      setVitalsNotice({
        variant: 'error',
        message: 'No EHR record exists for this patient. A doctor must create a record first.',
      });
      return;
    }
    const vitals = mergeVitalsPayload(latestRecord.vitals, vitalsForm);
    vitalsMutation.mutate({ ehrId: latestRecord.id, vitals });
  }

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-ds-text dark:text-white">Patient Details</h3>
        <div className="mt-2 rounded-ds-card border border-ds-border/70 bg-ds-surface-muted/40 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
          <span className="font-medium text-ds-text dark:text-slate-100">{nursePatientFullName(selectedPatient)}</span>
          <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
          <span className="font-mono text-xs text-ds-text dark:text-slate-200">{selectedPatient?.mrn ?? '—'}</span>
          <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
          <span className="text-ds-text dark:text-slate-200">{selectedPatient?.assignedDoctorName ?? 'Unassigned'}</span>
          <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
          <span className="font-medium text-ds-text-muted dark:text-slate-400">Diagnosis — Restricted</span>
        </div>
      </div>

      <form className="grid max-w-2xl grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-x-3 sm:gap-y-2.5" onSubmit={handleRecordVitals}>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          Blood Pressure Systolic (mmHg)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="decimal"
            value={vitalsForm.bloodPressureSystolic}
            onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureSystolic: e.target.value }))}
            placeholder={placeholders.bloodPressureSystolic || '145'}
          />
        </label>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          Blood Pressure Diastolic (mmHg)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="decimal"
            value={vitalsForm.bloodPressureDiastolic}
            onChange={(e) => setVitalsForm((f) => ({ ...f, bloodPressureDiastolic: e.target.value }))}
            placeholder={placeholders.bloodPressureDiastolic || '92'}
          />
        </label>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          Heart Rate (bpm)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="numeric"
            value={vitalsForm.heartRate}
            onChange={(e) => setVitalsForm((f) => ({ ...f, heartRate: e.target.value }))}
            placeholder={placeholders.heartRate || '88'}
          />
        </label>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          Temperature (°F)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="decimal"
            value={vitalsForm.temperatureF}
            onChange={(e) => setVitalsForm((f) => ({ ...f, temperatureF: e.target.value }))}
            placeholder={placeholders.temperatureF || '98.6'}
          />
        </label>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          O₂ Saturation (%)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="numeric"
            value={vitalsForm.o2Saturation}
            onChange={(e) => setVitalsForm((f) => ({ ...f, o2Saturation: e.target.value }))}
            placeholder={placeholders.o2Saturation || '97'}
          />
        </label>
        <label className={NURSE_VITALS_FIELD_LABEL}>
          Respiratory Rate (breaths/min)
          <input
            className={NURSE_VITALS_INPUT}
            inputMode="numeric"
            value={vitalsForm.respiratoryRate}
            onChange={(e) => setVitalsForm((f) => ({ ...f, respiratoryRate: e.target.value }))}
            placeholder={placeholders.respiratoryRate || '16'}
          />
        </label>
        <label className={`${NURSE_VITALS_FIELD_LABEL} sm:col-span-2`}>
          Notes
          <textarea
            className={`${NURSE_VITALS_INPUT} min-h-[76px]`}
            value={vitalsForm.notes}
            onChange={(e) => setVitalsForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>

        {vitalsNotice.message ? (
          <div className="sm:col-span-2">
            <Alert variant={vitalsNotice.variant || 'info'}>{vitalsNotice.message}</Alert>
          </div>
        ) : null}

        <div className="sm:col-span-2">
          <Button
            type="submit"
            variant="primary"
            loading={vitalsMutation.isPending}
            className="!h-7 !min-h-[1.75rem] !rounded-md !px-3 !py-0 !text-xs font-semibold w-fit"
          >
            Record Vitals
          </Button>
        </div>
      </form>
    </div>
  );
}

export default function NurseDashboard() {
  const [activeTab, setActiveTab] = useState('patients');
  const [vitalsPatientId, setVitalsPatientId] = useState('');
  const [recordsPatientId, setRecordsPatientId] = useState('');
  const [medsPatientId, setMedsPatientId] = useState('');
  const [patientsPage, setPatientsPage] = useState(1);
  const [recordsPage, setRecordsPage] = useState(1);
  const [activityPage, setActivityPage] = useState(1);
  const [medNotice, setMedNotice] = useState({ variant: '', message: '' });
  const [medAdministeredAt, setMedAdministeredAt] = useState({});

  const summaryQuery = useQuery({
    queryKey: ['nurseDashboardSummary'],
    queryFn: () => getNurseDashboardSummary(),
  });

  const patientsQuery = useQuery({
    queryKey: ['nursePatients'],
    queryFn: () => getNursePatients(),
  });

  const patients = useMemo(() => {
    const raw = patientsQuery.data?.patients;
    return Array.isArray(raw) ? raw : [];
  }, [patientsQuery.data]);

  const ehrPatientId = useMemo(() => {
    if (activeTab === 'vitals') return vitalsPatientId;
    if (activeTab === 'records') return recordsPatientId;
    if (activeTab === 'meds') return medsPatientId;
    return '';
  }, [activeTab, vitalsPatientId, recordsPatientId, medsPatientId]);

  const ehrQuery = useQuery({
    queryKey: ['nursePatientEhr', ehrPatientId],
    queryFn: () => getPatientEhr(ehrPatientId),
    enabled: Boolean(ehrPatientId),
  });

  const records = useMemo(() => {
    const data = ehrQuery.data;
    return Array.isArray(data) ? data : [];
  }, [ehrQuery.data]);

  const latestRecord = records[0] || null;

  const activitySkip = (Math.max(1, activityPage) - 1) * ACTIVITY_PAGE_SIZE;
  const activityQuery = useQuery({
    queryKey: ['nurseAccessLog', activityPage],
    queryFn: () => getNurseAccessLog({ take: ACTIVITY_PAGE_SIZE, skip: activitySkip }),
    enabled: activeTab === 'activity',
  });

  const activityLogs = useMemo(() => {
    const raw = activityQuery.data?.logs;
    return Array.isArray(raw) ? raw : [];
  }, [activityQuery.data]);
  const activityTotal = activityQuery.data?.total ?? 0;
  const activityTotalPages = Math.max(1, Math.ceil(activityTotal / ACTIVITY_PAGE_SIZE));

  const selectedPatient = useMemo(
    () => patients.find((p) => p.patientId === ehrPatientId) || null,
    [patients, ehrPatientId],
  );

  const patientSelectOptions = useMemo(() => {
    return patients.map((p) => {
      const full = nursePatientFullName(p);
      const name = full === '—' ? 'Patient' : full;
      const mrn = p.mrn != null && String(p.mrn).trim() ? String(p.mrn).trim() : '—';
      return {
        value: p.patientId,
        label: `${name} (${mrn})`,
      };
    });
  }, [patients]);

  const patientsTotalPages = Math.max(1, Math.ceil(patients.length / PATIENTS_PAGE_SIZE));
  const patientsPageSafe = Math.min(Math.max(1, patientsPage), patientsTotalPages);
  const patientsSlice = useMemo(() => {
    const start = (patientsPageSafe - 1) * PATIENTS_PAGE_SIZE;
    return patients.slice(start, start + PATIENTS_PAGE_SIZE);
  }, [patients, patientsPageSafe]);

  const recordsTotalPages = Math.max(1, Math.ceil(records.length / RECORDS_PAGE_SIZE));
  const recordsPageSafe = Math.min(Math.max(1, recordsPage), recordsTotalPages);
  const recordsSlice = useMemo(() => {
    const start = (recordsPageSafe - 1) * RECORDS_PAGE_SIZE;
    return records.slice(start, start + RECORDS_PAGE_SIZE);
  }, [records, recordsPageSafe]);

  const handleTabChange = useCallback(
    (next) => {
      if (next !== activeTab) {
        setVitalsPatientId('');
        setRecordsPatientId('');
        setMedsPatientId('');
        setRecordsPage(1);
      }
      setActiveTab(next);
    },
    [activeTab],
  );

  const goVitalsForPatient = useCallback((patientId) => {
    setRecordsPatientId('');
    setMedsPatientId('');
    setVitalsPatientId(patientId);
    setRecordsPage(1);
    setActiveTab('vitals');
  }, []);

  const goRecordsForPatient = useCallback((patientId) => {
    setVitalsPatientId('');
    setMedsPatientId('');
    setRecordsPatientId(patientId);
    setRecordsPage(1);
    setActiveTab('records');
  }, []);

  const sm = summaryQuery.data ?? {};

  return (
    <div>
      {summaryQuery.isError ? (
        <Alert variant="error" className="mb-4">
          {summaryQuery.error?.response?.data?.error ||
            summaryQuery.error?.message ||
            'Failed to load dashboard metrics.'}
        </Alert>
      ) : null}

      <div className="mb-2">
        <h2 className={appSectionHeading}>System Overview</h2>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className={STAT_CARD}>
          <p className={appDataLabel}>My Patients</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : (sm.myPatients ?? '—')}
          </p>
        </div>
        <div className={STAT_CARD}>
          <p className={appDataLabel}>Vitals Updated</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : (sm.vitalsUpdatedToday ?? '—')}
          </p>
        </div>
        <div className={STAT_CARD}>
          <p className={appDataLabel}>Pending Vitals</p>
          <p
            className={[
              'mt-1 text-2xl font-semibold',
              (sm.pendingVitals ?? 0) > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ds-text dark:text-white',
            ].join(' ')}
          >
            {summaryQuery.isLoading ? '—' : (sm.pendingVitals ?? '—')}
          </p>
        </div>
        <div className={STAT_CARD}>
          <p className={appDataLabel}>Last Activity</p>
          <p className="mt-1 text-sm font-semibold leading-snug text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : formatDateTime(sm.lastActivityAt)}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-ds-border dark:border-slate-700">
        <TabButton
          id="nurse-tab-patients"
          label="My Patients"
          active={activeTab === 'patients'}
          onClick={() => handleTabChange('patients')}
        />
        <TabButton
          id="nurse-tab-vitals"
          label="Update Vitals"
          active={activeTab === 'vitals'}
          onClick={() => handleTabChange('vitals')}
        />
        <TabButton
          id="nurse-tab-records"
          label="Patient Records"
          active={activeTab === 'records'}
          onClick={() => handleTabChange('records')}
        />
        <TabButton
          id="nurse-tab-meds"
          label="Medication Administration"
          active={activeTab === 'meds'}
          onClick={() => handleTabChange('meds')}
        />
        <TabButton
          id="nurse-tab-activity"
          label="My Activity Log"
          active={activeTab === 'activity'}
          onClick={() => handleTabChange('activity')}
        />
      </div>

      {activeTab === 'patients' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>My Patients</h2>

          {patientsQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading patients…</span>
            </div>
          ) : null}

          {patientsQuery.isError ? (
            <Alert variant="error" className="mt-4">
              {patientsQuery.error?.response?.data?.error || patientsQuery.error?.message || 'Failed to load patients.'}
            </Alert>
          ) : null}

          {!patientsQuery.isLoading && !patientsQuery.isError && patients.length === 0 ? (
            <p className={`${appMutedText} mt-4`}>No patients found.</p>
          ) : null}

          {!patientsQuery.isLoading && !patientsQuery.isError && patients.length > 0 ? (
            <div className="mt-4">
              <p className={`${appMutedText} mb-3 text-sm`}>
                Showing {patientsSlice.length} of {patients.length} patient{patients.length === 1 ? '' : 's'}
              </p>
              <div className="overflow-x-auto">
                <div className="min-w-[920px]">
                  <div className={`${PATIENT_TABLE_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                    <div className={appDataLabel}>Patient</div>
                    <div className={appDataLabel}>MRN</div>
                    <div className={appDataLabel}>Assigned Doctor</div>
                    <div className={appDataLabel}>Last vitals</div>
                    <div className={`${appDataLabel} text-center`}>Status</div>
                    <div className={`${appDataLabel} text-right`}>Actions</div>
                  </div>
                  <div className="max-h-[520px] divide-y divide-ds-border/60 overflow-y-auto pr-1 dark:divide-slate-700/60">
                    {patientsSlice.map((p) => {
                      const st = vitalsStatus(p.lastVitalsAt);
                      const label = p.displayName || p.email || p.patientId;
                      return (
                        <div key={p.patientId} className={`${PATIENT_TABLE_ROW} py-3`}>
                          <div className="min-w-0">
                            <div className={`${appDataValue} truncate font-medium`}>{label}</div>
                            {p.displayName && p.email ? (
                              <div className={`${appMutedText} truncate text-xs`}>{p.email}</div>
                            ) : null}
                          </div>
                          <div className={`${appDataValue} font-mono text-xs`}>{p.mrn ?? '—'}</div>
                          <div className={`${appDataValue} text-sm`}>{p.assignedDoctorName ?? 'Unassigned'}</div>
                          <div className={`${appDataValue} text-xs`}>{formatDateTime(p.lastVitalsAt)}</div>
                          <div className="flex justify-center">
                            <StatusDot status={st} />
                          </div>
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              className="!h-7 !min-h-0 !rounded-md !px-1.5 !py-0 !text-xs !leading-tight"
                              onClick={() => goVitalsForPatient(p.patientId)}
                            >
                              View Vitals
                            </Button>
                            <Button
                              type="button"
                              variant="secondary"
                              className="!h-7 !min-h-0 !rounded-md !px-1.5 !py-0 !text-xs !leading-tight"
                              onClick={() => goRecordsForPatient(p.patientId)}
                            >
                              View Record
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {patientsTotalPages > 1 ? (
                <div className="mt-3 flex items-center justify-end gap-2">
                  <span className={`${appMutedText} text-xs`}>
                    Page {patientsPageSafe} of {patientsTotalPages}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={patientsPageSafe <= 1}
                    onClick={() => setPatientsPage((x) => Math.max(1, x - 1))}
                  >
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                    disabled={patientsPageSafe >= patientsTotalPages}
                    onClick={() => setPatientsPage((x) => Math.min(patientsTotalPages, x + 1))}
                  >
                    Next
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'vitals' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Update Vitals</h2>

          <div className="mt-4 flex min-w-0 max-w-xl flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
            <span>Patient</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <ToolbarSelectDropdown
                  value={vitalsPatientId}
                  onChange={(v) => {
                    setVitalsPatientId(v);
                    setRecordsPage(1);
                  }}
                  options={patientSelectOptions}
                  ariaLabel="Select patient for vitals"
                  listAriaLabel="Patients"
                  placeholderLabel="Select a patient…"
                  className="w-full min-w-0"
                  triggerMinWidthClass="w-full min-w-0"
                />
              </div>
              {vitalsPatientId ? (
                <PatientClearButton
                  onClick={() => {
                    setVitalsPatientId('');
                    setRecordsPage(1);
                  }}
                />
              ) : null}
            </div>
          </div>

          {vitalsPatientId ? (
            ehrQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading EHR…</span>
              </div>
            ) : ehrQuery.isError ? (
              <Alert variant="error" className="mt-4">
                {ehrQuery.error?.response?.data?.error || ehrQuery.error?.message || 'Failed to load records.'}
              </Alert>
            ) : (
              <NurseVitalsFormPanel
                key={`${vitalsPatientId}-${latestRecord?.id ?? 'none'}-${String(latestRecord?.updatedAt ?? '')}`}
                latestRecord={latestRecord}
                selectedPatient={selectedPatient}
                selectedPatientId={vitalsPatientId}
              />
            )
          ) : null}
        </section>
      ) : null}

      {activeTab === 'records' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Patient Records</h2>

          <div className="mt-4 flex min-w-0 max-w-xl flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
            <span>Patient</span>
            <div className="flex min-w-0 items-center gap-1.5">
              <div className="min-w-0 flex-1">
                <ToolbarSelectDropdown
                  value={recordsPatientId}
                  onChange={(v) => {
                    setRecordsPatientId(v);
                    setRecordsPage(1);
                  }}
                  options={patientSelectOptions}
                  ariaLabel="Select patient for records"
                  listAriaLabel="Patients"
                  placeholderLabel="Select a patient…"
                  className="w-full min-w-0"
                  triggerMinWidthClass="w-full min-w-0"
                />
              </div>
              {recordsPatientId ? (
                <PatientClearButton
                  onClick={() => {
                    setRecordsPatientId('');
                    setRecordsPage(1);
                  }}
                />
              ) : null}
            </div>
          </div>

          {recordsPatientId ? (
            ehrQuery.isLoading ? (
              <div className="mt-4 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading records…</span>
              </div>
            ) : ehrQuery.isError ? (
              <Alert variant="error" className="mt-4">
                {ehrQuery.error?.response?.data?.error || ehrQuery.error?.message || 'Failed to load records.'}
              </Alert>
            ) : (
              <div className="mt-6 space-y-6">
              <div>
                <h3 className="text-sm font-semibold text-ds-text dark:text-white">Patient Details</h3>
                <div className="mt-2 rounded-ds-card border border-ds-border/70 bg-ds-surface-muted/40 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900/50">
                  <span className="font-medium text-ds-text dark:text-slate-100">{nursePatientFullName(selectedPatient)}</span>
                  <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
                  <span className="font-mono text-xs text-ds-text dark:text-slate-200">{selectedPatient?.mrn ?? '—'}</span>
                  <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
                  <span className="text-ds-text dark:text-slate-200">{selectedPatient?.assignedDoctorName ?? 'Unassigned'}</span>
                  <span className="mx-2 text-ds-text-muted dark:text-slate-500">|</span>
                  <span className="font-medium text-ds-text-muted dark:text-slate-400">Diagnosis — Restricted</span>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-ds-text dark:text-white">Vitals history</h3>
                {records.length === 0 ? (
                  <p className={`${appMutedText} mt-2`}>No vitals history for this patient yet.</p>
                ) : (
                  <>
                    <div className="mt-3 overflow-x-auto">
                      <div className="min-w-[760px]">
                        <div className={`${VITALS_HISTORY_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                          <div className={appDataLabel}>Date / time</div>
                          <div className={appDataLabel}>BP</div>
                          <div className={appDataLabel}>HR</div>
                          <div className={appDataLabel}>Temp °F</div>
                          <div className={appDataLabel}>O₂</div>
                          <div className={appDataLabel}>RR</div>
                        </div>
                        <div className="divide-y divide-ds-border/60 dark:divide-slate-700/60">
                          {recordsSlice.map((r) => (
                            <div key={r.id} className={`${VITALS_HISTORY_ROW} py-2.5`}>
                              <div className={`${appDataValue} text-xs`}>{formatDateTime(r.updatedAt)}</div>
                              <div className={appDataValue}>{formatBP(r.vitals)}</div>
                              <div className={appDataValue}>{formatNum(r.vitals, 'heartRate')}</div>
                              <div className={appDataValue}>{formatNum(r.vitals, 'temperatureF')}</div>
                              <div className={appDataValue}>{formatNum(r.vitals, 'o2Saturation')}</div>
                              <div className={appDataValue}>{formatNum(r.vitals, 'respiratoryRate')}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    {recordsTotalPages > 1 ? (
                      <div className="mt-3 flex items-center justify-end gap-2">
                        <span className={`${appMutedText} text-xs`}>
                          Page {recordsPageSafe} of {recordsTotalPages}
                        </span>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                          disabled={recordsPageSafe <= 1}
                          onClick={() => setRecordsPage((x) => Math.max(1, x - 1))}
                        >
                          Prev
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                          disabled={recordsPageSafe >= recordsTotalPages}
                          onClick={() => setRecordsPage((x) => Math.min(recordsTotalPages, x + 1))}
                        >
                          Next
                        </Button>
                      </div>
                    ) : null}
                  </>
                )}
              </div>
            </div>
            )
          ) : null}
        </section>
      ) : null}

      {activeTab === 'meds' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Medication Administration</h2>

          <label className="mt-4 flex min-w-0 max-w-xl flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
            Patient
            <ToolbarSelectDropdown
              value={medsPatientId}
              onChange={(v) => {
                setMedsPatientId(v);
              }}
              options={patientSelectOptions}
              ariaLabel="Select patient for medications"
              listAriaLabel="Patients"
              placeholderLabel="Select a patient…"
              className="w-full min-w-0"
              triggerMinWidthClass="w-full min-w-0"
            />
          </label>

          {medNotice.message ? (
            <Alert variant={medNotice.variant || 'info'} className="mt-4">
              {medNotice.message}
            </Alert>
          ) : null}

          {medsPatientId ? (
            <div className="mt-6">
              {(() => {
                const meds = demoMedications(medsPatientId);
                if (!meds.length) {
                  return <p className={appMutedText}>No medications currently prescribed for this patient.</p>;
                }
                return (
                  <div className="overflow-x-auto">
                    <div className="min-w-[960px]">
                      <div className={`${MED_TABLE_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                        <div className={appDataLabel}>Medication</div>
                        <div className={appDataLabel}>Prescribed By</div>
                        <div className={appDataLabel}>Schedule</div>
                        <div className={appDataLabel}>Last Administered</div>
                        <div className={appDataLabel}>Status</div>
                        <div className={`${appDataLabel} text-right`}>Action</div>
                      </div>
                      <div className="divide-y divide-ds-border/60 dark:divide-slate-700/60">
                        {meds.map((m) => {
                          const key = `${medsPatientId}-${m.id}`;
                          const administeredAt = medAdministeredAt[key];
                          const status = administeredAt ? 'Administered' : m.initialStatus;
                          const lastText = administeredAt ? formatDateTime(administeredAt) : 'Not yet today';
                          return (
                            <div key={m.id} className={`${MED_TABLE_ROW} py-3`}>
                              <div className={`${appDataValue} font-medium`}>{m.name}</div>
                              <div className={appDataValue}>{m.prescribedBy}</div>
                              <div className={`${appDataValue} text-sm`}>{m.schedule}</div>
                              <div className={`${appDataValue} text-xs`}>{lastText}</div>
                              <div>{medStatusBadge(status)}</div>
                              <div className="flex justify-end">
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="!h-7 !min-h-0 !rounded-md !px-1.5 !py-0 !text-xs !leading-tight"
                                  disabled={Boolean(administeredAt)}
                                  onClick={() => {
                                    const ts = new Date().toISOString();
                                    setMedAdministeredAt((prev) => ({ ...prev, [key]: ts }));
                                    setMedNotice({ variant: 'success', message: 'Medication recorded' });
                                  }}
                                >
                                  Mark Administered
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : null}
        </section>
      ) : null}

      {activeTab === 'activity' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>My Activity Log</h2>
          <p className={`${appMutedText} mt-2 max-w-3xl text-sm leading-relaxed`}>
            Your activity log shows every patient record you have accessed or updated during your shift.
          </p>

          {activityQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading activity…</span>
            </div>
          ) : null}

          {activityQuery.isError ? (
            <Alert variant="error" className="mt-4">
              {activityQuery.error?.response?.data?.error || activityQuery.error?.message || 'Failed to load activity.'}
            </Alert>
          ) : null}

          {!activityQuery.isLoading && !activityQuery.isError ? (
            <div className="mt-4">
              {activityLogs.length === 0 ? (
                <p className={appMutedText}>No activity recorded yet.</p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <div className="min-w-[640px]">
                      <div className={`${ACTIVITY_TABLE_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                        <div className={appDataLabel}>Time</div>
                        <div className={appDataLabel}>Patient</div>
                        <div className={appDataLabel}>Action</div>
                        <div className={`${appDataLabel} text-center`}>Decision</div>
                      </div>
                      <div className="divide-y divide-ds-border/60 dark:divide-slate-700/60">
                        {activityLogs.map((row) => (
                          <div key={row.id} className={`${ACTIVITY_TABLE_ROW} py-2.5`}>
                            <div className={`${appDataValue} text-xs`}>{formatTimeShort(row.timestamp)}</div>
                            <div className={`${appDataValue} truncate text-sm`}>{row.patientLabel ?? '—'}</div>
                            <div className={appDataValue}>{actionLabel(row.action)}</div>
                            <div className="flex justify-center">
                              {row.decision === 'ALLOW' ? (
                                <span className={appDecisionAllow}>ALLOW</span>
                              ) : row.decision === 'DENY' ? (
                                <span className={appDecisionDeny}>DENY</span>
                              ) : (
                                <Badge variant="soft">{row.decision ?? '—'}</Badge>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {activityTotalPages > 1 ? (
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <span className={`${appMutedText} text-xs`}>
                        Page {activityPage} of {activityTotalPages}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                        disabled={activityPage <= 1}
                        onClick={() => setActivityPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                        disabled={activityPage >= activityTotalPages}
                        onClick={() => setActivityPage((p) => Math.min(activityTotalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
