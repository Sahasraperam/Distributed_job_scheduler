'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  Layers,
  FileText,
  Cpu,
  LogOut,
  Menu,
  X,
  Briefcase,
  Globe,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { token, user, project, organization, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!token) {
      router.push('/login');
    }
  }, [token, router]);

  if (!token || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
      </div>
    );
  }

  const menuItems = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Queues', href: '/dashboard/queues', icon: Layers },
    { name: 'Jobs Explorer', href: '/dashboard/jobs', icon: FileText },
    { name: 'Workers', href: '/dashboard/workers', icon: Cpu },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex text-slate-100">
      {/* Sidebar for Desktop */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-900 border-r border-slate-800 p-6 shrink-0">
        <div className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white shadow-[0_0_15px_rgba(99,102,241,0.5)]">
            AG
          </div>
          <span className="font-bold text-lg tracking-tight text-gradient">
            Antigravity
          </span>
        </div>

        {/* Project Selector (Display) */}
        {organization && project && (
          <div className="mb-8 p-3 rounded-lg bg-slate-950/60 border border-slate-800 text-xs">
            <div className="flex items-center gap-1.5 text-slate-400 font-semibold mb-1">
              <Globe className="w-3.5 h-3.5" />
              <span>{organization.name}</span>
            </div>
            <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
              <Briefcase className="w-3.5 h-3.5" />
              <span>{project.name}</span>
            </div>
          </div>
        )}

        <nav className="flex-1 space-y-1">
          {menuItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg transition-colors ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.name}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-800 pt-4 mt-auto">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-indigo-400 text-sm">
              {user.firstName[0]}
              {user.lastName[0]}
            </div>
            <div className="overflow-hidden">
              <p className="text-sm font-bold truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-400 truncate">{user.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Navbar / Sidebar Trigger */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="md:hidden flex items-center justify-between bg-slate-900 border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded bg-indigo-600 flex items-center justify-center font-bold text-white shadow-[0_0_10px_rgba(99,102,241,0.5)]">
              AG
            </div>
            <span className="font-bold text-gradient">Antigravity</span>
          </div>
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-slate-400 hover:text-slate-200 focus:outline-none"
          >
            <Menu className="w-6 h-6" />
          </button>
        </header>

        {/* Mobile Sidebar overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <div
              className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setSidebarOpen(false)}
            />
            <div className="relative flex flex-col w-64 max-w-xs bg-slate-900 border-r border-slate-800 p-6 z-10">
              <button
                onClick={() => setSidebarOpen(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="flex items-center gap-2 mb-8">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-white">
                  AG
                </div>
                <span className="font-bold text-lg text-gradient">
                  Antigravity
                </span>
              </div>

              <nav className="flex-1 space-y-1">
                {menuItems.map((item) => {
                  const isActive = pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2 text-sm font-semibold rounded-lg ${
                        isActive
                          ? 'bg-indigo-600 text-white'
                          : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.name}
                    </Link>
                  );
                })}
              </nav>

              <div className="border-t border-slate-800 pt-4 mt-auto">
                <p className="text-sm font-bold">
                  {user.firstName} {user.lastName}
                </p>
                <p className="text-xs text-slate-400 mb-4 truncate">{user.email}</p>
                <button
                  onClick={() => {
                    setSidebarOpen(false);
                    logout();
                  }}
                  className="flex items-center gap-2 w-full px-3 py-2 text-sm font-semibold text-slate-400 hover:text-red-400 hover:bg-red-950/20 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main content body */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
