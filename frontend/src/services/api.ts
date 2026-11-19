import axios, { type InternalAxiosRequestConfig } from 'axios';

// Get backend API base URL from Vite env or fallback to localhost:4000
export const API_BASE_URL: string = (
  (import.meta as any).env?.VITE_API_URL ||
  (import.meta as any).env?.VITE_API_BASE ||
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

export default api;

