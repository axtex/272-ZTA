import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LoginPage from '../pages/LoginPage.jsx';

const { mockLoginFn } = vi.hoisted(() => ({
  mockLoginFn: vi.fn(),
}));

vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => ({
    login: mockLoginFn,
  }),
}));

function renderLogin(initialEntry = '/login') {
  const router = createMemoryRouter(
    [
      { path: '/login', element: <LoginPage /> },
      { path: '/mfa-verify', element: <div>MFA verify</div> },
      { path: '/dashboard', element: <div>Dashboard home</div> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('LoginPage', () => {
  beforeEach(() => {
    mockLoginFn.mockReset();
  });

  it('renders email and password inputs', () => {
    renderLogin();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });

  it('renders sign in button', () => {
    renderLogin();
    expect(
      screen.getByRole('button', { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it('shows validation error if email is invalid on submit', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'not-an-email');
    await user.type(screen.getByLabelText(/password/i), 'secret12');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument();
  });

  it('shows validation error if password is empty on submit', async () => {
    const user = userEvent.setup();
    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'nurse@hospital.com');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText(/password is required/i)).toBeInTheDocument();
  });

  it('calls login() with correct arguments on valid submit', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockResolvedValueOnce({ mfaRequired: false });
    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'nurse@hospital.com');
    await user.type(screen.getByLabelText(/password/i), 'secret12');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(mockLoginFn).toHaveBeenCalledTimes(1);
    });
    expect(mockLoginFn).toHaveBeenCalledWith(
      'nurse@hospital.com',
      'secret12',
      expect.any(String),
    );
  });

  it('shows error banner when login returns an error', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockRejectedValueOnce({
      response: { data: { error: 'Invalid credentials' } },
    });
    renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'nurse@hospital.com');
    await user.type(screen.getByLabelText(/password/i), 'wrongpass');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
  });

  it('navigates to /mfa-verify when mfaRequired is true', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockResolvedValueOnce({
      mfaRequired: true,
      tempToken: 'temp-jwt',
    });
    const router = renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'doc@hospital.com');
    await user.type(screen.getByLabelText(/password/i), 'secret12');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/mfa-verify');
      expect(router.state.location.state).toEqual({ tempToken: 'temp-jwt' });
    });
  });

  it('navigates to /dashboard when mfaRequired is false', async () => {
    const user = userEvent.setup();
    mockLoginFn.mockResolvedValueOnce({ mfaRequired: false });
    const router = renderLogin();
    await user.type(screen.getByLabelText(/email/i), 'doc@hospital.com');
    await user.type(screen.getByLabelText(/password/i), 'secret12');
    await user.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => {
      expect(router.state.location.pathname).toBe('/dashboard');
    });
  });
});
