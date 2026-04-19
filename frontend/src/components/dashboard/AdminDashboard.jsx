import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Alert, Badge, Button, Card, Spinner } from '../ui/index.js';
import {
  appDataLabel,
  appDataRow,
  appDataValue,
  appDecisionAllow,
  appDecisionDeny,
  appDecisionStepUp,
  appMutedText,
  appOutlineLink,
  appPanelCard,
  appSectionHeading,
  authInput,
} from '../../design-system/patterns.js';
import {
  assignDoctor,
  createUser,
  getAdminDashboardSummary,
  getAuditLogs,
  getUsers,
  unassignDoctor,
  unlockUser,
  updateUser,
} from '../../lib/api.js';

/** Compact selects aligned with panel inputs (role filter, row actions). */
const panelSelect = `${authInput} py-2 pr-9 text-sm leading-snug text-ds-text dark:text-slate-100`;

function statusBadge(status) {
  const s = String(status ?? '').toUpperCase();
  /* `Badge` variant `soft` defaults to violet; use `!` so status colors win. */
  if (s === 'ACTIVE') {
    return (
      <Badge
        variant="soft"
        className="!border !border-emerald-200/80 !bg-emerald-100 !text-emerald-800 dark:!border-emerald-900/50 dark:!bg-emerald-950/60 dark:!text-emerald-200"
      >
        ACTIVE
      </Badge>
    );
  }
  if (s === 'SUSPENDED') {
    return (
      <Badge
        variant="soft"
        className="!border !border-red-200/80 !bg-red-100 !text-red-800 dark:!border-red-900/50 dark:!bg-red-950/60 dark:!text-red-200"
      >
        Locked
      </Badge>
    );
  }
  /* Schema `DISABLED` is shown as INACTIVE in the UI (admin PATCH uses INACTIVE). */
  return (
    <Badge
      variant="soft"
      className="!border !border-slate-200/90 !bg-slate-100 !text-slate-700 dark:!border-slate-600 dark:!bg-slate-800 dark:!text-slate-300"
    >
      INACTIVE
    </Badge>
  );
}

const actionMenuItem =
  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs font-medium text-ds-text transition hover:bg-slate-100 disabled:pointer-events-none disabled:opacity-50 dark:text-slate-100 dark:hover:bg-slate-800';
const actionMenuItemDanger = `${actionMenuItem} text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40`;
const actionMenuItemSuccess = `${actionMenuItem} text-emerald-800 hover:bg-emerald-50 dark:text-emerald-200 dark:hover:bg-emerald-950/35`;

/** Shared with User Management role filter + per-row Actions menus. */
const toolbarDropdownTriggerClass =
  'inline-flex items-center gap-1 rounded-lg border border-ds-border bg-ds-surface px-2.5 py-1 text-xs font-semibold text-ds-text shadow-sm transition hover:border-ds-border-strong hover:bg-ds-surface-muted focus-visible:outline focus-visible:ring-2 focus-visible:ring-ds-primary/30 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800';

const toolbarDropdownPanelClass =
  'absolute z-50 w-max min-w-[9.5rem] max-w-[14rem] overflow-hidden rounded-md border border-ds-border/90 bg-ds-surface py-0.5 text-left shadow-lg ring-1 ring-black/5 divide-y divide-ds-border/60 dark:divide-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10 top-[calc(100%+0.35rem)]';

function useToolbarDropdownDismiss(open, setOpen) {
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      const el = rootRef.current;
      if (el && !el.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, setOpen]);

  return rootRef;
}

const ROLE_FILTER_OPTIONS = [
  { value: '', label: 'All roles' },
  { value: 'Doctor', label: 'Doctor' },
  { value: 'Nurse', label: 'Nurse' },
  { value: 'Admin', label: 'Admin' },
  { value: 'Patient', label: 'Patient' },
];

