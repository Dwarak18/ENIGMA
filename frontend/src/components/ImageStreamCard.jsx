/**
 * frontend/src/components/ImageStreamCard.jsx
 * Real-time display of encrypted image streams from a device
 *
 * Features:
 *   - Live feed updates via WebSocket
 *   - Display encrypted bitstream (hex)
 *   - Show device ID, timestamp, hash
 *   - Connection status indicator
 *   - Fallback to polling if WebSocket unavailable
 */

import React, { useMemo } from 'react';
import { useImageStream, useLatestImageStream } from '../hooks/useImageStream';

/**
 * Component to display a list of real-time image streams
 * 
 * @param {string} deviceId - Device to listen to (if null, shows all)
 * @param {number} maxStreams - Max streams to display (default: 10)
 */
export function ImageStreamFeed({ deviceId, maxStreams = 10 }) {
  const { streams, isConnected } = useImageStream(deviceId);

  const displayStreams = useMemo(() => {
    return streams.slice(0, maxStreams);
  }, [streams, maxStreams]);

  return (
    <div className="image-stream-feed">
      <div className="stream-header">
        <h3>📷 Image Stream Feed</h3>
        <div className="connection-status">
          <span className={`badge ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● WebSocket Connected' : '○ Disconnected'}
          </span>
        </div>
      </div>

      {displayStreams.length === 0 ? (
        <p className="empty-state">No image streams received yet...</p>
      ) : (
        <div className="stream-list">
          {displayStreams.map((stream, idx) => (
            <ImageStreamItem key={`${stream.device_id}:${stream.timestamp}`} stream={stream} />
          ))}
        </div>
      )}

      <style jsx>{`
        .image-stream-feed {
          padding: 1rem;
          background: #f5f5f5;
          border-radius: 8px;
          border: 1px solid #ddd;
        }

        .stream-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }

        .stream-header h3 {
          margin: 0;
          font-size: 1.1rem;
        }

        .connection-status {
          font-size: 0.85rem;
        }

        .badge {
          padding: 0.25rem 0.75rem;
          border-radius: 12px;
          font-weight: 500;
        }

        .badge.connected {
          background: #d4edda;
          color: #155724;
        }

        .badge.disconnected {
          background: #f8d7da;
          color: #721c24;
        }

        .empty-state {
          color: #666;
          text-align: center;
          padding: 2rem 0;
          font-style: italic;
        }

        .stream-list {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
      `}</style>
    </div>
  );
}

/**
 * Single image stream card
 */
function ImageStreamItem({ stream }) {
  const formatTime = (timestamp) => {
    return new Date(timestamp * 1000).toLocaleString();
  };

  const hashPreview = stream.hash ? stream.hash.slice(0, 16) + '...' : '???';

  return (
    <div className="stream-item">
      <div className="item-header">
        <span className="device-id">{stream.device_id}</span>
        <span className="timestamp">{formatTime(stream.timestamp)}</span>
      </div>

      <div className="item-details">
        <div className="detail-row">
          <span className="label">Hash:</span>
          <code className="mono">{hashPreview}</code>
        </div>
        <div className="detail-row">
          <span className="label">Size:</span>
          <span>{stream.size_bytes} bytes</span>
        </div>

        {stream.preview && (
          <div className="preview-section">
            <span className="label">Preview (base64):</span>
            <code className="mono small">
              {stream.preview.length > 64
                ? stream.preview.slice(0, 60) + '...'
                : stream.preview}
            </code>
          </div>
        )}
      </div>

      <style jsx>{`
        .stream-item {
          padding: 0.75rem;
          background: white;
          border-radius: 6px;
          border-left: 4px solid #007bff;
        }

        .item-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 0.5rem;
          gap: 1rem;
        }

        .device-id {
          font-weight: 600;
          color: #333;
        }

        .timestamp {
          font-size: 0.85rem;
          color: #666;
        }

        .item-details {
          font-size: 0.9rem;
        }

        .detail-row {
          display: flex;
          gap: 0.5rem;
          margin: 0.25rem 0;
        }

        .label {
          font-weight: 500;
          color: #666;
          min-width: 60px;
        }

        .mono {
          font-family: 'Courier New', monospace;
          background: #f9f9f9;
          padding: 0.25rem 0.5rem;
          border-radius: 3px;
          word-break: break-all;
        }

        .mono.small {
          font-size: 0.75rem;
        }

        .preview-section {
          margin-top: 0.5rem;
          padding-top: 0.5rem;
          border-top: 1px solid #eee;
        }
      `}</style>
    </div>
  );
}

/**
 * Component to display the latest image stream for a device
 * with optional polling
 */
export function LatestImageStream({ deviceId, pollInterval = 5000 }) {
  const { data: stream, loading, error } = useLatestImageStream(deviceId, pollInterval);

  if (error) {
    return (
      <div className="error-state">
        <p>⚠️ Error loading image stream: {error.message}</p>
      </div>
    );
  }

  if (loading && !stream) {
    return (
      <div className="loading-state">
        <p>Loading latest image stream...</p>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="no-data-state">
        <p>No image streams available for this device</p>
      </div>
    );
  }

  return (
    <div className="latest-stream-card">
      <h4>Latest Image Stream</h4>
      <div className="stream-metadata">
        <div className="meta-item">
          <span className="meta-label">Timestamp:</span>
          <span className="meta-value">{new Date(stream.timestamp * 1000).toLocaleString()}</span>
        </div>
        <div className="meta-item">
          <span className="meta-label">Encrypted Data (hex):</span>
          <code className="meta-value mono">
            {stream.encrypted_data.slice(0, 64)}...
          </code>
        </div>
        <div className="meta-item">
          <span className="meta-label">IV (hex):</span>
          <code className="meta-value mono">{stream.iv}</code>
        </div>
      </div>

      <style jsx>{`
        .latest-stream-card {
          padding: 1rem;
          background: white;
          border: 1px solid #ddd;
          border-radius: 6px;
        }

        .latest-stream-card h4 {
          margin: 0 0 0.75rem 0;
        }

        .stream-metadata {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          font-size: 0.9rem;
        }

        .meta-item {
          display: flex;
          gap: 0.5rem;
        }

        .meta-label {
          font-weight: 500;
          min-width: 180px;
        }

        .meta-value {
          flex: 1;
          word-break: break-all;
        }

        .mono {
          font-family: 'Courier New', monospace;
          background: #f9f9f9;
          padding: 0.25rem 0.5rem;
          border-radius: 3px;
        }

        .error-state, .loading-state, .no-data-state {
          padding: 1rem;
          text-align: center;
          color: #666;
        }

        .error-state {
          background: #fff3cd;
          border: 1px solid #ffeaa7;
          border-radius: 4px;
          color: #856404;
        }
      `}</style>
    </div>
  );
}

export default ImageStreamFeed;
