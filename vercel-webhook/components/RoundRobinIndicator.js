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

export default function RoundRobinIndicator({ officers = [], currentIndex = 0 }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!officers.length) return null;
  const nextIndex = currentIndex % officers.length;

  async function handleClick(index) {
    if (index === nextIndex || loading) return;
    setLoading(true);
    try {
      const res = await fetch('/api/round-robin', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index }),
      });
      if (res.ok) router.refresh();
    } catch (err) {
      console.error('Failed to update round-robin:', err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`space-y-1 ${loading ? 'opacity-60 pointer-events-none' : ''}`}>
      {officers.map((officer, i) => {
        const isNext = i === nextIndex;
        return (
          <div
            key={officer.userId || i}
            onClick={() => handleClick(i)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              isNext
                ? "bg-accent/10 border border-accent/30"
                : "hover:bg-navy/5"
            }`}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              isNext ? "bg-accent text-white" : "bg-navy/10 text-navy"
            }`}>
              {getInitials(officer.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm truncate ${isNext ? "font-semibold text-accent" : "text-gray-700"}`}>
                {officer.name}
              </p>
            </div>
            {isNext && (
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full flex-shrink-0">
                NEXT
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
