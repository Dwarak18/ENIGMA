/**
 * src/pages/LedgerPage.jsx
 * Searchable + filterable ledger table with entry detail panel.
 */
import { useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash, formatTimestamp } from '../utils.js';

export default function LedgerPage({ ledgerEntries }) {
  const [selectedEntry, setSelectedEntry] = useState(null);

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
              {ledgerEntries.slice(0, 15).map((entry) => (
                <tr key={entry.id} onClick={() => setSelectedEntry(entry)} style={{ cursor: 'pointer' }}>
                  <td style={{ color: '#d4d4d8' }}>#{entry.frameIndex}</td>
                  <td style={{ fontSize: '12px', color: '#a1a1aa' }}>
                    {formatTimestamp(entry.timestamp).slice(11)}
                  </td>
                  <td style={{ fontSize: '12px', color: '#10b981' }}>
                    {formatHash(entry.combinedHash, 8)}
                  </td>
                  <td><StatusBadge status={entry.signatureStatus} size="sm" /></td>
                  <td><StatusBadge status={entry.blockchainStatus} size="sm" /></td>
                  <td style={{ fontSize: '12px', color: '#71717a' }}>
                    {entry.entropyScore.toFixed(0)}
                  </td>
                </tr>
              ))}
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
        </div>
      )}
    </div>
  );
}
