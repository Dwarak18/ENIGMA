/**
 * src/pages/BlockchainPage.jsx
 * Real-time Sepolia Blockchain Anchoring dashboard with Metamask integration.
 */
import { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatHash, getDefaultBackendUrl } from '../utils.js';

/** Format a UNIX epoch (seconds) to "YYYY-MM-DD HH:MM:SS UTC" */
function fmtEpoch(ts) {
  if (!ts) return '—';
  return new Date(Number(ts) * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

export default function BlockchainPage({ records, latestRecord, firmwareRtcTime }) {
  const [account, setAccount] = useState(null);
  const [network, setNetwork] = useState(null);
  const [contractConfig, setContractConfig] = useState(null);
  const [anchoredRecords, setAnchoredRecords] = useState([]);
  const [onChainCount, setOnChainCount] = useState('—');
  const [isConnecting, setIsConnecting] = useState(false);

  const backendUrl = getDefaultBackendUrl();

  // 1. Fetch backend blockchain config and real anchored records
  const refreshAnchoredData = useCallback(async () => {
    try {
      // Fetch anchored records from our database (ones confirmed by backend)
      const r = await fetch(`${backendUrl}/api/v1/entropy/anchored`);
      const b = await r.json();
      if (b.ok) setAnchoredRecords(b.data);

      // Fetch contract config
      const cr = await fetch(`${backendUrl}/api/v1/system/blockchain-config`);
      const cb = await cr.json();
      if (cb.ok) setContractConfig(cb.data);
    } catch (err) {
      console.error('Failed to fetch anchored data', err);
    }
  }, [backendUrl]);

  useEffect(() => {
    refreshAnchoredData();
    const interval = setInterval(refreshAnchoredData, 10000);
    return () => clearInterval(interval);
  }, [refreshAnchoredData]);

  // 2. Metamask Logic
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert('Metamask not detected. Please install it to use this feature.');
      return;
    }
    try {
      setIsConnecting(true);
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const net = await provider.getNetwork();
      
      setAccount(accounts[0]);
      setNetwork(net);

      // If connected to correct contract, fetch on-chain count directly
      if (contractConfig?.contractAddress) {
        const contract = new ethers.Contract(contractConfig.contractAddress, contractConfig.abi, provider);
        const count = await contract.getRecordCount();
        setOnChainCount(count.toString());
      }
    } catch (err) {
      console.error('Wallet connection failed', err);
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="space-y-6">

      {/* ── Metamask Connection Panel ────────────────────────────────── */}
      <div className="card" style={{ borderLeft: account ? '4px solid #10b981' : '4px solid #3b82f6' }}>
        <div className="flex items-center justify-between">
          <div>
            <h2 style={{ fontSize: '14px', fontWeight: 'bold', color: '#fafafa', marginBottom: '4px' }}>
              BLOCKCHAIN WALLET (METAMASK)
            </h2>
            <p style={{ fontSize: '11px', color: '#71717a' }}>
              Connect to Sepolia Testnet to verify anchors directly on-chain.
            </p>
          </div>
          {!account ? (
            <button 
              onClick={connectWallet}
              disabled={isConnecting}
              style={{
                background: '#3b82f6', color: 'white', border: 'none', padding: '8px 16px',
                borderRadius: '2px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer'
              }}
            >
              {isConnecting ? 'CONNECTING...' : 'CONNECT WALLET'}
            </button>
          ) : (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '12px', fontWeight: 'bold', color: '#10b981' }}>CONNECTED</div>
              <div style={{ fontSize: '10px', color: '#71717a', fontFamily: 'monospace' }}>
                {account.slice(0, 6)}...{account.slice(-4)} | {network?.name?.toUpperCase()}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Firmware Sync */}
        <div className="card col-span-1">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase' }}>Hardware Time Sync</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: firmwareRtcTime ? '#10b981' : '#52525b', fontFamily: 'monospace' }}>
            {firmwareRtcTime || '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#52525b', marginTop: '4px' }}>
            {firmwareRtcTime ? 'NTP/SNTP Synchronized' : 'Waiting for hardware...'}
          </div>
        </div>

        {/* Contract Info */}
        <div className="card col-span-2">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase' }}>Anchor Contract (Sepolia)</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#3b82f6', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {contractConfig?.contractAddress || 'Not Configured'}
              </div>
              <div style={{ fontSize: '10px', color: '#71717a', marginTop: '4px' }}>
                {contractConfig?.enabled ? '✓ Backend automated anchoring active' : '✗ Anchoring disabled in backend config'}
              </div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 20px', borderLeft: '1px solid #27272a' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '4px' }}>TOTAL ON-CHAIN</div>
              <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fafafa' }}>{onChainCount}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Anchored Records Table ────────────────────────────────────── */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
          <span>VERIFIED ON-CHAIN ANCHORS</span>
        </div>
        {anchoredRecords.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px', color: '#52525b' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>⬡</div>
            <div style={{ fontSize: '13px' }}>No records confirmed on Sepolia yet.</div>
            <div style={{ fontSize: '11px', marginTop: '8px' }}>Ensure your backend has a PRIVATE_KEY and RPC_URL configured.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ background: 'rgba(0,0,0,0.2)' }}>
                <tr style={{ textAlign: 'left', fontSize: '10px', color: '#71717a' }}>
                  <th style={{ padding: '12px 16px' }}>BLOCKCHAIN TX</th>
                  <th style={{ padding: '12px 16px' }}>ENTROPY HASH</th>
                  <th style={{ padding: '12px 16px' }}>HARDWARE TIME</th>
                  <th style={{ padding: '12px 16px' }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {anchoredRecords.map((r, idx) => (
                  <tr key={idx} style={{ borderTop: '1px solid #27272a', fontSize: '12px' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <a 
                        href={`https://sepolia.etherscan.io/tx/${r.tx_hash}`} 
                        target="_blank" 
                        rel="noreferrer"
                        style={{ color: '#3b82f6', fontFamily: 'monospace', textDecoration: 'none' }}
                      >
                        {formatHash(r.tx_hash, 8)}
                      </a>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#10b981' }}>
                      {formatHash(r.entropy_hash, 12)}
                    </td>
                    <td style={{ padding: '12px 16px', color: '#a1a1aa' }}>
                      {new Date(r.confirmed_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <StatusBadge status="confirmed" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Info banner */}
      <div style={{ padding: '14px 18px', borderRadius: '2px', background: 'rgba(16,185,129,.05)', border: '1px solid rgba(16,185,129,.2)', fontSize: '12px', color: '#a7f3d0' }}>
        <strong>⬡ Immutable Anchoring Active</strong> — This system automatically anchors every hardware record to the Ethereum Sepolia Testnet. 
        Confirmation happens once the transaction is included in a block. You can click any transaction ID to verify the proof on Etherscan.
      </div>
    </div>
  );
}
