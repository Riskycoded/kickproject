const proxyClient = require('./proxy-client');
const KOPECHKA_BASE_URL = process.env.KOPECHKA_API_URL || 'https://api.kopechka.com/api/v1';
const DEFAULT_API_KEY = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';

async function createEmailOrder(apiToken = DEFAULT_API_KEY, details = {}) {
  // If first parameter is an object, swap parameters (handles case where only details are passed)
  if (typeof apiToken === 'object') {
    details = apiToken;
    apiToken = DEFAULT_API_KEY;
  }
  
  try {
    const response = await proxyClient.post(`${KOPECHKA_BASE_URL}/orders`, details, {
      headers: {
        'X-API-Key': apiToken,
        'Content-Type': 'application/json'
      }
    });
    return response;
  } catch (error) {
    console.error('Error creating email order:', error.response ? error.response.data : error.message);
    throw error;
  }
}

async function checkMessages(apiToken = DEFAULT_API_KEY, orderId) {
  if (typeof apiToken !== 'string') {
    orderId = apiToken;
    apiToken = DEFAULT_API_KEY;
  }

  try {
    const response = await proxyClient.get(`${KOPECHKA_BASE_URL}/orders/${orderId}/messages`, {
      headers: {
        'X-API-Key': apiToken
      }
    });
    return response;
  } catch (error) {
    console.error(`Error retrieving messages for order ${orderId}:`, error.response ? error.response.data : error.message);
    throw error;
  }
}

async function createAccount(accountData, apiToken = DEFAULT_API_KEY) {
  try {
    const response = await createEmailOrder(apiToken, {
      site: 'kick.com',
      domain: 'asia.com',
      mail_type: 'random'
    });
    
    // Check if response has correct shape and return ID
    if (response && response.data && response.data.success && response.data.data) {
      return response.data.data.id;
    }
    throw new Error('Invalid response structure from Kopeechka API');
  } catch (error) {
    console.error('Error creating account:', error);
    throw new Error('Error creating account');
  }
}

async function bulkCreateAccounts(emails, passwords, apiToken = DEFAULT_API_KEY) {
  const accounts = [];

  for (let i = 0; i < emails.length; i++) {
    const email = emails[i];
    const password = passwords[i];

    try {
      const accountId = await createAccount({ email, password }, apiToken);
      accounts.push({ id: accountId, url: `https://example.com/watch/${accountId}` });
    } catch (error) {
      console.error('Error creating account in bulk:', error);
    }
  }

  return accounts;
}

module.exports = {
  createEmailOrder,
  checkMessages,
  createAccount,
  bulkCreateAccounts
};