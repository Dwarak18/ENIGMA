/**
 * src/pages/SettingsPage.jsx
 * Backend connection settings, live system info, and about panel.
 */
import { useState } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';
import { formatUptime } from '../utils.js';

export default function SettingsPage({ backendUrl, setBackendUrl, wsStatus, systemStatus }) {
  const [urlInput, setUrlInput] = useState(backendUrl);
  const [testing,  setTesting]  = useState(false);
  const [testMsg,  setTestMsg]  = useState(null);

  const testConn = async () => {
    setTesting(true);
    setTestMsg(null);
    try {
      const r = await fetch(`${urlInput.replace(/\/$/, '')}/health`);
      const b = await r.json();
      setTestMsg({ ok: b.ok, txt: b.ok ? `✓ Connected · ${b.service}` : '✗ Responded but ok=false' });
    } catch (e) {
      setTestMsg({ ok: false, txt: `✗ ${e.message}` });
    }
    setTesting(false);
  };

  const save = () => {
    try { localStorage.setItem('enigma_backend_url', urlInput); } catch (_) {}
    setBackendUrl(urlInput);
  };

  const reset = () => {
    const def = window.location.protocol === 'file:' ? 'http://localhost:3000' : window.location.origin;
    try { localStorage.removeItem('enigma_backend_url'); } catch (_) {}
    setUrlInput(def);
    setBackendUrl(def);
  };

  return (
    <div className="space-y-6">
      {/* Backend Connection */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>Backend Connection</div>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '12px' }}>
          <input
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="http://localhost:3000"
            style={{ flex: 1, minWidth: '200px' }}
          />
          <button
            onClick={testConn}
            disabled={testing}
            style={{ background: '#27272a', color: '#a1a1aa', padding: '8px 14px', fontSize: '13px', borderRadius: '2px', border: 'none', cursor: 'pointer' }}
          >
            {testing ? 'Testing…' : 'Test'}
          </button>
          <button
            onClick={save}
            style={{ background: '#2563eb', color: 'white', padding: '8px 16px', fontSize: '13px', borderRadius: '2px', border: 'none', cursor: 'pointer' }}
          >
            Save &amp; Reconnect
          </button>
        </div>
        {testMsg && (
          <div style={{ fontSize: '12px', color: testMsg.ok ? '#10b981' : '#ef4444', marginBottom: '8px' }}>
            {testMsg.txt}
          </div>
        )}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <StatusBadge status={wsStatus} />
          <button
            onClick={reset}
            style={{ background: 'transparent', border: '1px solid #3f3f46', color: '#71717a', padding: '4px 10px', fontSize: '10px', borderRadius: '2px', cursor: 'pointer' }}
          >
            Reset to Default
          </button>
        </div>
      </div>

      {/* Live System Info */}
      {systemStatus && (
        <div className="card">
          <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px' }}>Live System Info</div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              {[
                ['Node.js',    systemStatus.system?.nodeVersion],
                ['Platform',   systemStatus.system?.platform],
                ['CPU Count',  systemStatus.system?.cpuCount],
                ['Load average', systemStatus.system?.load],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>{k}</span>
                  <span style={{ color: '#d4d4d8' }}>{v || '—'}</span>
                </div>
              ))}
            </div>
            <div>
              {[
                ['Heap used',      systemStatus.system?.memory?.usedMB  != null ? `${systemStatus.system.memory.usedMB} MB`  : '—'],
                ['Total RAM',      systemStatus.system?.memory?.totalMB != null ? `${systemStatus.system.memory.totalMB} MB` : '—'],
                ['Uptime',         formatUptime(systemStatus.uptime)],
                ['Active devices', systemStatus.activeDevices],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px' }}>
                  <span style={{ color: '#71717a' }}>{k}</span>
                  <span style={{ color: '#d4d4d8' }}>{v || '—'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* About */}
      <div className="card">
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '14px' }}>About ENIGMA</div>
        {[
          ['Dashboard',  'v2.1.0'],
          ['REST API',   '/api/v1/entropy, /api/v1/system'],
          ['WebSocket',  'entropy:new · system:stats · entropy:lookup_result'],
          ['Crypto',     'ECDSA secp256r1 / SHA-256'],
          ['Hardware',   'ESP32 + DS3231 + ATECC608A + Camera'],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', flexWrap: 'wrap', gap: '4px' }}>
            <span style={{ color: '#71717a' }}>{k}</span>
            <span style={{ color: '#d4d4d8' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
