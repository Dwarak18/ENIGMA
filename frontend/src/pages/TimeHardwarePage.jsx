/**
 * src/pages/TimeHardwarePage.jsx
 * System clock, RTC, ESP32, ATECC608A, Camera, and Device Registry.
 */
import { useState, useEffect } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';

export default function TimeHardwarePage({ hardware, systemStatus, latestRecord }) {
  const hw   = hardware || {};
  const devs = systemStatus?.devices || [];
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const pad = (n) => String(n).padStart(2, '0');
  const localTime = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const localDate = now.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const utcTime   = now.toISOString().slice(11, 19);
  const utcDate   = now.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* System Clock */}
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            System Clock (Browser)
          </div>
          <div style={{ fontSize: '28px', fontWeight: 'bold', color: '#10b981', letterSpacing: '.05em' }}>{localTime}</div>
          <div style={{ fontSize: '13px', color: '#a1a1aa', marginTop: '2px' }}>
            {localDate} &nbsp;<span style={{ color: '#52525b' }}>Local</span>
          </div>
          <div style={{ marginTop: '10px', padding: '8px 12px', background: '#09090b', border: '1px solid #27272a', borderRadius: '2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: '#71717a', textTransform: 'uppercase' }}>UTC</span>
            <span style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>{utcTime}</span>
            <span style={{ fontSize: '11px', color: '#52525b' }}>{utcDate}</span>
          </div>
        </div>

        {/* DS3231 */}
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            DS3231 RTC Module
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <StatusBadge status={hw.ds3231?.synced ? 'healthy' : 'warning'} />
          </div>
          <div style={{ fontSize: '12px', color: '#a1a1aa' }}>
            Drift: ≈{hw.ds3231?.drift?.toFixed?.(1) || 0}ms
          </div>
          <div style={{ fontSize: '12px', color: '#71717a', marginTop: '4px' }}>
            Last sync: {hw.ds3231?.lastSync
              ? new Date(hw.ds3231.lastSync).toISOString().replace('T', ' ').slice(0, 19)
              : '—'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* ESP32 */}
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            ESP32 Microcontroller
          </div>
          <StatusBadge status={hw.esp32?.online ? 'healthy' : 'error'} />
          {[
            ['Device ID',      hw.esp32?.deviceId],
            ['Status',         hw.esp32?.online ? 'Online' : 'Offline'],
            ['Records',        hw.esp32?.records?.toLocaleString?.()],
            ['Last heartbeat', hw.esp32?.lastHeartbeat ? new Date(hw.esp32.lastHeartbeat).toISOString().slice(11, 19) : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px' }}>
              <span style={{ color: '#71717a' }}>{k}</span>
              <span style={{ color: '#d4d4d8' }}>{v || '—'}</span>
            </div>
          ))}
        </div>

        {/* ATECC608A */}
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            ATECC608A Crypto Chip
          </div>
          <StatusBadge status={hw.atecc608a?.present ? 'signed' : 'unsigned'} />
          {[
            ['Firmware',        hw.atecc608a?.firmwareVersion],
            ['Signing status',  hw.atecc608a?.present ? (hw.atecc608a.lastSigning ? 'Active' : 'Ready') : 'Not detected'],
            ['Algorithm',       'ECDSA secp256r1'],
            ['Last signing',    hw.atecc608a?.lastSigning ? new Date(hw.atecc608a.lastSigning).toISOString().slice(11, 19) : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginTop: '8px' }}>
              <span style={{ color: '#71717a' }}>{k}</span>
              <span style={{ color: '#d4d4d8' }}>{v || '—'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Entropy Camera */}
      <div className="card">
        <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          Entropy Camera
        </div>
        <div className="grid grid-cols-4 gap-4">
          {[
            { l: 'Status',     v: hw.camera?.connected ? 'Connected' : 'Disconnected', c: hw.camera?.connected ? '#10b981' : '#ef4444' },
            { l: 'Resolution', v: hw.camera?.resolution || '1920x1080' },
            { l: 'Frame rate', v: `${hw.camera?.fps || 30} fps` },
            { l: 'Last frame', v: hw.camera?.lastCapture ? new Date(hw.camera.lastCapture).toISOString().slice(11, 19) : '—' },
          ].map(({ l, v, c }) => (
            <div key={l} style={{ background: '#09090b', border: '1px solid #27272a', padding: '12px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '4px', textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontSize: '14px', fontWeight: '600', color: c || '#d4d4d8' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Device Registry */}
      {devs.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '16px', borderBottom: '1px solid #27272a', fontSize: '14px', fontWeight: 'bold' }}>
            Device Registry
          </div>
          <div className="overflow-x-auto">
            <table>
              <thead>
                <tr>
                  <th>Device ID</th><th>Status</th><th>Records</th><th>First Seen</th><th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {devs.map((d) => (
                  <tr key={d.device_id}>
                    <td style={{ color: '#d4d4d8', fontWeight: '500' }}>{d.device_id}</td>
                    <td><StatusBadge status={d.online ? 'healthy' : 'error'} /></td>
                    <td style={{ color: '#10b981' }}>{d.record_count?.toLocaleString?.() || 0}</td>
                    <td style={{ color: '#71717a', fontSize: '12px' }}>
                      {d.first_seen ? new Date(d.first_seen).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                    <td style={{ color: '#71717a', fontSize: '12px' }}>
                      {d.last_seen ? new Date(d.last_seen).toISOString().replace('T', ' ').slice(0, 19) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Latest Record Timestamps */}
      {latestRecord && (
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            Latest Record Timestamps
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '14px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px' }}>Device Unix Timestamp</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#10b981' }}>{latestRecord.timestamp}</div>
              <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>
                {latestRecord.timestamp ? new Date(latestRecord.timestamp * 1000).toISOString() : '—'}
              </div>
            </div>
            <div style={{ background: '#09090b', border: '1px solid #27272a', padding: '14px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '6px' }}>Server Created At</div>
              <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>
                {latestRecord.created_at ? new Date(latestRecord.created_at).toISOString().replace('T', ' ').slice(0, 19) : '—'}
              </div>
              <div style={{ fontSize: '11px', color: '#71717a', marginTop: '4px' }}>UTC</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
