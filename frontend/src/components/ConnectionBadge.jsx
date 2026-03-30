/**
 * src/components/ConnectionBadge.jsx
 * Shows current WebSocket connection status.
 */
import { clsx } from 'clsx';

const STATUS_CONFIG = {
  connected:    { label: 'Live',         dot: 'bg-emerald-400 animate-pulse' },
  disconnected: { label: 'Disconnected', dot: 'bg-red-400'                   },
  connecting:   { label: 'Connecting',   dot: 'bg-yellow-400 animate-pulse'  },
  error:        { label: 'Error',        dot: 'bg-red-600'                   },
};

export default function ConnectionBadge({ status }) {
  const { label, dot } = STATUS_CONFIG[status] || STATUS_CONFIG.disconnected;

  return (
    <span className={clsx(
      'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold',
      'border border-white/10 bg-white/5 text-white/80',
    )}>
      <span className={clsx('w-2 h-2 rounded-full', dot)} />
      {label}
    </span>
  );
}
