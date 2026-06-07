const loadEnv = require('../load-env');
loadEnv();

const axios = require('axios');

const kasadaApiEndpoint = process.env.KOPECHKA_API_URL ? `${process.env.KOPECHKA_API_URL}/kasada` : 'https://kopechka.com/api/kasada';
const apiKey = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';

async function bypassKasada() {
  try {
    const response = await axios.post(`${kasadaApiEndpoint}/bypass`, {
      auth_token: 'your-auth-token-here',
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000
    });
    return response;
  } catch (err) {
    console.warn(`[Kasada Bypass] Request failed: ${err.message}`);
    throw err;
  }
}

module.exports = bypassKasada;
