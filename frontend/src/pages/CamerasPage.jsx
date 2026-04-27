/**
 * src/pages/CamerasPage.jsx
 * Laptop camera capture pipeline for encrypted image stream records.
 */

import { useEffect, useRef, useState } from 'react';
import useCamera from '../hooks/useCamera';
import useEnigmaAPI from '../hooks/useEnigmaAPI';
import { useLatestImageStream } from '../hooks/useImageStream';
import StatusBadge from '../components/StatusBadge';
import EntropyCard from '../components/EntropyCard';

const CAPTURE_INTERVAL_SECONDS = 20;

export default function CamerasPage() {
  const [deviceId, setDeviceId] = useState('webcam-local-001');
  const [captureStatus, setCaptureStatus] = useState('idle');
  const [captureError, setCaptureError] = useState(null);
  const [lastCapture, setLastCapture] = useState(null);
  const [secondsRemaining, setSecondsRemaining] = useState(CAPTURE_INTERVAL_SECONDS);
  const startedRef = useRef(false);

  const {
    videoRef,
    error: cameraError,
    isActive,
    startCamera,
    stopCamera,
    captureFrame,
  } = useCamera();

  const { captureImageStream, loading: apiLoading } = useEnigmaAPI();
  const { data: latestStream, refetch: refetchLatest } = useLatestImageStream(deviceId, 5000);

  useEffect(() => {
    if (startedRef.current) return undefined;
    startedRef.current = true;
    startCamera().catch((err) => setCaptureError(err.message));
    return () => stopCamera();
  }, [startCamera, stopCamera]);

  const handleCapture = async () => {
    if (captureStatus === 'capturing' || apiLoading) return;

    try {
      setCaptureStatus('capturing');
      setCaptureError(null);

      const frameData = await captureFrame();
      const espTime = new Date().toISOString();
      const result = await captureImageStream(frameData, deviceId, espTime);
      const stream = result.data;

      setLastCapture(stream);
      setCaptureStatus('success');
      setSecondsRemaining(CAPTURE_INTERVAL_SECONDS);
      await refetchLatest();

      window.setTimeout(() => setCaptureStatus('idle'), 1200);
    } catch (err) {
      setCaptureError(err.message);
      setCaptureStatus('error');
    }
  };

  useEffect(() => {
    if (!isActive) return undefined;

    const captureTimer = window.setInterval(() => {
      handleCapture();
    }, CAPTURE_INTERVAL_SECONDS * 1000);

    const countdownTimer = window.setInterval(() => {
      setSecondsRemaining((value) => (value <= 1 ? CAPTURE_INTERVAL_SECONDS : value - 1));
    }, 1000);

    return () => {
      window.clearInterval(captureTimer);
      window.clearInterval(countdownTimer);
    };
  }, [isActive, captureStatus, apiLoading, deviceId]);

  const displayedStream = lastCapture || latestStream;

  return (
    <div className="space-y-6 p-6">
      <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm text-gray-900">
        <h2 className="text-xl font-semibold mb-4">Laptop Camera Capture</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Device ID</label>
            <input
              type="text"
              value={deviceId}
              onChange={(e) => setDeviceId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Interval</label>
            <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50">
              Every {CAPTURE_INTERVAL_SECONDS} seconds
            </div>
          </div>

          <div className="flex items-end gap-3">
            <StatusBadge status={isActive ? 'connected' : 'disconnected'} />
            <span className="text-sm text-gray-600">Next capture in {secondsRemaining}s</span>
          </div>
        </div>
      </div>

      <div className="bg-black rounded-lg overflow-hidden shadow-lg">
        <div className="relative w-full bg-black">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full aspect-video object-cover"
          />

          {captureStatus === 'capturing' && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <div className="text-white text-center">
                <div className="text-xl mb-2">Processing frame</div>
                <div className="text-sm opacity-80">bitstream, AES-256-CBC, hash, database</div>
              </div>
            </div>
          )}

          {captureStatus === 'success' && (
            <div className="absolute inset-0 bg-green-500/20 flex items-center justify-center pointer-events-none">
              <div className="text-white text-center">
                <div className="text-2xl mb-2">Captured and encrypted</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {(cameraError || captureError) && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="text-red-700 font-medium">{cameraError || captureError}</div>
        </div>
      )}

      <button
        onClick={handleCapture}
        disabled={!isActive || captureStatus === 'capturing' || apiLoading}
        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-6 rounded-lg transition disabled:cursor-not-allowed"
      >
        {captureStatus === 'capturing' ? 'Capturing...' : 'Capture now'}
      </button>

      {displayedStream && (
        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm text-gray-900">
          <h3 className="text-lg font-semibold mb-4">Latest Stored Image Stream</h3>

          {displayedStream.image_preview && (
            <img
              src={displayedStream.image_preview}
              alt="Latest captured camera frame"
              className="w-full max-h-80 object-contain bg-black rounded mb-4"
            />
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EntropyCard label="Image Hash" value={displayedStream.image_hash} copyable size="compact" />
            <EntropyCard label="Encrypted Hash" value={displayedStream.encrypted_hash} copyable size="compact" />
            <EntropyCard label="Key + Time Hash" value={displayedStream.key_time_hash} copyable size="compact" />
            <EntropyCard label="AES IV" value={displayedStream.iv} copyable size="compact" />
          </div>

          <div className="mt-4 text-sm text-gray-500">
            Saved at {new Date(displayedStream.timestamp * 1000).toLocaleString()} with {displayedStream.byte_size || 0} source bytes
          </div>
        </div>
      )}
    </div>
  );
}