function ToolbarSelectDropdown({
  value,
  onChange,
  options,
  ariaLabel,
  listAriaLabel = 'Options',
  align = 'left',
  triggerMinWidthClass = 'min-w-[9.5rem]',
  className = '',
  /** When set, shown on the trigger if `value` is empty and not listed in `options` (not a menu row). */
  placeholderLabel,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useToolbarDropdownDismiss(open, setOpen);
  const selected = options.find((o) => o.value === value);
  const emptyish = value === '' || value == null;
  const selectedLabel =
    selected?.label ??
    (placeholderLabel != null && emptyish ? placeholderLabel : options[0]?.label ?? '—');
  const showPlaceholderStyle = emptyish && placeholderLabel != null && !selected;
  const panelSide = align === 'right' ? 'right-0' : 'left-0';

  return (
    <div ref={rootRef} className={['relative inline-flex shrink-0', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={`${toolbarDropdownTriggerClass} h-10 ${triggerMinWidthClass} justify-between`}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className={[
            'min-w-0 flex-1 truncate text-left',
            showPlaceholderStyle ? 'text-ds-text-muted dark:text-slate-500' : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {selectedLabel}
        </span>
        <span
          className={`shrink-0 ${open ? 'rotate-180' : ''} text-ds-text-muted transition-transform dark:text-slate-500`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open ? (
        <div role="listbox" aria-label={listAriaLabel} className={`${toolbarDropdownPanelClass} ${panelSide}`}>
          {options.map((opt) => (
            <button
              key={opt.value === '' ? '__empty' : opt.value}
              type="button"
              role="option"
              aria-selected={value === opt.value}
              className={[
                actionMenuItem,
                value === opt.value
                  ? 'bg-violet-50 font-semibold text-ds-primary dark:bg-violet-950/40 dark:text-ds-primary-soft'
                  : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function RoleFilterDropdown({ value, onChange }) {
  return (
    <ToolbarSelectDropdown
      value={value}
      onChange={onChange}
      options={ROLE_FILTER_OPTIONS}
      ariaLabel="Filter by role"
      listAriaLabel="Role filter"
      align="left"
      triggerMinWidthClass="min-w-[9.5rem]"
    />
  );
}

/**
 * Per-row actions in a compact dropdown (keeps the user table narrow on small screens).
 * Controlled open state + outside click / Escape so the panel does not trap the trigger like `<details>`.
 */
function UserRowActionsMenu({
  userId,
  status,
  rowBusy,
  onDeactivate,
  onLock,
  onUnlock,
  onReactivate,
  deactivatePending,
  lockPending,
  unlockPending,
  reactivatePending,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useToolbarDropdownDismiss(open, setOpen);
  const s = String(status ?? '').toUpperCase();
  const hasMenu = s === 'ACTIVE' || s === 'SUSPENDED' || s === 'DISABLED';

  useEffect(() => {
    if (rowBusy) setOpen(false);
  }, [rowBusy]);

  if (!userId || !hasMenu) {
    return <span className={`${appMutedText} text-xs`}>—</span>;
  }

  return (
    <div ref={rootRef} className="relative inline-flex justify-end text-right">
      <button
        type="button"
        className={[toolbarDropdownTriggerClass, 'h-10 min-w-[9.5rem] justify-between', rowBusy ? 'pointer-events-none opacity-55' : '']
          .filter(Boolean)
          .join(' ')}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={rowBusy}
        onClick={() => setOpen((v) => !v)}
      >
        {rowBusy ? (
          <span className="inline-flex items-center gap-1.5">
            <Spinner size="sm" theme="slate" />
            <span>Working…</span>
          </span>
        ) : (
          <>
            <span>Actions</span>
            <span className={`${open ? 'rotate-180' : ''} text-ds-text-muted transition-transform dark:text-slate-500`} aria-hidden>
              ▾
            </span>
          </>
        )}
      </button>
      {open && !rowBusy ? (
        <div
          role="menu"
          aria-label="User actions"
          className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-max min-w-[9.5rem] max-w-[14rem] overflow-hidden rounded-md border border-ds-border/90 bg-ds-surface py-0.5 text-left shadow-lg ring-1 ring-black/5 divide-y divide-ds-border/60 dark:divide-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:ring-white/10"
        >
          {s === 'ACTIVE' ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={actionMenuItem}
                onClick={() => {
                  onDeactivate();
                  setOpen(false);
                }}
              >
                {deactivatePending ? <Spinner size="sm" theme="slate" /> : null}
                Deactivate
              </button>
              <button
                type="button"
                role="menuitem"
                className={actionMenuItemDanger}
                onClick={() => {
                  onLock();
                  setOpen(false);
                }}
              >
                {lockPending ? <Spinner size="sm" theme="slate" /> : null}
                Lock account
              </button>
            </>
          ) : null}
          {s === 'SUSPENDED' ? (
            <button
              type="button"
              role="menuitem"
              className={actionMenuItemSuccess}
              onClick={() => {
                onUnlock();
                setOpen(false);
              }}
            >
              {unlockPending ? <Spinner size="sm" theme="slate" /> : null}
              Unlock
            </button>
          ) : null}
          {s === 'DISABLED' ? (
            <button
              type="button"
              role="menuitem"
              className={actionMenuItem}
              onClick={() => {
                onReactivate();
                setOpen(false);
              }}
            >
              {reactivatePending ? <Spinner size="sm" theme="slate" /> : null}
              Reactivate
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function decisionClass(decision) {
  const d = String(decision ?? '').toUpperCase();
  if (d === 'ALLOW') return appDecisionAllow;
  if (d === 'DENY') return appDecisionDeny;
  if (d === 'STEP_UP' || d === 'OVERRIDE') return appDecisionStepUp;
  return 'inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-900/50 dark:text-slate-200';
}

function decisionLabel(decision) {
  const d = String(decision ?? '').toUpperCase();
  if (d === 'OVERRIDE') return 'OVERRIDE';
  return d || '—';
}

function formatTimestamp(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

/** Relative time for “last login”; falls back to full timestamp when older than ~7 days. */
function formatRelativeLogin(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 10) return 'Just now';
  if (sec < 60) return `${sec} sec${sec === 1 ? '' : 's'} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min${min === 1 ? '' : 's'} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? '' : 's'} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  return formatTimestamp(value);
}

const AUDIT_ACTION_FILTER_OPTIONS = [
  'LOGIN_FAILED',
  'BREAK_GLASS',
  'ACCOUNT_LOCKED',
  'ACCOUNT_UNLOCKED',
  'REGISTER',
  'READ_EHR',
  'WRITE_EHR',
  'UPDATE_EHR',
  'DELETE_EHR',
  'BULK_DOWNLOAD_FLAGGED',
];

const AUDIT_ACTION_SELECT_OPTIONS = [
  { value: '', label: 'All' },
  ...AUDIT_ACTION_FILTER_OPTIONS.map((a) => ({ value: a, label: a })),
];

const AUDIT_DECISION_SELECT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'ALLOW', label: 'ALLOW' },
  { value: 'DENY', label: 'DENY' },
  { value: 'STEP_UP', label: 'STEP_UP' },
];

const AUDIT_DATE_SELECT_OPTIONS = [
  { value: 'today', label: 'Today' },
  { value: 'last7', label: 'Last 7 days' },
  { value: 'all', label: 'All' },
];

const CREATE_USER_ROLE_OPTIONS = [
  { value: 'doctor', label: 'Doctor' },
  { value: 'nurse', label: 'Nurse' },
  { value: 'admin', label: 'Admin' },
  { value: 'patient', label: 'Patient' },
];

function formatAction(action) {
  if (!action) return '—';
  const a = String(action);
  const map = {
    LOGIN_FAILED: 'Failed login',
    ACCOUNT_LOCKED: 'Account locked',
    ACCOUNT_UNLOCKED: 'Account unlocked',
    BREAK_GLASS: 'Break-glass access',
    EHR_ACCESS: 'EHR accessed',
    EHR_WRITE: 'EHR updated',
    VITALS_UPDATE: 'Vitals updated',
    FILE_UPLOAD: 'File uploaded',
    STEP_UP: 'Step-up required',
    REGISTER: 'Account registered',
    READ_EHR: 'EHR read',
    WRITE_EHR: 'EHR write',
    UPDATE_EHR: 'EHR updated',
    DELETE_EHR: 'EHR delete',
    BULK_DOWNLOAD_FLAGGED: 'Bulk download flagged',
  };
  if (map[a]) return map[a];
  if (a.startsWith('OFFHOURS_')) {
    const rest = a.replace(/^OFFHOURS_/, '');
    return `Off-hours activity (${rest.replace(/_/g, ' ').toLowerCase()})`;
  }
  return a.replace(/_/g, ' ');
}

function resourceCategory(action) {
  const u = String(action ?? '').toUpperCase();
  if (u === 'BREAK_GLASS' || u.includes('_EHR') || u.startsWith('OFFHOURS_')) return 'ehr';
  if (u === 'ACCOUNT_LOCKED' || u === 'ACCOUNT_UNLOCKED' || u === 'REGISTER') return 'user';
  if (u === 'LOGIN_FAILED' || u.includes('LOGIN') || u === 'LOGOUT') return 'auth';
  return '—';
}

function displayResourceId(resourceId) {
  const s = resourceId == null ? '' : String(resourceId);
  if (!s) return '—';
  if (s.startsWith('MRN-')) return s.length > 22 ? `${s.slice(0, 18)}…` : s;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return `${s.slice(0, 8)}…`;
  if (s.length > 16) return `${s.slice(0, 14)}…`;
  return s;
}

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOCKOUT_FAILED_ATTEMPTS = 5;

/** Newest event time for a security alert row (tab badge “unseen” uses this vs last visit). */
function securityAlertCandidateTime(c) {
  if (c.kind === 'LOGIN_FAILED_GROUP') return new Date(c.latest.timestamp).getTime();
  return new Date(c.log.timestamp).getTime();
}

function groupLoginFailedClusters(logs) {
  const byUser = new Map();
  for (const log of logs) {
    if (log?.action !== 'LOGIN_FAILED' || !log?.userId) continue;
    if (!byUser.has(log.userId)) byUser.set(log.userId, []);
    byUser.get(log.userId).push(log);
  }
  const clusters = [];
  for (const [, userLogs] of byUser) {
    userLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    let i = 0;
    while (i < userLogs.length) {
      const newestMs = new Date(userLogs[i].timestamp).getTime();
      const minMs = newestMs - FAILED_LOGIN_WINDOW_MS;
      const cluster = [];
      let k = i;
      while (k < userLogs.length) {
        const t = new Date(userLogs[k].timestamp).getTime();
        if (t >= minMs) {
          cluster.push(userLogs[k]);
          k += 1;
        } else break;
      }
      clusters.push({
        userId: userLogs[i].userId,
        userEmail: userLogs[i].userEmail,
        latest: userLogs[i],
        count: cluster.length,
        id: `lf-${userLogs[i].userId}-${newestMs}`,
      });
      i = k;
    }
  }
  return clusters;
}

function buildSecurityAlertCandidates(feedLogs, { reviewedBreakGlassIds, usersById }) {
  const reviewed = new Set(reviewedBreakGlassIds);
  const emailFor = (uid) => (uid ? usersById.get(uid)?.email : null) ?? null;

  const rows = [];

  for (const log of feedLogs) {
    if (!log?.timestamp) continue;
    const action = log.action;
    /** Keep lock events in the feed after unlock (historical); do not gate on current user status. */
    if (action === 'ACCOUNT_LOCKED' && log.userId) {
      rows.push({
        kind: 'ACCOUNT_LOCKED',
        id: log.id,
        log,
        userEmail: log.userEmail ?? emailFor(log.userId) ?? '—',
      });
    } else if (action === 'BREAK_GLASS' && log.id && !reviewed.has(log.id)) {
      rows.push({
        kind: 'BREAK_GLASS',
        id: log.id,
        log,
        userEmail: log.userEmail ?? emailFor(log.userId) ?? '—',
      });
    } else if (action === 'ACCOUNT_UNLOCKED') {
      const targetId = log.resourceId;
      rows.push({
        kind: 'ACCOUNT_UNLOCKED',
        id: log.id,
        log,
        targetEmail: emailFor(targetId) ?? (targetId ? displayResourceId(targetId) : '—'),
      });
    } else if (String(log.decision ?? '').toUpperCase() === 'STEP_UP' && action !== 'LOGIN_FAILED') {
      rows.push({
        kind: 'STEP_UP',
        id: log.id ?? `su-${log.timestamp}-${log.userId ?? ''}`,
        log,
        userEmail: log.userEmail ?? emailFor(log.userId) ?? '—',
      });
    }
  }

  const failedClusters = groupLoginFailedClusters(feedLogs).map((c) => ({
    kind: 'LOGIN_FAILED_GROUP',
    id: c.id,
    count: c.count,
    latest: c.latest,
    userEmail: c.userEmail ?? emailFor(c.userId) ?? '—',
    userId: c.userId,
  }));

  const merged = [...rows, ...failedClusters];
  merged.sort((a, b) => {
    const ta = a.kind === 'LOGIN_FAILED_GROUP' ? new Date(a.latest.timestamp).getTime() : new Date(a.log.timestamp).getTime();
    const tb = b.kind === 'LOGIN_FAILED_GROUP' ? new Date(b.latest.timestamp).getTime() : new Date(b.log.timestamp).getTime();
    return tb - ta;
  });

  return merged;
}

function TabButton({ id, label, active, onClick, badge }) {
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
      {badge ? (
        <span
          className="ml-1.5 inline-flex items-center justify-center
             rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-semibold
             text-red-700 dark:bg-red-950/60 dark:text-red-300"
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

/** Aligned grid: first, last, email, role, status, last login, actions. */
const ADMIN_USER_TABLE_ROW =
  'grid grid-cols-[minmax(4.5rem,0.85fr)_minmax(4.5rem,0.85fr)_minmax(6.5rem,1.1fr)_minmax(3.25rem,0.5fr)_minmax(5.5rem,0.7fr)_minmax(5.5rem,0.75fr)_minmax(6.5rem,1fr)] gap-x-3 items-center';

/** Assign User tab — MRN, patient name, assigned doctor, actions. */
const ASSIGNMENTS_TABLE_ROW =
  'grid grid-cols-[minmax(5.5rem,0.55fr)_minmax(9rem,1.1fr)_minmax(12rem,1.25fr)_minmax(11rem,1.1fr)] gap-x-3 items-center';

function displayFullName(userLike) {
  const fn = String(userLike?.firstName ?? '').trim();
  const ln = String(userLike?.lastName ?? '').trim();
  const full = `${fn} ${ln}`.trim();
  return full || null;
}

function patientDisplayLabel(user) {
  return displayFullName(user) ?? user?.email ?? user?.username ?? null;
}

function doctorDisplayLabel(user) {
  const full = displayFullName(user);
  const base = full ? `Dr. ${full}` : user?.email ?? user?.username ?? null;
  if (!base) return null;
  const dept = String(user?.department ?? '').trim();
  return dept ? `${base} (${dept})` : base;
}

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState('users');
  const [roleFilter, setRoleFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');
  const [usersPage, setUsersPage] = useState(1);
  const [assignmentsPage, setAssignmentsPage] = useState(1);
  const [createForm, setCreateForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    department: '',
    roleName: '',
  });
  const [createNotice, setCreateNotice] = useState({ variant: '', message: '' });
  const [actionNotice, setActionNotice] = useState({ variant: '', message: '' });
  const [assignDoctorForm, setAssignDoctorForm] = useState({ doctorId: '', patientId: '' });
  const [assignDoctorNotice, setAssignDoctorNotice] = useState({ variant: '', message: '' });
  const [auditPage, setAuditPage] = useState(1);
  const [securityPage, setSecurityPage] = useState(1);
  const [auditDecisionFilter, setAuditDecisionFilter] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('');
  const [auditDateRange, setAuditDateRange] = useState('all');
  const [reviewedBreakGlassIds, setReviewedBreakGlassIds] = useState([]);
  const [breakGlassReviewLog, setBreakGlassReviewLog] = useState(null);
  /** When the admin last opened Security Alerts or dismissed items; badge shows only newer events. */
  const [securityAlertsLastCheckedAt, setSecurityAlertsLastCheckedAt] = useState(null);

  const usersQuery = useQuery({
    queryKey: ['adminUsers', roleFilter],
    queryFn: () => getUsers(roleFilter || undefined),
  });

  /** Full roster for security alert status (role filter on User Management must not hide lockouts). */
  const usersLookupQuery = useQuery({
    queryKey: ['adminUsers', 'lookupAll'],
    queryFn: () => getUsers(undefined),
    staleTime: 30_000,
  });

  const users = useMemo(() => {
    return Array.isArray(usersQuery.data) ? usersQuery.data : [];
  }, [usersQuery.data]);

  const usersByIdSecurity = useMemo(() => {
    const list = Array.isArray(usersLookupQuery.data) ? usersLookupQuery.data : [];
    const m = new Map();
    for (const u of list) {
      if (u?.id) m.set(u.id, u);
    }
    return m;
  }, [usersLookupQuery.data]);

  const assignPatientsQuery = useQuery({
    queryKey: ['adminUsers', 'assignPatients'],
    queryFn: () => getUsers('Patient'),
    enabled: activeTab === 'assignuser',
    staleTime: 30_000,
  });

  const assignDoctorsQuery = useQuery({
    queryKey: ['adminUsers', 'assignDoctors'],
    queryFn: () => getUsers('Doctor'),
    enabled: activeTab === 'assignuser',
    staleTime: 30_000,
  });

  const AUDIT_PAGE_SIZE = 10;
  const auditSkip = (Math.max(1, auditPage) - 1) * AUDIT_PAGE_SIZE;
  const auditTableQuery = useQuery({
    queryKey: ['auditLogs', 'table', auditDecisionFilter, auditActionFilter, auditDateRange, auditPage],
    queryFn: () =>
      getAuditLogs({
        range: auditDateRange,
        take: AUDIT_PAGE_SIZE,
        skip: auditSkip,
        ...(auditDecisionFilter ? { decision: auditDecisionFilter } : {}),
        ...(auditActionFilter ? { action: auditActionFilter } : {}),
      }),
  });

  const auditSecurityFeedQuery = useQuery({
    queryKey: ['auditLogs', 'securityFeed'],
    queryFn: () => getAuditLogs({ range: 'all', take: 200, skip: 0 }),
    staleTime: 30_000,
  });

  const summaryQuery = useQuery({
    queryKey: ['adminDashboardSummary'],
    queryFn: () => getAdminDashboardSummary(),
  });

  const createUserMutation = useMutation({
    mutationFn: (data) => createUser(data),
    onSuccess: () => {
      setCreateNotice({ variant: 'success', message: 'User created successfully.' });
      setCreateForm({
        firstName: '',
        lastName: '',
        username: '',
        email: '',
        password: '',
        department: '',
        roleName: '',
      });
      usersQuery.refetch();
      usersLookupQuery.refetch();
      assignPatientsQuery.refetch();
      summaryQuery.refetch();
    },
    onError: (err) => {
      setCreateNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to create user',
      });
    },
  });

  const setInactiveMutation = useMutation({
    mutationFn: (userId) => updateUser(userId, { status: 'INACTIVE' }),
    onSuccess: () => {
      usersQuery.refetch();
      usersLookupQuery.refetch();
      summaryQuery.refetch();
    },
  });

  const suspendUserMutation = useMutation({
    mutationFn: (userId) => updateUser(userId, { status: 'SUSPENDED' }),
    onSuccess: () => {
      usersQuery.refetch();
      usersLookupQuery.refetch();
      summaryQuery.refetch();
    },
  });

  const reactivateMutation = useMutation({
    mutationFn: (userId) => updateUser(userId, { status: 'ACTIVE' }),
    onSuccess: () => {
      usersQuery.refetch();
      usersLookupQuery.refetch();
      summaryQuery.refetch();
    },
  });

  const unlockMutation = useMutation({
    mutationFn: (userId) => unlockUser(userId),
    onSuccess: () => {
      setActionNotice({ variant: 'success', message: 'Account unlocked' });
      usersQuery.refetch();
      usersLookupQuery.refetch();
      summaryQuery.refetch();
      auditTableQuery.refetch();
      auditSecurityFeedQuery.refetch();
    },
    onError: (err) => {
      setActionNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to unlock account',
      });
    },
  });

  useEffect(() => {
    if (actionNotice.variant !== 'success' || !actionNotice.message) return undefined;
    const id = window.setTimeout(() => {
      setActionNotice({ variant: '', message: '' });
    }, 4500);
    return () => window.clearTimeout(id);
  }, [actionNotice.variant, actionNotice.message]);

  useEffect(() => {
    if (assignDoctorNotice.variant !== 'success' || !assignDoctorNotice.message) return undefined;
    const id = window.setTimeout(() => {
      setAssignDoctorNotice({ variant: '', message: '' });
    }, 4500);
    return () => window.clearTimeout(id);
  }, [assignDoctorNotice.variant, assignDoctorNotice.message]);

  const assignDoctorMutation = useMutation({
    mutationFn: ({ doctorId, patientId }) => assignDoctor(doctorId, patientId),
    onSuccess: (_data, variables) => {
      setAssignDoctorNotice({
        variant: 'success',
        message: `${variables.doctorLabel} assigned to ${variables.patientLabel}`,
      });
      setAssignDoctorForm({ doctorId: '', patientId: '' });
      assignPatientsQuery.refetch();
      assignDoctorsQuery.refetch();
      usersLookupQuery.refetch();
      usersQuery.refetch();
    },
    onError: (err) => {
      setAssignDoctorNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to assign doctor',
      });
    },
  });

  const unassignDoctorMutation = useMutation({
    mutationFn: (patientId) => unassignDoctor(patientId),
    onSuccess: (_data, patientId) => {
      const list = Array.isArray(assignPatientsQuery.data) ? assignPatientsQuery.data : [];
      const pat = list.find((u) => u.patient?.id === patientId);
      const patientLabel = patientDisplayLabel(pat) ?? 'patient';
      setAssignDoctorNotice({
        variant: 'success',
        message: `Doctor removed from ${patientLabel}.`,
      });
      setAssignDoctorForm((s) =>
        String(s.patientId) === String(patientId) ? { doctorId: '', patientId: '' } : s,
      );
      assignPatientsQuery.refetch();
      usersLookupQuery.refetch();
      usersQuery.refetch();
    },
    onError: (err) => {
      setAssignDoctorNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to remove assignment',
      });
    },
  });

  const auditPayload = auditTableQuery.data;
  const auditLogs = auditPayload?.logs ?? [];
  const auditTotal = typeof auditPayload?.total === 'number' ? auditPayload.total : auditLogs.length;

  const securityFeedLogs = auditSecurityFeedQuery.data?.logs ?? [];
  const securityAlertCandidates = useMemo(
    () => buildSecurityAlertCandidates(securityFeedLogs, { reviewedBreakGlassIds, usersById: usersByIdSecurity }),
    [securityFeedLogs, reviewedBreakGlassIds, usersByIdSecurity],
  );
  const SECURITY_PAGE_SIZE = 10;
  const securityTotalPages = Math.max(1, Math.ceil(securityAlertCandidates.length / SECURITY_PAGE_SIZE));
  const securityPageSafe = Math.min(Math.max(1, securityPage), securityTotalPages);
  const securityAlertsDisplayed = useMemo(() => {
    const start = (securityPageSafe - 1) * SECURITY_PAGE_SIZE;
    return securityAlertCandidates.slice(start, start + SECURITY_PAGE_SIZE);
  }, [securityAlertCandidates, securityPageSafe]);
  const securityAlertBadgeCount = useMemo(() => {
    if (activeTab === 'alerts') return 0;
    const base = securityAlertCandidates.filter((c) => c.kind !== 'ACCOUNT_UNLOCKED');
    if (securityAlertsLastCheckedAt == null) return base.length;
    const ack = securityAlertsLastCheckedAt;
    return base.filter((c) => securityAlertCandidateTime(c) > ack).length;
  }, [activeTab, securityAlertCandidates, securityAlertsLastCheckedAt]);

  function handleCreateSubmit(e) {
    e.preventDefault();
    setCreateNotice({ variant: '', message: '' });
    const roleName = String(createForm.roleName ?? '').trim();
    if (!roleName) {
      setCreateNotice({ variant: 'error', message: 'Please select a role.' });
      return;
    }
    createUserMutation.mutate({
      firstName: String(createForm.firstName ?? '').trim(),
      lastName: String(createForm.lastName ?? '').trim(),
      username: String(createForm.username ?? '').trim(),
      email: String(createForm.email ?? '').trim(),
      password: String(createForm.password ?? ''),
      department: String(createForm.department ?? '').trim(),
      roleName,
    });
  }

  function handleUnlock(userId) {
    setActionNotice({ variant: '', message: '' });
    unlockMutation.mutate(userId);
  }

  function handleAssignDoctorSubmit(e) {
    e.preventDefault();
    setAssignDoctorNotice({ variant: '', message: '' });
    const doctorId = String(assignDoctorForm.doctorId ?? '').trim();
    const patientId = String(assignDoctorForm.patientId ?? '').trim();
    if (!doctorId || !patientId) {
      setAssignDoctorNotice({ variant: 'error', message: 'Please select a patient and a doctor.' });
      return;
    }
    const doc = assignDoctorList.find((d) => d.id === doctorId);
    const pat = assignmentPatients.find((u) => u.patient?.id === patientId);
    const doctorLabel = doctorDisplayLabel(doc) ?? doc?.email ?? doctorId;
    const patientLabel = patientDisplayLabel(pat) ?? pat?.email ?? pat?.username ?? patientId;
    assignDoctorMutation.mutate({ doctorId, patientId, doctorLabel, patientLabel });
  }

  function openAssignFormForPatient(patientRecordId) {
    setAssignDoctorNotice({ variant: '', message: '' });
    setAssignDoctorForm({ doctorId: '', patientId: patientRecordId });
  }

  const doctors = useMemo(() => {
    return users.filter((u) => u?.role?.roleName === 'Doctor');
  }, [users]);

  const assignDoctorList = useMemo(() => {
    return Array.isArray(assignDoctorsQuery.data) ? assignDoctorsQuery.data : [];
  }, [assignDoctorsQuery.data]);

  const assignmentPatients = useMemo(() => {
    const list = Array.isArray(assignPatientsQuery.data) ? assignPatientsQuery.data : [];
    return list.filter((u) => u?.patient?.id);
  }, [assignPatientsQuery.data]);

  const ASSIGNMENTS_PAGE_SIZE = 10;
  const assignmentsTotalPages = Math.max(1, Math.ceil(assignmentPatients.length / ASSIGNMENTS_PAGE_SIZE));
  const assignmentsPageSafe = Math.min(Math.max(1, assignmentsPage), assignmentsTotalPages);
  const assignmentPatientsPage = useMemo(() => {
    const start = (assignmentsPageSafe - 1) * ASSIGNMENTS_PAGE_SIZE;
    return assignmentPatients.slice(start, start + ASSIGNMENTS_PAGE_SIZE);
  }, [assignmentPatients, assignmentsPageSafe]);

  useEffect(() => {
    // Reset paging when the dataset changes or when switching tabs.
    if (activeTab !== 'assignuser') return;
    setAssignmentsPage(1);
  }, [activeTab, assignmentPatients.length]);

  const unassignedPatients = useMemo(
    () => assignmentPatients.filter((u) => !u.patient?.assignedDoctorId),
    [assignmentPatients],
  );

  /** Patient dropdown: unassigned only; if Reassign pre-fills an assigned patient, include that row so the value is valid. */
  const assignPatientSelectOptions = useMemo(() => {
    const base = unassignedPatients.map((u) => ({
      value: u.patient.id,
      label: `${patientDisplayLabel(u) ?? 'Patient'} (${u.patient.medicalRecordNumber})`,
    }));
    const pid = String(assignDoctorForm.patientId ?? '').trim();
    if (!pid || base.some((o) => o.value === pid)) return base;
    const row = assignmentPatients.find((u) => u.patient?.id === pid);
    if (!row) return base;
    return [
      {
        value: row.patient.id,
        label: `${patientDisplayLabel(row) ?? 'Patient'} (${row.patient.medicalRecordNumber})`,
      },
      ...base,
    ];
  }, [unassignedPatients, assignmentPatients, assignDoctorForm.patientId]);

  const assignDoctorSelectOptions = useMemo(
    () =>
      assignDoctorList.map((d) => ({
        value: d.id,
        label: `${displayFullName(d) ?? d.email ?? d.username ?? d.id}${String(d?.department ?? '').trim() ? ` (${String(d.department).trim()})` : ''}`,
      })),
    [assignDoctorList],
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) => {
      const email = String(u?.email ?? '').toLowerCase();
      const fn = String(u?.firstName ?? '').toLowerCase();
      const ln = String(u?.lastName ?? '').toLowerCase();
      const full = `${fn} ${ln}`.trim();
      return email.includes(q) || fn.includes(q) || ln.includes(q) || full.includes(q);
    });
  }, [users, userSearch]);

  const USERS_PAGE_SIZE = 10;
  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / USERS_PAGE_SIZE));
  const usersPageSafe = Math.min(Math.max(1, usersPage), usersTotalPages);
  const filteredUsersPage = useMemo(() => {
    const start = (usersPageSafe - 1) * USERS_PAGE_SIZE;
    return filteredUsers.slice(start, start + USERS_PAGE_SIZE);
  }, [filteredUsers, usersPageSafe]);

  useEffect(() => {
    if (activeTab !== 'users') return;
    setUsersPage(1);
  }, [activeTab, roleFilter, userSearch]);

  useEffect(() => {
    if (activeTab !== 'audit') return;
    setAuditPage(1);
  }, [activeTab, auditDecisionFilter, auditActionFilter, auditDateRange]);

  useEffect(() => {
    if (activeTab !== 'alerts') return;
    setSecurityPage(1);
  }, [activeTab, securityAlertCandidates.length]);

  useEffect(() => {
    if (activeTab !== 'alerts') return;
    setSecurityAlertsLastCheckedAt(Date.now());
  }, [activeTab]);

  const sm = summaryQuery.data;
  const totalUsers = sm?.totalUsers ?? 0;
  const lockedAccounts = sm?.lockedAccounts ?? 0;
  const activeSessionsApprox = sm?.activeSessionsApprox ?? 0;
  const deniedRequestsToday = sm?.deniedRequestsToday ?? 0;
  const breakGlassEventsToday = sm?.breakGlassEventsToday ?? 0;
  const auditEventsToday = sm?.auditEventsToday ?? 0;

  return (
    <div>
      {summaryQuery.isError ? (
        <Alert variant="error" className="mb-4">
          {summaryQuery.error?.response?.data?.error ||
            summaryQuery.error?.message ||
            'Failed to load dashboard metrics.'}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Total Users</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : totalUsers}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Active Sessions</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : activeSessionsApprox}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Locked Accounts</p>
          <p
            className={[
              'mt-1 text-2xl font-semibold',
              lockedAccounts > 0 ? 'text-red-600 dark:text-red-400' : 'text-ds-text dark:text-white',
            ].join(' ')}
          >
            {summaryQuery.isLoading ? '—' : lockedAccounts}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Denied Requests</p>
          <p
            className={[
              'mt-1 text-2xl font-semibold',
              deniedRequestsToday > 0 ? 'text-red-600 dark:text-red-400' : 'text-ds-text dark:text-white',
            ].join(' ')}
          >
            {summaryQuery.isLoading ? '—' : deniedRequestsToday}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Break-glass Events</p>
          <p
            className={[
              'mt-1 text-2xl font-semibold',
              breakGlassEventsToday > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ds-text dark:text-white',
            ].join(' ')}
          >
            {summaryQuery.isLoading ? '—' : breakGlassEventsToday}
          </p>
        </div>
        <div className="rounded-ds-card border border-ds-border/60 bg-ds-surface/80 p-4 dark:border-slate-700/60 dark:bg-slate-800/60">
          <p className={appDataLabel}>Audit Events Today</p>
          <p className="mt-1 text-2xl font-semibold text-ds-text dark:text-white">
            {summaryQuery.isLoading ? '—' : auditEventsToday}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-ds-border dark:border-slate-700 mb-6">
        <TabButton
          id="users"
          label="User Management"
          active={activeTab === 'users'}
          onClick={() => setActiveTab('users')}
        />
        <TabButton id="adduser" label="Add User" active={activeTab === 'adduser'} onClick={() => setActiveTab('adduser')} />
        <TabButton
          id="assignuser"
          label="Assign User"
          active={activeTab === 'assignuser'}
          onClick={() => setActiveTab('assignuser')}
        />
        <TabButton id="audit" label="Audit Log" active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} />
        <TabButton
          id="alerts"
          label="Security Alerts"
          active={activeTab === 'alerts'}
          onClick={() => setActiveTab('alerts')}
          badge={securityAlertBadgeCount > 0 ? securityAlertBadgeCount : null}
        />
      </div>

      {activeTab === 'users' ? (
        <section className={appPanelCard}>
          <div className="mb-3 space-y-3">
            <h2 className={appSectionHeading}>User Management</h2>
            <div className="flex w-full max-w-2xl flex-wrap items-center gap-2">
              <RoleFilterDropdown value={roleFilter} onChange={setRoleFilter} />
              <input
                type="search"
                className={`${authInput} h-10 min-w-[12rem] flex-1 py-2 text-sm leading-snug text-ds-text dark:text-slate-100 sm:max-w-xs`}
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search email or name"
                aria-label="Search users by email or name"
              />
            </div>
          </div>

          {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 ? (
            <p className={`${appMutedText} mb-3`}>
              Showing {filteredUsers.length} user{filteredUsers.length === 1 ? '' : 's'}
            </p>
          ) : null}

          <div>
            {actionNotice.message ? (
              <Alert variant={actionNotice.variant || 'info'} className="mb-3">
                {actionNotice.message}
              </Alert>
            ) : null}

            {usersQuery.isLoading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading users…</span>
              </div>
            ) : null}

            {usersQuery.isError ? (
              <Alert variant="error" className="mt-3">
                {usersQuery.error?.response?.data?.error || usersQuery.error?.message || 'Failed to load users'}
              </Alert>
            ) : null}

            {!usersQuery.isLoading && !usersQuery.isError && users.length === 0 ? (
              <p className={`${appMutedText} mt-3`}>No users found.</p>
            ) : null}

            {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 && filteredUsers.length === 0 ? (
              <p className={`${appMutedText} mt-3`}>No users match your search.</p>
            ) : null}

            {!usersQuery.isLoading && !usersQuery.isError && filteredUsers.length > 0 ? (
              <div className="mt-3 overflow-x-auto">
                <div className="min-w-[1020px]">
                  <div className={`${ADMIN_USER_TABLE_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                    <div className={appDataLabel}>First name</div>
                    <div className={appDataLabel}>Last name</div>
                    <div className={appDataLabel}>Email</div>
                    <div className={`${appDataLabel} text-right`}>Role</div>
                    <div className={`${appDataLabel} text-center`}>Status</div>
                    <div className={appDataLabel}>Last login</div>
                    <div className={`${appDataLabel} text-right`}>Actions</div>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-ds-border/60 pr-1 dark:divide-slate-700/60">
                    {filteredUsersPage.map((u) => {
                      const status = String(u?.status ?? 'ACTIVE').toUpperCase();
                      const rowBusy =
                        (setInactiveMutation.isPending && setInactiveMutation.variables === u?.id) ||
                        (suspendUserMutation.isPending && suspendUserMutation.variables === u?.id) ||
                        (reactivateMutation.isPending && reactivateMutation.variables === u?.id) ||
                        (unlockMutation.isPending && unlockMutation.variables === u?.id);
                      return (
                        <div key={u?.id ?? u?.email} className={`${ADMIN_USER_TABLE_ROW} py-2.5`}>
                          <div className={appDataValue}>{u?.firstName ?? '—'}</div>
                          <div className={appDataValue}>{u?.lastName ?? '—'}</div>
                          <div className={`${appDataValue} min-w-0 truncate`}>{u?.email ?? '—'}</div>
                          <div className={`${appDataValue} text-right`}>{u?.role?.roleName ?? '—'}</div>
                          <div className="flex justify-center">{statusBadge(status)}</div>
                          <div className={appDataValue}>{formatRelativeLogin(u?.lastLoginAt)}</div>
                          <UserRowActionsMenu
                            userId={u?.id}
                            status={status}
                            rowBusy={rowBusy}
                            onDeactivate={() => setInactiveMutation.mutate(u?.id)}
                            onLock={() => suspendUserMutation.mutate(u?.id)}
                            onUnlock={() => handleUnlock(u?.id)}
                            onReactivate={() => reactivateMutation.mutate(u?.id)}
                            deactivatePending={
                              setInactiveMutation.isPending && setInactiveMutation.variables === u?.id
                            }
                            lockPending={suspendUserMutation.isPending && suspendUserMutation.variables === u?.id}
                            unlockPending={unlockMutation.isPending && unlockMutation.variables === u?.id}
                            reactivatePending={
                              reactivateMutation.isPending && reactivateMutation.variables === u?.id
                            }
                          />
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <span className={`${appMutedText} text-xs`}>
                      Page {usersPageSafe} of {usersTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                      disabled={usersPageSafe <= 1}
                      onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                      disabled={usersPageSafe >= usersTotalPages}
                      onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'assignuser' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Assign User</h2>
          <p className={`${appMutedText} mt-1 mb-6`}>
            Link doctors to patient accounts so assigned doctors can access each patient’s EHR under normal policy.
          </p>

          <div>
            <h3 className="text-sm font-semibold tracking-tight text-ds-text dark:text-white">Assign Doctor</h3>

            <form
              className="mt-3 grid grid-cols-1 items-end gap-3 md:grid-cols-2 lg:grid-cols-[1fr_1fr_auto]"
              onSubmit={handleAssignDoctorSubmit}
            >
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
                Select patient
                <ToolbarSelectDropdown
                  value={assignDoctorForm.patientId}
                  onChange={(v) => setAssignDoctorForm((s) => ({ ...s, patientId: v }))}
                  options={assignPatientSelectOptions}
                  ariaLabel="Select patient"
                  listAriaLabel="Patients"
                  placeholderLabel="Select patient"
                  className="w-full min-w-0"
                  triggerMinWidthClass="w-full min-w-0"
                />
              </label>
              <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
                Select doctor
                <ToolbarSelectDropdown
                  value={assignDoctorForm.doctorId}
                  onChange={(v) => setAssignDoctorForm((s) => ({ ...s, doctorId: v }))}
                  options={assignDoctorSelectOptions}
                  ariaLabel="Select doctor"
                  listAriaLabel="Doctors"
                  placeholderLabel="Select doctor"
                  className="w-full min-w-0"
                  triggerMinWidthClass="w-full min-w-0"
                />
              </label>
              <div className="flex justify-start md:col-span-2 lg:col-span-1">
                <Button
                  type="submit"
                  variant="primary"
                  loading={assignDoctorMutation.isPending}
                  className="w-full !h-10 !min-h-[2.5rem] !rounded-lg !px-4 !py-0 !text-xs font-semibold lg:w-auto"
                >
                  Assign
                </Button>
              </div>

              {assignDoctorNotice.message ? (
                <div className="md:col-span-2 lg:col-span-3">
                  <Alert variant={assignDoctorNotice.variant || 'info'}>{assignDoctorNotice.message}</Alert>
                </div>
              ) : null}
            </form>
          </div>

          <div className="mt-10">
            <h3 className="text-sm font-semibold tracking-tight text-ds-text dark:text-white">
              Current Doctor-Patient Assignments
            </h3>

            {assignPatientsQuery.isLoading ? (
              <div className="mt-3 flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading patients…</span>
              </div>
            ) : null}

            {assignPatientsQuery.isError ? (
              <Alert variant="error" className="mt-2">
                {assignPatientsQuery.error?.response?.data?.error ||
                  assignPatientsQuery.error?.message ||
                  'Failed to load patients.'}
              </Alert>
            ) : null}

            {!assignPatientsQuery.isLoading && !assignPatientsQuery.isError && assignmentPatients.length === 0 ? (
              <p className={`${appMutedText} mt-2`}>No patient accounts found.</p>
            ) : null}

            {!assignPatientsQuery.isLoading && !assignPatientsQuery.isError && assignmentPatients.length > 0 ? (
              <div className="mt-2 overflow-x-auto">
                <div className="min-w-[720px]">
                  <div className={`${ASSIGNMENTS_TABLE_ROW} border-b border-ds-border/70 pb-2 dark:border-slate-600`}>
                    <div className={appDataLabel}>Patient MRN</div>
                    <div className={appDataLabel}>Patient</div>
                    <div className={appDataLabel}>Assigned Doctor</div>
                    <div className={`${appDataLabel} text-right`}>Actions</div>
                  </div>
                  <div className="max-h-[520px] overflow-y-auto divide-y divide-ds-border/60 pr-1 dark:divide-slate-700/60">
                    {assignmentPatientsPage.map((u) => {
                      const p = u.patient;
                      const hasDoctor = Boolean(p?.assignedDoctorId);
                      const doctorLabel = doctorDisplayLabel(p?.assignedDoctor);
                      const removingThis =
                        unassignDoctorMutation.isPending &&
                        String(unassignDoctorMutation.variables) === String(p.id);
                      const assignmentActionsLocked = unassignDoctorMutation.isPending && !removingThis;
                      return (
                        <div key={u.id} className={`${ASSIGNMENTS_TABLE_ROW} py-2.5`}>
                          <div className={`${appDataValue} font-mono text-xs`}>{p.medicalRecordNumber ?? '—'}</div>
                          <div className={`${appDataValue} min-w-0 truncate`}>{patientDisplayLabel(u) ?? '—'}</div>
                          <div className={`${appDataValue} min-w-0 truncate`}>
                            {hasDoctor ? (
                              doctorLabel ?? p?.assignedDoctor?.email ?? '—'
                            ) : (
                              <span className={appMutedText}>Unassigned</span>
                            )}
                          </div>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {hasDoctor ? (
                              <>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-[11px]"
                                  disabled={removingThis || assignmentActionsLocked}
                                  onClick={() => openAssignFormForPatient(p.id)}
                                >
                                  Change
                                </Button>
                                <Button
                                  type="button"
                                  variant="secondary"
                                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-[11px]"
                                  loading={removingThis}
                                  disabled={assignmentActionsLocked}
                                  onClick={() => {
                                    if (!window.confirm('Remove the assigned doctor from this patient?')) return;
                                    unassignDoctorMutation.mutate(p.id);
                                  }}
                                >
                                  Remove
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="secondary"
                                className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-[11px]"
                                disabled={assignmentActionsLocked}
                                onClick={() => openAssignFormForPatient(p.id)}
                              >
                                Assign
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center justify-end gap-2">
                    <span className={`${appMutedText} text-xs`}>
                      Page {assignmentsPageSafe} of {assignmentsTotalPages}
                    </span>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                      disabled={assignmentsPageSafe <= 1}
                      onClick={() => setAssignmentsPage((p) => Math.max(1, p - 1))}
                    >
                      Prev
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                      disabled={assignmentsPageSafe >= assignmentsTotalPages}
                      onClick={() => setAssignmentsPage((p) => Math.min(assignmentsTotalPages, p + 1))}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'adduser' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Create New User</h2>
          <p className={`${appMutedText} mt-1 mb-4`}>
            Add a new user to the system. They can log in immediately with the credentials you set.
          </p>

          <form className="grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={handleCreateSubmit}>
            <input
              className={authInput}
              value={createForm.firstName}
              onChange={(e) => setCreateForm((s) => ({ ...s, firstName: e.target.value }))}
              placeholder="First name"
              aria-label="firstName"
            />
            <input
              className={authInput}
              value={createForm.lastName}
              onChange={(e) => setCreateForm((s) => ({ ...s, lastName: e.target.value }))}
              placeholder="Last name"
              aria-label="lastName"
            />
            <input
              className={authInput}
              value={createForm.username}
              onChange={(e) => setCreateForm((s) => ({ ...s, username: e.target.value }))}
              placeholder="Username"
              aria-label="username"
            />
            <input
              className={authInput}
              value={createForm.email}
              onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
              placeholder="Email"
              aria-label="email"
            />
            <input
              className={authInput}
              value={createForm.password}
              onChange={(e) => setCreateForm((s) => ({ ...s, password: e.target.value }))}
              placeholder="Password"
              aria-label="password"
              type="password"
            />
            <input
              className={authInput}
              value={createForm.department}
              onChange={(e) => setCreateForm((s) => ({ ...s, department: e.target.value }))}
              placeholder="Department (optional)"
              aria-label="department"
            />
            <ToolbarSelectDropdown
              value={createForm.roleName}
              onChange={(v) => setCreateForm((s) => ({ ...s, roleName: v }))}
              options={CREATE_USER_ROLE_OPTIONS}
              ariaLabel="Role"
              listAriaLabel="User role"
              placeholderLabel="Role"
              className="w-full min-w-0"
              triggerMinWidthClass="w-full min-w-0"
            />

            <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
              <Button
                type="submit"
                variant="primary"
                loading={createUserMutation.isPending}
                className="!h-10 !rounded-lg !px-3 !py-0 !text-xs font-semibold"
              >
                Create User
              </Button>
            </div>

            {createNotice.message ? (
              <div className="md:col-span-2 space-y-3">
                <Alert variant={createNotice.variant || 'info'}>{createNotice.message}</Alert>
                {createNotice.variant === 'success' ? (
                  <Button type="button" variant="ghost" onClick={() => setActiveTab('users')}>
                    Go to User Management
                  </Button>
                ) : null}
              </div>
            ) : null}
          </form>
        </section>
      ) : null}

      {activeTab === 'audit' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Audit Log</h2>
          <p className={`${appMutedText} mb-4`}>
            Every access decision is logged in real time. Use filters to narrow results; newest events appear
            first.
          </p>

          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
              Decision
              <ToolbarSelectDropdown
                value={auditDecisionFilter}
                onChange={setAuditDecisionFilter}
                options={AUDIT_DECISION_SELECT_OPTIONS}
                ariaLabel="Filter by decision"
                listAriaLabel="Decision filter"
                className="w-full min-w-0"
                triggerMinWidthClass="w-full min-w-[8.5rem] sm:min-w-[9.5rem]"
              />
            </label>
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
              Action
              <ToolbarSelectDropdown
                value={auditActionFilter}
                onChange={setAuditActionFilter}
                options={AUDIT_ACTION_SELECT_OPTIONS}
                ariaLabel="Filter by action"
                listAriaLabel="Action filter"
                className="w-full min-w-0"
                triggerMinWidthClass="w-full min-w-[10rem] sm:min-w-[11rem]"
              />
            </label>
            <label className="flex min-w-0 max-w-full flex-col gap-1 text-xs font-medium text-ds-text-muted dark:text-slate-400">
              Date
              <ToolbarSelectDropdown
                value={auditDateRange}
                onChange={setAuditDateRange}
                options={AUDIT_DATE_SELECT_OPTIONS}
                ariaLabel="Filter by date range"
                listAriaLabel="Date range filter"
                className="w-full min-w-0"
                triggerMinWidthClass="w-full min-w-[8.5rem] sm:min-w-[9.5rem]"
              />
            </label>
          </div>

          <div className="mt-4">
            {auditTableQuery.isLoading ? (
              <div className="flex items-center gap-2">
                <Spinner size="sm" />
                <span className={appMutedText}>Loading audit logs…</span>
              </div>
            ) : null}

            {auditTableQuery.isError ? (
              <Alert variant="error" className="mt-1">
                {auditTableQuery.error?.response?.data?.error ||
                  auditTableQuery.error?.message ||
                  'Failed to load audit logs. Check that you are signed in as an admin and the API is reachable.'}
              </Alert>
            ) : null}

            {!auditTableQuery.isLoading && !auditTableQuery.isError ? (
              <p className={`${appMutedText} mb-3`}>
                Showing {auditLogs.length} of {auditTotal} event{auditTotal === 1 ? '' : 's'}
              </p>
            ) : null}

            {!auditTableQuery.isLoading && !auditTableQuery.isError && auditLogs.length === 0 ? (
              <Alert variant="info">
                No audit events match these filters. Events appear when users sign in, access EHR data, trigger
                lockouts, use break-glass, and when admins act on accounts.
              </Alert>
            ) : null}

            {!auditTableQuery.isLoading && !auditTableQuery.isError && auditLogs.length > 0 ? (
              <div className="mt-1 overflow-x-auto rounded-lg border border-ds-border/70 dark:border-slate-700/80">
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-ds-border/80 bg-ds-surface/90 dark:border-slate-700 dark:bg-slate-900/80">
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Timestamp</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>User</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Action</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Resource</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>Resource ID</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold text-right`}>Decision</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold text-right`}>Trust</th>
                      <th className={`${appDataLabel} px-3 py-2.5 font-semibold`}>IP address</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLogs.map((log, idx) => (
                      <tr
                        key={log?.id ?? `${log?.timestamp}-${idx}`}
                        className="border-b border-ds-border/50 last:border-0 dark:border-slate-800/80"
                      >
                        <td className={`${appDataValue} px-3 py-2 align-top`}>{formatTimestamp(log?.timestamp)}</td>
                        <td className={`${appDataValue} px-3 py-2 align-top`}>{log?.userEmail ?? '—'}</td>
                        <td className={`${appDataValue} px-3 py-2 align-top`}>{formatAction(log?.action)}</td>
                        <td className={`${appDataValue} px-3 py-2 align-top`}>{resourceCategory(log?.action)}</td>
                        <td className="px-3 py-2 align-top font-mono text-xs text-ds-text dark:text-slate-200">
                          {displayResourceId(log?.resourceId)}
                        </td>
                        <td className="px-3 py-2 align-top text-right">
                          <span className={decisionClass(log?.decision)}>{decisionLabel(log?.decision)}</span>
                        </td>
                        <td className={`${appDataValue} px-3 py-2 align-top text-right tabular-nums`}>
                          {log?.trustScore != null ? String(log.trustScore) : '—'}
                        </td>
                        <td className="px-3 py-2 align-top font-mono text-xs text-ds-text-muted dark:text-slate-400">
                          {log?.ipAddress ?? '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>

                {(() => {
                  const totalPages = Math.max(1, Math.ceil(auditTotal / AUDIT_PAGE_SIZE));
                  const pageSafe = Math.min(Math.max(1, auditPage), totalPages);
                  return (
                    <div className="px-3 py-2.5 flex items-center justify-end gap-2 border-t border-ds-border/60 dark:border-slate-800/80">
                      <span className={`${appMutedText} text-xs`}>
                        Page {pageSafe} of {totalPages}
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                        disabled={pageSafe <= 1 || auditTableQuery.isLoading}
                        onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                      >
                        Prev
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                        disabled={pageSafe >= totalPages || auditTableQuery.isLoading}
                        onClick={() => setAuditPage((p) => Math.min(totalPages, p + 1))}
                      >
                        Next
                      </Button>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'alerts' ? (
        <section className={appPanelCard}>
          <h2 className={appSectionHeading}>Security Alerts</h2>
          <p className={`${appMutedText} mb-4`}>Security-relevant items from the latest feed.</p>

          {auditSecurityFeedQuery.isError ? (
            <Alert variant="error" className="mt-3">
              {auditSecurityFeedQuery.error?.response?.data?.error ||
                auditSecurityFeedQuery.error?.message ||
                'Failed to load events. Fix the audit log request to see alerts here.'}
            </Alert>
          ) : null}

          {auditSecurityFeedQuery.isLoading ? (
            <div className="mt-4 flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading security feed…</span>
            </div>
          ) : null}

          {!auditSecurityFeedQuery.isLoading &&
          !auditSecurityFeedQuery.isError &&
          securityAlertCandidates.length === 0 ? (
            <p className={`${appMutedText} mt-4`}>
              No security alerts at this time. System is operating normally.
            </p>
          ) : null}

          {!auditSecurityFeedQuery.isLoading && !auditSecurityFeedQuery.isError && breakGlassReviewLog ? (
            <Card
              padding="p-4"
              className="mt-4 border-amber-200/80 bg-amber-50/40 dark:border-amber-900/50 dark:bg-amber-950/25"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <p className="text-sm font-semibold text-ds-text dark:text-white">Break-glass review</p>
                <Button type="button" variant="ghost" className="shrink-0 px-2 py-1 text-xs" onClick={() => setBreakGlassReviewLog(null)}>
                  Close
                </Button>
              </div>
              <dl className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className={appDataLabel}>Who (doctor)</dt>
                  <dd className={appDataValue}>{breakGlassReviewLog.userEmail ?? '—'}</dd>
                </div>
                <div>
                  <dt className={appDataLabel}>Patient</dt>
                  <dd className="font-mono text-sm text-ds-text dark:text-slate-200">
                    {breakGlassReviewLog.resourceId ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className={appDataLabel}>When</dt>
                  <dd className={appDataValue}>{formatTimestamp(breakGlassReviewLog.timestamp)}</dd>
                </div>
                <div>
                  <dt className={appDataLabel}>IP</dt>
                  <dd className="font-mono text-xs text-ds-text-muted dark:text-slate-400">
                    {breakGlassReviewLog.ipAddress ?? '—'}
                  </dd>
                </div>
              </dl>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-xs"
                  onClick={() => {
                    if (breakGlassReviewLog?.id) {
                      setReviewedBreakGlassIds((prev) =>
                        prev.includes(breakGlassReviewLog.id) ? prev : [...prev, breakGlassReviewLog.id],
                      );
                    }
                    setSecurityAlertsLastCheckedAt(Date.now());
                    setBreakGlassReviewLog(null);
                  }}
                >
                  Mark reviewed
                </Button>
              </div>
            </Card>
          ) : null}

          {!auditSecurityFeedQuery.isLoading && !auditSecurityFeedQuery.isError && securityAlertsDisplayed.length > 0 ? (
            <div className="mt-4">
              <ul className="max-h-[520px] overflow-y-auto space-y-3 pr-1">
                {securityAlertsDisplayed.map((row) => {
                if (row.kind === 'ACCOUNT_LOCKED') {
                  const log = row.log;
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-red-200/80 bg-red-50/35 p-4 dark:border-red-900/45 dark:bg-red-950/20"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={appDecisionDeny}>ACCOUNT_LOCKED</span>
                          <span className={`${appMutedText} text-xs`}>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <p className={`${appDataValue} text-sm`}>
                          {row.userEmail} locked after {LOCKOUT_FAILED_ATTEMPTS} failed login attempts
                        </p>
                      </div>
                    </li>
                  );
                }

                if (row.kind === 'BREAK_GLASS') {
                  const log = row.log;
                  const patientId = log.resourceId ?? '—';
                  return (
                    <li
                      key={row.id}
                      className="flex flex-col gap-2 rounded-lg border border-amber-200/80 bg-amber-50/30 p-4 dark:border-amber-900/45 dark:bg-amber-950/20 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={appDecisionStepUp}>BREAK_GLASS</span>
                          <span className={`${appMutedText} text-xs`}>{formatTimestamp(log.timestamp)}</span>
                        </div>
                        <p className={`${appDataValue} text-sm`}>
                          Dr. {row.userEmail} invoked emergency access on patient {patientId}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        className="shrink-0 border border-amber-300/80 px-3 py-1.5 text-xs text-amber-900 hover:bg-amber-100/80 dark:border-amber-800 dark:text-amber-100 dark:hover:bg-amber-950/50"
                        onClick={() => setBreakGlassReviewLog(log)}
                      >
                        Review
                      </Button>
                    </li>
                  );
                }

                if (row.kind === 'LOGIN_FAILED_GROUP') {
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-red-200/80 bg-red-50/35 p-4 dark:border-red-900/45 dark:bg-red-950/20"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={appDecisionDeny}>LOGIN_FAILED</span>
                        <span
                          className="inline-flex items-center rounded-full bg-red-600/90 px-2 py-0.5 text-xs font-semibold text-white dark:bg-red-800"
                        >
                          {row.count} attempt{row.count === 1 ? '' : 's'}
                        </span>
                        <span className={`${appMutedText} text-xs`}>{formatTimestamp(row.latest.timestamp)}</span>
                      </div>
                      <p className={`${appDataValue} mt-2 text-sm`}>
                        {row.count} failed login attempt{row.count === 1 ? '' : 's'} for {row.userEmail} in the last 15
                        minutes
                      </p>
                    </li>
                  );
                }

                if (row.kind === 'STEP_UP') {
                  const log = row.log;
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-amber-200/80 bg-amber-50/30 p-4 dark:border-amber-900/45 dark:bg-amber-950/20"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={appDecisionStepUp}>STEP_UP</span>
                        <span className={`${appMutedText} text-xs`}>{formatTimestamp(log.timestamp)}</span>
                      </div>
                      <p className={`${appDataValue} mt-2 text-sm`}>{row.userEmail} required step-up authentication</p>
                      <p className={`${appMutedText} mt-1 text-sm`}>Low trust score — device not recognized</p>
                    </li>
                  );
                }

                if (row.kind === 'ACCOUNT_UNLOCKED') {
                  const log = row.log;
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border border-emerald-200/80 bg-emerald-50/35 p-4 dark:border-emerald-900/45 dark:bg-emerald-950/20"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={appDecisionAllow}>ACCOUNT_UNLOCKED</span>
                        <span className={`${appMutedText} text-xs`}>{formatTimestamp(log.timestamp)}</span>
                      </div>
                      <p className={`${appDataValue} mt-2 text-sm`}>{row.targetEmail} account restored by administrator</p>
                    </li>
                  );
                }

                return null;
                })}
              </ul>

              <div className="mt-3 flex items-center justify-end gap-2">
                <span className={`${appMutedText} text-xs`}>
                  Page {securityPageSafe} of {securityTotalPages}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={securityPageSafe <= 1}
                  onClick={() => setSecurityPage((p) => Math.max(1, p - 1))}
                >
                  Prev
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="!h-7 !min-h-[1.75rem] !rounded-md !px-2 !py-0 !text-xs"
                  disabled={securityPageSafe >= securityTotalPages}
                  onClick={() => setSecurityPage((p) => Math.min(securityTotalPages, p + 1))}
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

