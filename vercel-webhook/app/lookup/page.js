'use client';

import { useState } from 'react';
import Link from 'next/link';
import TaskHistoryTable from '@/components/TaskHistoryTable';

export default function LookupPage() {
  const [searchType, setSearchType] = useState('email');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [caseData, setCaseData] = useState(null);
  const [taskHistory, setTaskHistory] = useState([]);
  const [error, setError] = useState('');

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError('');
    setCaseData(null);
    setTaskHistory([]);

    try {
      const params = new URLSearchParams({ [searchType]: query.trim() });
      const res = await fetch(`/api/case?${params}`);
      const data = await res.json();

      if (!res.ok || data.error) {
        setError(data.error || 'Case not found.');
        return;
      }

      setCaseData(data.case || null);
      setTaskHistory(data.taskHistory || []);
    } catch (err) {
      console.error('Lookup failed:', err);
      setError('Failed to look up case. Please try again.');
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-navy">Case Lookup</h1>
        <p className="text-gray-500 mt-1">Search for cases by email or phone number</p>
      </div>

      {/* Search Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setSearchType('email')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchType === 'email'
                    ? 'bg-navy text-white shadow-sm'
                    : 'text-gray-600 hover:text-navy'
                }`}
              >
                Email
              </button>
              <button
                type="button"
                onClick={() => setSearchType('phone')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  searchType === 'phone'
                    ? 'bg-navy text-white shadow-sm'
                    : 'text-gray-600 hover:text-navy'
                }`}
              >
                Phone
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type={searchType === 'email' ? 'email' : 'tel'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchType === 'email' ? 'Enter email address...' : 'Enter phone number...'}
              className="flex-1 border border-gray-300 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-navy focus:border-navy"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="bg-accent hover:bg-red-700 text-white font-medium px-6 py-3 rounded-lg text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>
        </form>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          {error}
        </div>
      )}

      {/* Case Details */}
      {caseData && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-navy mb-4">Case Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Case ID', value: caseData.CaseID, link: true },
              { label: 'Name', value: `${caseData.FirstName || ''} ${caseData.LastName || ''}`.trim() || '-' },
              { label: 'Email', value: caseData.Email || '-' },
              { label: 'Phone', value: caseData.Phone || '-' },
              { label: 'Status', value: caseData.Status || '-' },
              { label: 'Sale Date', value: caseData.SaleDate ? formatDate(caseData.SaleDate) : '-' },
              { label: 'Tax Amount', value: caseData.TaxAmount ? `$${Number(caseData.TaxAmount).toLocaleString()}` : '-' },
              { label: 'Location', value: [caseData.City, caseData.State].filter(Boolean).join(', ') || '-' },
            ].map((item) => (
              <div key={item.label} className="p-3 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{item.label}</p>
                {item.link && item.value ? (
                  <Link href={`/case/${item.value}`} className="text-sm font-semibold text-navy hover:underline font-mono mt-1 block">
                    {item.value}
                  </Link>
                ) : (
                  <p className="text-sm font-semibold text-navy mt-1">{item.value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Task History */}
      {taskHistory.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-navy mb-4">Task History</h2>
          <TaskHistoryTable logs={taskHistory} />
        </div>
      )}
    </div>
  );
}
