import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button } from '../components/ui/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import DoctorDashboard from '../components/dashboard/DoctorDashboard.jsx';
import NurseDashboard from '../components/dashboard/NurseDashboard.jsx';
import AdminDashboard from '../components/dashboard/AdminDashboard.jsx';
import PatientDashboard from '../components/dashboard/PatientDashboard.jsx';
import {
  appHeaderBar,
  appOutlineLink,
  appPageBg,
  appPanelCard,
} from '../design-system/patterns.js';

function InfoCard({ title, children }) {
  return (
    <div className={appPanelCard}>
      <h2 className="mb-2 text-lg font-semibold tracking-tight text-ds-text dark:text-white">
        {title}
      </h2>
      <p className="text-sm leading-relaxed text-ds-text-muted dark:text-slate-400">
        {children}
      </p>
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
    <div className={appPageBg}>
      <header className={appHeaderBar}>
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-ds-text dark:text-white sm:text-2xl">
              Welcome, {user?.email}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="soft">{user?.role ?? 'Unknown'}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <Link to="/mfa-setup" className={appOutlineLink}>
              Set up 2FA
            </Link>
            <Button type="button" variant="secondary" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        {roleKey === 'doctor' && <DoctorDashboard />}

        {roleKey === 'nurse' && <NurseDashboard />}

        {roleKey === 'admin' && <AdminDashboard />}

        {roleKey === 'patient' && <PatientDashboard />}

        {!['doctor', 'nurse', 'admin', 'patient'].includes(roleKey) && (
          <div className="rounded-ds-card border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100">
            No role-specific dashboard for role &quot;{user?.role}&quot;. Contact an administrator.
          </div>
        )}
      </main>
    </div>
  );
}
