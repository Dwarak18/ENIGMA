/**
 * src/pages/CamerasPage.jsx
 * Live webcam preview for all detected video devices.
 */
import { useState, useEffect, useRef } from 'react';
import StatusBadge from '../components/StatusBadge.jsx';

/* ── Single webcam feed ─────────────────────────────────────────────── */
function WebcamFeed({ deviceId, label }) {
  const videoRef = useRef(null);
  const [active, setActive] = useState(false);
  const [err, setErr]       = useState(null);

  useEffect(() => {
    let stream = null;
    const start = async () => {
      try {
        const constraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : true,
          audio: false,
        };
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setActive(true);
        }
      } catch (e) {
        setErr(e.message);
      }
    };
    start();
    return () => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      setActive(false);
    };
  }, [deviceId]);

  return (
    <div className="card">
      <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '.05em', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{label}</span>
        {active && (
          <span style={{ color: '#ef4444', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span className="animate-pulse" style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: '#ef4444' }} />
            LIVE
          </span>
        )}
      </div>
      {err ? (
        <div style={{ padding: '48px 0', textAlign: 'center', color: '#ef4444', fontSize: '12px' }}>
          ✗ {err}
        </div>
      ) : (
        <div style={{ position: 'relative', background: '#09090b', border: '1px solid #27272a', borderRadius: '2px', overflow: 'hidden', aspectRatio: '16/9' }}>
          <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        </div>
      )}
    </div>
  );
}

/* ── Cameras page ───────────────────────────────────────────────────── */
export default function CamerasPage() {
  const [devices, setDevices] = useState([]);
  const [permErr, setPermErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        s.getTracks().forEach((t) => t.stop());
        const all = await navigator.mediaDevices.enumerateDevices();
        setDevices(all.filter((d) => d.kind === 'videoinput'));
      } catch (e) {
        setPermErr(e.message);
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '48px', color: '#71717a', fontSize: '13px' }}>
        Requesting camera access…
      </div>
    );
  }

  if (permErr) {
    return (
      <div className="card">
        <div style={{ color: '#ef4444', fontSize: '14px', fontWeight: 'bold' }}>✗ Camera access denied</div>
        <div style={{ color: '#71717a', fontSize: '12px', marginTop: '8px' }}>{permErr}</div>
        <div style={{ color: '#71717a', fontSize: '12px', marginTop: '4px' }}>
          Allow camera permission in your browser and reload the page.
        </div>
      </div>
    );
  }

  const laptop   = devices[0];
  const external = devices[1];

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="card">
        <div className="grid grid-cols-4 gap-6">
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>CAMERAS FOUND</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10b981' }}>{devices.length}</div>
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>LAPTOP CAM</div>
            <StatusBadge status={laptop ? 'healthy' : 'error'} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>EXTERNAL CAM</div>
            <StatusBadge status={external ? 'healthy' : 'offline'} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px', textTransform: 'uppercase' }}>MODE</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#3b82f6' }}>LIVE PREVIEW</div>
          </div>
        </div>
      </div>

      {/* Primary feeds */}
      <div className="grid grid-cols-2 gap-6">
        {laptop ? (
          <WebcamFeed deviceId={laptop.deviceId} label={`Laptop Camera — ${laptop.label || 'Device 0'}`} />
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <div style={{ color: '#52525b', fontSize: '13px' }}>No laptop camera detected</div>
          </div>
        )}
        {external ? (
          <WebcamFeed deviceId={external.deviceId} label={`External Camera — ${external.label || 'Device 1'}`} />
        ) : (
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '200px' }}>
            <div style={{ color: '#52525b', fontSize: '13px', textAlign: 'center' }}>
              No external camera detected<br />
              <span style={{ color: '#3f3f46', fontSize: '11px' }}>Connect a USB camera and reload</span>
            </div>
          </div>
        )}
      </div>

      {/* Additional cameras */}
      {devices.length > 2 && (
        <div className="card">
          <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase' }}>
            Additional Cameras
          </div>
          <div className="grid grid-cols-2 gap-6">
            {devices.slice(2).map((dev, i) => (
              <WebcamFeed
                key={dev.deviceId}
                deviceId={dev.deviceId}
                label={`Camera ${i + 3} — ${dev.label || `Device ${i + 2}`}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Device registry */}
      <div className="card">
        <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '12px', textTransform: 'uppercase' }}>
          Device Registry
        </div>
        {devices.map((d, i) => (
          <div key={d.deviceId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '6px', padding: '8px', background: '#09090b', border: '1px solid #27272a', borderRadius: '2px' }}>
            <span style={{ color: '#71717a' }}>Device {i}</span>
            <span style={{ color: '#d4d4d8', flex: 1, marginLeft: '16px', wordBreak: 'break-all' }}>
              {d.label || `Camera ${i}`}
            </span>
            <span style={{ color: '#52525b', fontSize: '10px', marginLeft: '8px' }}>
              {d.deviceId.slice(0, 16)}…
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
