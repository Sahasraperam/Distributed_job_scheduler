'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Cpu, RefreshCw, Server, Shield } from 'lucide-react';

export default function WorkersPage() {
  const { token, project, apiUrl } = useAuth();
  const [workers, setWorkers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchWorkers = async (isSilent = false) => {
    if (!project || !token) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      // Metrics endpoint fetches active worker statistics
      const response = await fetch(`${apiUrl}/metrics?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setWorkers(data.workers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, [project, token]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Active Workers</h1>
          <p className="text-slate-400 text-sm mt-1">
            Monitor active worker clusters, verify load distributions, and track node heartbeats.
          </p>
        </div>
        <button
          onClick={() => fetchWorkers(true)}
          className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
          disabled={refreshing}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Workers Grid */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
        </div>
      ) : workers.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {workers.map((worker) => (
            <div
              key={worker.workerId}
              className="glass-panel border-indigo-500/10 rounded-xl p-5 relative overflow-hidden flex flex-col justify-between"
            >
              {/* Dynamic Status Glow */}
              <div
                className={`absolute top-0 right-0 w-24 h-24 rounded-full blur-[40px] opacity-20 ${
                  worker.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              ></div>

              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div className="flex gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-indigo-400">
                      <Server className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-200 truncate max-w-[140px]" title={worker.workerName}>
                        {worker.workerName}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono block truncate max-w-[140px]">
                        {worker.hostname}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${
                      worker.status === 'ACTIVE'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                    }`}
                  >
                    {worker.status}
                  </span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Worker ID:</span>
                    <span className="font-mono text-slate-300 truncate max-w-[120px]">{worker.workerId}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Target Threads:</span>
                    <span className="font-bold text-indigo-400">{worker.concurrency} concurrent</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Running Jobs:</span>
                    <span className="font-bold text-slate-200">{worker.runningJobsCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Last Ping:</span>
                    <span className="text-slate-400">{new Date(worker.updatedAt).toLocaleTimeString()}</span>
                  </div>
                </div>

                {/* Progress bar Load */}
                <div>
                  <div className="flex justify-between text-xs font-semibold mb-1.5">
                    <span className="text-slate-400">Thread Pool Load</span>
                    <span className="text-indigo-400">{worker.loadPercentage.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-slate-900 h-2 border border-slate-800 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, worker.loadPercentage)}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 glass-panel rounded-xl">
          <Cpu className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-350 mb-1">No worker clusters found</h3>
          <p className="text-slate-400 text-sm">
            Launch a worker microservice node to see cluster status here.
          </p>
        </div>
      )}
    </div>
  );
}
