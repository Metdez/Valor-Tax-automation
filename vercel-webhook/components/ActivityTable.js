import Link from "next/link";

function timeAgo(dateString) {
  const now = new Date();
  const date = new Date(dateString);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function AssignmentBadge({ method }) {
  if (method === "case_officer") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        Case Officer
      </span>
    );
  }
  if (method === "round_robin") {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
        Round Robin
      </span>
    );
  }
  return <span className="text-gray-400 text-xs">-</span>;
}

function StatusBadge({ status }) {
  const styles = {
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    "not found": "bg-yellow-100 text-yellow-800",
  };

  const key = (status || "").toLowerCase();
  const className = styles[key] || "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}
    >
      {status}
    </span>
  );
}

export default function ActivityTable({ logs = [] }) {
  if (!logs.length) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center">
        <p className="text-gray-400 text-lg">No activity yet</p>
        <p className="text-gray-300 text-sm mt-1">
          Cases will appear here as they are created
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="px-4 py-3 font-medium text-gray-500">Time</th>
              <th className="px-4 py-3 font-medium text-gray-500">Contact</th>
              <th className="px-4 py-3 font-medium text-gray-500">Case ID</th>
              <th className="px-4 py-3 font-medium text-gray-500">Officer</th>
              <th className="px-4 py-3 font-medium text-gray-500">Assigned Via</th>
              <th className="px-4 py-3 font-medium text-gray-500">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log, i) => (
              <tr
                key={log.id || i}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                  {log.created_at ? timeAgo(log.created_at) : "-"}
                </td>
                <td className="px-4 py-3 font-medium text-gray-800">
                  {log.contact_name || "-"}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {log.case_id ? (
                    <Link href={`/case/${log.case_id}`} className="text-navy hover:underline">
                      {log.case_id}
                    </Link>
                  ) : "-"}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {log.officer_name || "-"}
                </td>
                <td className="px-4 py-3">
                  <AssignmentBadge method={log.assignment_method} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={log.status || "Unknown"} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
