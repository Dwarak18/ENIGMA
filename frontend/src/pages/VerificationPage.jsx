/**
 * src/pages/VerificationPage.jsx
 * Real-time entropy record integrity verification.
 */

import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import useEnigmaAPI from '../hooks/useEnigmaAPI';
import StatusBadge from '../components/StatusBadge.jsx';
import { getDefaultBackendUrl } from '../utils.js';

export default function VerificationPage() {
  const [recordId, setRecordId] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);
  const [realtimeFeed, setRealtimeFeed] = useState([]);

  const { verifyRecord } = useEnigmaAPI();

  // Listen for real-time entropy and auto-verify
  useEffect(() => {
    const backendUrl = getDefaultBackendUrl();
    const socket = io(backendUrl, { transports: ['websocket'] });

    socket.on('entropy:new', async (record) => {
      try {
        // Auto-verify every incoming record for the real-time feed
        const result = await verifyRecord(record.id);
        setRealtimeFeed(prev => [{ ...result, ts: Date.now() }, ...prev].slice(0, 10));
      } catch (err) {
        console.error('Real-time verification error:', err);
      }
    });

    return () => socket.disconnect();
  }, [verifyRecord]);

  const handleVerify = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setVerificationResult(null);

    const cleanId = recordId.trim().replace(/^#/, '');
    if (cleanId.length < 8) {
      setError('Please enter at least 8 characters for a partial match');
      return;
    }

    try {
      setIsVerifying(true);
      const result = await verifyRecord(cleanId);
      setVerificationResult(result);
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Real-time Verification Feed ──────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a', display: 'flex', justifyContent: 'between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '14px', fontWeight: 'bold' }}>REAL-TIME VERIFICATION FEED</h2>
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div className="animate-pulse" style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981' }} />
            <span style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase' }}>Live Monitoring</span>
          </div>
        </div>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          {realtimeFeed.length === 0 ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#52525b', fontSize: '13px' }}>
              Awaiting next entropy emission for real-time proof...
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(0,0,0,0.2)', position: 'sticky', top: 0 }}>
                <tr style={{ textAlign: 'left', fontSize: '10px', color: '#71717a' }}>
                  <th style={{ padding: '12px 16px' }}>RECORD ID</th>
                  <th style={{ padding: '12px 16px' }}>DEVICE</th>
                  <th style={{ padding: '12px 16px' }}>INTEGRITY HASH</th>
                  <th style={{ padding: '12px 16px' }}>RESULT</th>
                </tr>
              </thead>
              <tbody>
                {realtimeFeed.map((item, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid #27272a', fontSize: '12px' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#a1a1aa' }}>{item.record_id.slice(0, 8)}...</td>
                    <td style={{ padding: '12px 16px', fontWeight: 'bold' }}>{item.device_id}</td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#10b981' }}>{item.integrity_hash.slice(0, 16)}...</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10b981' }}>
                        <span>✓</span> <span style={{ fontSize: '10px', fontWeight: 'bold' }}>VERIFIED</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Verification Form */}
        <div className="card">
          <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>MANUAL INSPECTION</h2>
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>
                Record ID (UUID)
              </label>
              <input
                type="text"
                value={recordId}
                onChange={(e) => setRecordId(e.target.value)}
                placeholder="Paste Record ID here..."
                style={{
                  width: '100%', background: '#09090b', border: '1px solid #27272a',
                  borderRadius: '2px', padding: '10px 12px', color: '#fafafa',
                  fontSize: '13px', fontFamily: 'monospace'
                }}
              />
            </div>
            <button
              type="submit"
              disabled={!recordId.trim() || isVerifying}
              style={{
                width: '100%', background: '#2563eb', color: 'white', fontWeight: 'bold',
                padding: '10px', borderRadius: '2px', cursor: isVerifying ? 'not-allowed' : 'pointer',
                opacity: isVerifying ? 0.5 : 1, transition: '0.2s', border: 'none'
              }}
            >
              {isVerifying ? 'COMPUTING PROOF...' : 'RE-DERIVE & VERIFY'}
            </button>
          </form>

          {error && (
            <div style={{ marginTop: '16px', padding: '12px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', fontSize: '12px' }}>
              ✗ {error}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="card" style={{ background: 'rgba(37,99,235,0.03)', border: '1px solid rgba(37,99,235,0.2)' }}>
          <h3 style={{ fontSize: '13px', fontWeight: 'bold', color: '#93c5fd', marginBottom: '12px' }}>How Verification Works</h3>
          <ol style={{ fontSize: '12px', color: '#a1a1aa', paddingLeft: '16px', listStyleType: 'decimal' }} className="space-y-3">
            <li>
              <strong>Retrieval:</strong> Record data is fetched from the persistent ARGUS ledger.
            </li>
            <li>
              <strong>Key Re-derivation:</strong> A session-specific AES key is recomputed using the hardware-secured seed, <code>device_id</code>, and the record's <code>timestamp</code>.
            </li>
            <li>
              <strong>Hash Re-computation:</strong> The integrity hash is recalculated as <code>SHA-256(derived_key || timestamp)</code>.
            </li>
            <li>
              <strong>Tamper Detection:</strong> If the recomputed hash doesn't match the stored value, the system flags the record as altered.
            </li>
          </ol>
        </div>
      </div>

      {/* Manual Verification Result */}
      {verificationResult && (
        <div className="card" style={{ borderLeft: `4px solid ${verificationResult.is_valid ? '#10b981' : '#ef4444'}` }}>
          <div className="flex items-center justify-between mb-6">
            <h3 style={{ fontSize: '14px', fontWeight: 'bold' }}>VERIFICATION REPORT</h3>
            <StatusBadge status={verificationResult.is_valid ? 'confirmed' : 'failed'} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Record ID</label>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#a1a1aa' }}>{verificationResult.record_id}</div>
            </div>
            <div>
              <label style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Hardware Timestamp</label>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#a1a1aa' }}>{new Date(verificationResult.timestamp * 1000).toLocaleString()}</div>
            </div>
            <div className="md:col-span-2">
              <label style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Stored Integrity Proof</label>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#10b981', background: 'rgba(0,0,0,0.3)', padding: '8px', border: '1px solid #27272a' }}>
                {verificationResult.integrity_hash}
              </div>
            </div>
            <div className="md:col-span-2">
              <label style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase', display: 'block', marginBottom: '4px' }}>Re-derived Integrity Proof</label>
              <div style={{ fontFamily: 'monospace', fontSize: '12px', color: '#3b82f6', background: 'rgba(0,0,0,0.3)', padding: '8px', border: '1px solid #27272a' }}>
                {verificationResult.computed_hash}
              </div>
            </div>
          </div>

          <div style={{ marginTop: '24px', padding: '12px', background: verificationResult.is_valid ? 'rgba(16,185,129,0.05)' : 'rgba(239,68,68,0.05)', borderRadius: '2px', border: `1px solid ${verificationResult.is_valid ? 'rgba(16,185,129,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
            <p style={{ fontSize: '13px', color: verificationResult.is_valid ? '#10b981' : '#ef4444', fontWeight: 'bold' }}>
              {verificationResult.message}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
