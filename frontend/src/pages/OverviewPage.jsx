/**
 * src/pages/OverviewPage.jsx
 * Global status, hardware chips, key metrics, and pipeline view.
 */
import StatusBadge        from '../components/StatusBadge.jsx';
import MetricCard         from '../components/MetricCard.jsx';
import HardwareStatusChip from '../components/HardwareStatusChip.jsx';
import { getStatusColor } from '../utils.js';

export default function OverviewPage({
  wsStatus, backendUrl, systemStatus,
  hardware, nextCaptureIn, ledgerEntries, pipeline,
  trngStatus = { state: 'inactive', pipeline: [] },
}) {
  return (
    <div className="space-y-6">
      {/* Global Status Header */}
      <div className="card">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>SYSTEM STATUS</div>
            <StatusBadge
              status={wsStatus === 'connected' ? 'healthy' : wsStatus === 'connecting' ? 'degraded' : 'error'}
              size="lg"
            />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>BACKEND</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: getStatusColor(wsStatus) }}>
              {wsStatus.toUpperCase()}
            </div>
            <div style={{ fontSize: '10px', color: '#71717a' }}>{backendUrl}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>UPTIME</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {systemStatus?.uptime
                ? `${Math.floor(systemStatus.uptime / 3600)}h ${Math.floor((systemStatus.uptime % 3600) / 60)}m`
                : '—'}
            </div>
            <div style={{ fontSize: '10px', color: '#71717a' }}>
              {systemStatus?.uptime ? `${systemStatus.uptime}s` : 'not available'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>DEVICES</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
              {systemStatus?.activeDevices ?? 0} online
            </div>
            <div style={{ fontSize: '10px', color: '#71717a' }}>
              {systemStatus?.devices?.length ?? 0} registered
            </div>
          </div>
        </div>
      </div>

      {/* Hardware Status Chips */}
      <div className="grid grid-cols-4 gap-4">
        <HardwareStatusChip
          name="CAMERA"
          status={hardware.camera.connected}
          details={hardware.camera.connected
            ? `${hardware.camera.resolution} @ ${hardware.camera.fps}fps`
            : 'Disconnected'}
        />
        <HardwareStatusChip
          name="ESP32"
          status={hardware.esp32.online}
          details={hardware.esp32.online
            ? `Latency: ${hardware.esp32.latency.toFixed(1)}ms`
            : 'Offline'}
        />
        <HardwareStatusChip
          name="DS3231"
          status={hardware.ds3231.synced}
          details={hardware.ds3231.synced
            ? `Drift: ${hardware.ds3231.drift.toFixed(0)}ms`
            : 'Not synced'}
        />
        <HardwareStatusChip
          name="ATECC608A"
          status={hardware.atecc608a.present}
          details={hardware.atecc608a.present
            ? `FW: ${hardware.atecc608a.firmwareVersion}`
            : 'Not detected'}
        />
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard label="NEXT CAPTURE" value={nextCaptureIn} unit="sec" />
        <MetricCard
          label="TOTAL RECORDS"
          value={systemStatus?.totalRecords ?? ledgerEntries.length}
          unit="entries"
          trend="up"
        />
        <MetricCard
          label="VERIFIED"
          value={systemStatus?.verifiedRecords ?? ledgerEntries.filter(e => e.signatureStatus === 'signed').length}
          unit="records"
          trend="neutral"
        />
        <MetricCard label="RATE (60s)" value={systemStatus?.recentRate ?? 0} unit="submissions" />
      </div>

      {/* Pipeline */}
      <div className="card">
        {/* TRNG Pipeline State Banner */}
        {(() => {
          const stateColors = {
            active:    { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.35)', dot: '#10b981', label: '⬡ TRNG ACTIVE', sub: 'Device verified — entropy pipeline running' },
            suspended: { bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.35)',  dot: '#ef4444', label: '⬡ TRNG SUSPENDED', sub: 'Device disconnected — entropy unavailable (GET /latest → 503)' },
            inactive:  { bg: 'rgba(113,113,122,0.08)', border: 'rgba(113,113,122,0.25)', dot: '#71717a', label: '⬡ TRNG INACTIVE', sub: 'No device paired — waiting for ESP32-S3 + ATECC608A' },
          };
          const c = stateColors[trngStatus.state] || stateColors.inactive;
          return (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 14px', marginBottom: '20px',
              background: c.bg, border: `1px solid ${c.border}`, borderRadius: '2px',
            }}>
              <div className={trngStatus.state === 'active' ? 'animate-pulse' : ''} style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: c.dot, flexShrink: 0,
                boxShadow: trngStatus.state === 'active' ? `0 0 8px ${c.dot}` : 'none',
              }} />
              <div style={{ flex: 1 }}>
                <span style={{ fontSize: '11px', fontWeight: '700', color: c.dot, fontFamily: 'monospace', letterSpacing: '.06em' }}>
                  {c.label}
                </span>
                <span style={{ fontSize: '9px', color: '#71717a', marginLeft: '12px' }}>{c.sub}</span>
              </div>
              {trngStatus.pipeline?.length > 0 && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  {trngStatus.pipeline.map(d => {
                    const dc = d.state === 'active' ? '#10b981' : d.state === 'suspended' ? '#ef4444' : '#52525b';
                    return (
                      <div key={d.device_id} style={{
                        fontSize: '9px', color: dc, fontFamily: 'monospace',
                        padding: '2px 8px', border: `1px solid ${dc}40`,
                        background: `${dc}0f`, borderRadius: '2px',
                      }}>
                        {d.device_id} · {d.state}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '24px', color: '#d4d4d8' }}>
          PIPELINE STATUS
        </h2>
        <div className="grid grid-cols-8 gap-3">
          {pipeline.map((step, idx) => (
            <div key={step.id} className="relative">
              <div
                className="cursor-pointer transition-all"
                style={{ border: `2px solid ${getStatusColor(step.status)}`, padding: '12px', borderRadius: '2px' }}
              >
                <div style={{ fontSize: '10px', color: '#a1a1aa', marginBottom: '8px' }}>{step.name}</div>
                <StatusBadge status={step.status} size="sm" />
                <div style={{ marginTop: '8px', fontSize: '9px', color: '#71717a' }}>
                  <div>Latency: {step.latency}ms</div>
                  <div>Rate: {step.successRate.toFixed(1)}%</div>
                </div>
              </div>
              {idx < pipeline.length - 1 && (
                <div style={{
                  position: 'absolute', top: '50%', right: '-12px',
                  width: '24px', height: '2px', background: '#3f3f46',
                  transform: 'translateY(-50%)',
                }} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
