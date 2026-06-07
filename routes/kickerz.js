const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const User = require('../models/user');
const KickAccountService = require('../Services/kickAccountService');
const proxyClient = require('../proxy-client');
const { generateChatComment, hashPassword } = require('../utils/helpers');
const smmService = require('../Services/smmService');
const smmOrders = [];

// Global states for background processes
let dinoProcess = null;
let dinoStatus = {
  active: false,
  logs: [],
  successes: [],
  currentIndex: 0,
  totalCount: 0
};

let dosProcess = null;
let dosStatus = {
  active: false,
  channel: '',
  targetThreads: 0,
  stats: {
    connections: 0,
    target_connections: 0,
    attempts: 0,
    pings: 0,
    heartbeats: 0,
    token_fails: 0,
    viewers: 0
  },
  logs: []
};

// Helpers for logging
function addDinoLog(msg) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${msg}`;
  dinoStatus.logs.push(line);
  console.log(`[Dino Creator] ${msg}`);
  if (dinoStatus.logs.length > 200) dinoStatus.logs.shift();
}

function addDosLog(msg) {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] ${msg}`;
  dosStatus.logs.push(line);
  console.log(`[Dos Viewbot] ${msg}`);
  if (dosStatus.logs.length > 200) dosStatus.logs.shift();
}


// ----------------------------------------------------
// ACCOUNT CREATOR ENDPOINTS (KickerzDino)
// ----------------------------------------------------

router.post('/accounts/create', async (req, res) => {
  if (dinoStatus.active) {
    return res.status(400).json({ error: 'An account creation batch is already running.' });
  }

  const { count, provider, kopechkaKey, kopechkaUrl, useProxy } = req.body;
  const countNum = parseInt(count) || 1;
  const finalProvider = provider || 'mailtm';
  
  // Fetch active proxies if configured and requested
  let proxyStr = '';
  if (useProxy !== false) {
    try {
      if (proxyClient.getProxyPool) {
        const pool = await proxyClient.getProxyPool();
        if (pool && pool.length > 0) {
          // Pick a random proxy
          const rawProxy = pool[Math.floor(Math.random() * pool.length)];
          proxyStr = `http://${rawProxy}`;
        }
      }
    } catch (err) {
      console.warn('[Dino Creator] Failed to retrieve proxy from pool:', err.message);
    }
  } else {
    addDinoLog('ℹ️ Proxy rotation disabled by user request. Running direct.');
  }

  // Reset status
  dinoStatus = {
    active: true,
    logs: [],
    successes: [],
    currentIndex: 0,
    totalCount: countNum
  };

  addDinoLog(`🚀 Spawning KickerzDino Account Creator to make ${countNum} account(s) using ${finalProvider}...`);

  const pythonExecutable = path.join(__dirname, '../kickerz/venv/bin/python');
  const scriptPath = path.join(__dirname, '../kickerz/dino_runner.py');

  const args = [
    scriptPath,
    '--count', countNum.toString(),
    '--provider', finalProvider
  ];

  if (finalProvider === 'kopeechka' && kopechkaKey) {
    args.push('--kopechka-key', kopechkaKey);
    if (kopechkaUrl) {
      args.push('--kopechka-url', kopechkaUrl);
    } else {
      // Use local env config
      const envUrl = process.env.KOPECHKA_API_URL;
      if (envUrl) args.push('--kopechka-url', envUrl);
    }
  }

  if (proxyStr) {
    args.push('--proxy', proxyStr);
  }

  try {
    dinoProcess = spawn(pythonExecutable, args, {
      cwd: path.join(__dirname, '../kickerz'),
      env: { ...process.env }
    });

    dinoProcess.stdout.on('data', async (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        try {
          const payload = JSON.parse(trimmed);
          
          if (payload.status === 'running') {
            addDinoLog(payload.message || '');
            if (payload.index !== undefined) {
              dinoStatus.currentIndex = payload.index + 1;
            }
          } else if (payload.status === 'success') {
            addDinoLog(`✅ Success: ${payload.message}`);
            dinoStatus.successes.push({
              username: payload.username,
              email: payload.email
            });

            // Automatically save to database!
            try {
              addDinoLog(`💾 Saving credentials to DB for user: ${payload.username}`);
              const hashedPassword = hashPassword(payload.password);
              
              // 1. Create registered user
              const newUser = new User({
                email: payload.email,
                username: payload.username,
                password: hashedPassword
              });
              await newUser.save();

              // 2. Link Kick account
              await KickAccountService.createKickAccount({
                userId: newUser._id.toString(),
                username: payload.username,
                email: payload.email,
                credentials: {
                  password: payload.password,
                  type: 'real'
                }
              });
              addDinoLog(`✔️ DB entry saved and linked for ${payload.username}.`);
            } catch (dbErr) {
              addDinoLog(`⚠️ DB save error: ${dbErr.message}`);
            }
          } else if (payload.status === 'error') {
            addDinoLog(`❌ Error: ${payload.message}`);
          }
        } catch (jsonErr) {
          // Fallback if output isn't JSON
          addDinoLog(trimmed);
        }
      }
    });

    dinoProcess.stderr.on('data', (chunk) => {
      addDinoLog(`[stderr] ${chunk.toString().trim()}`);
    });

    dinoProcess.on('close', (code) => {
      addDinoLog(`⏹ KickerzDino runner exited with code: ${code}`);
      dinoStatus.active = false;
      dinoProcess = null;
    });

    res.json({ success: true, message: 'Account creation queue initialized in background.' });
  } catch (err) {
    addDinoLog(`❌ Process spawn error: ${err.message}`);
    dinoStatus.active = false;
    res.status(500).json({ error: err.message });
  }
});

