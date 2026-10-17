/**
 * src/pages/LedgerPage.jsx
 * Searchable + filterable ledger table with real entropy quality data.
 */
import { useState, useEffect, useCallback } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash, formatTimestamp, getDefaultBackendUrl } from '../utils.js';

export default function LedgerPage({ ledgerEntries, backendUrl = getDefaultBackendUrl() }) {
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [entropyData, setEntropyData] = useState({});
  const [loadingEntropy, setLoadingEntropy] = useState(false);

  // Fetch entropy quality data for a specific record
  const fetchEntropyQuality = useCallback(async (recordId) => {
    if (!recordId || entropyData[recordId]) return;

    try {
      setLoadingEntropy(true);
      const res = await fetch(`${backendUrl}/api/v1/entropy/quality/${recordId}`, {
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Failed to fetch entropy quality: ${res.status}`);
      const json = await res.json();
      if (json.ok && json.data) {
        setEntropyData(prev => ({
          ...prev,
          [recordId]: json.data.entropy,
        }));
      }
    } catch (err) {
      console.error(`Error fetching entropy for ${recordId}:`, err);
    } finally {
      setLoadingEntropy(false);
    }
  }, [backendUrl, entropyData]);

  // Load entropy data for all visible entries
  useEffect(() => {
    const idsToLoad = ledgerEntries.slice(0, 15).map(e => e.id).filter(id => !entropyData[id]);
    idsToLoad.forEach(id => fetchEntropyQuality(id));
  }, [ledgerEntries, entropyData, fetchEntropyQuality]);

  // Fetch entropy data when an entry is selected
  useEffect(() => {
    if (selectedEntry && !entropyData[selectedEntry.id]) {
      fetchEntropyQuality(selectedEntry.id);
    }
  }, [selectedEntry, entropyData, fetchEntropyQuality]);

  const getEntropyBadge = (bits, quality) => {
    let color = '#71717a';
    let label = 'N/A';
    
    if (bits >= 192) {
      color = '#10b981';
      label = `${bits}b`;
    } else if (bits >= 128) {
      color = '#f59e0b';
      label = `${bits}b`;
    } else if (bits >= 64) {
      color = '#ef4444';
      label = `${bits}b`;
    }
    
    return { color, label };
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="card flex items-center gap-4" style={{ padding: '16px' }}>
        <input type="text" placeholder="Search by hash, frame ID..." style={{ flex: 1 }} />
        <select>
          <option>All Statuses</option>
          <option>Confirmed</option>
          <option>Pending</option>
        </select>
        <button style={{ background: '#2563eb', color: 'white', padding: '8px 16px', fontSize: '14px', borderRadius: '2px', border: 'none' }}>
          EXPORT
        </button>
      </div>

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>FRAME ID</th>
                <th>TIMESTAMP</th>
                <th>COMBINED HASH</th>
                <th>SIGNATURE</th>
                <th>BLOCKCHAIN</th>
                <th>ENTROPY</th>
              </tr>
            </thead>
            <tbody>
              {ledgerEntries.slice(0, 15).map((entry) => {
                const entropy = entropyData[entry.id];
                const badge = entropy ? getEntropyBadge(entropy.bits, entropy.quality) : { color: '#71717a', label: 'loading...' };
                
                return (
                  <tr key={entry.id} onClick={() => setSelectedEntry(entry)} style={{ cursor: 'pointer', transition: 'background 0.2s' }} 
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(16,185,129,0.05)'} 
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}>
                    <td style={{ color: '#d4d4d8' }}>#{entry.frameIndex}</td>
                    <td style={{ fontSize: '12px', color: '#a1a1aa' }}>
                      {formatTimestamp(entry.timestamp).slice(11)}
                    </td>
                    <td style={{ fontSize: '12px', color: '#10b981' }}>
                      {formatHash(entry.combinedHash, 8)}
                    </td>
                    <td><StatusBadge status={entry.signatureStatus} size="sm" /></td>
                    <td><StatusBadge status={entry.blockchainStatus} size="sm" /></td>
                    <td style={{ fontSize: '12px', fontWeight: 'bold', color: badge.color }}>
                      {badge.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {ledgerEntries.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#52525b', fontSize: '13px' }}>
              No records loaded
            </div>
          )}
        </div>
      </div>

      {/* Entry Detail */}
      {selectedEntry && (
        <div className="card">
          <div className="flex items-center justify-between mb-6">
            <h2 style={{ fontSize: '14px', fontWeight: 'bold' }}>
              ENTRY DETAILS: #{selectedEntry.frameIndex}
            </h2>
            <button
              onClick={() => setSelectedEntry(null)}
              style={{ background: 'transparent', border: 'none', color: '#71717a', fontSize: '20px', cursor: 'pointer' }}
            >
              ×
            </button>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>COMBINED HASH</div>
              <code style={{ fontSize: '12px', color: '#10b981', wordBreak: 'break-all' }}>
                {selectedEntry.combinedHash}
              </code>
            </div>
            <div>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>BLOCKCHAIN TX</div>
              {selectedEntry.blockchainTxHash ? (
                <code style={{ fontSize: '12px', color: '#3b82f6', wordBreak: 'break-all' }}>
                  {formatHash(selectedEntry.blockchainTxHash)}
                </code>
              ) : (
                <div style={{ fontSize: '12px', color: '#71717a' }}>Not yet anchored</div>
              )}
            </div>
          </div>

          {/* Entropy Quality Analysis */}
          {entropyData[selectedEntry.id] ? (
            <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #27272a' }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '12px' }}>
                ENTROPY QUALITY ANALYSIS
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div style={{ background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.2)', padding: '12px', borderRadius: '2px' }}>
                  <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Entropy Strength
                  </div>
                  <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981' }}>
                    {entropyData[selectedEntry.id].bits}
                  </div>
                  <div style={{ fontSize: '11px', color: '#52525b', marginTop: '4px' }}>
                    bits ({entropyData[selectedEntry.id].quality})
                  </div>
                </div>
                <div style={{ background: 'rgba(59,130,246,0.05)', border: '1px solid rgba(59,130,246,0.2)', padding: '12px', borderRadius: '2px' }}>
                  <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Status
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: entropyData[selectedEntry.id].status === 'success' ? '#10b981' : entropyData[selectedEntry.id].status === 'warning' ? '#f59e0b' : '#ef4444' }}>
                    {entropyData[selectedEntry.id].status.toUpperCase()}
                  </div>
                </div>
                <div style={{ background: 'rgba(160,174,192,0.05)', border: '1px solid rgba(160,174,192,0.2)', padding: '12px', borderRadius: '2px' }}>
                  <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px', textTransform: 'uppercase' }}>
                    Quality Level
                  </div>
                  <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#d4d4d8' }}>
                    {entropyData[selectedEntry.id].quality}
                  </div>
                </div>
              </div>

              {/* Entropy Sources */}
              <div style={{ marginTop: '16px' }}>
                <div style={{ fontSize: '11px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase', fontWeight: 'bold' }}>
                  Entropy Sources (5-point aggregation)
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
                  {entropyData[selectedEntry.id].sources?.map((source, idx) => (
                    <div
                      key={idx}
                      style={{
                        background: source.status === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
                        border: source.status === 'success' ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(239,68,68,0.3)',
                        padding: '10px',
                        borderRadius: '2px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '4px' }}>
                        {source.name}
                      </div>
                      <div style={{ fontSize: '18px', fontWeight: 'bold', color: source.status === 'success' ? '#10b981' : '#ef4444' }}>
                        {source.bits}b
                      </div>
                      <div style={{ fontSize: '9px', color: '#a1a1aa', marginTop: '2px' }}>
                        {source.quality}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security Message */}
              <div style={{ marginTop: '12px', fontSize: '12px', color: '#52525b', background: 'rgba(16,185,129,0.05)', padding: '10px', borderRadius: '2px', border: '1px solid rgba(16,185,129,0.2)' }}>
                {entropyData[selectedEntry.id].message}
              </div>
            </div>
          ) : loadingEntropy ? (
            <div style={{ marginTop: '20px', fontSize: '12px', color: '#71717a' }}>
              Loading entropy analysis...
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
