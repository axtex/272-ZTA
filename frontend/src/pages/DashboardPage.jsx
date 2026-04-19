import { useNavigate } from 'react-router-dom';
import { Badge } from '../components/ui/index.js';
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
  appShellInner,
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

function welcomeFirstName(user) {
  const fromToken = user?.firstName;
  if (fromToken && String(fromToken).trim()) return String(fromToken).trim();
  const email = user?.email;
  if (!email || typeof email !== 'string' || !email.includes('@')) return 'there';
  const local = email.split('@')[0];
  const token = local.split(/[._-]/)[0] || local;
  if (!token) return 'there';
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
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
        <div className={`${appShellInner} flex flex-wrap items-start justify-between gap-4`}>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-semibold text-ds-text dark:text-white sm:text-2xl">
              Welcome, {welcomeFirstName(user)}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="soft">{user?.role ?? 'Unknown'}</Badge>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleLogout}
              className={appOutlineLink}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className={`${appShellInner} py-8`}>
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