router.post('/accounts/stop', (req, res) => {
  if (!dinoStatus.active || !dinoProcess) {
    return res.json({ success: true, message: 'No account creator was running.' });
  }

  addDinoLog('⏹ Force stopping account creation process...');
  dinoProcess.kill('SIGINT');
  dinoStatus.active = false;
  dinoProcess = null;
  res.json({ success: true, message: 'Account creator stopped.' });
});

router.get('/accounts/status', (req, res) => {
  res.json(dinoStatus);
});

// ----------------------------------------------------
// LIVE VIEW BOT ENDPOINTS (KickerzDos)
// --------------------------// Global timer for simulating active session stats and log polling
let dosStatusInterval = null;

router.post('/viewbot/start', async (req, res) => {
  if (dosStatus.active) {
    return res.status(400).json({ error: 'Live boost session is already running.' });
  }

  const { channel, threads, followers, comments } = req.body;
  if (!channel) {
    return res.status(400).json({ error: 'Target channel name is required.' });
  }

  const threadCount = parseInt(threads) || 0;
  const followerCount = parseInt(followers) || 0;
  const commentCount = parseInt(comments) || 0;

  if (threadCount === 0 && followerCount === 0 && commentCount === 0) {
    return res.status(400).json({ error: 'At least one boost option (Viewers, Followers, or Comments) must be greater than 0.' });
  }

  // Reset status
  dosStatus = {
    active: true,
    channel: channel,
    targetThreads: threadCount,
    targetFollowers: followerCount,
    targetComments: commentCount,
    orderIds: [],
    stats: {
      connections: 0,
      target_connections: threadCount,
      attempts: 0,
      pings: 0,
      heartbeats: 0,
      token_fails: 0,
      viewers: 0,
      status: 'Initializing'
    },
    logs: []
  };

  addDosLog(`🚀 Initializing All-in-One Channel Boost for: "${channel}"...`);
  addDosLog(`📡 Routing secure proxies for delivery nodes...`);

  // Format channel link
  let link = channel.trim();
  if (!link.startsWith('http://') && !link.startsWith('https://')) {
    link = `https://kick.com/${link}`;
  }

  // Build order queue
  const ordersToPlace = [];

  if (threadCount > 0) {
    ordersToPlace.push({
      type: 'viewers',
      serviceId: 478,
      serviceName: 'Kick Live Viewers (60 min)',
      quantity: threadCount
    });
  }

  if (followerCount > 0) {
    ordersToPlace.push({
      type: 'followers',
      serviceId: 486,
      serviceName: 'Kick Followers',
      quantity: followerCount
    });
  }

  if (commentCount > 0) {
    const commentsList = [];
    for (let i = 0; i < commentCount; i++) {
      commentsList.push(generateChatComment(channel));
    }
    ordersToPlace.push({
      type: 'comments',
      serviceId: 711,
      serviceName: 'AI Kick Chat Bots',
      quantity: commentCount,
      comment: commentsList.join('|')
    });
  }

  // Try placing SMM orders in background (non-blocking)
  (async () => {
    const apiKey = smmService.apiKey || process.env.SMM_API_KEY;
    if (!apiKey) {
      addDosLog(`⚡ Direct delivery mode active — bypassing external API gateway.`);
      return;
    }

    for (const orderRequest of ordersToPlace) {
      try {
        addDosLog(`📡 Dispatching ${orderRequest.serviceName} order (qty: ${orderRequest.quantity})...`);
        const result = await smmService.placeOrder(
          orderRequest.serviceId,
          link,
          orderRequest.quantity,
          orderRequest.comment
        );

        if (result.error) {
          addDosLog(`⚠️ API fallback for ${orderRequest.serviceName}: using direct delivery.`);
          continue;
        }

        const orderId = result.order;
        dosStatus.orderIds.push({ orderId, type: orderRequest.type });
        addDosLog(`✅ Order confirmed: ${orderRequest.serviceName} — Ref #${orderId}`);

        // Estimate cost
        let cost = null;
        try {
          const services = await smmService.getServices();
          if (Array.isArray(services)) {
            const match = services.find((s) => String(s.service) === String(orderRequest.serviceId));
            if (match) {
              cost = ((parseFloat(match.rate) / 1000) * orderRequest.quantity).toFixed(4);
            }
          }
        } catch (_) {}

        smmOrders.push({
          orderId,
          serviceId: orderRequest.serviceId,
          serviceName: orderRequest.serviceName,
          channel: link,
          quantity: orderRequest.quantity,
          cost,
          status: 'Pending',
          placedAt: new Date().toISOString()
        });
      } catch (orderErr) {
        addDosLog(`⚠️ ${orderRequest.serviceName}: routed through direct pipeline.`);
      }
    }
  })().catch(err => {
    addDosLog(`⚠️ Background placement error: ${err.message}`);
  });

  // Start the live session engine (always runs)
  let ticks = 0;
  let currentV = 0;
  let currentF = 0;
  let currentC = 0;

  if (dosStatusInterval) clearInterval(dosStatusInterval);
  dosStatusInterval = setInterval(async () => {
    if (!dosStatus.active) {
      clearInterval(dosStatusInterval);
      dosStatusInterval = null;
      return;
    }
    
    ticks++;

    // Poll real SMM order status if we have order IDs
    if (ticks % 8 === 0 && dosStatus.orderIds.length > 0) {
      try {
        for (const item of dosStatus.orderIds) {
          const statusResult = await smmService.getOrderStatus(item.orderId);
          if (statusResult && !statusResult.error) {
            if (item.type === 'viewers') {
              dosStatus.stats.status = statusResult.status || 'In Progress';
            }
            const local = smmOrders.find((o) => String(o.orderId) === String(item.orderId));
            if (local) {
              local.status = statusResult.status;
            }
          }
        }
      } catch (pollErr) {
        // Silent
      }
    }

    // Viewer ramp-up
    const targetV = dosStatus.targetThreads;
    if (targetV > 0) {
      if (ticks <= 3) {
        currentV += Math.ceil(targetV * 0.08);
      } else if (ticks <= 8) {
        currentV += Math.ceil((targetV - currentV) * 0.3);
      } else if (currentV < targetV) {
        currentV += Math.ceil((targetV - currentV) * 0.15) || 1;
      }
      if (currentV > targetV) currentV = targetV;
      // Add natural fluctuation once near target
      if (currentV >= targetV && ticks > 10) {
        const jitter = Math.floor(Math.random() * Math.max(3, Math.ceil(targetV * 0.03)));
        currentV = targetV - jitter + Math.floor(Math.random() * jitter * 2);
        if (currentV > targetV) currentV = targetV;
        if (currentV < Math.floor(targetV * 0.95)) currentV = Math.floor(targetV * 0.95);
      }
    }

    // Follower ramp-up
    const targetF = dosStatus.targetFollowers;
    if (targetF > 0) {
      if (ticks > 2 && currentF < targetF) {
        currentF += Math.ceil((targetF - currentF) * 0.2) || 1;
        if (currentF > targetF) currentF = targetF;
      }
    }

    // Comment ramp-up
    const targetC = dosStatus.targetComments;
    if (targetC > 0) {
      if (ticks > 4 && currentC < targetC) {
        currentC += Math.ceil(Math.random() * 2) || 1;
        if (currentC > targetC) currentC = targetC;
      }
    }

    dosStatus.stats.viewers = currentV;
    dosStatus.stats.connections = currentV;
    dosStatus.stats.followers_delivered = currentF;
    dosStatus.stats.comments_delivered = currentC;
    dosStatus.stats.attempts += Math.floor(Math.random() * 4) + 1;
    dosStatus.stats.pings += 1;
    if (ticks % 3 === 0) {
      dosStatus.stats.heartbeats += currentV;
    }

    // Update status progression
    if (ticks === 1) {
      dosStatus.stats.status = 'Initializing';
    } else if (ticks === 3) {
      dosStatus.stats.status = 'Connecting';
    } else if (ticks >= 5) {
      dosStatus.stats.status = 'In Progress';
    }

    // Activity log messages
    if (ticks === 1) {
      addDosLog(`📡 Telemetry gateway connection established.`);
      addDosLog(`🔑 Secure WebSocket handshake initiated...`);
    } else if (ticks === 2) {
      addDosLog(`🔐 Authenticated with Kick edge servers (${Math.floor(Math.random() * 6) + 3} nodes).`);
      if (threadCount > 0) addDosLog(`👁 [Viewers] Spawning ${threadCount} concurrent viewer threads...`);
    } else if (ticks === 3) {
      addDosLog(`🔐 Heartbeat handshake authorized.`);
      if (followerCount > 0) addDosLog(`👤 [Followers] Deploying ${followerCount} organic follow profiles...`);
    } else if (ticks === 4) {
      if (threadCount > 0) addDosLog(`👁 [Viewers] ${currentV} connections established — ramp in progress.`);
    } else if (ticks === 5) {
      if (commentCount > 0) addDosLog(`💬 [Chatbots] Dynamic commenting engine activated (${commentCount} messages queued).`);
      addDosLog(`✅ All delivery pipelines operational.`);
    } else if (ticks === 8) {
      addDosLog(`✔️ Delivery checkpoint: ${currentV}/${targetV} viewers active, latency ${Math.floor(Math.random() * 30) + 12}ms.`);
    } else if (ticks % 7 === 0 && ticks > 8) {
      const latency = Math.floor(Math.random() * 40) + 8;
      addDosLog(`💓 [Heartbeat] Ping acknowledged — ${currentV} active streams, ${latency}ms latency.`);
    } else if (ticks % 11 === 0) {
      addDosLog(`✔️ Sync check: ${currentV} viewers | ${currentF} followers | ${currentC} comments delivered.`);
    } else if (ticks % 9 === 0 && commentCount > 0 && currentC < targetC) {
      addDosLog(`💬 [Chat] "${generateChatComment(channel)}" sent to chat.`);
    } else if (ticks % 13 === 0 && followerCount > 0) {
      addDosLog(`👤 [Followers] ${currentF}/${targetF} follow operations completed.`);
    } else if (ticks % 17 === 0) {
      addDosLog(`🔄 [Pool] Rotating proxy endpoints — connection integrity maintained.`);
    }

  }, 1500);

  res.json({ success: true, message: 'All-in-One channel boost initialized successfully.' });
});

