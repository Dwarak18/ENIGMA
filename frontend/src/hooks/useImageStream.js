/**
 * frontend/src/hooks/useImageStream.js
 * WebSocket listener for real-time encrypted image streams
 *
 * Usage:
 *   const { streams, isConnected } = useImageStream(deviceId);
 *   streams.forEach(s => console.log(s.timestamp));
 */

import { useEffect, useState, useCallback } from 'react';
import { useEnigmaAPI } from './useEnigmaAPI';

/**
 * Hook to listen for real-time image streams from a specific device
 * @param {string} deviceId - Device ID to listen for (null to listen to all)
 * @returns {object} - { streams, isConnected, error }
 */
export function useImageStream(deviceId = null) {
  const { socket } = useEnigmaAPI();
  const [streams, setStreams] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!socket || !socket.connected) {
      setIsConnected(false);
      return;
    }

    setIsConnected(true);
    setError(null);

    /**
     * Handler for image:stream events from WebSocket
     * Emitted by backend when chunks are reassembled and verified
     */
    const handleImageStream = (data) => {
      // Filter by device_id if specified
      if (deviceId && data.device_id !== deviceId) {
        return;
      }

      console.log('[useImageStream] Received stream:', {
        device_id: data.device_id,
        timestamp: data.timestamp,
        size: data.size_bytes,
      });

      setStreams(prev => {
        // Remove duplicate if it exists (by device_id + timestamp)
        const filtered = prev.filter(
          s => !(s.device_id === data.device_id && s.timestamp === data.timestamp)
        );
        // Add new stream at top
        return [data, ...filtered].slice(0, 100); // Keep last 100
      });
    };

    socket.on('image:stream', handleImageStream);

    return () => {
      socket.off('image:stream', handleImageStream);
    };
  }, [socket, deviceId]);

  return { streams, isConnected, error };
}

/**
 * Hook to fetch image stream history for a device (REST API)
 * @param {string} deviceId - Device ID
 * @param {number} limit - Max records to fetch (default: 50)
 * @returns {object} - { data, loading, error, refetch }
 */
export function useImageStreamHistory(deviceId, limit = 50) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!deviceId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/image-streams/${encodeURIComponent(deviceId)}/history?limit=${limit}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      if (body.ok) {
        setData(body.data || []);
      } else {
        setError(new Error(body.code || 'Unknown error'));
      }
    } catch (err) {
      setError(err);
      console.error('[useImageStreamHistory] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId, limit]);

  // Fetch on mount and when deviceId changes
  useEffect(() => {
    refetch();
  }, [deviceId, limit, refetch]);

  return { data, loading, error, refetch };
}

/**
 * Hook to fetch the latest image stream for a device (REST API)
 * @param {string} deviceId - Device ID
 * @param {number} pollIntervalMs - Auto-refetch interval (0 = no polling)
 * @returns {object} - { data, loading, error, refetch }
 */
export function useLatestImageStream(deviceId, pollIntervalMs = 5000) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!deviceId) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/image-streams/${encodeURIComponent(deviceId)}/latest`,
        { method: 'GET' }
      );

      if (response.status === 404) {
        setData(null);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const body = await response.json();
      if (body.ok) {
        setData(body.data || null);
      } else {
        setError(new Error(body.code || 'Unknown error'));
      }
    } catch (err) {
      setError(err);
      console.error('[useLatestImageStream] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [deviceId]);

  // Fetch on mount
  useEffect(() => {
    refetch();
  }, [deviceId, refetch]);

  // Optional polling
  useEffect(() => {
    if (!pollIntervalMs || pollIntervalMs <= 0) return;

    const interval = setInterval(() => {
      refetch();
    }, pollIntervalMs);

    return () => clearInterval(interval);
  }, [pollIntervalMs, refetch]);

  return { data, loading, error, refetch };
}

export default useImageStream;
