import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor — attach JWT
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('sq_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle errors globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message =
      error.response?.data?.message || error.message || 'Something went wrong.';

    // Auto-logout on 401
    if (error.response?.status === 401) {
      localStorage.removeItem('sq_token');
      localStorage.removeItem('sq_user');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }

    // Don't toast for validation errors (let forms handle them)
    if (error.response?.status !== 400) {
      toast.error(message);
    }

    return Promise.reject(error);
  }
);

export default api;
