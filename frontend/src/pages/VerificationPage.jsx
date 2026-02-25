/**
 * src/pages/VerificationPage.jsx
 * Hash / record verifier and click-to-verify records table.
 */
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash, computeEntropyScore } from '../utils.js';

export default function VerificationPage({
  records,
  verifyQuery, setVerifyQuery,
  verifyResult, verifying,
  onVerify,
}) {
  return (
    <div className="space-y-6">
      {/* Verifier Input */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>Hash & Record Verifier</div>
        <div style={{ fontSize: '12px', color: '#71717a', marginBottom: '16px' }}>
          Enter an entropy_hash (64 hex chars) or Record UUID to verify its presence in the database
          and check cryptographic integrity.
        </div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <input
            value={verifyQuery}
            onChange={(e) => setVerifyQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onVerify(verifyQuery)}
            placeholder="Entropy hash or Record UUID…"
            style={{ flex: 1, minWidth: '240px' }}
          />
          <button
            onClick={() => onVerify(verifyQuery)}
            disabled={verifying || !verifyQuery.trim()}
            style={{
              background: '#2563eb', color: 'white', padding: '8px 18px',
              fontSize: '13px', borderRadius: '2px', border: 'none', cursor: 'pointer',
              opacity: verifying || !verifyQuery.trim() ? 0.5 : 1,
            }}
          >
            {verifying ? 'Verifying…' : 'Verify'}
          </button>
        </div>

        {/* Result */}
        {verifyResult && (
          <div style={{
            marginTop: '14px', padding: '14px', borderRadius: '2px',
            background: verifyResult.found ? 'rgba(16,185,129,.12)' : 'rgba(239,68,68,.12)',
            border: `1px solid ${verifyResult.found ? 'rgba(16,185,129,.3)' : 'rgba(239,68,68,.3)'}`,
          }}>
            {verifyResult.found ? (
              <div>
                <div style={{ color: '#10b981', fontWeight: 'bold', marginBottom: '12px' }}>✓ Record verified</div>
                {verifyResult.record && [
                  ['Record ID',   verifyResult.record.id],
                  ['Device ID',   verifyResult.record.device_id],
                  ['Entropy Hash',verifyResult.record.entropy_hash],
                  ['Signature',   verifyResult.record.signature],
                  ['Created At',  verifyResult.record.created_at
                    ? new Date(verifyResult.record.created_at).toISOString().replace('T', ' ').slice(0, 19)
                    : '—'],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '8px', marginBottom: '6px', alignItems: 'start' }}>
                    <span style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', letterSpacing: '.05em', paddingTop: '2px' }}>{k}</span>
                    <code style={{ fontSize: '11px', color: '#10b981', wordBreak: 'break-all', userSelect: 'all' }}>{v || '—'}</code>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Record not found in database</div>
            )}
          </div>
        )}
      </div>

      {/* Click-to-verify table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold' }}>
          Click a row to prefill verifier
        </div>
        {records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px', color: '#52525b', fontSize: '13px' }}>
            No records loaded
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Entropy Hash</th><th>Signature</th><th>Score</th><th>Time</th></tr></thead>
              <tbody>
                {records.slice(0, 20).map((r) => {
                  const score = computeEntropyScore(r.entropy_hash);
                  return (
                    <tr key={r.id} style={{ cursor: 'pointer' }} onClick={() => setVerifyQuery(r.entropy_hash || '')}>
                      <td><code style={{ fontSize: '12px', color: '#10b981' }}>{formatHash(r.entropy_hash, 16)}</code></td>
                      <td><StatusBadge status={r.signature ? 'signed' : 'unsigned'} /></td>
                      <td style={{ fontSize: '12px', color: score >= 60 ? '#10b981' : '#f59e0b' }}>{score}</td>
                      <td style={{ fontSize: '12px', color: '#71717a' }}>
                        {r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(11, 19) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
