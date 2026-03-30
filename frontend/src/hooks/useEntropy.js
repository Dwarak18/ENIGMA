/**
 * src/hooks/useEntropy.js
 * Custom React hook – manages WebSocket connection and entropy state.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || '';
const MAX_LIVE_RECORDS = 50;

/**
 * @returns {{
 *   records: Array,
 *   latestRecord: Object|null,
 *   connected: boolean,
 *   connectionStatus: 'connecting'|'connected'|'disconnected'|'error',
 *   stats: { total: number, verified: number, failed: number }
 * }}
 */
export function useEntropy() {
  const [records, setRecords]               = useState([]);
  const [connected, setConnected]           = useState(false);
  const [connectionStatus, setStatus]       = useState('connecting');
  const [stats, setStats]                   = useState({ total: 0, verified: 0, failed: 0 });
  const socketRef                           = useRef(null);

  /* ── Load initial history from REST API ─────────────────────────────── */
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/entropy/history?limit=50`);
      if (!res.ok) return;
      const body = await res.json();
      if (body.data) {
        setRecords(body.data.map(r => ({ ...r, verified: true })));
        setStats(prev => ({ ...prev, total: body.count, verified: body.count }));
      }
    } catch {
      /* backend not reachable yet – ignore */
    }
  }, []);

  /* ── WebSocket setup ─────────────────────────────────────────────────── */
  useEffect(() => {
    loadHistory();

    const socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      setStatus('connected');
    });

    socket.on('disconnect', () => {
      setConnected(false);
      setStatus('disconnected');
    });

    socket.on('connect_error', () => {
      setConnected(false);
      setStatus('error');
    });

    socket.on('entropy:new', (record) => {
      setRecords(prev => {
        const updated = [record, ...prev];
        return updated.slice(0, MAX_LIVE_RECORDS);
      });
      setStats(prev => ({
        total:    prev.total + 1,
        verified: record.verified ? prev.verified + 1 : prev.verified,
        failed:   record.verified ? prev.failed     : prev.failed + 1,
      }));
    });

    socket.on('entropy:history', (historyRecords) => {
      setRecords(historyRecords.map(r => ({ ...r, verified: true })));
    });

    return () => {
      socket.disconnect();
    };
  }, [loadHistory]);

  const latestRecord = records[0] || null;

  return { records, latestRecord, connected, connectionStatus, stats };
}
