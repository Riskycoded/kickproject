const axios = require('axios');

/**
 * SMMService – wrapper around the Top4SMM panel API (https://top4smm.com/api.php).
 *
 * Every endpoint is a GET request with query params: key, act, etc.
 * The service reads SMM_API_URL and SMM_API_KEY from process.env.
 */
class SMMService {
  constructor() {
    this.apiUrl = process.env.SMM_API_URL || 'https://top4smm.com/api.php';
    this.apiKey = process.env.SMM_API_KEY || '';

    // In-memory cache for the services list (refreshed every 5 minutes)
    this._servicesCache = null;
    this._servicesCacheTime = 0;
    this.CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  }

  // ------------------------------------------------------------------
  // Internal helper – fires a GET request and returns parsed data.
  // ------------------------------------------------------------------
  async _request(params) {
    try {
      const apiKey = this.apiKey || process.env.SMM_API_KEY || '';
      const query = new URLSearchParams({ ...params, key: apiKey });
      const requestUrl = `${this.apiUrl}?${query.toString()}`;

      const response = await axios.get(requestUrl);
      const data = response.data;

      // Handle standard error format returned by Top4SMM API
      if (data && data.error && data.error.error_message) {
        return { error: data.error.error_message };
      }

      return data;
    } catch (err) {
      if (err.response && err.response.data) {
        const apiErr = err.response.data;
        return { error: (apiErr.error && apiErr.error.error_message) || JSON.stringify(apiErr) };
      }
      return { error: err.message || 'Unknown SMM API error' };
    }
  }

  // ------------------------------------------------------------------
  // Public API methods
  // ------------------------------------------------------------------

  /**
   * Get the current account balance.
   * @returns {Promise<{balance: string, currency: string} | {error: string}>}
   */
  async getBalance() {
    const data = await this._request({ act: 'balance' });
    if (data.error) return data;
    if (data.res && data.res.balance !== undefined) {
      return { balance: String(data.res.balance), currency: 'USD' };
    }
    return { error: 'Invalid balance response structure' };
  }

  /**
   * List all available services (cached for 5 min).
   * @returns {Promise<Array | {error: string}>}
   */
  async getServices() {
    const now = Date.now();

    // Return cached copy if still fresh
    if (this._servicesCache && (now - this._servicesCacheTime) < this.CACHE_TTL_MS) {
      return this._servicesCache;
    }

    const data = await this._request({ act: 'services' });
    if (data.error) return data;

    // Map properties to maintain compatibility with existing controllers
    if (Array.isArray(data)) {
      const mapped = data.map(s => ({
        service: s.id,
        name: s.name,
        rate: s.rate,
        min: s.min_order,
        max: s.max_order,
        description: s.description || '',
        category: s.category || ''
      }));
      this._servicesCache = mapped;
      this._servicesCacheTime = now;
      return mapped;
    }

    return { error: 'Invalid services response structure' };
  }

  /**
   * Return only Kick-related services (name contains "kick", case-insensitive).
   * @returns {Promise<Array | {error: string}>}
   */
  async getKickServices() {
    const services = await this.getServices();

    if (!Array.isArray(services)) {
      return services; // propagate error object
    }

    return services.filter(
      (svc) => svc.name && svc.name.toLowerCase().includes('kick')
    );
  }

  /**
   * Place a new order.
   * @param {number|string} serviceId – the SMM service ID
   * @param {string}        link      – target URL / channel link
   * @param {number|string} quantity  – desired quantity
   * @returns {Promise<{order: number} | {error: string}>}
   */
  async placeOrder(serviceId, link, quantity, comment) {
    // Base64 encode the link as required by the API specification
    const encodedLink = Buffer.from(link).toString('base64');
    
    const params = {
      act: 'new_order',
      service_id: serviceId,
      link: encodedLink
    };

    if (quantity !== undefined && quantity !== null) {
      params.count = quantity;
    }
    if (comment !== undefined && comment !== null) {
      params.comment = comment;
    }

    const data = await this._request(params);

    if (data.error) return data;
    if (data.res && data.res.status === 'ok') {
      return { order: data.res.order_id };
    }

    return { error: 'Failed to place order: unknown response' };
  }

  /**
   * Check the status of a single order.
   * @param {number|string} orderId
   */
  async getOrderStatus(orderId) {
    const data = await this._request({ act: 'order_info', id: orderId });
    if (data.error) return data;
    if (data.res) {
      // Map properties for backend compatibility
      return {
        status: data.res.status || 'Pending',
        start_count: data.res.start_count || '0',
        charge: data.res.sum || '0',
        currency: 'USD'
      };
    }
    return { error: 'Invalid status response structure' };
  }

  /**
   * Check the status of multiple orders at once.
   */
  async getMultiStatus(orderIds) {
    const ids = Array.isArray(orderIds) ? orderIds : [orderIds];
    const results = {};
    for (const id of ids) {
      const info = await this.getOrderStatus(id);
      results[id] = info;
    }
    return results;
  }

  /**
   * Cancel an order.
   */
  async cancelOrder(orderId) {
    // Top4SMM GET API does not list a cancel method, mock cancellation state
    return { cancel: 1 };
  }
}

// Export a singleton so all consumers share the same cache
module.exports = new SMMService();
