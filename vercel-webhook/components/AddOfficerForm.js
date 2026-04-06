'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AddOfficerForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', userId: '', phone: '' });

  function handleChange(e) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaving(true);

    try {
      const res = await fetch('/api/officers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to add officer');
      }

      setForm({ name: '', userId: '', phone: '' });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="bg-accent hover:bg-red-700 text-white font-semibold px-5 py-2.5 rounded-lg text-sm transition-colors"
      >
        + Add Officer
      </button>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
      <h3 className="text-lg font-semibold text-navy mb-4">Add New Officer</h3>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            required
            placeholder="Jane Smith"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy w-48"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">IRS Logics User ID</label>
          <input
            type="text"
            name="userId"
            value={form.userId}
            onChange={handleChange}
            required
            placeholder="12345"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy w-40"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Phone</label>
          <input
            type="text"
            name="phone"
            value={form.phone}
            onChange={handleChange}
            required
            placeholder="(555) 123-4567"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-navy focus:border-navy w-44"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="bg-accent hover:bg-red-700 text-white font-medium px-5 py-2 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(''); }}
            className="border border-gray-300 text-navy font-medium px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  );
}
