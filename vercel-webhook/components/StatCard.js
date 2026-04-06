export default function StatCard({ title, value, subtitle, icon }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 border-l-4 border-l-accent">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 uppercase tracking-wide">
            {title}
          </p>
          <p className="text-3xl font-bold text-navy mt-1">{value}</p>
          {subtitle && (
            <p className="text-sm text-gray-400 mt-1">{subtitle}</p>
          )}
        </div>
        {icon && <span className="text-3xl opacity-60">{icon}</span>}
      </div>
    </div>
  );
}
