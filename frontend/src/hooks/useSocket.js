import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_BASE || 'http://localhost:5000/api')
  .replace(/\/api\/?$/, '');

/**
 * Subscribes to real-time backend events.
 * @param {(callLog) => void}  onCallUpdate        fired when a call finalizes
 * @param {(progress) => void} onCampaignProgress  fired when campaign counters change
 */
export function useSocket(onCallUpdate, onCampaignProgress) {
  const handlers = useRef({ onCallUpdate, onCampaignProgress });
  handlers.current = { onCallUpdate, onCampaignProgress };

  useEffect(() => {
    const socket = io(SOCKET_URL);
    socket.on('call:update',       (d) => handlers.current.onCallUpdate?.(d));
    socket.on('campaign:progress', (d) => handlers.current.onCampaignProgress?.(d));
    return () => socket.disconnect();
  }, []);
}
