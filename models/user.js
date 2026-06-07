const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: String,
  username: String,
  password: { type: String, required: true },
});

module.exports = mongoose.model('User', userSchema);
