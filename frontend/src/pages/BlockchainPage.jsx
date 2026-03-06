/**
 * src/pages/BlockchainPage.jsx
 * Blockchain anchor queue and confirmed records.
 */
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash } from '../utils.js';

/** Format a UNIX epoch (seconds) to "YYYY-MM-DD HH:MM:SS UTC" */
function fmtEpoch(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function BlockchainPage({ records, latestRecord, firmwareRtcTime }) {
  const queue    = records.slice(0, 5);
  const anchored = records.slice(5);

  return (
    <div className="space-y-6">

      {/* ── Firmware Time Confirmation ────────────────────────────────── */}
      <div className="card">
        <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          Firmware Time Confirmation
        </div>
        <div className="grid grid-cols-3 gap-6">
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>DS3231 RTC Time</div>
            <div style={{ fontSize: '20px', fontWeight: 'bold', color: firmwareRtcTime ? '#10b981' : '#52525b', fontFamily: 'monospace' }}>
              {firmwareRtcTime || '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#52525b', marginTop: '4px' }}>
              {firmwareRtcTime ? 'Hardware clock confirmed' : 'Awaiting device connection'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Last Session Datetime</div>
            <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#a1a1aa', fontFamily: 'monospace' }}>
              {latestRecord ? fmtEpoch(latestRecord.timestamp) : '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#52525b', marginTop: '4px' }}>Used in entropy hash derivation</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Hash Derivation</div>
            <div style={{ fontSize: '10px', color: '#a1a1aa', fontFamily: 'monospace', lineHeight: '1.6' }}>
              <span style={{ color: '#3b82f6' }}>SHA-256</span>
              {'(AES_key || datetime)'}
            </div>
            <div style={{ fontSize: '10px', color: '#52525b', marginTop: '4px' }}>Entropy encryption key + RTC datetime</div>
          </div>
        </div>

        {latestRecord?.entropy_hash && (
          <div style={{ marginTop: '14px', paddingTop: '12px', borderTop: '1px solid #27272a' }}>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>Latest Entropy Hash (anchored to blockchain)</div>
            <code style={{ fontSize: '12px', color: '#10b981', wordBreak: 'break-all' }}>
              {latestRecord.entropy_hash}
            </code>
          </div>
        )}
      </div>

      {/* ── Summary ───────────────────────────────────────────────────── */}
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

      {/* ── Info banner ───────────────────────────────────────────────── */}
      <div style={{ padding: '14px 18px', borderRadius: '2px', background: 'rgba(37,99,235,.1)', border: '1px solid rgba(37,99,235,.3)', fontSize: '12px', color: '#93c5fd' }}>
        <strong>⬡ Blockchain Anchoring</strong> — Each validated entropy hash is derived as{' '}
        <code style={{ background: 'rgba(255,255,255,0.05)', padding: '1px 5px', borderRadius: '2px' }}>
          SHA-256(AES_encryption_key || "YYYY-MM-DD HH:MM:SS")
        </code>{' '}
        using the hardware AES-256 key and the DS3231 RTC datetime, then anchored to Ethereum as an
        immutable record. Records older than the newest 5 are marked as confirmed (simulated).
        Production systems will anchor via a real contract transaction.
      </div>

      {/* ── Pending queue ─────────────────────────────────────────────── */}
      {queue.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <StatusBadge status="pending" /><span>Pending Anchor Queue</span>
          </div>
          <table>
            <thead><tr><th>Record ID</th><th>Entropy Hash</th><th>Device</th><th>Datetime (UTC)</th><th>Status</th></tr></thead>
            <tbody>
              {queue.map((r) => (
                <tr key={r.id}>
                  <td><code style={{ fontSize: '11px', color: '#71717a' }}>{r.id ? r.id.slice(0, 14) + '…' : '—'}</code></td>
                  <td><code style={{ fontSize: '12px', color: '#10b981' }}>{formatHash(r.entropy_hash, 10)}</code></td>
                  <td style={{ color: '#a1a1aa' }}>{r.device_id}</td>
                  <td style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>{fmtEpoch(r.timestamp)}</td>
                  <td><StatusBadge status="pending" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Anchored records ──────────────────────────────────────────── */}
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
              <thead><tr><th>Entropy Hash</th><th>Datetime (UTC)</th><th>Simulated TX Hash</th><th>Status</th></tr></thead>
              <tbody>
                {anchored.slice(0, 15).map((r) => (
                  <tr key={r.id}>
                    <td><code style={{ fontSize: '12px', color: '#10b981' }}>{formatHash(r.entropy_hash, 12)}</code></td>
                    <td style={{ fontSize: '11px', color: '#71717a', fontFamily: 'monospace' }}>{fmtEpoch(r.timestamp)}</td>
                    <td><code style={{ fontSize: '12px', color: '#3b82f6' }}>
                      {r.id ? formatHash('0x' + r.id.replace(/-/g, '') + (r.entropy_hash || '').slice(2, 10), 16) : '—'}
                    </code></td>
                    <td><StatusBadge status="confirmed" /></td>
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
