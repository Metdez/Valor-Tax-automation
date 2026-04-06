import { getCaseDeepDive, getCaseConversations } from "@/lib/dashboard";
import TaskHistoryTable from "@/components/TaskHistoryTable";
import ConversationPanel from "@/components/ConversationPanel";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function OfficerCard({ label, officer }) {
  return (
    <div className="bg-gray-50 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
        {label}
      </p>
      {officer ? (
        <div className="mt-1">
          <p className="text-sm font-semibold text-navy">{officer.Name}</p>
          {officer.Email && (
            <p className="text-xs text-gray-500 mt-0.5">{officer.Email}</p>
          )}
        </div>
      ) : (
        <p className="text-sm italic text-gray-400 mt-1">Not assigned</p>
      )}
    </div>
  );
}

function StatusBadge({ statusId }) {
  const label =
    statusId === 1
      ? "Active"
      : statusId === 2
        ? "Closed"
        : statusId === 0
          ? "New"
          : statusId != null
            ? `Status ${statusId}`
            : "Unknown";

  const color =
    statusId === 1
      ? "bg-green-100 text-green-800"
      : statusId === 2
        ? "bg-gray-100 text-gray-600"
        : statusId === 0
          ? "bg-blue-100 text-blue-800"
          : "bg-gray-100 text-gray-800";

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

export default async function CasePage({ params }) {
  const { caseId } = await params;

  let caseInfo = null;
  let taskHistory = [];
  let conversations = [];
  let error = null;

  try {
    const [result, convos] = await Promise.all([
      getCaseDeepDive(caseId),
      getCaseConversations(caseId),
    ]);
    caseInfo = result.caseInfo;
    taskHistory = result.taskHistory;
    conversations = convos;
  } catch (err) {
    error = err.message || "Failed to load case details";
  }

  if (error) {
    return (
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-navy hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1">Error Loading Case</h2>
          <p className="text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!caseInfo) {
    return (
      <div className="space-y-6">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-navy hover:underline"
        >
          &larr; Back to Dashboard
        </Link>
        <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-xl p-6">
          <h2 className="text-lg font-semibold mb-1">Case Not Found</h2>
          <p className="text-sm">
            No case found with ID <span className="font-mono">{caseId}</span>.
          </p>
        </div>
      </div>
    );
  }

  const fullName =
    [caseInfo.FirstName, caseInfo.LastName].filter(Boolean).join(" ").trim() ||
    "-";
  const phone = caseInfo.CellPhone || caseInfo.HomePhone || "-";
  const location =
    [caseInfo.City, caseInfo.State].filter(Boolean).join(", ") || "-";
  const taxAmount = caseInfo.TotalTaxLiability
    ? `$${Number(caseInfo.TotalTaxLiability).toLocaleString()}`
    : "N/A";
  const saleDate = formatDate(caseInfo.SaleDate) || "N/A";

  const infoFields = [
    { label: "Case ID", value: caseInfo.CaseID, mono: true },
    { label: "Full Name", value: fullName },
    { label: "Email", value: caseInfo.Email || "-" },
    { label: "Phone", value: phone },
    { label: "Status", badge: true },
    { label: "Sale Date", value: saleDate },
    { label: "Tax Amount", value: taxAmount },
    { label: "Location", value: location },
  ];

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/"
        className="inline-flex items-center text-sm text-navy hover:underline"
      >
        &larr; Back to Dashboard
      </Link>

      {/* Header */}
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold text-navy">Case #{caseId}</h1>
        <StatusBadge statusId={caseInfo.StatusID} />
      </div>

      {/* Info Grid */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">
          Case Information
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {infoFields.map((item) => (
            <div key={item.label} className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {item.label}
              </p>
              {item.badge ? (
                <div className="mt-1">
                  <StatusBadge statusId={caseInfo.StatusID} />
                </div>
              ) : (
                <p
                  className={`text-sm font-semibold text-navy mt-1 ${item.mono ? "font-mono" : ""}`}
                >
                  {item.value}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Officer Assignments */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-semibold text-navy mb-4">
          Officer Assignments
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <OfficerCard
            label="Settlement Officer"
            officer={caseInfo.setofficerid}
          />
          <OfficerCard label="Attorney" officer={caseInfo.attorneyid} />
          <OfficerCard
            label="Case Manager"
            officer={caseInfo.casemanagerid}
          />
          <OfficerCard label="Case Worker" officer={caseInfo.caseworkerid} />
        </div>
      </div>

      {/* Conversation Summaries */}
      {conversations.length > 0 && (
        <ConversationPanel conversations={conversations} />
      )}

      {/* Task History */}
      <div>
        <h2 className="text-lg font-semibold text-navy mb-4">Task History</h2>
        <TaskHistoryTable logs={taskHistory} />
      </div>
    </div>
  );
}
