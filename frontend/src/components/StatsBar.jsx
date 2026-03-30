/**
 * src/components/StatsBar.jsx
 * Summary counters: total / verified / failed events.
 */
export default function StatsBar({ stats }) {
  const verifiedPct = stats.total > 0
    ? Math.round((stats.verified / stats.total) * 100)
    : 0;

  return (
    <div className="grid grid-cols-3 gap-4">
      <StatCard label="Total Received" value={stats.total} color="text-white" />
      <StatCard
        label="Verified"
        value={stats.verified}
        sub={`${verifiedPct}%`}
        color="text-emerald-400"
      />
      <StatCard label="Failed" value={stats.failed} color="text-red-400" />
    </div>
  );
}

function StatCard({ label, value, sub, color }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-center">
      <p className="text-[11px] text-white/40 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="text-xs text-white/30 mt-1">{sub}</p>}
    </div>
  );
}
