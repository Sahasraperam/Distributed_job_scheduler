'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface Project {
  id: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
}

interface AuthContextType {
  token: string | null;
  user: User | null;
  project: Project | null;
  organization: Organization | null;
  login: (data: { accessToken: string; refreshToken: string; user: User; project: Project | null; organization: Organization | null }) => void;
  logout: () => void;
  setProject: (proj: Project) => void;
  setOrganization: (org: Organization) => void;
  apiUrl: string;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [project, setProjectState] = useState<Project | null>(null);
  const [organization, setOrganizationState] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

  useEffect(() => {
    const savedToken = localStorage.getItem('token');
    const savedUser = localStorage.getItem('user');
    const savedProject = localStorage.getItem('project');
    const savedOrg = localStorage.getItem('organization');

    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      if (savedProject) setProjectState(JSON.parse(savedProject));
      if (savedOrg) setOrganizationState(JSON.parse(savedOrg));
    }
    setLoading(false);
  }, []);

  const login = (data: { accessToken: string; refreshToken: string; user: User; project: Project | null; organization: Organization | null }) => {
    localStorage.setItem('token', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (data.project) localStorage.setItem('project', JSON.stringify(data.project));
    if (data.organization) localStorage.setItem('organization', JSON.stringify(data.organization));

    setToken(data.accessToken);
    setUser(data.user);
    setProjectState(data.project);
    setOrganizationState(data.organization);

    router.push('/dashboard');
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('project');
    localStorage.removeItem('organization');

    setToken(null);
    setUser(null);
    setProjectState(null);
    setOrganizationState(null);

    router.push('/login');
  };

  const setProject = (proj: Project) => {
    localStorage.setItem('project', JSON.stringify(proj));
    setProjectState(proj);
  };

  const setOrganization = (org: Organization) => {
    localStorage.setItem('organization', JSON.stringify(org));
    setOrganizationState(org);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ token, user, project, organization, login, logout, setProject, setOrganization, apiUrl }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
