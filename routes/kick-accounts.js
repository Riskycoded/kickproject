const express = require('express');
const router = express.Router();
const KickAccountService = require('../Services/kickAccountService');

// Link a new platform account
router.post('/', async (req, res) => {
  try {
    const { userId, username, email, credentials } = req.body;
    if (!userId || !username) {
      return res.status(400).json({ error: 'userId and username are required.' });
    }
    
    const kickAccount = await KickAccountService.createKickAccount({
      userId,
      username,
      email,
      credentials
    });
    return res.json(kickAccount);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Get all linked accounts for a user
router.get('/user/:userId', async (req, res) => {
  try {
    const accounts = await KickAccountService.getKickAccountsByUserId(req.params.userId);
    return res.json(accounts);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Update status or credentials of a linked account
router.put('/:id', async (req, res) => {
  try {
    const updatedAccount = await KickAccountService.updateKickAccount(req.params.id, req.body);
    if (!updatedAccount) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    return res.json(updatedAccount);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

// Unlink/Delete a linked account
router.delete('/:id', async (req, res) => {
  try {
    const deletedAccount = await KickAccountService.deleteKickAccount(req.params.id);
    if (!deletedAccount) {
      return res.status(404).json({ error: 'Account not found.' });
    }
    return res.json({ message: 'Account successfully unlinked.', deletedAccount });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
