/**
 * src/hooks/useCamera.js
 * Custom hook for webcam/camera access and image capture.
 */

import { useState, useRef, useCallback } from 'react';

export const useCamera = () => {
  const [stream, setStream] = useState(null);
  const [error, setError] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const videoRef = useRef(null);

  const startCamera = useCallback(async (constraints = { video: true, audio: false }) => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      setIsActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

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
  }, []);

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
    startCamera,
    stopCamera,
    captureFrame,
  };
};

export default useCamera;
