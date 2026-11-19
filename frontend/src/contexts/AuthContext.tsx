// src/contexts/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import api from '../services/api';

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'user' | 'collector' | 'admin';
  points?: number;
  phone?: string;
  avatar?: string;
  memberSince?: string;
  collectorInfo?: {
    phone?: string;
    address?: string;
    vehicleType?: string;
    vehicleNumberPlate?: string;
    experience?: string;
    isApproved?: boolean;
    status?: 'pending' | 'approved' | 'rejected';
  };
}

interface AuthContextType {
  user: User | null;
  login: (user: User, token: string, rememberMe: boolean) => void;
  logout: () => void;
  updateUser: (data: Partial<User>) => void;
  updateToken: (token: string) => void;
  refreshUser: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Helper to get active storage
  const getStorage = () => {
    const loginMethod = localStorage.getItem('loginMethod') || sessionStorage.getItem('loginMethod');
    return loginMethod === 'session' ? sessionStorage : localStorage;
  };

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginMethod');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('loginMethod');
    // Older versions cached the avatar separately; clear it so the next account never sees it
    localStorage.removeItem('profile.avatar');
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const token = localStorage.getItem('token') || sessionStorage.getItem('token');
    if (!token) return;

    try {
      const res = await api.get('/api/auth/me');
      if (res.data?.success && res.data.user) {
        const updated = res.data.user;
        setUser(updated);
        const storage = getStorage();
        storage.setItem('user', JSON.stringify(updated));
      }
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 401) {
        logout();
      }
    }
  }, [logout]);

  useEffect(() => {
    const initAuth = async () => {
      try {
        const token = localStorage.getItem('token') || sessionStorage.getItem('token');
        const rawUser = localStorage.getItem('user') || sessionStorage.getItem('user');

        if (token && rawUser) {
          const parsedUser = JSON.parse(rawUser);
          setUser(parsedUser);

          // Verify token and fetch fresh user profile from backend
          try {
            const res = await api.get('/api/auth/me');
            if (res.data?.success && res.data.user) {
              const freshUser = res.data.user;
              setUser(freshUser);
              const storage = getStorage();
              storage.setItem('user', JSON.stringify(freshUser));
            }
          } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 401) {
              console.warn('Session expired or token invalid, logging out');
              logout();
            }
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        logout();
      } finally {
        setLoading(false);
      }
    };

    initAuth();
  }, [logout]);

  const login = (userData: User, token: string, rememberMe: boolean) => {
    // Clean both first
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('loginMethod');
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    sessionStorage.removeItem('loginMethod');

    const storage = rememberMe ? localStorage : sessionStorage;
    storage.setItem('token', token);
    storage.setItem('user', JSON.stringify(userData));
    storage.setItem('loginMethod', rememberMe ? 'local' : 'session');

    setUser(userData);
  };

  const updateUser = (data: Partial<User>) => {
    setUser(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...data };
      const storage = getStorage();
      storage.setItem('user', JSON.stringify(updated));
      return updated;
    });
  };

  // Saves a fresh token (after a password change) in the same storage chosen at login
  const updateToken = (token: string) => {
    getStorage().setItem('token', token);
  };

  const value: AuthContextType = {
    user,
    login,
    logout,
    updateUser,
    updateToken,
    refreshUser,
    loading
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// The provider and its hook live together on purpose; fast refresh simply reloads this file
// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
