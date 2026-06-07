const express = require('express');
const router = express.Router();
const proxyClient = require('../proxy-client');
const viewSimulator = require('../views/view-simulator');
const kasadaBypass = require('../views/kasada-bypass');
const KickAccount = require('../models/kickAccount');

let simulationActive = false;
let simulationLogs = [];
let activeSessions = [];
let targetChannel = '';
let simulationStats = {
  totalIterations: 0,
  successfulIterations: 0,
  failedIterations: 0,
  startedAt: null,
  sessionsActive: 0,
  channelIsLive: false,
  playbackUrl: null
};

// Helper to push a timestamped log line
function addLog(msg) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${msg}`;
  simulationLogs.push(line);
  console.log(`[Simulation] ${msg}`);
  if (simulationLogs.length > 300) {
    simulationLogs.shift();
  }
}

// GET /api/simulation/logs
router.get('/logs', (req, res) => {
  res.json({
    active: simulationActive,
    channel: targetChannel,
    logs: simulationLogs,
    stats: simulationStats
  });
});

// POST /api/simulation/stop
router.post('/stop', (req, res) => {
  if (!simulationActive) {
    return res.json({ success: true, message: 'Simulation was not running' });
  }

  addLog('⏹ Stopping all active stream viewer sessions...');
  simulationActive = false;

  // Cancel all session loops
  activeSessions.forEach(session => {
    if (session.timeoutId) clearTimeout(session.timeoutId);
    session.stopped = true;
  });

  const sessionCount = activeSessions.length;
  activeSessions = [];
  targetChannel = '';
  simulationStats.sessionsActive = 0;

  addLog(`✅ Simulation stopped. ${sessionCount} viewing thread(s) terminated.`);
  res.json({ success: true, message: 'Simulation stopped' });
});

// POST /api/simulation/start
router.post('/start', async (req, res) => {
  if (simulationActive) {
    return res.status(400).json({ error: 'A simulation is already running.' });
  }

  const { channel, sessionsCount } = req.body;
  if (!channel) {
    return res.status(400).json({ error: 'Target channel username is required.' });
  }

  const count = parseInt(sessionsCount) || 5;
  targetChannel = channel;
  simulationActive = true;
  simulationLogs = []; // clear old logs

  // Reset stats
  simulationStats = {
    totalIterations: 0,
    successfulIterations: 0,
    failedIterations: 0,
    startedAt: new Date().toISOString(),
    sessionsActive: 0,
    channelIsLive: false,
    playbackUrl: null
  };

  addLog(`🚀 Initializing stream setup for channel: "${channel}" with ${count} session(s)...`);

  // 1. Resolve channel livestream playback URL using public API
  let playbackUrl = null;
  try {
    addLog(`🔍 Resolving playback metadata for channel "${channel}" via Kick API...`);
    const checkUrl = `https://kick.com/api/v2/channels/${encodeURIComponent(channel)}`;
    const response = await proxyClient.get(checkUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 8000
    });
    
    if (response.data && response.data.livestream && response.data.livestream.is_live !== false) {
      playbackUrl = response.data.livestream.playback_url;
      simulationStats.channelIsLive = true;
      simulationStats.playbackUrl = playbackUrl ? playbackUrl.split('?')[0] : null;
      addLog(`✅ Channel is LIVE! Playback stream: ${playbackUrl ? playbackUrl.split('?')[0] : 'N/A'}`);
    } else {
      addLog(`⚠️ Channel "${channel}" appears to be offline. Using mock heartbeat simulation...`);
    }
  } catch (err) {
    addLog(`⚠️ Kick API lookup failed: ${err.message}. Using mock API watch simulation.`);
  }

  // 2. Fetch linked accounts in database to use as viewer session IDs
  let accounts = [];
  try {
    accounts = await KickAccount.find({}).exec();
    addLog(`📦 Retrieved ${accounts.length} registered Kick account(s) from database.`);
  } catch (dbErr) {
    addLog(`⚠️ Database fetch error: ${dbErr.message}. Will use mock session IDs.`);
  }

  // Fallback to generating temporary account IDs if there are no registered accounts in database
  const requiredCount = Math.min(count, 100); // cap at 100
  const sessionList = [];

  for (let i = 0; i < requiredCount; i++) {
    let accountId;
    let username;
    
    if (i < accounts.length) {
      accountId = accounts[i]._id.toString();
      username = accounts[i].username;
    } else {
      accountId = `mock_session_id_${1000 + i}`;
      username = `mock_user_${1000 + i}`;
    }
    sessionList.push({ id: accountId, username });
  }

  // 3. Launch background viewing loop for each session
  activeSessions = sessionList.map(session => ({
    id: session.id,
    username: session.username,
    stopped: false,
    timeoutId: null,
    iterationCount: 0,
    lastError: null
  }));

  simulationStats.sessionsActive = requiredCount;

  addLog(`🎬 Launching ${requiredCount} viewer session(s) in background...`);

  res.json({
    success: true,
    message: 'Simulation started in background',
    channel: channel,
    sessionsCount: requiredCount
  });

  // Start background viewing loops
  activeSessions.forEach(session => {
    runSessionLoop(session, playbackUrl);
  });
});

// Run a continuous HLS download loop for a single viewer session
async function runSessionLoop(session, playbackUrl) {
  if (!simulationActive || session.stopped) return;

  session.iterationCount++;
  simulationStats.totalIterations++;
  
  addLog(`▶ [${session.username}] Starting watch iteration #${session.iterationCount}...`);

  try {
    if (playbackUrl) {
      // Real HLS segment downloading
      addLog(`📡 [${session.username}] Downloading HLS playlist segments...`);
    } else {
      // Simulated watch heartbeat
      addLog(`💓 [${session.username}] Sending telemetry heartbeat & focus simulation...`);
    }

    // Call our viewSimulator (runs for 30s)
    await viewSimulator(session.id, playbackUrl);

    simulationStats.successfulIterations++;
    session.lastError = null;

    // Call Kasada Bypass
    try {
      await kasadaBypass();
      addLog(`🛡 [${session.username}] Kasada bypass succeeded.`);
    } catch (kErr) {
      addLog(`⚠️ [${session.username}] Kasada bypass skipped: ${kErr.message}`);
    }

    addLog(`✅ [${session.username}] Iteration #${session.iterationCount} completed successfully.`);
  } catch (err) {
    simulationStats.failedIterations++;
    session.lastError = err.message;
    addLog(`❌ [${session.username}] Iteration #${session.iterationCount} error: ${err.message}`);
  }

  // If simulation is still active, queue the next loop iteration after a short delay (e.g. 3 seconds)
  if (simulationActive && !session.stopped) {
    addLog(`⏳ [${session.username}] Next iteration in 3s...`);
    session.timeoutId = setTimeout(() => {
      runSessionLoop(session, playbackUrl);
    }, 3000);
  }
}

module.exports = router;
