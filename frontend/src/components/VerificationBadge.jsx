/**
 * src/components/VerificationBadge.jsx
 * Verified / Failed indicator for individual records.
 */
import { clsx } from 'clsx';

export default function VerificationBadge({ verified }) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold tracking-wide',
      verified
        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'bg-red-500/20 text-red-300 border border-red-500/30',
    )}>
      {verified ? '✓ VERIFIED' : '✗ FAILED'}
    </span>
  );
}
