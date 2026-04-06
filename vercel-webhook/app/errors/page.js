'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Sparkline from '@/components/Sparkline';

const CATEGORIES = [
  { value: '', label: 'All Errors' },
  { value: 'case_not_found', label: 'Case Not Found' },
  { value: 'task_failed', label: 'Task Failed' },
  { value: 'error', label: 'Error' },
  { value: 'pending_appointment', label: 'Pending Appointment' },
];

const PAGE_SIZE = 20;

const CATEGORY_COLORS = {
  case_not_found: 'bg-yellow-100 text-yellow-800',
  task_failed: 'bg-red-100 text-red-800',
  error: 'bg-red-200 text-red-900',
  pending_appointment: 'bg-blue-100 text-blue-800',
};

export default function ErrorsPage() {
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [retryingId, setRetryingId] = useState(null);

  const fetchErrors = useCallback(async (pageNum, cat) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
      if (cat) params.set('category', cat);
      const res = await fetch(`/api/errors?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      console.error('Failed to fetch errors:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch stats and trend once on mount
    fetch('/api/errors?mode=stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => setStats(null));

    fetch('/api/errors?mode=trend&days=14')
      .then((r) => r.json())
      .then(setTrend)
      .catch(() => setTrend([]));
  }, []);

  useEffect(() => {
    fetchErrors(page, category);
  }, [page, category, fetchErrors]);

  function handleCategoryChange(e) {
    setCategory(e.target.value);
    setPage(1);
  }

  async function handleRetry(logId) {
    setRetryingId(logId);
    try {
      await fetch('/api/errors/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logId }),
      });
      // Refresh stats + list
      fetch('/api/errors?mode=stats')
        .then((r) => r.json())
        .then(setStats)
        .catch(() => {});
      fetchErrors(page, category);
    } catch (err) {
      console.error('Retry failed:', err);
    } finally {
      setRetryingId(null);
    }
  }

  function formatDate(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  function categoryBadge(status) {
    const color = CATEGORY_COLORS[status] || 'bg-gray-100 text-gray-600';
    const label = status ? status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '-';
    return (
      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
        {label}
      </span>
    );
  }

  const statCards = stats
    ? [
        { label: 'Total Errors', value: stats.total, color: 'text-accent' },
        { label: 'Case Not Found', value: stats.caseNotFound, color: 'text-yellow-600' },
        { label: 'Task Failed', value: stats.taskFailed, color: 'text-red-600' },
        { label: 'Errors', value: stats.error, color: 'text-red-800' },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-navy">Error Center</h1>
        <p className="text-gray-500 mt-1">Failed webhooks and error tracking</p>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-4"
          >
            <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            <p className="text-xs text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Trend Card */}
      {trend.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold text-navy">14-Day Error Trend</h2>
          </div>
          <Sparkline data={trend.map((t) => t.count)} width={600} height={48} />
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={category}
              onChange={handleCategoryChange}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Error Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No errors found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-4 py-3 text-left font-medium">Date/Time</th>
                  <th className="px-4 py-3 text-left font-medium">Contact</th>
                  <th className="px-4 py-3 text-left font-medium">Case ID</th>
                  <th className="px-4 py-3 text-left font-medium">Category</th>
                  <th className="px-4 py-3 text-left font-medium">Error Message</th>
                  <th className="px-4 py-3 text-left font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => {
                  const contactName =
                    [log.firstName, log.lastName].filter(Boolean).join(' ').trim() || '-';
                  return (
                    <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                        {formatDate(log.createdAt)}
                      </td>
                      <td className="px-4 py-3 font-medium text-navy">{contactName}</td>
                      <td className="px-4 py-3">
                        {log.caseId ? (
                          <Link
                            href={`/case/${log.caseId}`}
                            className="text-navy hover:underline font-mono"
                          >
                            {log.caseId}
                          </Link>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">{categoryBadge(log.status)}</td>
                      <td className="px-4 py-3">
                        <span
                          className="block max-w-xs truncate text-gray-600"
                          title={log.errorMessage || ''}
                        >
                          {log.errorMessage || '-'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleRetry(log.id)}
                          disabled={retryingId === log.id}
                          className="bg-accent hover:bg-red-700 text-white text-xs px-3 py-1 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                          {retryingId === log.id ? 'Retrying...' : 'Retry'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({total} total)
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded-lg border border-gray-300 text-sm font-medium text-navy disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 rounded-lg border border-gray-300 text-sm font-medium text-navy disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
