"use client";

import { useState } from "react";

export default function ConversationPanel({ conversations = [] }) {
  const [expandedIds, setExpandedIds] = useState(new Set());

  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h2 className="text-lg font-semibold text-navy mb-4">Conversation Summaries</h2>
      <div className="space-y-4">
        {conversations.map(conv => (
          <div key={conv.id} className="border border-gray-200 rounded-lg p-4">
            <div className="text-xs text-gray-500 mb-2">
              {new Date(conv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
              {conv.task_subject && <span className="ml-2">— {conv.task_subject}</span>}
            </div>
            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
              <p className="text-sm text-gray-800">{conv.ai_summary}</p>
            </div>
            {conv.ai_transcript && (
              <div className="mt-2">
                <button
                  onClick={() => toggleExpand(conv.id)}
                  className="text-xs text-navy hover:underline font-medium"
                >
                  {expandedIds.has(conv.id) ? "Hide transcript" : "Show transcript"}
                </button>
                {expandedIds.has(conv.id) && (
                  <pre className="mt-2 whitespace-pre-wrap text-sm bg-gray-50 p-4 rounded-lg border border-gray-200 text-gray-700 max-h-64 overflow-y-auto">
                    {conv.ai_transcript}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
