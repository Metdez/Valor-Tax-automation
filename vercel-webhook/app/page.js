import { getDashboardStats } from '@/lib/dashboard';
import StatCard from '@/components/StatCard';
import ActivityTable from '@/components/ActivityTable';
import RoundRobinIndicator from '@/components/RoundRobinIndicator';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function DashboardPage() {
  const stats = await getDashboardStats();
  const currentIndex = stats.roundRobinIndex ?? 0;
  const officers = stats.officers || [];

  const formattedDate = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-navy">Dashboard</h1>
        <p className="text-gray-500 mt-1">{formattedDate}</p>
        <p className="text-sm text-gray-400 mt-2">
          GHL recovery mode: {stats.ghlRecoveryMode}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-5">
        <StatCard title="Total Tasks" value={stats.totalTasks} icon="📋" />
        <StatCard title="Tasks Today" value={stats.tasksToday} icon="📅" />
        <StatCard title="Tasks This Week" value={stats.tasksThisWeek} icon="📊" />
        {stats.pendingCount > 0 && (
          <StatCard title="Pending" value={stats.pendingCount} icon="⏳" />
        )}
        {stats.needsReviewCount > 0 && (
          <StatCard title="Needs Review" value={stats.needsReviewCount} icon="⚠️" />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-navy mb-4">Recent Activity</h2>
            <ActivityTable logs={stats.recentActivity} />
          </div>
        </div>

        <div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <h2 className="text-lg font-semibold text-navy mb-1">Round Robin</h2>
            <p className="text-xs text-gray-400 mb-3">Fallback when case has no assigned officer</p>
            <RoundRobinIndicator currentIndex={currentIndex} officers={officers} />
          </div>
        </div>
      </div>
    </div>
  );
}
