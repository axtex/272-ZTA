import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

function InfoCard({ title, children }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
        {title}
      </h2>
      <p className="text-sm text-slate-600 dark:text-slate-400">{children}</p>
    </div>
  );
}

function normalizeRole(role) {
  return String(role ?? '').toLowerCase();
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const roleKey = normalizeRole(user?.role);

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950">
      <header className="border-b border-slate-200 bg-white px-4 py-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-slate-900 dark:text-white sm:text-2xl">
              Welcome, {user?.email}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center rounded-full bg-slate-200 px-3 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-700 dark:text-slate-100">
                {user?.role ?? 'Unknown'}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Link
              to="/mfa-setup"
              className="rounded-lg border border-slate-300 bg-transparent px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Set up 2FA
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {roleKey === 'doctor' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <InfoCard title="My Patients">
                Patient list coming soon
              </InfoCard>
              <InfoCard title="EHR Access">Placeholder</InfoCard>
              <InfoCard title="Upload Medical Files">Placeholder</InfoCard>
            </div>
            <button
              type="button"
              className="w-full rounded-lg border-2 border-red-600 bg-transparent px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-50 dark:border-red-500 dark:text-red-400 dark:hover:bg-red-950/40 md:max-w-md"
            >
              Break-glass Emergency Access
            </button>
          </div>
        )}

        {roleKey === 'nurse' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="My Ward">Placeholder</InfoCard>
            <InfoCard title="Patient Vitals">Placeholder</InfoCard>
          </div>
        )}

        {roleKey === 'admin' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="User Management">Placeholder</InfoCard>
            <InfoCard title="Audit Logs">Placeholder</InfoCard>
            <InfoCard title="Security Alerts">Placeholder</InfoCard>
          </div>
        )}

        {roleKey === 'patient' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <InfoCard title="My Health Records">Placeholder</InfoCard>
            <InfoCard title="My Documents">Placeholder</InfoCard>
          </div>
        )}

        {!['doctor', 'nurse', 'admin', 'patient'].includes(roleKey) && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            No role-specific dashboard for role &quot;{user?.role}&quot;. Contact an administrator.
          </div>
        )}
      </main>
    </div>
  );
}
