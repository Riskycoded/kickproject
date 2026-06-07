const axios = require('axios');

class KickApiService {
  constructor() {
    this.clientId = process.env.KICK_CLIENT_ID;
    this.clientSecret = process.env.KICK_CLIENT_SECRET;
    this.apiBaseUrl = 'https://api.kick.com';
    this.oauthBaseUrl = 'https://id.kick.com';
  }

  /**
   * Exchanges an authorization code for a User Access Token.
   * @param {string} code - Authorization code from callback redirect.
   * @param {string} redirectUri - Redirect URI configured in developer portal.
   * @param {string} codeVerifier - Verifier string generated for PKCE.
   * @returns {Promise<Object>} Token response data.
   */
  async exchangeAuthorizationCode(code, redirectUri, codeVerifier) {
    try {
      const response = await axios.post(`${this.oauthBaseUrl}/oauth/token`, 
        new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier,
          code: code
        }).toString(), 
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error exchanging authorization code:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to exchange authorization code');
    }
  }

  /**
   * Refreshes an expired access token using a refresh token.
   * @param {string} refreshToken - Active refresh token.
   * @returns {Promise<Object>} Token response data.
   */
  async refreshAccessToken(refreshToken) {
    try {
      const response = await axios.post(`${this.oauthBaseUrl}/oauth/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      return response.data;
    } catch (error) {
      console.error('Error refreshing access token:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to refresh access token');
    }
  }

  /**
   * Fetches active livestreams based on filter criteria.
   * @param {string} token - Valid User Access Token or App Access Token.
   * @param {Object} params - Query filters (broadcaster_user_id, category_id, language, limit, sort).
   * @returns {Promise<Object>} Array of active streams and metadata.
   */
  async getLivestreams(token, params = {}) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/livestreams`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: params
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching livestreams:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch livestreams');
    }
  }

  /**
   * Fetches general statistics for active livestreams.
   * @param {string} token - Valid User Access Token or App Access Token.
   * @returns {Promise<Object>} Livestream statistics data.
   */
  async getLivestreamStats(token) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/livestreams/stats`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching livestream stats:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch livestream stats');
    }
  }

  /**
   * Fetches channel details by channel slug/name.
   * @param {string} token - Valid User Access Token or App Access Token.
   * @param {string} slug - Channel slug/username.
   * @returns {Promise<Object>} Channel metadata.
   */
  async getChannel(token, slug) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/channels`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: {
          slug: [slug]
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching channel ${slug}:`, error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || `Failed to fetch channel ${slug}`);
    }
  }

  /**
   * Fetches authenticated user information.
   * @param {string} token - Valid User Access Token.
   * @returns {Promise<Object>} User data.
   */
  async getAuthenticatedUser(token) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/users`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching authenticated user:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch user information');
    }
  }

  /**
   * Fetches categories based on cursor, limit, names, tags, or ids.
   * @param {string} token - Valid Access Token.
   * @param {Object} params - Query parameters (cursor, limit, name, tag, id).
   * @returns {Promise<Object>} Categories list and pagination metadata.
   */
  async getCategories(token, params = {}) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v2/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: params
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching categories v2:', error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || 'Failed to fetch categories');
    }
  }

  /**
   * Search categories based on query word.
   * @param {string} token - Valid Access Token.
   * @param {string} query - Search query word.
   * @param {number} [page=1] - Page number.
   * @returns {Promise<Object>} Search results.
   */
  async searchCategories(token, query, page = 1) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/categories`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        },
        params: { q: query, page }
      });
      return response.data;
    } catch (error) {
      console.error(`Error searching categories for "${query}":`, error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || `Failed to search categories for "${query}"`);
    }
  }

  /**
   * Fetches a specific category by its ID.
   * @param {string} token - Valid Access Token.
   * @param {number|string} categoryId - Category ID.
   * @returns {Promise<Object>} Category metadata.
   */
  async getCategory(token, categoryId) {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/public/v1/categories/${categoryId}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json'
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching category ${categoryId}:`, error.response ? error.response.data : error.message);
      throw new Error(error.response?.data?.message || `Failed to fetch category ${categoryId}`);
    }
  }
}

module.exports = new KickApiService();
