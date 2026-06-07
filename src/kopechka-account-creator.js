const proxyClient = require('../proxy-client');
const kopechkaApiUrl = 'https://api.kopechka.com/v1/accounts';

async function createAccount(accountData) {
  const payload = {
    email: accountData.email,
    password: accountData.password,
  };

  try {
    const response = await proxyClient.post(kopechkaApiUrl, payload);
    return response.data.account.id;
  } catch (error) {
    console.error('Error creating account:', error);
    throw error;
  }
}

async function createEmailOrder(email) {
  const payload = {
    email: email,
  };

  try {
    const response = await proxyClient.post(kopechkaApiUrl, payload);
    return response.data;
  } catch (error) {
    console.error('Error creating email order:', error);
    throw error;
  }
}

async function checkMessages(orderId) {
  const payload = {
    orderId: orderId,
  };

  try {
    const response = await proxyClient.get(kopechkaApiUrl, { params: payload });
    return response.data;
  } catch (error) {
    console.error('Error checking messages for order:', error);
    throw error;
  }
}

async function bulkCreateAccounts(emails, passwords) {
  const accounts = [];
  for (let i = 0; i < emails.length; i++) {
    try {
      const id = await createAccount({ email: emails[i], password: passwords[i] });
      accounts.push({ id });
    } catch (error) {
      console.error('Error creating account in bulk:', error);
    }
  }
  return accounts;
}

module.exports = {
  createAccount,
  createEmailOrder,
  checkMessages,
  bulkCreateAccounts
};