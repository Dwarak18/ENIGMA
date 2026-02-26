/**
 * src/App.jsx
 * TRNG Control System – root component (TRNGDashboard).
 *
 * All WebSocket / REST state lives here; page components receive
 * only the props they need.
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { io } from 'socket.io-client';

import LiveClock          from './components/LiveClock.jsx';
import DevicePairingBadge from './components/DevicePairingBadge.jsx';
import OverviewPage       from './pages/OverviewPage.jsx';
import EntropyPage        from './pages/EntropyPage.jsx';
import LedgerPage         from './pages/LedgerPage.jsx';
import TimeHardwarePage   from './pages/TimeHardwarePage.jsx';
import BlockchainPage     from './pages/BlockchainPage.jsx';
import VerificationPage   from './pages/VerificationPage.jsx';
import CamerasPage        from './pages/CamerasPage.jsx';
import SettingsPage       from './pages/SettingsPage.jsx';

import {
  getDefaultBackendUrl,
  getStatusColor,
  computeEntropyScore,
  buildPipeline,
  adaptRecord,
  formatUptime,
} from './utils.js';

// ── Navigation items ────────────────────────────────────────────────
const NAVIGATION = [
  { id: 'overview',      label: 'Overview',       icon: '◈' },
  { id: 'entropy',       label: 'Live Entropy',   icon: '◉' },
  { id: 'time',          label: 'Time & Hardware',icon: '◷' },
  { id: 'ledger',        label: 'Ledger Explorer',icon: '≡' },
  { id: 'blockchain',    label: 'Blockchain',     icon: '⬡' },
  { id: 'verification',  label: 'Verification',   icon: '✓' },
  { id: 'cameras',       label: 'Cameras',        icon: '⏺' },
  { id: 'settings',      label: 'Settings',       icon: '⚙' },
];

export default function App() {
  // ── UI state ─────────────────────────────────────────────────────
  const [activePage,    setActivePage]    = useState('overview');
  const [nextCaptureIn, setNextCaptureIn] = useState(10);
  const [currentFrame,  setCurrentFrame]  = useState(0);

  // ── Verify state ─────────────────────────────────────────────────
  const [verifyQuery,   setVerifyQuery]   = useState('');
  const [verifyResult,  setVerifyResult]  = useState(null);
  const [verifying,     setVerifying]     = useState(false);

  // ── Backend connection state ──────────────────────────────────────
  const [backendUrl, setBackendUrl] = useState(getDefaultBackendUrl);
  const [wsStatus,   setWsStatus]   = useState('connecting');
  const socketRef                   = useRef(null);

  // ── Live data ─────────────────────────────────────────────────────
  const [records,      setRecords]      = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [latestRecord, setLatestRecord] = useState(null);

  // ── Derived state ─────────────────────────────────────────────────
  const entropyScore  = useMemo(() => computeEntropyScore(latestRecord?.entropy_hash), [latestRecord]);
  const ledgerEntries = useMemo(() => records.map(adaptRecord), [records]);
  const pipeline      = useMemo(() => buildPipeline(records, wsStatus === 'connected'), [records, wsStatus]);

  const hardware = useMemo(() => {
    const devs = systemStatus?.devices;
    if (!devs?.length) {
      return {
        camera:    { connected: false, resolution: '1920x1080', fps: 30, lastCapture: null },
        esp32:     { online: false, lastHeartbeat: null, latency: 0 },
        ds3231:    { synced: false, drift: 0, lastSync: null },
        atecc608a: { present: false, lastSigning: null, firmwareVersion: 'v2.1.3' },
      };
    }
    const d  = devs[0];
    const on = d.online;
    const paired = d.has_key || false;
    return {
      camera:    { connected: on, resolution: '1920x1080', fps: 30, lastCapture: on ? d.last_seen : null },
      esp32:     { online: on, paired, lastHeartbeat: d.last_seen, latency: 12, deviceId: d.device_id, records: d.record_count },
      ds3231:    { synced: on, drift: on ? 0.3 : 0, lastSync: d.last_seen },
      atecc608a: { present: paired, lastSigning: latestRecord?.created_at, firmwareVersion: 'v2.1.3' },
    };
  }, [systemStatus, latestRecord]);

  // ── REST loaders ──────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    try {
      const r = await fetch(`${backendUrl}/api/v1/entropy/history?limit=100`);
      if (!r.ok) return;
      const b = await r.json();
      if (b.data?.length) { setRecords(b.data); setLatestRecord(b.data[0]); }
    } catch (_) {}
  }, [backendUrl]);

  const loadSystemStatus = useCallback(async () => {
    try {
      const r = await fetch(`${backendUrl}/api/v1/system/status`);
      if (!r.ok) return;
      const b = await r.json();
      if (b.data) setSystemStatus(b.data);
    } catch (_) {}
  }, [backendUrl]);

  // ── Socket.IO ─────────────────────────────────────────────────────
  useEffect(() => {
    setWsStatus('connecting');
    setRecords([]);
    setSystemStatus(null);
    setLatestRecord(null);
    loadHistory();
    loadSystemStatus();

    const socket = io(backendUrl, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on('connect',       () => setWsStatus('connected'));
    socket.on('disconnect',    () => setWsStatus('disconnected'));
    socket.on('connect_error', () => setWsStatus('error'));

    socket.on('entropy:new', (rec) => {
      setRecords((prev) => [rec, ...prev].slice(0, 100));
      setLatestRecord(rec);
      setCurrentFrame((f) => f + 1);
    });

    socket.on('entropy:history', (hist) => {
      if (hist?.length) { setRecords(hist); setLatestRecord(hist[0]); }
    });

    socket.on('system:stats', (data) => {
      setSystemStatus((prev) => ({ ...(prev || {}), ...data }));
    });

    socket.on('entropy:lookup_result', (res) => {
      setVerifyResult(res.ok ? { found: true, record: res.record } : { found: false });
      setVerifying(false);
    });

    socket.emit('entropy:fetch_history', { limit: 100 });
    return () => socket.disconnect();
  }, [backendUrl, loadHistory, loadSystemStatus]);

  // ── Countdown timer ───────────────────────────────────────────────
  useEffect(() => {
    const t = setInterval(() => setNextCaptureIn((p) => (p <= 0 ? 10 : p - 1)), 1000);
    return () => clearInterval(t);
  }, []);

  // ── Verify handler ────────────────────────────────────────────────
  const handleVerify = useCallback((query) => {
    if (!query.trim()) return;
    setVerifyResult(null);
    setVerifying(true);
    const local = records.find((r) => r.entropy_hash === query || r.id === query);
    if (local) { setVerifyResult({ found: true, record: local }); setVerifying(false); return; }
    const sock = socketRef.current;
    if (sock?.connected) {
      sock.emit('entropy:lookup', { entropy_hash: query });
      setTimeout(() => {
        setVerifying(false);
        setVerifyResult((prev) => prev || { found: false });
      }, 5000);
    } else {
      setVerifyResult({ found: false });
      setVerifying(false);
    }
  }, [records]);

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#0a0a0a', color: '#fafafa' }}>

      {/* ── Top Bar ──────────────────────────────────────────────── */}
      <div
        className="sticky top-0 z-50"
        style={{ borderBottom: '1px solid #27272a', background: 'rgba(24,24,27,0.8)', backdropFilter: 'blur(4px)' }}
      >
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-bold uppercase tracking-wider flex items-center gap-3">
              <span style={{ color: '#10b981' }}>⬢</span>
              TRNG Control System
            </h1>
            <div className="flex items-center gap-2" style={{ fontSize: '10px', color: '#71717a' }}>
              <span>v2.1.0</span>
              {systemStatus?.uptime && (
                <><span>•</span><span>Up {formatUptime(systemStatus.uptime)}</span></>
              )}
              <span>•</span>
              <span style={{ color: getStatusColor(wsStatus) }}>
                {wsStatus === 'connected'
                  ? '● Connected'
                  : wsStatus === 'connecting'
                  ? '◌ Connecting…'
                  : '○ ' + wsStatus}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <LiveClock />
            <div style={{ width: '1px', height: '32px', background: '#27272a' }} />
            <span style={{ fontSize: '10px', color: '#3b82f6' }}>{backendUrl}</span>
            <div style={{
              width: '32px', height: '32px',
              background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
              borderRadius: '2px', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: '12px', fontWeight: 'bold',
            }}>
              OP
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* ── Sidebar ────────────────────────────────────────────── */}
        <div style={{
          width: '256px', borderRight: '1px solid #27272a',
          background: 'rgba(24,24,27,0.5)', minHeight: 'calc(100vh - 73px)', padding: '16px',
        }}>
          <nav className="space-y-1">
            {NAVIGATION.map((item) => (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                className={`nav-button${activePage === item.id ? ' active' : ''}`}
              >
                <span style={{ fontSize: '18px' }}>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          {/* ── Device Pairing Status ──────────────────────────── */}
          <div style={{ marginTop: '24px', paddingTop: '16px', borderTop: '1px solid #27272a' }}>
            <div style={{
              fontSize: '9px', color: '#52525b', marginBottom: '8px',
              letterSpacing: '0.12em', fontWeight: '600',
            }}>
              HARDWARE DEVICES
            </div>
            <DevicePairingBadge devices={systemStatus?.devices ?? []} />
          </div>
        </div>

        {/* ── Main Content ───────────────────────────────────────── */}
        <div style={{ flex: 1, padding: '32px', paddingBottom: '80px' }}>

          {activePage === 'overview' && (
            <OverviewPage
              wsStatus={wsStatus}
              backendUrl={backendUrl}
              systemStatus={systemStatus}
              hardware={hardware}
              nextCaptureIn={nextCaptureIn}
              ledgerEntries={ledgerEntries}
              pipeline={pipeline}
            />
          )}

          {activePage === 'entropy' && (
            <EntropyPage
              entropyScore={entropyScore}
              latestRecord={latestRecord}
              currentFrame={currentFrame}
            />
          )}

          {activePage === 'ledger' && (
            <LedgerPage ledgerEntries={ledgerEntries} />
          )}

          {activePage === 'time' && (
            <TimeHardwarePage
              hardware={hardware}
              systemStatus={systemStatus}
              latestRecord={latestRecord}
            />
          )}

          {activePage === 'blockchain' && (
            <BlockchainPage records={records} />
          )}

          {activePage === 'verification' && (
            <VerificationPage
              records={records}
              verifyQuery={verifyQuery}    setVerifyQuery={setVerifyQuery}
              verifyResult={verifyResult}  verifying={verifying}
              onVerify={handleVerify}
            />
          )}

          {activePage === 'cameras' && <CamerasPage />}

          {activePage === 'settings' && (
            <SettingsPage
              backendUrl={backendUrl}  setBackendUrl={setBackendUrl}
              wsStatus={wsStatus}      systemStatus={systemStatus}
            />
          )}
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────── */}
      <div
        className="fixed bottom-0 left-0 right-0 z-40"
        style={{ borderTop: '1px solid #27272a', background: 'rgba(24,24,27,0.8)', backdropFilter: 'blur(4px)' }}
      >
        <div className="flex items-center justify-between px-6 py-2" style={{ fontSize: '10px', color: '#71717a' }}>
          <div className="flex items-center gap-6">
            {systemStatus?.system ? (
              <>
                <span>Heap: <span style={{ color: '#10b981' }}>{systemStatus.system.memory?.usedMB}MB / {systemStatus.system.memory?.totalMB}MB</span></span>
                <span>Load: <span style={{ color: '#10b981' }}>{systemStatus.system.load}</span></span>
                <span>Node: <span style={{ color: '#a1a1aa' }}>{systemStatus.system.nodeVersion}</span></span>
                <span>Uptime: <span style={{ color: '#10b981' }}>{formatUptime(systemStatus.uptime)}</span></span>
              </>
            ) : (
              <span style={{ color: '#52525b' }}>Backend unreachable — run: docker compose up -d</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>WS: <span style={{ color: '#3b82f6' }}>{backendUrl}</span></span>
            <div className="flex items-center gap-2">
              <div
                className={wsStatus === 'connected' ? 'animate-pulse' : ''}
                style={{ width: '6px', height: '6px', borderRadius: '50%', background: getStatusColor(wsStatus) }}
              />
              <span style={{ color: getStatusColor(wsStatus) }}>{wsStatus.toUpperCase()}</span>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
