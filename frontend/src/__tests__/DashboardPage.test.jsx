import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useAuth } from '../context/AuthContext.jsx';
import DashboardPage from '../pages/DashboardPage.jsx';
import { renderWithProviders } from '../test/utils.jsx';

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: vi.fn(),
}));

function renderDashboard() {
  const router = createMemoryRouter(
    [
      { path: '/dashboard', element: <DashboardPage /> },
      { path: '/login', element: <div>Login page</div> },
    ],
    { initialEntries: ['/dashboard'] },
  );
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}

describe('DashboardPage', () => {
  beforeEach(() => {
    vi.mocked(useAuth).mockReset();
  });

  it('shows doctor-specific cards when role is doctor', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'doc@hospital.com', role: 'doctor', sub: 'doc-id' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByRole('heading', { name: 'System Overview' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'My Patients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'EHR Records' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /break-glass access/i })).toBeInTheDocument();
  });

  it('shows doctor header with department line, Doctor badge, and logout', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'doc@hospital.com',
        role: 'doctor',
        firstName: 'Alex',
        department: 'Cardiology',
      },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByRole('heading', { name: /welcome, alex/i })).toBeInTheDocument();
    expect(screen.getByText('Cardiology')).toBeInTheDocument();
    expect(screen.getByText('Department:')).toBeInTheDocument();
    expect(screen.getByText('Doctor')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('shows nurse-specific dashboard when role is nurse', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'nurse@hospital.com', role: 'Nurse' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByText('System Overview')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'My Patients' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update Vitals' })).toBeInTheDocument();
  });

  it('shows nurse header with department line, Nurse badge, and logout', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'nurse@hospital.com',
        role: 'Nurse',
        firstName: 'Sam',
        department: 'ICU',
      },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByRole('heading', { name: /welcome, sam/i })).toBeInTheDocument();
    expect(screen.getByText('ICU')).toBeInTheDocument();
    expect(screen.getByText('Department:')).toBeInTheDocument();
    expect(screen.getByText('Nurse', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
  });

  it('shows admin-specific cards when role is admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'admin@hospital.com', role: 'Admin' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getAllByText('User Management').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Audit Log').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Security Alerts').length).toBeGreaterThan(0);
  });

  it('shows patient-specific cards when role is patient', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'pat@hospital.com',
        role: 'patient',
        firstName: 'Jordan',
        assignedDoctorName: null,
        mfaEnabled: false,
      },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(
      screen.getByRole('heading', { name: /welcome,\s*jordan/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Assigned Doctor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Unassigned').length).toBeGreaterThan(0);
    expect(screen.getByText('Patient', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument();
    expect(screen.getByText('System Overview')).toBeInTheDocument();
    expect(screen.getByText('My Health Summary')).toBeInTheDocument();
    expect(screen.getByText('My Medical Records')).toBeInTheDocument();
    expect(screen.getAllByText('My Files').length).toBeGreaterThan(0);
  });

  it('shows assigned doctor name in patient overview when set', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: {
        email: 'pat@hospital.com',
        role: 'patient',
        firstName: 'Sam',
        assignedDoctorName: 'Dr. Jane Smith',
        mfaEnabled: false,
      },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getAllByText('Dr. Jane Smith').length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText('Unassigned')).not.toBeInTheDocument();
  });

  it('calls logout and redirects to /login when logout button clicked', async () => {
    const user = userEvent.setup();
    const logout = vi.fn().mockResolvedValue(undefined);
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'any@hospital.com', role: 'doctor' },
      logout,
    });
    const router = renderDashboard();
    await user.click(screen.getByRole('button', { name: /logout/i }));
    await waitFor(() => {
      expect(logout).toHaveBeenCalled();
      expect(router.state.location.pathname).toBe('/login');
    });
  });
});
