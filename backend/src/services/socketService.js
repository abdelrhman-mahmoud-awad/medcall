/**
 * socketService.js — Socket.io real-time events for the dashboard.
 *
 * Events emitted:
 *   call:update        — a CallLog changed (finalized, escalated, ...)
 *   campaign:progress  — campaign counters changed
 */
let _io = null;

function initSocket(io) {
  _io = io;
  io.on('connection', (socket) => {
    console.log('🔌 Client connected:', socket.id);
    socket.on('disconnect', () => console.log('🔌 Client disconnected:', socket.id));
  });
}

/** Emit a call status update to all connected dashboards. */
function emitCallUpdate(callLog) {
  if (_io) _io.emit('call:update', callLog);
}

/** Emit campaign progress counters. */
function emitCampaignProgress(campaignId, stats) {
  if (_io) _io.emit('campaign:progress', { campaignId, ...stats });
}

module.exports = { initSocket, emitCallUpdate, emitCampaignProgress };
