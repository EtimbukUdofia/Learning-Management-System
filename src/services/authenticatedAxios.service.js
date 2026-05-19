const axios = require('axios');
const auth0Service = require('./auth0.service');
const logger = require('../utils/logger');

/**
 * Authenticated Axios Client
 * Automatically adds Auth0 Bearer token to all requests
 */

class AuthenticatedClient {
  constructor(baseURL = '') {
    this.axiosInstance = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor to inject Auth0 token
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        try {
          const authHeader = await auth0Service.getAuthHeader();
          config.headers = {
            ...config.headers,
            ...authHeader,
          };
          logger.debug(`📤 Request: ${config.method.toUpperCase()} ${config.url}`);
          return config;
        } catch (error) {
          logger.error('❌ Failed to add Auth0 token to request:', error.message);
          return Promise.reject(error);
        }
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor for error handling
    this.axiosInstance.interceptors.response.use(
      (response) => {
        logger.debug(`📥 Response: ${response.status} ${response.statusText}`);
        return response;
      },
      (error) => {
        if (error.response) {
          logger.error(
            `❌ API Error: ${error.response.status} ${error.response.statusText}`,
            error.response.data
          );

          // If 401 Unauthorized, clear cached token for refresh
          if (error.response.status === 401) {
            logger.warn('⚠️  Received 401 - Clearing cached Auth0 token');
            auth0Service.clearToken();
          }
        } else {
          logger.error('❌ Request failed:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * GET request
   * @param {string} url - Endpoint URL
   * @param {Object} config - Axios config options
   */
  async get(url, config = {}) {
    try {
      const response = await this.axiosInstance.get(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * POST request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body
   * @param {Object} config - Axios config options
   */
  async post(url, data = {}, config = {}) {
    try {
      const response = await this.axiosInstance.post(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * PUT request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body
   * @param {Object} config - Axios config options
   */
  async put(url, data = {}, config = {}) {
    try {
      const response = await this.axiosInstance.put(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * PATCH request
   * @param {string} url - Endpoint URL
   * @param {Object} data - Request body
   * @param {Object} config - Axios config options
   */
  async patch(url, data = {}, config = {}) {
    try {
      const response = await this.axiosInstance.patch(url, data, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * DELETE request
   * @param {string} url - Endpoint URL
   * @param {Object} config - Axios config options
   */
  async delete(url, config = {}) {
    try {
      const response = await this.axiosInstance.delete(url, config);
      return response.data;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get raw axios instance for advanced usage
   */
  getAxiosInstance() {
    return this.axiosInstance;
  }
}

// Export factory function for creating instances
module.exports = (baseURL) => new AuthenticatedClient(baseURL);
