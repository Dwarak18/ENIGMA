/**
 * src/pages/VerificationPage.jsx
 * Verify entropy record integrity using FastAPI backend.
 */

import { useState } from 'react';
import useEnigmaAPI from '../hooks/useEnigmaAPI';
import StatusBadge from '../components/StatusBadge';

export default function VerificationPage() {
  const [recordId, setRecordId] = useState('');
  const [verificationResult, setVerificationResult] = useState(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState(null);

  const { verifyRecord } = useEnigmaAPI();

  const handleVerify = async (e) => {
    e.preventDefault();
    setError(null);
    setVerificationResult(null);

    if (!recordId.trim()) {
      setError('Please enter a record ID');
      return;
    }

    try {
      setIsVerifying(true);
      const result = await verifyRecord(recordId);
      setVerificationResult(result);
    } catch (err) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Verification Form */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Verify Entropy Record</h2>

        <form onSubmit={handleVerify} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Record ID (UUID)</label>
            <input
              type="text"
              value={recordId}
              onChange={(e) => setRecordId(e.target.value)}
              placeholder="e.g., 550e8400-e29b-41d4-a716-446655440000"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            />
            <p className="text-xs text-gray-500 mt-1">
              Copy the Record ID from a capture result or record list
            </p>
          </div>

          <button
            type="submit"
            disabled={!recordId.trim() || isVerifying}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-2 px-4 rounded-lg transition disabled:cursor-not-allowed"
          >
            {isVerifying ? 'Verifying...' : 'Verify Record'}
          </button>
        </form>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-700 font-medium">✗ {error}</div>
        </div>
      )}

      {/* Verification Result */}
      {verificationResult && (
        <div className={`rounded-lg border p-6 ${
          verificationResult.is_valid
            ? 'bg-green-50 border-green-200'
            : 'bg-red-50 border-red-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Verification Result</h3>
            <StatusBadge
              status={verificationResult.is_valid ? 'confirmed' : 'failed'}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Record ID */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Record ID</label>
              <input
                type="text"
                value={verificationResult.record_id}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded font-mono text-xs"
              />
            </div>

            {/* Timestamp */}
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Timestamp</label>
              <input
                type="text"
                value={new Date(verificationResult.timestamp * 1000).toLocaleString()}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded"
              />
            </div>

            {/* Stored Hash */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Stored Integrity Hash
              </label>
              <input
                type="text"
                value={verificationResult.integrity_hash}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded font-mono text-xs"
              />
            </div>

            {/* Computed Hash */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">
                Computed Integrity Hash
              </label>
              <input
                type="text"
                value={verificationResult.computed_hash}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded font-mono text-xs"
              />
            </div>

            {/* Entropy Hash */}
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-600 mb-1">Entropy Hash</label>
              <input
                type="text"
                value={verificationResult.entropy_hash}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded font-mono text-xs"
              />
            </div>
          </div>

          {/* Verification Status Message */}
          <div className="mt-4 p-3 bg-white rounded border-l-4" style={{
            borderColor: verificationResult.is_valid ? '#10b981' : '#ef4444'
          }}>
            <p className={`font-medium ${
              verificationResult.is_valid ? 'text-green-800' : 'text-red-800'
            }`}>
              {verificationResult.message}
            </p>
          </div>

          {/* Hash Match Indicator */}
          <div className="mt-4 p-3 bg-white rounded">
            <p className="text-sm text-gray-600">
              <span className="font-medium">Hash Match:</span>{' '}
              {verificationResult.integrity_hash === verificationResult.computed_hash ? (
                <span className="text-green-600 font-semibold">✓ Perfect match</span>
              ) : (
                <span className="text-red-600 font-semibold">✗ Mismatch detected</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Information Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">How Verification Works</h3>
        <ol className="text-sm text-blue-800 space-y-2">
          <li className="flex gap-2">
            <span className="font-bold">1.</span>
            <span>Record is retrieved from database</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">2.</span>
            <span>Key is re-derived from stored device_id + timestamp</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">3.</span>
            <span>Integrity hash is recomputed using encrypted data + key</span>
          </li>
          <li className="flex gap-2">
            <span className="font-bold">4.</span>
            <span>Computed hash is compared with stored hash for tamper detection</span>
          </li>
        </ol>
      </div>
    </div>
  );
}
