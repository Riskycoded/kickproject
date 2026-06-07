const mongoose = require('mongoose');

const kickAccountSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  email: { type: String },
  username: { type: String, required: true },
  status: { 
    type: String, 
    enum: ['active', 'expired', 'suspended'], 
    default: 'active' 
  },
  credentials: { type: mongoose.Schema.Types.Mixed },
  createdAt: { type: Date, default: Date.now }
});

// Ensure a user cannot add duplicate accounts under the same username
kickAccountSchema.index({ userId: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('KickAccount', kickAccountSchema);
