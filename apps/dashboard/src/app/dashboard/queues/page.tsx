'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { Layers, Pause, Play, Plus, RefreshCw } from 'lucide-react';

export default function QueuesPage() {
  const { token, project, apiUrl } = useAuth();
  const [queues, setQueues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newQueueName, setNewQueueName] = useState('');
  const [newQueueConcurrency, setNewQueueConcurrency] = useState('10');
  const [submitError, setSubmitError] = useState<string | null>(null);

  const fetchQueues = async (isSilent = false) => {
    if (!project || !token) return;
    if (!isSilent) setLoading(true);
    else setRefreshing(true);

    try {
      const response = await fetch(`${apiUrl}/queues?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to fetch queues');
      const data = await response.json();
      setQueues(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, [project, token]);

  const handlePauseResume = async (queueId: string, isPaused: boolean) => {
    if (!token) return;
    try {
      const action = isPaused ? 'resume' : 'pause';
      const response = await fetch(`${apiUrl}/queues/${queueId}/${action}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Failed to ${action} queue`);
      await fetchQueues(true);
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !project) return;
    setSubmitError(null);

    try {
      const response = await fetch(`${apiUrl}/queues`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newQueueName,
          projectId: project.id,
          concurrencyLimit: parseInt(newQueueConcurrency),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create queue');
      }

      setNewQueueName('');
      setNewQueueConcurrency('10');
      setShowAddForm(false);
      await fetchQueues(true);
    } catch (err: any) {
      setSubmitError(err?.message || 'Error occurred while creating queue');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Queues Manager</h1>
          <p className="text-slate-400 text-sm mt-1">
            Configure system execution pipelines and adjust parallel concurrency limits.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchQueues(true)}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Queue</span>
          </button>
        </div>
      </div>

      {/* Add Queue Form (Overlay Panel) */}
      {showAddForm && (
        <div className="glass-panel border-indigo-500/20 rounded-xl p-6 max-w-lg">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-400" />
            <span>Create New Execution Queue</span>
          </h3>
          {submitError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 text-red-200 text-sm rounded-lg">
              {submitError}
            </div>
          )}
          <form onSubmit={handleCreateQueue} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Queue Name
              </label>
              <input
                type="text"
                required
                value={newQueueName}
                onChange={(e) => setNewQueueName(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                placeholder="e.g. video_transcode"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                Concurrency Limit
              </label>
              <input
                type="number"
                min="1"
                max="1000"
                required
                value={newQueueConcurrency}
                onChange={(e) => setNewQueueConcurrency(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
              />
              <span className="text-xs text-slate-400 mt-1 block">
                Maximum number of concurrent workers executing jobs from this queue globally.
              </span>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-4 py-2 text-sm font-semibold border border-slate-800 rounded-lg hover:bg-slate-850 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 rounded-lg transition-colors cursor-pointer"
              >
                Create Queue
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Queues List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
        </div>
      ) : queues.length > 0 ? (
        <div className="glass-panel rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                  <th className="p-4">Queue Name</th>
                  <th className="p-4">Concurrency Limit</th>
                  <th className="p-4">Execution Status</th>
                  <th className="p-4">Registered Jobs</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {queues.map((q) => (
                  <tr key={q.id} className="hover:bg-slate-900/20 transition-colors">
                    <td className="p-4 font-bold text-slate-200">{q.name}</td>
                    <td className="p-4 font-semibold text-indigo-400">{q.concurrencyLimit} concurrent</td>
                    <td className="p-4">
                      {q.isPaused ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          PAUSED
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          RUNNING
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-slate-350">{q._count?.jobs ?? 0} jobs</td>
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handlePauseResume(q.id, q.isPaused)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                          q.isPaused
                            ? 'bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-600/20'
                            : 'bg-amber-600/10 hover:bg-amber-600/20 text-amber-400 border border-amber-600/20'
                        }`}
                      >
                        {q.isPaused ? (
                          <>
                            <Play className="w-3.5 h-3.5" />
                            <span>Resume</span>
                          </>
                        ) : (
                          <>
                            <Pause className="w-3.5 h-3.5" />
                            <span>Pause</span>
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="text-center py-12 glass-panel rounded-xl">
          <Layers className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-350 mb-1">No queues created yet</h3>
          <p className="text-slate-400 text-sm mb-6">
            Get started by registering your first execution pipeline.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg shadow-md cursor-pointer"
          >
            Create First Queue
          </button>
        </div>
      )}
    </div>
  );
}
