/**
 * src/pages/EntropyPage.jsx
 * Live capture preview + entropy quality + cryptographic hashes.
 */
import { formatHash } from '../utils.js';

export default function EntropyPage({ entropyScore, latestRecord, currentFrame }) {
  const hashFields = latestRecord
    ? [
        { label: 'ENTROPY HASH (SHA-256)', value: latestRecord.entropy_hash },
        { label: 'RECORD ID',              value: latestRecord.id           },
        { label: 'ECDSA SIGNATURE',        value: latestRecord.signature    },
        { label: 'DEVICE ID',              value: latestRecord.device_id    },
      ]
    : [
        { label: 'ENTROPY HASH (SHA-256)', value: null },
        { label: 'RECORD ID',              value: null },
        { label: 'ECDSA SIGNATURE',        value: null },
        { label: 'DEVICE ID',              value: null },
      ];

  const encryptedFields = latestRecord
    ? [
        { label: 'AES CIPHERTEXT',              value: latestRecord.aes_ciphertext },
        { label: 'AES IV',                      value: latestRecord.aes_iv },
        { label: 'IMAGE BITSTREAM (ENCRYPTED)', value: latestRecord.image_encrypted },
        { label: 'IMAGE IV',                    value: latestRecord.image_iv },
        { label: 'IMAGE HASH (SHA-256)',        value: latestRecord.image_hash },
      ]
    : [
        { label: 'AES CIPHERTEXT',              value: null },
        { label: 'AES IV',                      value: null },
        { label: 'IMAGE BITSTREAM (ENCRYPTED)', value: null },
        { label: 'IMAGE IV',                    value: null },
        { label: 'IMAGE HASH (SHA-256)',        value: null },
      ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-6">
        {/* Live Image Panel */}
        <div className="col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 style={{ fontSize: '14px', fontWeight: 'bold' }}>LIVE CAPTURE</h2>
            <div className="flex gap-2">
              <button style={{ fontSize: '10px', padding: '4px 12px', borderRadius: '2px', background: '#2563eb', color: 'white', border: 'none' }}>
                ORIGINAL
              </button>
              <button style={{ fontSize: '10px', padding: '4px 12px', borderRadius: '2px', background: '#27272a', color: '#a1a1aa', border: 'none' }}>
                PROCESSED
              </button>
            </div>
          </div>
          <div className="aspect-video relative" style={{ background: '#09090b', border: '1px solid #27272a', borderRadius: '2px', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {latestRecord?.image_preview ? (
                <img
                  src={latestRecord.image_preview}
                  alt="Live Capture"
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                />
              ) : (
                <div
                  className="lava-lamp"
                  style={{
                    width: '256px', height: '256px', borderRadius: '50%',
                    background: 'radial-gradient(circle at 30% 40%, #ff6b6b, #ee5a6f 30%, #c44569 60%, #8b3a62 90%)',
                  }}
                />
              )}
            </div>
            <div style={{ position: 'absolute', top: '16px', left: '16px', background: 'rgba(0,0,0,0.7)', padding: '4px 12px', fontSize: '10px', color: '#d4d4d8' }}>
              {latestRecord ? `Frame #${latestRecord.id?.slice(0, 8)} • ORIGINAL` : `Frame #${currentFrame} • WAITING...`}
            </div>
          </div>
        </div>

        {/* Entropy Quality */}
        <div className="card">
          <h3 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>ENTROPY QUALITY</h3>
          <div style={{ textAlign: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#10b981' }}>
              {entropyScore.toFixed(1)}
            </div>
            <div style={{ fontSize: '14px', color: '#71717a' }}>/ 100</div>
          </div>
          <div style={{
            padding: '8px', borderRadius: '2px', textAlign: 'center', fontSize: '12px',
            background: entropyScore < 60 ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
            color:      entropyScore < 60 ? '#f87171'              : '#34d399',
          }}>
            {entropyScore < 60 ? '⚠ Low entropy detected' : '✓ Quality within normal range'}
          </div>
        </div>
      </div>

      {/* Cryptographic Hashes */}
      <div className="card">
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>CRYPTOGRAPHIC HASHES</h2>
        <div className="grid grid-cols-2 gap-4">
          {hashFields.map(({ label, value }) => (
            <div key={label} style={{ background: '#09090b', border: '1px solid #27272a', padding: '16px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>{label}</div>
              <code style={{ fontSize: '12px', color: value ? '#10b981' : '#52525b', wordBreak: 'break-all' }}>
                {value ? formatHash(value, 16) : '— awaiting data —'}
              </code>
            </div>
          ))}
        </div>
      </div>

      {/* Encrypted payload values */}
      <div className="card">
        <h2 style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '16px' }}>ENCRYPTED PAYLOAD</h2>
        <div className="space-y-3">
          {encryptedFields.map(({ label, value }) => (
            <div key={label} style={{ background: '#09090b', border: '1px solid #27272a', padding: '12px', borderRadius: '2px' }}>
              <div style={{ fontSize: '10px', color: '#71717a', marginBottom: '8px' }}>{label}</div>
              <code style={{ fontSize: '12px', color: value ? '#fbbf24' : '#52525b', wordBreak: 'break-all' }}>
                {value || '— not available in current record —'}
              </code>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
