'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

function getInitials(name) {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function OfficerCard({
  officer,
  totalTasks = 0,
  weekTasks = 0,
  isNext = false,
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${officer?.name} from round-robin?`)) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/officers', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: officer.userId }),
      });
      if (res.ok) router.refresh();
    } catch (err) {
      console.error('Failed to remove officer:', err);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div
      className={`group bg-white rounded-xl shadow-sm p-5 relative ${
        isNext
          ? "border-2 border-accent ring-2 ring-accent/20"
          : "border border-gray-100"
      } ${removing ? "opacity-50 pointer-events-none" : ""}`}
    >
      {isNext && (
        <span className="absolute -top-2.5 right-3 bg-accent text-white text-xs font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          Next Up
        </span>
      )}

      <button
        onClick={handleRemove}
        className="absolute top-2 left-2 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity text-xs"
        title={`Remove ${officer?.name}`}
      >
        &times;
      </button>

      <div className="flex items-center gap-3 mb-4">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ${
            isNext ? "bg-accent" : "bg-navy"
          }`}
        >
          {getInitials(officer?.name)}
        </div>
        <div>
          <p className="font-semibold text-gray-800">{officer?.name || "-"}</p>
          <p className="text-xs text-gray-400">{officer?.phone || ""}</p>
        </div>
      </div>

      <div className="flex gap-4">
        <div>
          <p className="text-2xl font-bold text-navy">{totalTasks}</p>
          <p className="text-xs text-gray-400">Total</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-navy">{weekTasks}</p>
          <p className="text-xs text-gray-400">This Week</p>
        </div>
      </div>
    </div>
  );
}
