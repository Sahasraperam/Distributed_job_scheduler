'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '@/context/AuthContext';
import { io, Socket } from 'socket.io-client';
import {
  FileText,
  Search,
  RefreshCw,
  Clock,
  Play,
  RotateCcw,
  Trash2,
  X,
  Plus,
  ChevronLeft,
  ChevronRight,
  Terminal,
} from 'lucide-react';

export default function JobsPage() {
  const { token, project, apiUrl } = useAuth();
  const [jobs, setJobs] = useState<any[]>([]);
  const [queues, setQueues] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedQueue, setSelectedQueue] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');

  // Selected Job Details Drawer
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [jobLogs, setJobLogs] = useState<any[]>([]);
  const [fetchingDetails, setFetchingDetails] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  // New Job Creation
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newJobName, setNewJobName] = useState('send_email');
  const [newJobQueue, setNewJobQueue] = useState('');
  const [newJobPayload, setNewJobPayload] = useState('{\n  "to": "test@example.com",\n  "fail": false\n}');
  const [newJobPriority, setNewJobPriority] = useState('0');
  const [newJobDelayMin, setNewJobDelayMin] = useState('0');
  const [createError, setCreateError] = useState<string | null>(null);

  const fetchQueues = async () => {
    if (!project || !token) return;
    try {
      const response = await fetch(`${apiUrl}/queues?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setQueues(data);
      if (data.length > 0 && !newJobQueue) {
        setNewJobQueue(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    if (!project || !token) return;
    setLoading(true);
    try {
      let url = `${apiUrl}/jobs?projectId=${project.id}&page=${page}&limit=${limit}`;
      if (selectedQueue) url += `&queueId=${selectedQueue}`;
      if (selectedStatus) url += `&status=${selectedStatus}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;

      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      setJobs(data.items || []);
      setTotal(data.total || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueues();
  }, [project, token]);

  useEffect(() => {
    fetchJobs();
  }, [project, token, page, selectedQueue, selectedStatus]);

  // Log WebSockets Subscriptions
  useEffect(() => {
    if (!token || !selectedJob) {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
      return;
    }

    const socketUrl = apiUrl.replace('/api', '');
    const socket = io(socketUrl, {
      auth: { token },
      query: { token },
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('subscribe_job_logs', { jobId: selectedJob.id });
    });

    socket.on('job_log', (log: any) => {
      setJobLogs((prev) => [...prev, log]);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token, selectedJob, apiUrl]);

  const viewJobDetails = async (job: any) => {
    setSelectedJob(job);
    setJobLogs([]);
    setFetchingDetails(true);

    try {
      // 1. Fetch Job logs from REST
      const logsRes = await fetch(`${apiUrl}/jobs/${job.id}/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const logs = await logsRes.json();
      setJobLogs(logs);

      // 2. Refresh detailed Job payload/executions
      const detailRes = await fetch(`${apiUrl}/jobs/${job.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const detailed = await detailRes.json();
      setSelectedJob(detailed);
    } catch (e) {
      console.error(e);
    } finally {
      setFetchingDetails(false);
    }
  };

  const handleRetryJob = async (jobId: string) => {
    if (!token) return;
    try {
      const response = await fetch(`${apiUrl}/jobs/${jobId}/retry`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to retry job');
      await fetchJobs();
      if (selectedJob && selectedJob.id === jobId) {
        viewJobDetails(selectedJob);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!token) return;
    if (!confirm('Are you sure you want to permanently delete this job?')) return;
    try {
      const response = await fetch(`${apiUrl}/jobs/${jobId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Failed to delete job');
      setSelectedJob(null);
      await fetchJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !project) return;
    setCreateError(null);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(newJobPayload);
    } catch (err) {
      setCreateError('Invalid JSON payload formatting');
      return;
    }

    try {
      const body: any = {
        name: newJobName,
        projectId: project.id,
        queueId: newJobQueue,
        payload: parsedPayload,
        priority: parseInt(newJobPriority),
      };

      const delayMin = parseInt(newJobDelayMin);
      if (delayMin > 0) {
        body.nextRunAt = new Date(Date.now() + delayMin * 60 * 1000).toISOString();
      }

      const response = await fetch(`${apiUrl}/jobs`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.message || 'Failed to create job');
      }

      setShowCreateForm(false);
      setNewJobPayload('{\n  "to": "test@example.com",\n  "fail": false\n}');
      setNewJobDelayMin('0');
      setNewJobPriority('0');
      await fetchJobs();
    } catch (err: any) {
      setCreateError(err?.message || 'Error occurred while creating job');
    }
  };

  const handleSearchKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      fetchJobs();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'QUEUED':
        return 'bg-purple-500/10 text-purple-400 border border-purple-500/20';
      case 'SCHEDULED':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'CLAIMED':
      case 'RUNNING':
        return 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse';
      case 'FAILED':
      case 'DLQ':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border border-slate-500/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Jobs Explorer</h1>
          <p className="text-slate-400 text-sm mt-1">
            Search active logs, inspect payloads, and manually trigger job execution retries.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setPage(1);
              fetchJobs();
            }}
            className="p-2 text-slate-400 hover:text-slate-200 bg-slate-900 border border-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-4 py-2 text-sm rounded-lg transition-all shadow-md cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Enqueue Job</span>
          </button>
        </div>
      </div>

      {/* Manual Enqueue Form */}
      {showCreateForm && (
        <div className="glass-panel border-indigo-500/20 rounded-xl p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-indigo-400" />
            <span>Enqueue Manual Test Job</span>
          </h3>
          {createError && (
            <div className="mb-4 p-3 bg-red-950/60 border border-red-800/80 text-red-200 text-sm rounded-lg">
              {createError}
            </div>
          )}
          <form onSubmit={handleCreateJob} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Job Handler Type
                </label>
                <select
                  value={newJobName}
                  onChange={(e) => setNewJobName(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                >
                  <option value="send_email">send_email (Simulated SMTP)</option>
                  <option value="generate_report">generate_report (PDF report compilation)</option>
                  <option value="webhook_trigger">webhook_trigger (HTTP Hook caller)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Target Queue
                </label>
                <select
                  value={newJobQueue}
                  onChange={(e) => setNewJobQueue(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                >
                  {queues.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Priority (Higher = Faster)
                  </label>
                  <input
                    type="number"
                    value={newJobPriority}
                    onChange={(e) => setNewJobPriority(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                    Delay (Minutes)
                  </label>
                  <input
                    type="number"
                    value={newJobDelayMin}
                    onChange={(e) => setNewJobDelayMin(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-200"
                    placeholder="0 for immediate"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4 flex flex-col">
              <div className="flex-1 flex flex-col">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  JSON Payload
                </label>
                <textarea
                  value={newJobPayload}
                  onChange={(e) => setNewJobPayload(e.target.value)}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-indigo-500 text-slate-200 min-h-[140px]"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowCreateForm(false)}
                  className="px-4 py-2 text-sm font-semibold border border-slate-800 rounded-lg hover:bg-slate-850 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 rounded-lg cursor-pointer"
                >
                  Enqueue Job
                </button>
              </div>
            </div>
          </form>
        </div>
      )}

      {/* Filters toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 bg-slate-900 p-4 border border-slate-800 rounded-xl">
        <div className="relative sm:col-span-2">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search by job handler (Enter)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={handleSearchKeyPress}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div>
          <select
            value={selectedQueue}
            onChange={(e) => {
              setPage(1);
              setSelectedQueue(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-300"
          >
            <option value="">All Queues</option>
            {queues.map((q) => (
              <option key={q.id} value={q.id}>
                {q.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <select
            value={selectedStatus}
            onChange={(e) => {
              setPage(1);
              setSelectedStatus(e.target.value);
            }}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 text-slate-300"
          >
            <option value="">All Statuses</option>
            <option value="QUEUED">QUEUED</option>
            <option value="SCHEDULED">SCHEDULED</option>
            <option value="CLAIMED">CLAIMED</option>
            <option value="RUNNING">RUNNING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="DLQ">DLQ</option>
          </select>
        </div>
      </div>

      {/* Layout Split: Jobs list + details pane */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Table container */}
        <div className={`glass-panel rounded-xl overflow-hidden lg:col-span-2 ${selectedJob ? 'hidden lg:block' : ''}`}>
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-indigo-500"></div>
            </div>
          ) : jobs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-900/50 text-slate-400 font-semibold text-xs uppercase tracking-wider">
                    <th className="p-4">Job Handler</th>
                    <th className="p-4">Queue</th>
                    <th className="p-4">Priority</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Attempts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      onClick={() => viewJobDetails(job)}
                      className={`hover:bg-slate-900/40 transition-colors cursor-pointer ${
                        selectedJob && selectedJob.id === job.id ? 'bg-indigo-950/15 border-l-2 border-l-indigo-500' : ''
                      }`}
                    >
                      <td className="p-4">
                        <p className="font-bold text-slate-200">{job.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate max-w-[120px] sm:max-w-none">
                          {job.id}
                        </p>
                      </td>
                      <td className="p-4 font-semibold text-slate-300">{job.queue?.name}</td>
                      <td className="p-4 font-semibold text-slate-350">{job.priority}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadge(job.status)}`}>
                          {job.status}
                        </span>
                      </td>
                      <td className="p-4 text-slate-400">
                        {job.attemptsMade} / {job.maxAttempts}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Pagination */}
              <div className="flex items-center justify-between border-t border-slate-800 px-6 py-4 bg-slate-900/30">
                <span className="text-xs text-slate-400">
                  Showing {(page - 1) * limit + 1} - {Math.min(page * limit, total)} of {total} jobs
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1.5 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-opacity cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setPage((p) => (p * limit < total ? p + 1 : p))}
                    disabled={page * limit >= total}
                    className="p-1.5 border border-slate-800 rounded-lg text-slate-400 hover:text-slate-200 disabled:opacity-40 transition-opacity cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-20 text-sm text-slate-500">No jobs match your filter queries.</div>
          )}
        </div>

        {/* Details Drawer Pane */}
        {selectedJob && (
          <div className="glass-panel border-indigo-500/10 rounded-xl overflow-hidden p-6 relative lg:col-span-1 min-h-[500px]">
            <button
              onClick={() => setSelectedJob(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-200"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="space-y-6">
              <div>
                <span className={`inline-flex px-2 py-0.5 rounded text-xs font-semibold ${getStatusBadge(selectedJob.status)} mb-2`}>
                  {selectedJob.status}
                </span>
                <h3 className="text-xl font-bold text-slate-200">{selectedJob.name}</h3>
                <p className="text-[10px] font-mono text-slate-400 break-all mt-1">{selectedJob.id}</p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2.5">
                {(selectedJob.status === 'FAILED' || selectedJob.status === 'DLQ') && (
                  <button
                    onClick={() => handleRetryJob(selectedJob.id)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2 px-3 text-xs rounded-lg shadow transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retry Task</span>
                  </button>
                )}
                <button
                  onClick={() => handleDeleteJob(selectedJob.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-slate-850 hover:border-rose-900/60 hover:bg-rose-950/20 text-slate-400 hover:text-rose-400 font-semibold py-2 px-3 text-xs rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Job</span>
                </button>
              </div>

              {/* Job Metadata details */}
              <div className="bg-slate-900/50 p-4 border border-slate-800 rounded-lg text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-400">Queue:</span>
                  <span className="font-bold text-slate-300">{selectedJob.queue?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Max Attempts:</span>
                  <span className="font-bold text-slate-350">{selectedJob.maxAttempts}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Attempts Made:</span>
                  <span className="font-bold text-slate-350">{selectedJob.attemptsMade}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Created:</span>
                  <span className="text-slate-300">{new Date(selectedJob.createdAt).toLocaleString()}</span>
                </div>
                {selectedJob.completedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Completed At:</span>
                    <span className="text-slate-300">{new Date(selectedJob.completedAt).toLocaleString()}</span>
                  </div>
                )}
                {selectedJob.failedAt && (
                  <div className="flex justify-between">
                    <span className="text-slate-400">Failed At:</span>
                    <span className="text-slate-300">{new Date(selectedJob.failedAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Payload Viewer */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Job Payload</h4>
                <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-[10px] font-mono overflow-x-auto text-indigo-300">
                  {JSON.stringify(selectedJob.payload, null, 2)}
                </pre>
              </div>

              {/* Real-time console logs */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Execution Logs (Live Feed)</span>
                </h4>
                {fetchingDetails ? (
                  <div className="text-[10px] text-slate-500 py-4 text-center">Loading logs...</div>
                ) : jobLogs.length > 0 ? (
                  <div className="bg-slate-950 rounded-lg border border-slate-800 p-3 font-mono text-[10px] h-48 overflow-y-auto space-y-1.5">
                    {jobLogs.map((log, idx) => (
                      <p key={idx} className={log.level === 'ERROR' || log.level === 'FATAL' ? 'text-rose-400' : 'text-slate-300'}>
                        <span className="text-slate-500 mr-1.5">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
                        {log.message}
                      </p>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-950 rounded-lg border border-slate-800 p-3 text-[10px] text-slate-500 text-center font-mono py-8">
                    Console quiet. No logs recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
