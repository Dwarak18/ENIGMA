/**
 * src/hooks/useEnigmaAPI.js
 * Custom hook for ENIGMA FastAPI backend communication.
 */

import { useState, useCallback } from 'react';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export const useEnigmaAPI = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const request = useCallback(
    async (endpoint, options = {}) => {
      setLoading(true);
      setError(null);

      try {
        const url = `${API_BASE_URL}${endpoint}`;
        const response = await fetch(url, {
          headers: {
            'Content-Type': 'application/json',
          },
          ...options,
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.detail || `HTTP ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (err) {
        setError(err.message);
        throw err;
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Device endpoints
  const registerDevice = useCallback(
    (deviceId, publicKey) =>
      request('/devices', {
        method: 'POST',
        body: JSON.stringify({
          device_id: deviceId,
          public_key: publicKey,
        }),
      }),
    [request]
  );

  const getDevice = useCallback(
    (deviceId) => request(`/devices/${deviceId}`),
    [request]
  );

  // Entropy capture
  const captureEntropy = useCallback(
    (image, deviceId) =>
      request('/capture', {
        method: 'POST',
        body: JSON.stringify({
          image,
          device_id: deviceId,
        }),
      }),
    [request]
  );

  // Records endpoints
  const getRecords = useCallback(
    (deviceId = null, limit = 100) => {
      const params = new URLSearchParams();
      if (deviceId) params.append('device_id', deviceId);
      params.append('limit', limit);
      return request(`/records?${params.toString()}`);
    },
    [request]
  );

  const getRecord = useCallback(
    (recordId) => request(`/records/${recordId}`),
    [request]
  );

  // Verification
  const verifyRecord = useCallback(
    (recordId) =>
      request(`/verify/${recordId}`, {
        method: 'POST',
      }),
    [request]
  );

  // Statistics
  const getStatistics = useCallback(
    () => request('/statistics'),
    [request]
  );

  // Health check
  const healthCheck = useCallback(
    () => request('/health'),
    [request]
  );

  return {
    loading,
    error,
    registerDevice,
    getDevice,
    captureEntropy,
    getRecords,
    getRecord,
    verifyRecord,
    getStatistics,
    healthCheck,
  };
};

export default useEnigmaAPI;