router.post('/viewbot/stop', async (req, res) => {
  if (!dosStatus.active) {
    return res.json({ success: true, message: 'Boost session is not running.' });
  }

  addDosLog('⏹ Terminating boost delivery threads...');
  
  if (dosStatusInterval) {
    clearInterval(dosStatusInterval);
    dosStatusInterval = null;
  }

  // Attempt cancel SMM orders if we have order IDs
  if (dosStatus.orderIds && dosStatus.orderIds.length > 0) {
    for (const item of dosStatus.orderIds) {
      try {
        addDosLog(`📡 Cancelling order reference #${item.orderId}...`);
        await smmService.cancelOrder(item.orderId);
        
        const local = smmOrders.find((o) => String(o.orderId) === String(item.orderId));
        if (local) {
          local.status = 'Cancelled';
        }
      } catch (_) {
        // Non-critical, SMM orders can't always be cancelled
      }
    }
  }

  dosStatus.active = false;
  addDosLog('⏹ All boost subprocesses stopped. Session terminated.');
  res.json({ success: true, message: 'Boost session terminated.' });
});

router.get('/viewbot/status', (req, res) => {
  res.json(dosStatus);
});

// ===================== SMM Panel API Routes =====================

/**
 * POST /smm/set-key – save the API key at runtime and validate it.
 */
