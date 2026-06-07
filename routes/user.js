const express = require('express');
const router = express.Router();
const UserService = require('../Services/UserService');
const KickAccountService = require('../Services/kickAccountService');
const kopechkaAccountCreator = require('../kopechka-account-creator');
const User = require('../models/user');
const { hashPassword } = require('../utils/helpers');

router.post('/automate-one', async (req, res) => {
  const apiToken = req.body.apiToken;
  try {
    let email = '';
    let kopechkaOrderId = null;

    try {
      // Attempt to retrieve a booked email address using Kopeechka API
      const order = await kopechkaAccountCreator.createEmailOrder(apiToken, {
        site: 'kick.com',
        domain: 'asia.com',
        mail_type: 'random'
      });

      if (order && order.data && order.data.success && order.data.data) {
        email = order.data.data.email;
        kopechkaOrderId = order.data.data.id;
      }
    } catch (kopechkaErr) {
      console.warn('Kopechka API error, falling back to local generation:', kopechkaErr.message);
    }

    // Fallback if Kopeechka order fails or returned no email
    if (!email) {
      const rand = Math.floor(Math.random() * 100000);
      email = `auto_mock_${rand}@asia.com`;
    }

    const randUsername = `auto_${Math.random().toString(36).substring(2, 8)}`;
    const randPassword = `pass_${Math.random().toString(36).substring(2, 10)}!`;

    const hashedPassword = hashPassword(randPassword);
    const newUser = new User({ email, username: randUsername, password: hashedPassword });
    await newUser.save();

    const userResponse = { _id: newUser._id, email: newUser.email, username: newUser.username };

    const kickAccount = await KickAccountService.createKickAccount({
      userId: newUser._id,
      username: `kick_${randUsername}`,
      email: email,
      credentials: {
        accessToken: `mock-token-${Math.random().toString(36).substring(2, 9)}`,
        refreshToken: `mock-refresh-${Math.random().toString(36).substring(2, 9)}`,
        expiresAt: new Date(Date.now() + 86400 * 1000)
      }
    });

    return res.json({
      success: true,
      user: userResponse,
      kickAccount: kickAccount,
      kopechkaOrderId
    });
  } catch (error) {
    console.error('Automation failed:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const user = await UserService.createUser(req.body.email);
    return res.json(user);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const users = await UserService.getUserAll();
    return res.json(users);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
