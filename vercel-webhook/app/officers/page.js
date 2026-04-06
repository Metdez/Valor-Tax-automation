import { getDashboardStats } from '@/lib/dashboard';
import OfficerCard from '@/components/OfficerCard';
import AddOfficerForm from '@/components/AddOfficerForm';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function OfficersPage() {
  const stats = await getDashboardStats();
  const officers = stats.officers || [];
  const currentIndex = stats.roundRobinIndex ?? 0;
  const nextOfficer = officers.length > 0 ? officers[currentIndex % officers.length] : null;

  // Build lookup maps from officerStats
  const totalCounts = {};
  const weekCounts = {};
  for (const os of stats.officerStats) {
    totalCounts[os.name] = os.totalTasks || 0;
    weekCounts[os.name] = os.tasksThisWeek || 0;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-navy">Officers</h1>
        <p className="text-gray-500 mt-1">Case officer roster and assignment tracking</p>
      </div>

      {nextOfficer && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <span className="text-sm font-medium text-gray-500">Next assignment:</span>
          <span className="bg-accent text-white px-3 py-1 rounded-full text-sm font-semibold">
            {nextOfficer.name}
          </span>
          <span className="text-sm text-gray-400">({nextOfficer.phone})</span>
        </div>
      )}

      <AddOfficerForm />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {officers.map((officer, index) => (
          <OfficerCard
            key={officer.user_id || officer.userId}
            officer={officer}
            totalTasks={totalCounts[officer.name] || 0}
            weekTasks={weekCounts[officer.name] || 0}
            isNextUp={index === currentIndex % officers.length}
          />
        ))}
      </div>
    </div>
  );
}
