/**
 * src/components/DevicePairingBadge.jsx
 * Shows the pairing/connection status of each registered hardware device.
 *
 * States:
 *   PAIRED + ONLINE   → green pulsing dot  + "⬡ CONNECTED"
 *   PAIRED + OFFLINE  → yellow dot         + "PAIRED / OFFLINE"
 *   UNPAIRED (no key) → red dot            + "NOT PAIRED"
 *
 * Props:
 *   devices      – array from systemStatus.devices (DB snapshot)
 *   deviceStates – realtime overrides from device:status WS events
 */
import { useState, useEffect } from 'react';

export default function DevicePairingBadge({ devices = [], deviceStates = {} }) {
  // Tick every second so "Xs ago" stays live
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  if (devices.length === 0) {
    return (
      <div
        style={{
          padding: '8px 10px',
          borderRadius: '2px',
          background: 'rgba(24,24,27,0.4)',
          border: '1px solid rgba(63,63,70,0.25)',
        }}
      >
        <div style={{ fontSize: '10px', color: '#52525b', textAlign: 'center' }}>
          No devices registered
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {devices.map((device) => {
        // Realtime override wins over DB snapshot
        const rt       = deviceStates[device.device_id];
        const isPaired = device.has_key;
        const isOnline = rt ? rt.online : device.online;
        const lastSeen = (rt?.last_seen) || device.last_seen;

        /* colour / label logic */
        let dotColor  = '#ef4444';   /* red   – not paired */
        let dotGlow   = 'none';
        let dotPulse  = false;
        let label     = 'NOT PAIRED';
        let labelColor = '#71717a';

        if (isPaired && isOnline) {
          dotColor   = '#10b981';
          dotGlow    = '0 0 6px #10b981';
          dotPulse   = true;
          label      = '⬡ CONNECTED';
          labelColor = '#10b981';
        } else if (isPaired && !isOnline) {
          dotColor   = '#f59e0b';
          label      = 'PAIRED / OFFLINE';
          labelColor = '#f59e0b';
        }

        /* format last_seen as live relative time */
        const lastSeenText = lastSeen
          ? relativeTime(new Date(lastSeen))
          : 'never';

        return (
          <div
            key={device.device_id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '8px 10px',
              borderRadius: '2px',
              background: 'rgba(24,24,27,0.5)',
              border: `1px solid ${isOnline ? 'rgba(16,185,129,0.25)' : 'rgba(63,63,70,0.3)'}`,
              transition: 'border-color 0.5s',
            }}
          >
            {/* Status dot */}
            <div
              className={dotPulse ? 'animate-pulse' : ''}
              style={{
                width: '9px',
                height: '9px',
                borderRadius: '50%',
                background: dotColor,
                boxShadow: dotGlow,
                flexShrink: 0,
                transition: 'background 0.4s, box-shadow 0.4s',
              }}
            />

            {/* Device info */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: '11px',
                  fontWeight: '700',
                  color: '#e4e4e7',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontFamily: 'monospace',
                }}
              >
                {device.device_id}
              </div>
              <div style={{ fontSize: '9px', color: labelColor, marginTop: '1px', transition: 'color 0.4s' }}>
                {label}
              </div>
              <div style={{ fontSize: '9px', color: '#52525b', marginTop: '1px' }}>
                last: {lastSeenText}
              </div>
            </div>

            {/* Paired key icon */}
            {isPaired && (
              <div
                title="Public key registered"
                style={{ fontSize: '12px', color: '#3b82f6', flexShrink: 0 }}
              >
                ⬢
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Format a Date as a short relative string */
function relativeTime(date) {
  const diffSec = Math.floor((Date.now() - date.getTime()) / 1000);
  if (diffSec < 5)   return 'just now';
  if (diffSec < 60)  return `${diffSec}s ago`;
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  return `${Math.floor(diffSec / 3600)}h ago`;
}
