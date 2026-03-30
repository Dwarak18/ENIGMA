/**
 * src/components/HardwareStatusChip.jsx
 * Small chip showing a hardware component's name, online/offline dot, and detail text.
 */
export default function HardwareStatusChip({ name, status, details }) {
  return (
    <div
      className="flex items-center gap-2"
      style={{
        background: 'rgba(24, 24, 27, 0.3)',
        border: '1px solid rgba(63, 63, 70, 0.3)',
        padding: '8px 12px',
        borderRadius: '2px',
      }}
    >
      <div
        className={status ? 'animate-pulse' : ''}
        style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: status ? '#10b981' : '#ef4444',
          flexShrink: 0,
        }}
      />
      <div className="flex-1">
        <div style={{ fontSize: '12px', fontWeight: '600', color: '#e4e4e7' }}>{name}</div>
        <div style={{ fontSize: '10px', color: '#71717a' }}>{details}</div>
      </div>
    </div>
  );
}
