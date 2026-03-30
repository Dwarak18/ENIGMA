/**
 * src/components/EntropyCard.jsx
 * Displays a single entropy record in card format (used in live feed).
 */
import { format } from 'date-fns';
import VerificationBadge from './VerificationBadge.jsx';

function truncate(str, len = 24) {
  if (!str) return '';
  return str.length > len ? str.slice(0, len) + '…' : str;
}

export default function EntropyCard({ record, isLatest = false }) {
  const localTime = format(new Date(record.created_at || record.timestamp * 1000), 'HH:mm:ss');

  return (
    <div className={`
      rounded-xl border p-4 transition-all duration-300
      ${isLatest
        ? 'border-cyan-500/50 bg-cyan-950/30 shadow-lg shadow-cyan-500/10 scale-[1.01]'
        : 'border-white/10 bg-white/5 hover:border-white/20'}
    `}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-cyan-400">{record.device_id}</span>
          {isLatest && (
            <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-500/30 font-bold">
              LATEST
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <VerificationBadge verified={record.verified} />
          <span className="text-xs text-white/40 font-mono">{localTime}</span>
        </div>
      </div>

      {/* Hash */}
      <div className="space-y-1">
        <p className="text-[10px] text-white/40 uppercase tracking-widest">Entropy Hash</p>
        <p className="font-mono text-xs text-emerald-300 break-all leading-relaxed">
          {record.entropy_hash}
        </p>
      </div>

      {/* Signature */}
      <div className="mt-2 space-y-1">
        <p className="text-[10px] text-white/40 uppercase tracking-widest">Signature (r‖s)</p>
        <p className="font-mono text-[11px] text-white/50 break-all leading-relaxed">
          {truncate(record.signature, 64)}
        </p>
      </div>

      {/* AES fields (shown when present) */}
      {record.aes_ciphertext && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <p className="text-[10px] text-white/40 uppercase tracking-widest">AES Cipher</p>
            <p className="font-mono text-[11px] text-amber-300/80 break-all leading-relaxed">
              {record.aes_ciphertext}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-white/40 uppercase tracking-widest">AES IV</p>
            <p className="font-mono text-[11px] text-purple-300/80 break-all leading-relaxed">
              {record.aes_iv}
            </p>
          </div>
        </div>
      )}

      {/* RTC time (shown when present) */}
      {record.rtc_time && (
        <div className="mt-2 space-y-1">
          <p className="text-[10px] text-white/40 uppercase tracking-widest">RTC (IST)</p>
          <p className="font-mono text-[11px] text-cyan-300/70">{record.rtc_time}</p>
        </div>
      )}

      {/* Hash visualizer */}
      <HashBar hash={record.entropy_hash} />
    </div>
  );
}

/**
 * Visual representation of the hash as colored blocks.
 */
function HashBar({ hash }) {
  if (!hash) return null;
  const bytes = hash.match(/.{2}/g) || [];
  return (
    <div className="mt-3 flex gap-px flex-wrap">
      {bytes.slice(0, 32).map((b, i) => {
        const val = parseInt(b, 16);
        const brightness = Math.round((val / 255) * 100);
        return (
          <div
            key={i}
            title={`0x${b}`}
            className="w-3 h-3 rounded-sm transition-colors duration-700"
            style={{
              backgroundColor: `hsl(${(val * 5) % 360}, 70%, ${20 + brightness * 0.3}%)`,
            }}
          />
        );
      })}
    </div>
  );
}
