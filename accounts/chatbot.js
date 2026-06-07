const loadEnv = require('../load-env');
loadEnv();

const proxyClient = require('../proxy-client');
const { generateChatComment } = require('../utils/helpers');

const chatbotApiEndpoint = process.env.KOPECHKA_API_URL ? `${process.env.KOPECHKA_API_URL}/chatbots` : 'https://kopechka.com/api/chatbots';
const apiKey = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';

async function sendComment(comment, channelId) {
  // If no comment was provided, generate a human-like comment
  const finalComment = comment || generateChatComment(channelId);

  const response = await proxyClient.post(`${chatbotApiEndpoint}/comments`, {
    comment: finalComment,
    channel_id: channelId,
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return response.data;
}

module.exports = sendComment;
