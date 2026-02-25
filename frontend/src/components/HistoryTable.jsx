/**
 * src/components/HistoryTable.jsx
 * Tabular view of historical entropy records.
 */
import { format } from 'date-fns';
import VerificationBadge from './VerificationBadge.jsx';

function truncateMid(str, keep = 12) {
  if (!str || str.length <= keep * 2 + 3) return str;
  return str.slice(0, keep) + '…' + str.slice(-keep);
}

export default function HistoryTable({ records }) {
  if (records.length === 0) {
    return (
      <div className="text-white/30 text-sm text-center py-12">
        No records yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-sm text-left">
        <thead>
          <tr className="border-b border-white/10 bg-white/5">
            <th className="px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Time</th>
            <th className="px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Device</th>
            <th className="px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Hash (truncated)</th>
            <th className="px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Signature</th>
            <th className="px-4 py-3 text-white/50 font-medium text-xs uppercase tracking-wider">Status</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, idx) => (
            <tr
              key={r.id || idx}
              className="border-b border-white/5 hover:bg-white/5 transition-colors"
            >
              <td className="px-4 py-3 font-mono text-xs text-white/60">
                {format(new Date(r.created_at || r.timestamp * 1000), 'yyyy-MM-dd HH:mm:ss')}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-cyan-400">
                {r.device_id}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-emerald-300">
                {truncateMid(r.entropy_hash, 14)}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-white/40">
                {truncateMid(r.signature, 10)}
              </td>
              <td className="px-4 py-3">
                <VerificationBadge verified={r.verified !== false} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
