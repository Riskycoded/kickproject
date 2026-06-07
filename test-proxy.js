const proxyClient = require('./proxy-client');
const loadEnv = require('./load-env');
loadEnv();

console.log('--- Loaded Configuration ---');
console.log('Host:', process.env.PROXY_HOST);
console.log('Port:', process.env.PROXY_PORT);
console.log('User:', process.env.PROXY_USER);
console.log('Pass:', process.env.PROXY_PASS ? '********' : 'Not Loaded');
console.log('----------------------------\n');

async function checkProxyIP() {
  try {
    console.log('Sending request to check IP through the proxy...');
    const response = await proxyClient.get('https://httpbin.org/ip', { timeout: 10000 });
    console.log('Proxy connection successful!');
    console.log('Detected Public IP:', response.data.origin);
  } catch (error) {
    console.error('Error connecting through the proxy!');
    if (error.code) console.error('Error Code:', error.code);
    console.error('Message:', error.message);
    if (error.response) {
      console.error('Response Status:', error.response.status);
      console.error('Response Data:', error.response.data);
    } else {
      console.error('Full Error:', error);
    }
  }
}

checkProxyIP();
