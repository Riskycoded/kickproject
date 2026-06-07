const loadEnv = require('./load-env');
loadEnv();

const accountCreator = require('./accounts/account-creator');
const chatbot = require('./accounts/chatbot');
const viewSimulator = require('./views/view-simulator');
const kasadaBypass = require('./views/kasada-bypass');

async function main() {
  const accounts = [];
  const simCount = parseInt(process.env.SIMULATION_COUNT) || 5;
  console.log(`Starting simulation for ${simCount} accounts...`);

  for (let i = 0; i < simCount; i++) {
    const email = `email${i}@example.com`;
    try {
      const response = await accountCreator(email);
      if (response.status === 200 || response.status === 201) {
        const accountId = response.data?.data?.id || response.data?.id;
        if (accountId) {
          console.log(`Account created: ${email} (ID: ${accountId})`);
          accounts.push(accountId);
        } else {
          console.warn(`Account creation response did not contain ID:`, response.data);
        }
      }
    } catch (err) {
      console.error(`Failed to create account for ${email}:`, err.message);
    }
  }

  // Simulate watching streams for each account
  for (const accountId of accounts) {
    const channelId = `channel${accountId}`;
    try {
      const response = await viewSimulator(channelId);
      console.log(`Watched stream at channel ID: ${channelId}`);
    } catch (err) {
      console.error(`Failed watching stream for ${channelId}:`, err.message);
    }
  }

  // Bypass Kasada for each account
  for (const accountId of accounts) {
    const channelId = `channel${accountId}`;
    try {
      const response = await kasadaBypass();
      if (response.status === 200 || response.status === 201) {
        console.log(`Kasada bypassed for channel ID: ${channelId}`);
      }
    } catch (err) {
      console.error(`Failed bypassing Kasada for ${channelId}:`, err.message);
    }
  }

  return accounts;
}

main().then((accounts) => {
  console.log('Simulation completed. Created accounts:', accounts);
}).catch(err => {
  console.error('Simulation execution failed:', err);
});