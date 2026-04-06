'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

const STATUS_OPTIONS = ['All', 'success', 'case_not_found', 'failed', 'error'];
const PAGE_SIZE = 20;

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const fmt = (d) => d.toISOString().split('T')[0];
  return { from: fmt(monday), to: fmt(sunday) };
}

export default function ActivityPage() {
  const week = getWeekRange();
  const [logs, setLogs] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [officers, setOfficers] = useState([]);

  const [officer, setOfficer] = useState('All');
  const [status, setStatus] = useState('All');
  const [fromDate, setFromDate] = useState(week.from);
  const [toDate, setToDate] = useState(week.to);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  async function fetchLogs(pageNum) {
    setLoading(true);
    const params = new URLSearchParams({ page: pageNum, limit: PAGE_SIZE });
    if (officer !== 'All') params.set('officer', officer);
    if (status !== 'All') params.set('status', status);
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);

    try {
      const res = await fetch(`/api/activity?${params}`);
      const data = await res.json();
      setLogs(data.logs || []);
      setTotalCount(data.total || 0);
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetch('/api/officers').then(r => r.json()).then(d => setOfficers(d.officers || []));
  }, []);

  useEffect(() => {
    fetchLogs(page);
  }, [page]);

  function handleFilter() {
    setPage(1);
    fetchLogs(1);
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

  function assignmentBadge(method) {
    if (method === 'case_officer') {
      return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">Case Officer</span>;
    }
    if (method === 'round_robin') {
      return <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Round Robin</span>;
    }
    return <span className="text-gray-400 text-xs">-</span>;
  }

  function statusBadge(s) {
    const colors = {
      success: 'bg-green-100 text-green-800',
      case_not_found: 'bg-yellow-100 text-yellow-800',
      failed: 'bg-red-100 text-red-800',
      error: 'bg-red-200 text-red-900',
    };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${colors[s] || 'bg-gray-100 text-gray-600'}`}>
        {s}
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-navy">Activity Log</h1>
        <p className="text-gray-500 mt-1">Task execution history and filtering</p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Officer</label>
            <select
              value={officer}
              onChange={(e) => setOfficer(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            >
              <option value="All">All Officers</option>
              {officers.map((o) => (
                <option key={o.user_id} value={o.name}>{o.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All Statuses' : s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            />
          </div>

          <button
            onClick={handleFilter}
            className="bg-accent hover:bg-red-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors"
          >
            Filter
          </button>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-400">Loading...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-400">No activity logs found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy text-white">
                  <th className="px-4 py-3 text-left font-medium">Date/Time</th>
                  <th className="px-4 py-3 text-left font-medium">Contact Name</th>
                  <th className="px-4 py-3 text-left font-medium">Email</th>
                  <th className="px-4 py-3 text-left font-medium">Phone</th>
                  <th className="px-4 py-3 text-left font-medium">Case ID</th>
                  <th className="px-4 py-3 text-left font-medium">Task ID</th>
                  <th className="px-4 py-3 text-left font-medium">Officer</th>
                  <th className="px-4 py-3 text-left font-medium">Assigned Via</th>
                  <th className="px-4 py-3 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDate(log.created_at)}</td>
                    <td className="px-4 py-3 font-medium text-navy">{log.contactName || `${log.first_name || ''} ${log.last_name || ''}`.trim() || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.email || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.phone || '-'}</td>
                    <td className="px-4 py-3 font-mono text-xs">{log.case_id ? (
                      <Link href={`/case/${log.case_id}`} className="text-navy hover:underline">
                        {log.case_id}
                      </Link>
                    ) : '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.task_id || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{log.officer_name || '-'}</td>
                    <td className="px-4 py-3">{assignmentBadge(log.assignment_method)}</td>
                    <td className="px-4 py-3">{statusBadge(log.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-sm text-gray-500">
              Page {page} of {totalPages} ({totalCount} total)
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
