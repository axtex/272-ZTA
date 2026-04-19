
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import api, {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setTokens,
} from '../lib/axios';

const AuthContext = createContext(null);

function decodeAccessTokenPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  const segment = parts[1];
  let base64 = segment.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  try {
    const json = atob(base64);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function userFromPayload(payload) {
  if (!payload?.userId) return null;
  return {
    id: payload.userId,
    email: payload.email,
    role: payload.role,
    firstName: payload.firstName ?? null,
    mfaEnabled: payload.mfaEnabled ?? false,
  };
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  const syncUserFromStorage = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      setUser(null);
      return;
    }
    const payload = decodeAccessTokenPayload(token);
    setUser(userFromPayload(payload));
  }, []);

  useEffect(() => {
    syncUserFromStorage();
  }, [syncUserFromStorage]);

  const login = useCallback(async (email, password, timezone) => {
    const { data } = await api.post('/auth/login', {
      email,
      password,
      timezone,
    });
    if (data.mfaRequired) {
      return { mfaRequired: true, tempToken: data.tempToken };
    }
    setTokens(data.accessToken, data.refreshToken);
    const payload = decodeAccessTokenPayload(data.accessToken);
    const userObj = userFromPayload(payload);
    setUser(userObj);
    return { mfaRequired: false, mfaEnabled: userObj?.mfaEnabled ?? false };
  }, []);

  const verifyMfa = useCallback(async (tempToken, code) => {
    const { data } = await api.post('/auth/mfa/validate', { tempToken, code });
    setTokens(data.accessToken, data.refreshToken);
    const payload = decodeAccessTokenPayload(data.accessToken);
    const userObj = userFromPayload(payload);
    setUser(userObj);
    return { ...data, mfaEnabled: userObj?.mfaEnabled ?? false };
  }, []);

  const setupMfa = useCallback(async () => {
    const { data } = await api.post('/auth/mfa/setup');
    return { secret: data.secret, qrCode: data.qrCode };
  }, []);

  const confirmMfaSetup = useCallback(async (code) => {
    await api.post('/auth/mfa/verify', { code });
    return { success: true };
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      if (refreshToken) {
        await api.post('/auth/logout', { refreshToken });
      }
    } finally {
      clearTokens();
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      login,
      verifyMfa,
      setupMfa,
      confirmMfaSetup,
      logout,
    }),
    [user, login, verifyMfa, setupMfa, confirmMfaSetup, logout],
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}