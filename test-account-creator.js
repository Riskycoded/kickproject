const axios = require('axios');
const kopechkaAccountCreator = require('./kopechka-account-creator');

const API_KEY = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';
const KOPECHKA_BASE_URL = process.env.KOPECHKA_API_URL || 'https://api.kopechka.com/api/v1';

async function testEmailOrder() {
  try {
    console.log('Checking Kopeechka balance for the API key...');
    const balanceResponse = await axios.get(`${KOPECHKA_BASE_URL}/balance`, {
      headers: { 'X-API-Key': API_KEY }
    });
    
    const balance = balanceResponse.data.data.balance;
    console.log(`Current Balance: ${balance}`);
    
    console.log('Fetching available domains for kick.com...');
    const domainsResponse = await axios.get(`${KOPECHKA_BASE_URL}/domains`, {
      params: { site: 'kick.com' },
      headers: { 'X-API-Key': API_KEY }
    });
    
    const responseData = domainsResponse.data;
    let selectedDomain = null;
    let selectedPrice = 0;
    
    if (responseData && responseData.success && Array.isArray(responseData.data)) {
      // Find domains that are active (availableCount > 0) AND cost less than or equal to current balance
      const affordableDomains = responseData.data.filter(d => d.availableCount > 0 && d.price <= balance);
      
      if (affordableDomains.length > 0) {
        // Pick the cheapest affordable domain
        affordableDomains.sort((a, b) => a.price - b.price);
        selectedDomain = affordableDomains[0].name;
        selectedPrice = affordableDomains[0].price;
        console.log(`Selected affordable domain: ${selectedDomain} (Price: ${selectedPrice}, Available: ${affordableDomains[0].availableCount})`);
      } else {
        console.log(`No active domains found priced <= current balance (${balance}).`);
        // Find the absolute cheapest active domain to show how much more is needed
        const activeDomains = responseData.data.filter(d => d.availableCount > 0);
        if (activeDomains.length > 0) {
          activeDomains.sort((a, b) => a.price - b.price);
          console.log(`Cheapest active domain available is: ${activeDomains[0].name} (Price: ${activeDomains[0].price}). You need at least ${activeDomains[0].price - balance} more.`);
        }
      }
    }

    if (!selectedDomain) {
      console.log('Cannot proceed with order creation due to lack of affordable domains.');
      return;
    }

    console.log(`Testing Kopeechka order creation using domain: ${selectedDomain}...`);
    const order = await kopechkaAccountCreator.createEmailOrder(API_KEY, {
      site: 'kick.com',
      domain: selectedDomain,
      mail_type: 'random'
    });
    console.log('Order response:', order);

    if (order && order.data && order.data.success && order.data.data && order.data.data.id) {
      const orderId = order.data.data.id;
      console.log(`Successfully created order ID: ${orderId}. Checking messages...`);
      const messages = await kopechkaAccountCreator.checkMessages(API_KEY, orderId);
      console.log('Messages retrieved:', messages.data);
    }
  } catch (error) {
    console.error('Test run failed:', error.response ? error.response.data : error.message);
  }
}

testEmailOrder();