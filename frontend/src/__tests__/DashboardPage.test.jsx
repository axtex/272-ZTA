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
      user: { email: 'doc@hospital.com', role: 'doctor' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByText('My Patients')).toBeInTheDocument();
    expect(screen.getByText('EHR Quick View')).toBeInTheDocument();
    expect(screen.getByText('Break-glass Emergency Access')).toBeInTheDocument();
  });

  it('shows nurse-specific cards when role is nurse', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'nurse@hospital.com', role: 'Nurse' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByText('Patient Vitals')).toBeInTheDocument();
    expect(screen.getByText('Update Vitals')).toBeInTheDocument();
  });

  it('shows admin-specific cards when role is admin', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'admin@hospital.com', role: 'Admin' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByText('User Management')).toBeInTheDocument();
    expect(screen.getByText('Audit Log')).toBeInTheDocument();
    expect(screen.getByText('Security Alerts')).toBeInTheDocument();
  });

  it('shows patient-specific cards when role is patient', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { email: 'pat@hospital.com', role: 'patient' },
      logout: vi.fn().mockResolvedValue(undefined),
    });
    renderDashboard();
    expect(screen.getByText('My Health Records')).toBeInTheDocument();
    expect(screen.getByText('My Documents')).toBeInTheDocument();
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
