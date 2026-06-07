const WebSocket = require('ws');
const proxyClient = require('../proxy-client');

/**
 * Simulates user telemetry and interaction events over a WebSocket connection.
 * @param {WebSocket} socket - The active WebSocket connection.
 * @param {string} channelId - The identifier of the stream channel.
 */
function startInteractionSimulation(socket, channelId) {
  // Define possible human-like interaction events
  const actions = ['scroll', 'tab_focus', 'click_player', 'volume_change'];

  const intervalId = setInterval(() => {
    if (socket.readyState !== WebSocket.OPEN) {
      clearInterval(intervalId);
      return;
    }

    const randomAction = actions[Math.floor(Math.random() * actions.length)];
    const payload = {
      event: 'telemetry',
      channel_id: channelId,
      action: randomAction,
      timestamp: Date.now()
    };

    console.log(`[Viewbot] Simulating action for ${channelId}:`, randomAction);
    socket.send(JSON.stringify(payload));
  }, 15000); // Send interaction every 15 seconds

  return intervalId;
}

/**
 * Establishes a simulated viewing session for a given stream channel.
 * @param {string} wsUrl - The target WebSocket server URL.
 * @param {string} channelId - The identifier of the stream channel.
 * @returns {Promise<WebSocket>}
 */
function connectStreamViewer(wsUrl, channelId) {
  return new Promise((resolve, reject) => {
    console.log(`[Viewbot] Initializing connection to ${wsUrl} for channel ${channelId}...`);
    const socket = new WebSocket(wsUrl);

    let heartbeatInterval;
    let interactionInterval;

    socket.on('open', () => {
      console.log(`[Viewbot] Connection opened for channel: ${channelId}`);
      
      // Send join event
      socket.send(JSON.stringify({ event: 'join', channel_id: channelId }));

      // Setup human interaction simulation loop
      interactionInterval = startInteractionSimulation(socket, channelId);

      resolve(socket);
    });

    socket.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle server heartbeat ping
        if (message.event === 'ping') {
          socket.send(JSON.stringify({ event: 'pong', timestamp: Date.now() }));
        }
      } catch (err) {
        // Handle non-JSON server messages
      }
    });

    socket.on('close', (code, reason) => {
      console.log(`[Viewbot] Connection closed for channel ${channelId}. Code: ${code}`);
      clearInterval(heartbeatInterval);
      clearInterval(interactionInterval);
    });

    socket.on('error', (error) => {
      console.error(`[Viewbot] Socket error on channel ${channelId}:`, error.message);
      clearInterval(heartbeatInterval);
      clearInterval(interactionInterval);
      reject(error);
    });
  });
}

module.exports = {
  connectStreamViewer,
  startInteractionSimulation
};