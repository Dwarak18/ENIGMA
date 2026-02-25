/**
 * src/pages/BlockchainPage.jsx
 * Blockchain anchor queue and confirmed records.
 */
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash } from '../utils.js';

export default function BlockchainPage({ records }) {
  const queue    = records.slice(0, 5);
  const anchored = records.slice(5);

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Network</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>Sepolia Testnet</div>
            <div style={{ fontSize: '10px', color: '#71717a' }}>Chain ID: 11155111</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Anchored</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{anchored.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Pending</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#f59e0b' }}>{queue.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>Anchor Rate</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {records.length > 0 ? `${((anchored.length / records.length) * 100).toFixed(1)}%` : '—'}
            </div>
          </div>
        </div>
      </div>

      {/* Info banner */}
      <div style={{ padding: '14px 18px', borderRadius: '2px', background: 'rgba(37,99,235,.1)', border: '1px solid rgba(37,99,235,.3)', fontSize: '12px', color: '#93c5fd' }}>
        <strong>⬡ Blockchain Anchoring</strong> — Each validated entropy record's hash is submitted to a smart
        contract on Ethereum for immutable anchoring. Records older than the newest 5 are marked as confirmed
        (simulated). Production systems will anchor via a real contract transaction.
      </div>

      {/* Pending queue */}
      {queue.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StatusBadge status="pending" /><span>Pending Anchor Queue</span>
          </div>
          <table>
            <thead><tr><th>Record ID</th><th>Entropy Hash</th><th>Device</th><th>Status</th></tr></thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: '11px', color: '#71717a' }}>{r.id ? r.id.slice(0, 14) + '…' : '—'}</code></td>
                  <td><code style={{ fontSize: '12px', color: '#10b981' }}>{formatHash(r.entropy_hash, 10)}</code></td>
                  <td style={{ color: '#a1a1aa' }}>{r.device_id}</td>
                  <td><StatusBadge status="pending" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Anchored records */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <StatusBadge status="confirmed" /><span>Anchored Records</span>
        </div>
        {anchored.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#52525b', fontSize: '13px' }}>
            No anchored records yet
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Entropy Hash</th><th>Simulated TX Hash</th><th>Status</th><th>Time</th></tr></thead>
              <tbody>
                {anchored.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td><code style={{ fontSize: '12px', color: '#10b981' }}>{formatHash(r.entropy_hash, 12)}</code></td>
                    <td><code style={{ fontSize: '12px', color: '#3b82f6' }}>
                      {r.id ? formatHash('0x' + r.id.replace(/-/g, '') + (r.entropy_hash || '').slice(2, 10), 16) : '—'}
                    </code></td>
                    <td><StatusBadge status="confirmed" /></td>
                    <td style={{ fontSize: '12px', color: '#71717a' }}>
                      {r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
