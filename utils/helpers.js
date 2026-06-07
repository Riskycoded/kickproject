const chatTemplates = [
  "yo {streamer} this stream is {adj}!",
  "that last play was absolutely {adj}",
  "can we get some hype in the chat for {streamer}?",
  "how long have you been streaming for?",
  "this setup looks {adj} ngl",
  "we eating good tonight boys",
  "damnnnn that was clean",
  "poggers in the chat",
  "sheeeeesh",
  "insane gameplay right there",
  "what keyboard is that?",
  "bro is cooking",
  "lmao no way that just happened"
];

const adjectives = [
  "insane",
  "crazy",
  "wild",
  "cracked",
  "amazing",
  "hype",
  "huge",
  "unreal",
  "godlike"
];

/**
 * Generates a random, human-like chat comment using predefined structural templates.
 * @param {string} streamerName - The username of the streamer to target.
 * @returns {string} The constructed message.
 */
function generateChatComment(streamerName = 'streamer') {
  const template = chatTemplates[Math.floor(Math.random() * chatTemplates.length)];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  
  return template
    .replace(/{streamer}/g, streamerName)
    .replace(/{adj}/g, adjective);
}

const crypto = require('crypto');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 600000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

module.exports = {
  generateChatComment,
  hashPassword
};
