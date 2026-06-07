const axios = require('axios');
const loadEnv = require('./load-env');
const { HttpsProxyAgent } = require('https-proxy-agent');

// Load environment variables
loadEnv();

const axiosInstance = axios.create({
  insecureHTTPParser: true
});

let proxyPool = [];
let lastFetchTime = 0;
const FETCH_INTERVAL = 3 * 60 * 1000; // 3 minutes cache

/**
 * Fetches the proxy list from the Smartproxy API endpoint.
 * @param {string} apiUrl 
 * @returns {Promise<string[]>} List of proxy IP:Port strings
 */
async function fetchProxyPool(apiUrl) {
  try {
    console.log('[Proxy] Fetching fresh proxies from Smartproxy API...');
    // Create a clean instance to fetch the proxy list without proxying the proxy request itself
    const cleanAxios = axios.create();
    const response = await cleanAxios.get(apiUrl, { timeout: 10000 });
    const data = response.data;
    
    // Check if the response is JSON error (e.g. IP not whitelisted)
    if (typeof data === 'object' || (typeof data === 'string' && data.trim().startsWith('{'))) {
      const json = typeof data === 'string' ? JSON.parse(data) : data;
      if (json.msg || json.code) {
        console.error(`\n[Proxy API Warning] ${json.msg} (Code: ${json.code})`);
        return [];
      }
    }
    
    if (typeof data === 'string') {
      const ips = data.split('\n')
        .map(line => line.trim())
        .filter(line => line && line.includes(':'));
      console.log(`[Proxy] Successfully loaded ${ips.length} proxies.`);
      return ips;
    }
    
    return [];
  } catch (err) {
    console.error('[Proxy] Failed to fetch proxy list:', err.message);
    return [];
  }
}

// Request interceptor to dynamically apply proxies
axiosInstance.interceptors.request.use(async (config) => {
  const apiUrl = process.env.PROXY_API_URL;
  
  if (apiUrl) {
    // Refresh pool if empty or cache duration has expired
    if (proxyPool.length === 0 || (Date.now() - lastFetchTime) > FETCH_INTERVAL) {
      const newPool = await fetchProxyPool(apiUrl);
      if (newPool.length > 0) {
        proxyPool = newPool;
        lastFetchTime = Date.now();
      }
    }
    
    if (proxyPool.length > 0) {
      // Pick a random proxy from the active pool
      const proxyStr = proxyPool[Math.floor(Math.random() * proxyPool.length)];
      console.log(`[Proxy] Routing request via: http://${proxyStr}`);
      
      const agent = new HttpsProxyAgent(`http://${proxyStr}`);
      config.httpsAgent = agent;
      config.proxy = false;
    } else {
      console.warn('[Proxy] No active proxies available in pool. Routing request directly.');
    }
  } else {
    // Fallback to static proxy configuration if configured
    const host = process.env.PROXY_HOST;
    const port = process.env.PROXY_PORT;
    const user = process.env.PROXY_USER;
    const pass = process.env.PROXY_PASS;
    
    if (host && port) {
      const auth = user && pass ? `${user}:${pass}@` : '';
      const agent = new HttpsProxyAgent(`http://${auth}${host}:${port}`);
      config.httpsAgent = agent;
      config.proxy = false;
    }
  }
  
  return config;
}, (error) => {
  return Promise.reject(error);
});

// Export helper to retrieve current proxy list for Python runners
axiosInstance.getProxyPool = async () => {
  const apiUrl = process.env.PROXY_API_URL;
  if (apiUrl) {
    if (proxyPool.length === 0 || (Date.now() - lastFetchTime) > FETCH_INTERVAL) {
      const newPool = await fetchProxyPool(apiUrl);
      if (newPool.length > 0) {
        proxyPool = newPool;
        lastFetchTime = Date.now();
      }
    }
  }
  return proxyPool;
};

module.exports = axiosInstance;

