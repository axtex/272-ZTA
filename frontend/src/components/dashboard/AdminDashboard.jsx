import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

import { Alert, Badge, Button, Spinner } from '../ui/index.js';
import {
  appDataLabel,
  appDataRow,
  appDataValue,
  appDecisionAllow,
  appDecisionDeny,
  appDecisionStepUp,
  appMutedText,
  appPanelCard,
  appSectionHeading,
  authInput,
} from '../../design-system/patterns.js';
import { createUser, deactivateUser, getAuditLogs, getUsers } from '../../lib/api.js';

function statusBadge(status) {
  const s = String(status ?? '').toUpperCase();
  if (s === 'ACTIVE') {
    return (
      <Badge
        variant="soft"
        className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
      >
        ACTIVE
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="border-ds-border text-ds-text-muted shadow-none hover:bg-transparent dark:border-slate-700 dark:text-slate-400"
    >
      INACTIVE
    </Badge>
  );
}

function decisionClass(decision) {
  const d = String(decision ?? '').toUpperCase();
  if (d === 'ALLOW') return appDecisionAllow;
  if (d === 'DENY') return appDecisionDeny;
  if (d === 'STEP_UP') return appDecisionStepUp;
  return 'inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 dark:bg-slate-900/50 dark:text-slate-200';
}

function formatTimestamp(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString()}`;
}

export default function AdminDashboard() {
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    username: '',
    email: '',
    password: '',
    roleName: 'doctor',
  });
  const [createNotice, setCreateNotice] = useState({ variant: '', message: '' });

  const usersQuery = useQuery({
    queryKey: ['adminUsers'],
    queryFn: () => getUsers(),
  });

  const users = useMemo(() => {
    return Array.isArray(usersQuery.data) ? usersQuery.data : [];
  }, [usersQuery.data]);

  const createUserMutation = useMutation({
    mutationFn: (data) => createUser(data),
    onSuccess: () => {
      setCreateNotice({ variant: 'success', message: 'User created successfully.' });
      setCreateForm({ username: '', email: '', password: '', roleName: 'doctor' });
      usersQuery.refetch();
    },
    onError: (err) => {
      setCreateNotice({
        variant: 'error',
        message: err?.response?.data?.error || err?.message || 'Failed to create user',
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: (userId) => deactivateUser(userId),
    onSuccess: () => {
      usersQuery.refetch();
    },
  });

  const auditQuery = useQuery({
    queryKey: ['auditLogs'],
    queryFn: () => getAuditLogs(),
  });

  const auditLogs = useMemo(() => {
    const logs = Array.isArray(auditQuery.data) ? auditQuery.data : [];
    return logs
      .slice()
      .sort((a, b) => new Date(b?.timestamp ?? 0) - new Date(a?.timestamp ?? 0))
      .slice(0, 20);
  }, [auditQuery.data]);

  function handleCreateSubmit(e) {
    e.preventDefault();
    setCreateNotice({ variant: '', message: '' });
    createUserMutation.mutate({
      username: String(createForm.username ?? '').trim(),
      email: String(createForm.email ?? '').trim(),
      password: String(createForm.password ?? ''),
      roleName: createForm.roleName,
    });
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <section className={`${appPanelCard} md:col-span-2`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className={appSectionHeading}>User Management</h2>
          <Button type="button" variant="secondary" onClick={() => setShowCreate((v) => !v)}>
            Add User
          </Button>
        </div>

        {showCreate ? (
          <form className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2" onSubmit={handleCreateSubmit}>
            <input
              className={authInput}
              value={createForm.username}
              onChange={(e) => setCreateForm((s) => ({ ...s, username: e.target.value }))}
              placeholder="username"
              aria-label="username"
            />
            <input
              className={authInput}
              value={createForm.email}
              onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
              placeholder="email"
              aria-label="email"
            />
            <input
              className={authInput}
              value={createForm.password}
              onChange={(e) => setCreateForm((s) => ({ ...s, password: e.target.value }))}
              placeholder="password"
              aria-label="password"
              type="password"
            />
            <select
              className={authInput}
              value={createForm.roleName}
              onChange={(e) => setCreateForm((s) => ({ ...s, roleName: e.target.value }))}
              aria-label="roleName"
            >
              <option value="doctor">Doctor</option>
              <option value="nurse">Nurse</option>
              <option value="admin">Admin</option>
              <option value="patient">Patient</option>
            </select>

            <div className="md:col-span-2 flex flex-wrap items-center justify-end gap-2">
              <Button type="submit" variant="primary" loading={createUserMutation.isPending}>
                Create User
              </Button>
            </div>

            {createNotice.message ? (
              <div className="md:col-span-2">
                <Alert variant={createNotice.variant || 'info'}>{createNotice.message}</Alert>
              </div>
            ) : null}
          </form>
        ) : null}

        <div className="mt-5">
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

          {!usersQuery.isLoading && !usersQuery.isError && users.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[640px]">
                <div className={`${appDataRow} font-semibold`}>
                  <div className={appDataLabel}>Email</div>
                  <div className={`${appDataLabel} text-right`}>Role</div>
                  <div className={`${appDataLabel} text-right`}>Status</div>
                  <div className={`${appDataLabel} text-right`}>Actions</div>
                </div>
                {users.map((u) => {
                  const status = String(u?.status ?? 'ACTIVE').toUpperCase();
                  const canDeactivate = status === 'ACTIVE';
                  return (
                    <div key={u?.id ?? u?.email} className={appDataRow}>
                      <div className={appDataValue}>{u?.email ?? '—'}</div>
                      <div className={`${appDataValue} text-right`}>{u?.role?.roleName ?? '—'}</div>
                      <div className="flex justify-end">{statusBadge(status)}</div>
                      <div className="flex justify-end">
                        {canDeactivate ? (
                          <Button
                            type="button"
                            variant="ghost"
                            className="px-2 py-1 text-xs"
                            loading={deactivateMutation.isPending && deactivateMutation.variables === u?.id}
                            spinner="dark"
                            onClick={() => deactivateMutation.mutate(u?.id)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <span className={appMutedText}>—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={appPanelCard}>
        <h2 className={appSectionHeading}>Audit Log</h2>

        <div className="mt-4">
          {auditQuery.isLoading ? (
            <div className="flex items-center gap-2">
              <Spinner size="sm" />
              <span className={appMutedText}>Loading audit logs…</span>
            </div>
          ) : null}

          {!auditQuery.isLoading && Array.isArray(auditQuery.data) && auditQuery.data.length === 0 ? (
            <Alert variant="info">
              Audit log endpoint coming soon. Logs are written to the database and visible in Prisma Studio.
            </Alert>
          ) : null}

          {!auditQuery.isLoading && auditLogs.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <div className="min-w-[720px]">
                <div className={`${appDataRow} font-semibold`}>
                  <div className={appDataLabel}>Timestamp</div>
                  <div className={appDataLabel}>User</div>
                  <div className={appDataLabel}>Resource</div>
                  <div className={appDataLabel}>Action</div>
                  <div className={`${appDataLabel} text-right`}>Decision</div>
                </div>
                {auditLogs.map((log, idx) => (
                  <div key={log?.id ?? `${log?.timestamp}-${idx}`} className={appDataRow}>
                    <div className={appDataValue}>{formatTimestamp(log?.timestamp)}</div>
                    <div className={appDataValue}>{log?.userEmail ?? log?.userId ?? '—'}</div>
                    <div className={appDataValue}>{log?.resourceId ?? '—'}</div>
                    <div className={appDataValue}>{log?.action ?? '—'}</div>
                    <div className="flex justify-end">
                      <span className={decisionClass(log?.decision)}>{String(log?.decision ?? '—')}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      <section className={appPanelCard}>
        <h2 className={appSectionHeading}>Security Alerts</h2>
        <p className={`${appMutedText} mt-3`}>
          Real-time alerts will appear here. Break-glass access events and anomalies are logged automatically.
        </p>

        <div className="mt-4">
          <div className={appDataRow}>
            <div className={appDataLabel}>Example</div>
            <div className="flex items-center gap-2">
              <span className={appDecisionDeny}>DENY</span>
              <span className={appDataValue}>Unusual access attempt flagged</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

