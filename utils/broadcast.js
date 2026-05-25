/**
 * broadcast.js — WebSocket broadcast helper
 *
 * Usage in controllers / routes:
 *   const { broadcast } = require('../utils/broadcast');
 *   broadcast({ type: 'invoice_created', data: { ...invoiceData } });
 *
 * The WebSocket server is attached to the HTTP server in server.js.
 */

let wss = null;

/**
 * Called once from server.js to inject the WebSocketServer instance.
 * @param {import('ws').WebSocketServer} wsServer
 */
function attachWss(wsServer) {
  wss = wsServer;
}

/**
 * Broadcast a JSON message to all connected WebSocket clients.
 * @param {object} payload  Any JSON-serialisable object.
 */
function broadcast(payload) {
  if (!wss) return;
  const json = JSON.stringify(payload);
  wss.clients.forEach((client) => {
    try {
      if (client.readyState === 1 /* OPEN */) {
        client.send(json);
      }
    } catch (_) {}
  });
}

module.exports = { attachWss, broadcast };
