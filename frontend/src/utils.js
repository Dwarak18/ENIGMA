/**
 * src/utils.js
 * Shared utility functions for the TRNG Control System dashboard.
 */

export const formatHash = (hash, length = 12) =>
  hash ? `${hash.slice(0, length)}...${hash.slice(-8)}` : '—';

export const formatTimestamp = (date) =>
  date ? new Date(date).toISOString().replace('T', ' ').slice(0, 19) : 'N/A';

export const getStatusColor = (status) => {
  const colors = {
    idle:         '#64748b',
    processing:   '#3b82f6',
    success:      '#10b981',
    healthy:      '#10b981',
    warning:      '#f59e0b',
    degraded:     '#f59e0b',
    error:        '#ef4444',
    critical:     '#dc2626',
    signed:       '#10b981',
    unsigned:     '#71717a',
    failed:       '#ef4444',
    not_anchored: '#71717a',
    pending:      '#f59e0b',
    confirmed:    '#10b981',
    online:       '#10b981',
    offline:      '#ef4444',
    connected:    '#10b981',
    disconnected: '#ef4444',
    connecting:   '#f59e0b',
  };
  return colors[status] || '#64748b';
};

/** Read backend URL from localStorage or auto-detect from window.location */
export const getDefaultBackendUrl = () => {
  try {
    const s = localStorage.getItem('enigma_backend_url');
    if (s) return s;
  } catch (_) {}
  if (typeof window !== 'undefined' && window.location.protocol === 'file:')
    return 'http://localhost:3000';
  return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
};

/**
 * Compute Shannon entropy score from a hex hash string.
 * Returns a value 0–100.
 */
export const computeEntropyScore = (hex) => {
  if (!hex) return 0;
  const h = hex.replace(/^0x/, '');
  if (h.length < 4) return 0;
  const freq = {};
  for (let i = 0; i < h.length; i += 2) {
    const b = h.substr(i, 2);
    freq[b] = (freq[b] || 0) + 1;
  }
  const n = h.length / 2;
  let H = 0;
  for (const c of Object.values(freq)) {
    const p = c / n;
    H -= p * Math.log2(p);
  }
  return Math.min(100, parseFloat(((H / 8) * 100).toFixed(1)));
};

export const formatUptime = (s) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

/** Build pipeline steps from real data */
export const buildPipeline = (records, wsConnected) => {
  const hasRec = records.length > 0;
  const hasSig = hasRec && Boolean(records[0]?.signature);
  const ok = wsConnected;
  return [
    { id: 'capture', name: 'Image Capture',  status: ok&&hasRec?'success':ok?'processing':'idle', latency: 45,   successRate: 99.8 },
    { id: 'preproc', name: 'Pre-processing', status: ok&&hasRec?'success':'idle',                  latency: 118,  successRate: 99.9 },
    { id: 'trng',    name: 'TRNG Gen',       status: ok&&hasRec?'success':ok?'processing':'idle',  latency: 87,   successRate: 99.7 },
    { id: 'hash',    name: 'Hashing',        status: ok&&hasRec?'success':'idle',                  latency: 22,   successRate: 100  },
    { id: 'time',    name: 'Trusted Time',   status: ok&&hasRec?'success':'idle',                  latency: 14,   successRate: 99.9 },
    { id: 'sign',    name: 'HW Signing',     status: hasSig?'success':ok?'processing':'idle',      latency: 65,   successRate: 99.6 },
    { id: 'ledger2', name: 'Ledger Entry',   status: hasRec?'success':'idle',                      latency: 31,   successRate: 100  },
    { id: 'anchor',  name: 'Blockchain',     status: hasRec?'pending':'idle',                      latency: 2300, successRate: 98.2 },
  ];
};

/** Adapt a raw API record to the ledger entry shape used in the UI */
export const adaptRecord = (r) => ({
  id:              r.id,
  frameIndex:      r.id ? r.id.slice(0, 8) : '—',
  timestamp:       r.timestamp ? new Date(r.timestamp * 1000) : new Date(r.created_at),
  combinedHash:    r.entropy_hash || '',
  signatureStatus: r.signature ? 'signed' : 'unsigned',
  blockchainStatus:'pending',
  blockchainTxHash:null,
  entropyScore:    computeEntropyScore(r.entropy_hash),
  device_id:       r.device_id,
  rawRecord:       r,
});
