"use client";

import { useState } from "react";

export default function CaseLookup() {
  const [query, setQuery] = useState("");
  const [searchType, setSearchType] = useState("email");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!query.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const params = new URLSearchParams({ [searchType]: query.trim() });
      const res = await fetch(`/api/case?${params}`);
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Case not found");
      } else {
        setResult(data);
      }
    } catch (err) {
      setError("Failed to fetch. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      {/* Search form */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <form onSubmit={handleSearch} className="space-y-4">
          {/* Search type toggle */}
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="searchType"
                value="email"
                checked={searchType === "email"}
                onChange={() => setSearchType("email")}
                className="accent-accent"
              />
              <span className="text-sm font-medium text-gray-700">Email</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="searchType"
                value="phone"
                checked={searchType === "phone"}
                onChange={() => setSearchType("phone")}
                className="accent-accent"
              />
              <span className="text-sm font-medium text-gray-700">Phone</span>
            </label>
          </div>

          {/* Search input + button */}
          <div className="flex gap-3">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                searchType === "email"
                  ? "Enter email address..."
                  : "Enter phone number..."
              }
              className="flex-1 px-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-navy/30 focus:border-navy"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="px-6 py-2.5 bg-accent text-white text-sm font-medium rounded-lg hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Searching..." : "Search"}
            </button>
          </div>
        </form>
      </div>

      {/* Error state */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-red-700 text-sm">{error}</p>
        </div>
      )}

      {/* Results */}
      {result && (
        <div className="mt-4 space-y-4">
          {/* Case details card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h3 className="text-lg font-semibold text-navy mb-4">
              Case Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.caseId && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Case ID</p>
                  <p className="font-mono text-sm text-gray-800">
                    {result.caseId}
                  </p>
                </div>
              )}
              {result.contactName && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Contact</p>
                  <p className="text-sm text-gray-800">{result.contactName}</p>
                </div>
              )}
              {result.email && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Email</p>
                  <p className="text-sm text-gray-800">{result.email}</p>
                </div>
              )}
              {result.phone && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Phone</p>
                  <p className="text-sm text-gray-800">{result.phone}</p>
                </div>
              )}
              {result.officer && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">
                    Assigned Officer
                  </p>
                  <p className="text-sm text-gray-800">{result.officer}</p>
                </div>
              )}
              {result.status && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Status</p>
                  <p className="text-sm text-gray-800">{result.status}</p>
                </div>
              )}
              {result.createdAt && (
                <div>
                  <p className="text-xs text-gray-400 uppercase">Created</p>
                  <p className="text-sm text-gray-800">
                    {new Date(result.createdAt).toLocaleString()}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Task history */}
          {result.history && result.history.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-lg font-semibold text-navy">
                  Task History
                </h3>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-4 py-3 font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-500">
                      Action
                    </th>
                    <th className="px-4 py-3 font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {result.history.map((entry, i) => (
                    <tr
                      key={i}
                      className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                    >
                      <td className="px-4 py-3 text-gray-500">
                        {entry.date
                          ? new Date(entry.date).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-800">
                        {entry.action || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                            entry.status === "Success"
                              ? "bg-green-100 text-green-800"
                              : entry.status === "Failed"
                              ? "bg-red-100 text-red-800"
                              : "bg-gray-100 text-gray-800"
                          }`}
                        >
                          {entry.status || "-"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
