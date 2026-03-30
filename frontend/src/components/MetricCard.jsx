/**
 * src/components/MetricCard.jsx
 * A single KPI card: label / big number / unit / optional trend arrow.
 */
export default function MetricCard({ label, value, unit, trend }) {
  const trendColor = trend === 'up' ? '#10b981' : trend === 'down' ? '#ef4444' : '#71717a';
  const trendText  = trend === 'up' ? '↗ +2.3%' : trend === 'down' ? '↘ -1.2%' : '→ 0.0%';

  return (
    <div className="card">
      <div style={{ color: '#71717a', fontSize: '10px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
        {label}
      </div>
      <div className="flex items-baseline gap-2">
        <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#fafafa' }}>{value}</span>
        {unit && <span style={{ fontSize: '14px', color: '#a1a1aa' }}>{unit}</span>}
      </div>
      {trend && (
        <div style={{ fontSize: '12px', marginTop: '4px', color: trendColor }}>
          {trendText}
        </div>
      )}
    </div>
  );
}
