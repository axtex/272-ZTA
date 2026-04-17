import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import MfaVerifyPage from '../pages/MfaVerifyPage.jsx';
import { renderWithProviders } from '../test/utils.jsx';

const { mockVerifyMfa } = vi.hoisted(() => ({
  mockVerifyMfa: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    verifyMfa: mockVerifyMfa,
  }),
}));

function renderMfaVerify(entry) {
  const router = createMemoryRouter(
    [
      { path: '/mfa-verify', element: <MfaVerifyPage /> },
      { path: '/login', element: <div>Login page</div> },
      { path: '/dashboard', element: <div>Dashboard home</div> },
    ],
    { initialEntries: [entry] },
  );
  renderWithProviders(<RouterProvider router={router} />);
  return router;
}

describe('MfaVerifyPage', () => {
  beforeEach(() => {
    mockVerifyMfa.mockReset();
  });

  it('redirects to /login if no tempToken in location state', async () => {
    const router = renderMfaVerify('/mfa-verify');
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/login');
    });
  });

  it('renders 6-digit code input', () => {
    renderMfaVerify({
      pathname: '/mfa-verify',
      state: { tempToken: 'temp-token' },
    });
    const input = screen.getByLabelText(/authentication code/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute('maxLength', '6');
  });

  it('calls verifyMfa with tempToken and entered code on submit', async () => {
    const user = userEvent.setup();
    mockVerifyMfa.mockResolvedValueOnce(undefined);
    renderMfaVerify({
      pathname: '/mfa-verify',
      state: { tempToken: 'my-temp-token' },
    });
    await user.type(screen.getByLabelText(/authentication code/i), '123456');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      expect(mockVerifyMfa).toHaveBeenCalledWith('my-temp-token', '123456');
    });
  });

  it('shows error message on failed verification', async () => {
    const user = userEvent.setup();
    mockVerifyMfa.mockRejectedValueOnce({
      response: { data: { error: 'Invalid MFA code' } },
    });
    renderMfaVerify({
      pathname: '/mfa-verify',
      state: { tempToken: 'temp' },
    });
    await user.type(screen.getByLabelText(/authentication code/i), '000000');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    expect(await screen.findByText('Invalid MFA code')).toBeInTheDocument();
  });

  it('navigates to /dashboard on success', async () => {
    const user = userEvent.setup();
    mockVerifyMfa.mockResolvedValueOnce(undefined);
    const router = renderMfaVerify({
      pathname: '/mfa-verify',
      state: { tempToken: 'temp' },
    });
    await user.type(screen.getByLabelText(/authentication code/i), '654321');
    await user.click(screen.getByRole('button', { name: /verify/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });
});
