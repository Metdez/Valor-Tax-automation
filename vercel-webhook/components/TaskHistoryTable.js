function formatDate(iso) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  const colors = {
    success: "bg-green-100 text-green-800",
    case_not_found: "bg-yellow-100 text-yellow-800",
    task_failed: "bg-red-100 text-red-800",
    failed: "bg-red-100 text-red-800",
    error: "bg-red-200 text-red-900",
  };
  const className = colors[status] || "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

export default function TaskHistoryTable({ logs = [] }) {
  if (!logs.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
        <p className="text-gray-400 text-lg">No task history</p>
        <p className="text-gray-300 text-sm mt-1">
          Tasks will appear here as they are created for this case
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-navy text-white">
              <th className="px-4 py-3 text-left font-medium">Date/Time</th>
              <th className="px-4 py-3 text-left font-medium">Task ID</th>
              <th className="px-4 py-3 text-left font-medium">Officer</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3 text-left font-medium">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {logs.map((log, i) => (
              <tr key={log.id || i} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                  {formatDate(log.created_at)}
                </td>
                <td className="px-4 py-3 text-gray-600">{log.task_id || "-"}</td>
                <td className="px-4 py-3 text-gray-600">
                  {log.officer_name || "-"}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={log.status || "unknown"} />
                </td>
                <td className="px-4 py-3 text-gray-500 max-w-xs truncate">
                  {log.task_subject || log.error_message || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
