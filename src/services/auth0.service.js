const logger = require('../utils/logger');

/**
 * Auth0 Token Service
 * Handles M2M (Machine-to-Machine) OAuth token requests
 * Uses native Node.js 18+ fetch API
 */

class Auth0Service {
  constructor() {
    this.domain = process.env.AUTH0_DOMAIN;
    this.clientId = process.env.AUTH0_CLIENT_ID;
    this.clientSecret = process.env.AUTH0_CLIENT_SECRET;
    this.audience = process.env.AUTH0_AUDIENCE;
    this.tokenUrl = `https://${this.domain}/oauth/token`;
    this.token = null;
    this.tokenExpiry = null;
  }

  /**
   * Get Auth0 access token using client credentials flow
   * Caches token until expiry
   * @returns {Promise<string>} Access token
   */
  async getToken() {
    try {
      // Return cached token if still valid (with 60s buffer)
      if (this.token && this.tokenExpiry && Date.now() < (this.tokenExpiry - 60000)) {
        logger.debug('Using cached Auth0 token');
        return this.token;
      }

      logger.info('🔐 Fetching Auth0 access token...');

      const response = await fetch(this.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          client_secret: this.clientSecret,
          audience: this.audience,
          grant_type: 'client_credentials',
        }),
      });

      if (!response.ok) {
        throw new Error(`Auth0 token request failed: ${response.statusText}`);
      }

      const data = await response.json();

      // Cache token and expiry
      this.token = data.access_token;
      this.tokenExpiry = Date.now() + (data.expires_in * 1000);

      logger.info('✅ Auth0 access token obtained successfully');
      logger.debug(`Token expires in: ${data.expires_in}s`);

      return this.token;
    } catch (error) {
      logger.error('❌ Error fetching Auth0 token:', error.message);
      throw new Error(`Auth0 token retrieval failed: ${error.message}`);
    }
  }

  /**
   * Get authorization header with Bearer token
   * @returns {Promise<Object>} Authorization header object
   */
  async getAuthHeader() {
    try {
      const token = await this.getToken();
      return {
        Authorization: `Bearer ${token}`,
      };
    } catch (error) {
      logger.error('❌ Error creating Auth0 authorization header:', error.message);
      throw error;
    }
  }

  /**
   * Verify token validity (ping Auth0)
   * @returns {Promise<boolean>} Token validity
   */
  async verifyToken() {
    try {
      if (!this.token) {
        await this.getToken();
      }
      logger.info('✅ Auth0 token verified');
      return true;
    } catch (error) {
      logger.error('❌ Auth0 token verification failed:', error.message);
      return false;
    }
  }

  /**
   * Clear cached token (forces refresh on next request)
   */
  clearToken() {
    this.token = null;
    this.tokenExpiry = null;
    logger.debug('Auth0 token cache cleared');
  }
}

module.exports = new Auth0Service();
