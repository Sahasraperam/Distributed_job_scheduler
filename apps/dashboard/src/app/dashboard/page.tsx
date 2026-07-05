'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io } from 'socket.io-client';
import {
  Layers,
  Cpu,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  Activity,
  ArrowUpRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';

export default function DashboardOverview() {
  const { token, project, apiUrl } = useAuth();
  const [metrics, setMetrics] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!token || !project) return;

    // Connect to WebSockets
    const socketUrl = apiUrl.replace('/api', '');
    const socket = io(socketUrl, {
      auth: { token },
      query: { token },
    });

    const handleMetricsUpdate = (data: any) => {
      setMetrics(data);
      // Append to live charts history
      setHistory((prev) => {
        const nextHist = [
          ...prev,
          {
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            throughput: data.totalThroughput ?? 0,
            latency: data.queues?.[0]?.averageLatencyMs ?? 0,
          },
        ];
        // Keep last 12 points
        if (nextHist.length > 12) {
          nextHist.shift();
        }
        return nextHist;
      });
    };

    socket.on('system_metrics', handleMetricsUpdate);

    // Fetch initial HTTP payload
    const fetchMetrics = async () => {
      try {
        const response = await fetch(`${apiUrl}/metrics?projectId=${project.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        handleMetricsUpdate(data);
      } catch (e) {
        console.error('Failed fetching metrics:', e);
      }
    };

    fetchMetrics();
    const interval = setInterval(fetchMetrics, 3000); // 3 seconds query loop fallback

    return () => {
      socket.disconnect();
      clearInterval(interval);
    };
  }, [token, project, apiUrl]);

  if (!metrics) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-indigo-500"></div>
        <p className="text-sm text-slate-400">Loading live execution metrics...</p>
      </div>
    );
  }

  const cards = [
    {
      title: 'Queued Jobs',
      value: metrics.totals?.queued ?? 0,
      icon: Clock,
      color: 'border-purple-500/20 text-purple-400 bg-purple-500/5',
      desc: 'Pending execution',
    },
    {
      title: 'Active Runs',
      value: metrics.totals?.running ?? 0,
      icon: Activity,
      color: 'border-blue-500/20 text-blue-400 bg-blue-500/5',
      desc: 'Currently processing',
    },
    {
      title: 'Completed',
      value: metrics.totals?.completed ?? 0,
      icon: CheckCircle,
      color: 'border-emerald-500/20 text-emerald-400 bg-emerald-500/5',
      desc: 'Processed successfully',
    },
    {
      title: 'DLQ / Failed',
      value: (metrics.totals?.failed ?? 0) + (metrics.totals?.dlq ?? 0),
      icon: AlertTriangle,
      color: 'border-rose-500/20 text-rose-400 bg-rose-500/5',
      desc: 'Error state jobs',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">System Monitor</h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time status overview of job distribution networks.
          </p>
        </div>
        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 rounded-lg px-4 py-2 text-xs">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          <span className="font-semibold text-slate-300">Live Network Feed Active</span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.title}
              className={`glass-panel border rounded-xl p-5 glass-card-hover ${c.color}`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  {c.title}
                </span>
                <Icon className="w-5 h-5" />
              </div>
              <p className="text-3xl font-extrabold tracking-tight">{c.value}</p>
              <span className="text-xs text-slate-400 mt-2 block">{c.desc}</span>
            </div>
          );
        })}
      </div>

      {/* System Health Ratios */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-panel rounded-xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Job Success Rate
            </span>
            <p className="text-4xl font-extrabold text-emerald-400 tracking-tight">
              {metrics.successRate ? metrics.successRate.toFixed(2) : '100.00'}%
            </p>
          </div>
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden mt-6 border border-slate-800">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${metrics.successRate ?? 100}%` }}
            ></div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Average Network Load
            </span>
            <p className="text-4xl font-extrabold text-blue-400 tracking-tight">
              {metrics.workers?.length
                ? (
                    metrics.workers.reduce((s: number, w: any) => s + w.loadPercentage, 0) /
                    metrics.workers.length
                  ).toFixed(1)
                : '0.0'}%
            </p>
          </div>
          <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden mt-6 border border-slate-800">
            <div
              className="bg-blue-500 h-full rounded-full transition-all duration-500"
              style={{
                width: `${
                  metrics.workers?.length
                    ? Math.min(
                        100,
                        metrics.workers.reduce((s: number, w: any) => s + w.loadPercentage, 0) /
                          metrics.workers.length
                      )
                    : 0
                }%`,
              }}
            ></div>
          </div>
        </div>

        <div className="glass-panel rounded-xl p-6 flex flex-col justify-between">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block mb-1">
              Current Throughput
            </span>
            <p className="text-4xl font-extrabold text-indigo-400 tracking-tight">
              {metrics.totalThroughput ? metrics.totalThroughput.toFixed(1) : '0.0'}
              <span className="text-sm font-normal text-slate-400 ml-1">jobs/min</span>
            </p>
          </div>
          <div className="flex items-center gap-1 text-slate-400 text-xs mt-6">
            <Zap className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
            <span>Active Worker nodes: {metrics.workers?.length ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Live Chart */}
      {isMounted && (
        <div className="glass-panel rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-bold">Throughput Analytics</h2>
              <p className="text-xs text-slate-400">Live polling throughput trend</p>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold text-indigo-400">
              <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
              <span>Throughput</span>
            </div>
          </div>
          <div className="h-72">
            {history.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={history} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorThroughput" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#475569" fontSize={11} />
                  <YAxis stroke="#475569" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0f172a',
                      borderColor: '#334155',
                      color: '#f8fafc',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="throughput"
                    stroke="#6366f1"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorThroughput)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-500">
                Waiting for sufficient data feed points...
              </div>
            )}
          </div>
        </div>
      )}

      {/* Queues and Workers split grids */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Queues load */}
        <div className="glass-panel rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Layers className="w-5 h-5 text-indigo-400" />
              <span>Queue Distribution</span>
            </h2>
          </div>
          <div className="space-y-4">
            {metrics.queues?.length ? (
              metrics.queues.map((q: any) => {
                const totalActive = q.queuedCount + q.runningCount;
                return (
                  <div key={q.queueId} className="p-3 bg-slate-900/50 rounded-lg border border-slate-800/80">
                    <div className="flex justify-between items-center text-sm font-semibold mb-2">
                      <span>{q.queueName}</span>
                      <span className="text-xs text-slate-400 font-normal">
                        Active Runs: {q.runningCount} | Backlog: {q.queuedCount}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-950 h-2 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-indigo-500 h-full rounded-full"
                          style={{
                            width: `${Math.min(
                              100,
                              totalActive > 0 ? (q.runningCount / totalActive) * 100 : 0
                            )}%`,
                          }}
                        ></div>
                      </div>
                      <span className="text-xs text-slate-400 font-semibold w-10 text-right">
                        {q.throughputPerMin.toFixed(1)}/m
                      </span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-sm text-slate-500">No active queues found.</div>
            )}
          </div>
        </div>

        {/* Workers Load */}
        <div className="glass-panel rounded-xl p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Cpu className="w-5 h-5 text-indigo-400" />
              <span>Active Worker Clusters</span>
            </h2>
          </div>
          <div className="space-y-4">
            {metrics.workers?.length ? (
              metrics.workers.map((w: any) => (
                <div key={w.workerId} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg border border-slate-800/80 text-sm">
                  <div className="overflow-hidden mr-3">
                    <p className="font-bold truncate text-slate-200">{w.workerName}</p>
                    <p className="text-xs text-slate-400 truncate">{w.hostname}</p>
                  </div>
                  <div className="text-right flex items-center gap-4">
                    <div className="hidden sm:block">
                      <span className="text-xs text-slate-400 block">Workload Load</span>
                      <span className="font-semibold text-slate-200">{w.loadPercentage.toFixed(0)}%</span>
                    </div>
                    <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      ACTIVE
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-sm text-slate-500">
                No workers currently online. Start a worker node.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
