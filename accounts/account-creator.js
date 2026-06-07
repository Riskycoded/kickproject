const loadEnv = require('../load-env');
loadEnv();

const proxyClient = require('../proxy-client');

const apiEndpoint = process.env.KOPECHKA_API_URL || 'https://kopechka.com/api';
const apiKey = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';

async function createAccount(email) {
  const response = await proxyClient.post(`${apiEndpoint}/orders`, {
    email,
    password: 'password123',
  }, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  return response;
}

module.exports = createAccount;