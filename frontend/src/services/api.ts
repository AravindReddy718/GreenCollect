import axios, { type InternalAxiosRequestConfig } from 'axios';

// Get backend API base URL from Vite env or fallback to localhost:4000
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE ||
  'http://localhost:4000'
).replace(/\/$/, '');

// Helper to get stored auth token
export const getAuthToken = (): string | null => {
  try {
    return localStorage.getItem('token') || sessionStorage.getItem('token');
  } catch {
    return null;
  }
};

// Create configured Axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor to automatically add JWT token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getAuthToken();
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Turns any thrown error (axios, fetch or plain) into a message that can be shown to the user
export const getErrorMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string; message?: string } | undefined;
    if (data?.error || data?.message) return (data.error || data.message) as string;
    return err.response
      ? `Request failed (${err.response.status})`
      : 'Cannot connect to server. Please check your connection.';
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

// An expired or revoked session sends the user back to the login page.
// Login/register errors are shown by their own forms, and /me is handled by AuthContext.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = String(error.config?.url || '');
    if (error.response?.status === 401 && !/\/api\/auth\/(login|register|me)/.test(url)) {
      ['token', 'user', 'loginMethod'].forEach((key) => {
        localStorage.removeItem(key);
        sessionStorage.removeItem(key);
      });
      if (window.location.pathname !== '/login') window.location.assign('/login');
    }
    return Promise.reject(error);
  }
);

export default api;

