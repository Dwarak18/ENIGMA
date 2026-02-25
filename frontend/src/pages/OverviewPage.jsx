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
