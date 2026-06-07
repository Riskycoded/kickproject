const express = require('express');
const router = express.Router();

let activeOrders = new Map();

// GET /mock/kopechka/balance
router.get('/balance', (req, res) => {
  res.json({
    success: true,
    data: {
      balance: 10.5
    }
  });
});

// GET /mock/kopechka/domains
router.get('/domains', (req, res) => {
  res.json({
    success: true,
    data: [
      { name: 'asia.com', price: 0.02, availableCount: 200 },
      { name: 'gmail.com', price: 0.1, availableCount: 50 },
      { name: 'mail.ru', price: 0.05, availableCount: 150 }
    ]
  });
});

// POST /mock/kopechka/orders
router.post('/orders', (req, res) => {
  const { site, domain, mail_type } = req.body;
  const orderId = 'ord_mock_' + Math.random().toString(36).substring(2, 9);
  const email = `auto_${Math.random().toString(36).substring(2, 8)}@${domain || 'asia.com'}`;
  
  const orderData = {
    id: orderId,
    email: email,
    site: site || 'kick.com',
    createdAt: Date.now()
  };
  
  activeOrders.set(orderId, orderData);
  
  res.json({
    success: true,
    data: orderData
  });
});

// GET /mock/kopechka/orders/:id/messages
router.get('/orders/:id/messages', (req, res) => {
  const orderId = req.params.id;
  const order = activeOrders.get(orderId);
  if (!order) {
    return res.status(404).json({ success: false, error: 'Order not found' });
  }
  
  const code = Math.floor(100000 + Math.random() * 900000);
  res.json({
    success: true,
    data: [
      {
        id: Math.floor(Math.random() * 10000),
        text: `Welcome to Kick! Your verification code is: ${code}`,
        receivedAt: new Date().toISOString()
      }
    ]
  });
});

// POST /mock/kopechka/chatbots/comments
router.post('/chatbots/comments', (req, res) => {
  const { comment, channel_id } = req.body;
  res.json({
    success: true,
    message: 'Comment simulated successfully',
    data: { comment, channel_id, timestamp: Date.now() }
  });
});

// POST /mock/kopechka/watch
router.post('/watch', (req, res) => {
  const { channel_id } = req.body;
  res.json({
    success: true,
    message: 'Stream watch simulation started',
    data: { channel_id, startedAt: Date.now() }
  });
});

// GET /mock/kopechka/stream/:channelId
router.get('/stream/:channelId', (req, res) => {
  const { channelId } = req.params;
  res.json({
    success: true,
    channelId,
    timestamp: Date.now(),
    viewerCount: Math.floor(Math.random() * 50) + 1
  });
});

// POST /mock/kopechka/kasada/bypass
router.post('/kasada/bypass', (req, res) => {
  const { auth_token } = req.body;
  res.json({
    success: true,
    message: 'Kasada bypassed successfully',
    data: { tokenUsed: auth_token, bypassedAt: Date.now() }
  });
});

module.exports = router;
