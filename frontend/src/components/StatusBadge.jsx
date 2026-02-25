/**
 * src/components/StatusBadge.jsx
 * Coloured badge for system / pipeline / record statuses.
 */
import { getStatusColor } from '../utils.js';

export default function StatusBadge({ status, size = 'md' }) {
  const sizeStyle = {
    sm: { fontSize: '10px', padding: '2px 8px' },
    md: { fontSize: '10px', padding: '4px 12px' },
    lg: { fontSize: '12px', padding: '4px 16px' },
  }[size] || { fontSize: '10px', padding: '4px 12px' };

  const color = getStatusColor(status);
  return (
    <span
      className="status-badge"
      style={{
        ...sizeStyle,
        backgroundColor: `${color}15`,
        color,
        border: `1px solid ${color}40`,
      }}
    >
      {status.replace(/_/g, ' ')}
    </span>
  );
}
