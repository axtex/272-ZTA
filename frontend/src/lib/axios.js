import axios from 'axios';

const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export function getAccessToken() {
  return localStorage.getItem('accessToken');
}

export function getRefreshToken() {
  return localStorage.getItem('refreshToken');
}

export function setTokens(accessToken, refreshToken) {
  localStorage.setItem('accessToken', accessToken);
  localStorage.setItem('refreshToken', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('accessToken');
  localStorage.removeItem('refreshToken');
}

const api = axios.create({
  baseURL,
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    const status = error.response?.status;

    if (status !== 401 || !originalRequest) {
      return Promise.reject(error);
    }

    const requestUrl = axios.getUri(originalRequest);
    if (requestUrl.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (originalRequest._retry) {
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    const refreshToken = getRefreshToken();
    if (!refreshToken) {
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    try {
      const { data } = await axios.post(
        `${baseURL}/auth/token/refresh`,
        { refreshToken },
        {
          headers: { 'Content-Type': 'application/json' },
          withCredentials: false,
        },
      );

      setTokens(data.accessToken, data.refreshToken);

      originalRequest.headers = originalRequest.headers ?? {};
      originalRequest.headers.Authorization = `Bearer ${getAccessToken()}`;

      return api(originalRequest);
    } catch (refreshErr) {
      clearTokens();
      window.location.href = '/login';
      return Promise.reject(refreshErr);
    }
  },
);

export default api;