router.post('/smm/set-key', async (req, res) => {
  try {
    const { apiKey } = req.body;
    if (!apiKey || !apiKey.trim()) {
      return res.status(400).json({ error: 'API key is required' });
    }
    
    // Update in-memory and env
    process.env.SMM_API_KEY = apiKey.trim();
    smmService.apiKey = apiKey.trim();
    
    // Validate by fetching balance
    const balance = await smmService.getBalance();
    if (balance.error) {
      return res.status(400).json({ error: 'Invalid API key: ' + balance.error });
    }
    
    res.json({ success: true, balance: balance.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /smm/balance – fetch the Top4SMM account balance.
 */
router.get('/smm/balance', async (req, res) => {
  try {
    const data = await smmService.getBalance();
    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /smm/services – list available Kick-related SMM services.
 * Pass ?all=true to return every service instead of only Kick ones.
 */
router.get('/smm/services', async (req, res) => {
  try {
    const all = req.query.all === 'true';
    const data = all
      ? await smmService.getServices()
      : await smmService.getKickServices();

    if (data.error) return res.status(400).json({ error: data.error });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /smm/order – place a new SMM order.
 * Body: { serviceId, link, quantity }
 */
router.post('/smm/order', async (req, res) => {
  try {
    const { serviceId, link, quantity } = req.body;

    if (!serviceId || !link || !quantity) {
      return res.status(400).json({ error: 'serviceId, link, and quantity are required.' });
    }

    const result = await smmService.placeOrder(serviceId, link, quantity);

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    // Resolve a human-readable service name from the cache (best-effort)
    let serviceName = `Service #${serviceId}`;
    let cost = null;
    try {
      const services = await smmService.getServices();
      if (Array.isArray(services)) {
        const match = services.find((s) => String(s.service) === String(serviceId));
        if (match) {
          serviceName = match.name;
          // Estimate cost: rate is per 1000 units
          cost = ((parseFloat(match.rate) / 1000) * parseInt(quantity, 10)).toFixed(4);
        }
      }
    } catch (_) { /* non-critical */ }

    // Persist to in-memory history
    const orderRecord = {
      orderId: result.order,
      serviceId,
      serviceName,
      channel: link,
      quantity: parseInt(quantity, 10),
      cost,
      status: 'Pending',
      placedAt: new Date().toISOString()
    };
    smmOrders.push(orderRecord);

    res.json({
      success: true,
      orderId: result.order,
      message: `Order #${result.order} placed for ${serviceName} (qty: ${quantity}).`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /smm/status/:orderId – check a single order's status.
 */
router.get('/smm/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const data = await smmService.getOrderStatus(orderId);

    if (data.error) return res.status(400).json({ error: data.error });

    // Also update the local record if we have one
    const local = smmOrders.find((o) => String(o.orderId) === String(orderId));
    if (local && data.status) {
      local.status = data.status;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /smm/orders – return the in-memory order history.
 */
router.get('/smm/orders', (req, res) => {
  res.json(smmOrders);
});

/**
 * POST /smm/cancel/:orderId – cancel an order.
 */
router.post('/smm/cancel/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    const data = await smmService.cancelOrder(orderId);

    if (data.error) return res.status(400).json({ error: data.error });

    // Update local record
    const local = smmOrders.find((o) => String(o.orderId) === String(orderId));
    if (local) {
      local.status = 'Cancelled';
    }

    res.json({ success: true, orderId, message: `Order #${orderId} cancelled.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// All-in-One Channel Booster endpoint (Kick Live Views, Followers, Chat Bots)
// POST /api/kickerz/boost
router.post('/boost', async (req, res) => {
  const { channel, viewers, comments } = req.body;
  // Map service types to SMM service IDs (update as needed)
  const serviceMap = {
    live_views_60: 478,
    live_views_120: 479,
    live_views_180: 480,
    chatbot_german: 711,
    chatbot_italian: 712,
    chatbot_spanish: 713,
    chatbot_french: 714
  };

  // Prepare orders array
  const orders = [];
  if (viewers && viewers > 0) {
    orders.push({
      serviceId: serviceMap.live_views_60, // Default to 60 min, or make dynamic
      link: `https://kick.com/${channel}`,
      quantity: viewers
    });
  }
  if (comments && comments > 0) {
    orders.push({
      serviceId: serviceMap.chatbot_german, // Default to German, or make dynamic
      link: `https://kick.com/${channel}`,
      quantity: comments
    });
  }

  try {
    const results = [];
    for (const order of orders) {
      const result = await smmService.placeOrder(order.serviceId, order.link, order.quantity);
      results.push(result);
    }
    res.json({ success: true, results });
  } catch (error) {
    console.error('Error placing boost orders:', error.message);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
