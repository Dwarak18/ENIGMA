/**
 * src/hooks/useCamera.js
 * Custom hook for webcam/camera access and image capture.
 */

import { useState, useRef, useCallback, useEffect } from 'react';

export const useCamera = () => {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [availableCameras, setAvailableCameras] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  const videoRef = useRef(null);

  const refreshCameraList = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices
      .filter((device) => device.kind === 'videoinput')
      .map((device, index) => ({
        id: device.deviceId,
        label: device.label || `Camera ${index + 1}`,
      }));

    setAvailableCameras(cameras);

    if (cameras.length > 0 && !selectedCameraId) {
      setSelectedCameraId(cameras[0].id);
    }
  }, [selectedCameraId]);

  useEffect(() => {
    refreshCameraList().catch(() => {});

    if (!navigator.mediaDevices?.addEventListener) {
      return undefined;
    }

    const handleDeviceChange = () => {
      refreshCameraList().catch(() => {});
    };

    navigator.mediaDevices.addEventListener('devicechange', handleDeviceChange);
    return () => navigator.mediaDevices.removeEventListener('devicechange', handleDeviceChange);
  }, [refreshCameraList]);

  const startCamera = useCallback(async (constraints = null) => {
    try {
      setError(null);
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }

      const resolvedConstraints =
        constraints || {
          video: selectedCameraId
            ? {
                deviceId: { ideal: selectedCameraId },
                width: { ideal: 1280 },
                height: { ideal: 720 },
              }
            : true,
          audio: false,
        };

      const mediaStream = await navigator.mediaDevices.getUserMedia(resolvedConstraints);
      setStream(mediaStream);
      setIsActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      await refreshCameraList();

      return mediaStream;
    } catch (err) {
      const errorMsg =
        err.name === 'NotAllowedError'
          ? 'Camera permission denied'
          : err.name === 'NotFoundError'
          ? 'No camera found'
          : `Camera error: ${err.message}`;

      setError(errorMsg);
      setIsActive(false);
      throw err;
    }
  }, [selectedCameraId, stream, refreshCameraList]);

  const selectCamera = useCallback(
    async (cameraId) => {
      setSelectedCameraId(cameraId);
      await startCamera({
        video: {
          deviceId: { exact: cameraId },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
    },
    [startCamera]
  );

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setIsActive(false);
    }
  }, [stream]);

  const captureFrame = useCallback(async () => {
    if (!videoRef.current || !isActive) {
      throw new Error('Camera not active');
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;

    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    // Convert to JPEG base64
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          const reader = new FileReader();
          reader.onload = () => {
            // Remove "data:image/jpeg;base64," prefix
            const base64 = reader.result.split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
        },
        'image/jpeg',
        0.9
      );
    });
  }, [isActive]);

  return {
    videoRef,
    stream,
    error,
    isActive,
    availableCameras,
    selectedCameraId,
    selectCamera,
    refreshCameraList,
    startCamera,
    stopCamera,
    captureFrame,
  };
};

export default useCamera;
