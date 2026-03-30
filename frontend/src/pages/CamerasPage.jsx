/**
 * src/pages/CamerasPage.jsx
 * Live camera capture and entropy processing with FastAPI backend.
 */

import { useState, useEffect } from 'react';
import useCamera from '../hooks/useCamera';
import useEnigmaAPI from '../hooks/useEnigmaAPI';
import StatusBadge from '../components/StatusBadge';
import EntropyCard from '../components/EntropyCard';

export default function CamerasPage() {
  const [deviceId, setDeviceId] = useState('device-001');
  const [captureStatus, setCaptureStatus] = useState('idle');
  const [lastCapture, setLastCapture] = useState(null);
  const [captureError, setCaptureError] = useState(null);
  const [autoCapture, setAutoCapture] = useState(false);
  const [captureInterval, setCaptureInterval] = useState(10);

  const { videoRef, error: cameraError, isActive, startCamera, stopCamera, captureFrame } =
    useCamera();
  const { captureEntropy, loading: apiLoading } = useEnigmaAPI();

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  useEffect(() => {
    if (!autoCapture || !isActive) return;

    const interval = setInterval(() => {
      handleCapture();
    }, captureInterval * 1000);

    return () => clearInterval(interval);
  }, [autoCapture, isActive, captureInterval]);

  const handleCapture = async () => {
    try {
      setCaptureStatus('capturing');
      setCaptureError(null);

      const frameData = await captureFrame();
      const result = await captureEntropy(frameData, deviceId);

      setLastCapture({
        id: result.id,
        timestamp: result.timestamp,
        entropyHash: result.entropy_hash,
        integrityHash: result.integrity_hash,
        imageHash: result.image_hash,
      });

      setCaptureStatus('success');

      setTimeout(() => {
        if (captureStatus === 'success') {
          setCaptureStatus('idle');
        }
      }, 3000);
    } catch (err) {
      setCaptureError(err.message);
      setCaptureStatus('error');
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Configuration */}
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Camera Configuration</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Device ID</label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              disabled={isActive}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              placeholder="e.g., device-001"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Capture Interval (seconds)
            </label>
            <input
              type="number"
              value={captureInterval}
              onChange={(e) => setCaptureInterval(Math.max(1, parseInt(e.target.value)))}
              disabled={autoCapture}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
              min="1"
            />
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={autoCapture}
                onChange={(e) => setAutoCapture(e.target.checked)}
                className="w-4 h-4"
              />
              <span className="text-sm font-medium text-gray-700">Enable Auto-Capture</span>
            </label>
          </div>

          <div className="flex items-end">
            <StatusBadge status={isActive ? 'connected' : 'disconnected'} />
          </div>
        </div>
      </div>

      {/* Video Feed */}
      <div className="bg-black rounded-lg overflow-hidden shadow-lg">
        <div className="relative w-full bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full aspect-video object-cover"
          />

          {captureStatus === 'capturing' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-2xl mb-2">⟳</div>
                <div>Processing...</div>
              </div>
            </div>
          )}

          {captureStatus === 'success' && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center pointer-events-none">
              <div className="text-white text-center">
                <div className="text-4xl mb-2">✓</div>
                <div>Captured & Encrypted</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {(cameraError || captureError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-700 font-medium">✗ {cameraError || captureError}</div>
        </div>
      )}

      <button
        onClick={handleCapture}
        disabled={!isActive || captureStatus === 'capturing' || apiLoading || autoCapture}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition disabled:cursor-not-allowed"
      >
        {captureStatus === 'capturing' ? 'Capturing...' : 'Capture & Encrypt Frame'}
      </button>

      {lastCapture && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Last Capture</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EntropyCard
              label="Entropy Hash"
              value={lastCapture.entropyHash}
              copyable
              size="compact"
            />

            <EntropyCard
              label="Integrity Hash"
              value={lastCapture.integrityHash}
              copyable
              size="compact"
            />

            <EntropyCard
              label="Image Hash"
              value={lastCapture.imageHash}
              copyable
              size="compact"
            />

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-2">Record ID</label>
              <input
                type="text"
                value={lastCapture.id}
                readOnly
                className="w-full px-3 py-2 bg-gray-100 border border-gray-300 rounded font-mono text-xs"
              />
            </div>
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Captured at: {new Date(lastCapture.timestamp * 1000).toLocaleString()}
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">Pipeline Summary</h3>
        <ol className="text-sm text-blue-800 space-y-1">
          <li>✓ Capture image from camera</li>
          <li>✓ Convert to grayscale</li>
          <li>✓ Extract bitstream (LSB method)</li>
          <li>✓ Condition entropy (SHA-256)</li>
          <li>✓ Derive key from device_id + timestamp</li>
          <li>✓ Encrypt with AES-128-CTR</li>
          <li>✓ Generate integrity hash</li>
          <li>✓ Store in database with chaining</li>
        </ol>
      </div>
    </div>
  );
}
