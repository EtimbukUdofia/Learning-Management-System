/**
 * Auth0 Integration Examples
 * Shows how to use Auth0 service and authenticated axios client
 * in your controllers and services
 */

const auth0Service = require('./auth0.service');
const createAuthenticatedClient = require('./authenticatedAxios.service');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

// ─── Example 1: Get Auth0 Token Directly ──────────────────────────────────────
const exampleGetToken = catchAsync(async (req, res, next) => {
  try {
    const token = await auth0Service.getToken();
    logger.info('✅ Token fetched successfully');

    res.status(200).json({
      success: true,
      message: 'Auth0 token obtained',
      token: token.substring(0, 20) + '...', // Only show partial token for security
      expiresIn: '1 hour',
    });
  } catch (error) {
    next(new AppError('Failed to get Auth0 token', 503));
  }
});

// ─── Example 2: Make Authenticated API Request ─────────────────────────────────
const exampleMakeApiRequest = catchAsync(async (req, res, next) => {
  try {
    // Create authenticated axios client
    const client = createAuthenticatedClient('http://path_to_your_api/');

    // Make GET request (token automatically added)
    const response = await client.get('/endpoint', {
      // Optional config
      params: { filter: 'value' },
    });

    res.status(200).json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('API request failed:', error.message);
    next(new AppError('External API request failed', 503));
  }
});

// ─── Example 3: POST Request with Auth0 ───────────────────────────────────────
const examplePostWithAuth = catchAsync(async (req, res, next) => {
  try {
    const client = createAuthenticatedClient('http://path_to_your_api/');

    const payload = {
      name: 'Example',
      description: 'Test payload',
    };

    const response = await client.post('/endpoint', payload);

    res.status(201).json({
      success: true,
      data: response,
    });
  } catch (error) {
    logger.error('POST request failed:', error.message);
    next(new AppError('Failed to create resource', 503));
  }
});

// ─── Example 4: Multiple Requests in Parallel ─────────────────────────────────
const exampleParallelRequests = catchAsync(async (req, res, next) => {
  try {
    const client = createAuthenticatedClient('http://path_to_your_api/');

    // Make multiple requests in parallel
    const [data1, data2, data3] = await Promise.all([
      client.get('/endpoint1'),
      client.get('/endpoint2'),
      client.get('/endpoint3'),
    ]);

    res.status(200).json({
      success: true,
      data: {
        endpoint1: data1,
        endpoint2: data2,
        endpoint3: data3,
      },
    });
  } catch (error) {
    logger.error('Parallel requests failed:', error.message);
    next(new AppError('Failed to fetch data', 503));
  }
});

// ─── Example 5: Using Auth Header Directly ────────────────────────────────────
const exampleUsingAuthHeader = catchAsync(async (req, res, next) => {
  try {
    const authHeader = await auth0Service.getAuthHeader();

    // Use with any HTTP client or axios instance
    const response = await fetch('http://path_to_your_api/endpoint', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...authHeader, // Spread the auth header
      },
    });

    const data = await response.json();

    res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    logger.error('Fetch request failed:', error.message);
    next(new AppError('External API call failed', 503));
  }
});

// ─── Example 6: Service Integration (Reusable Pattern) ──────────────────────────
class ExternalApiService {
  constructor(baseUrl) {
    this.client = createAuthenticatedClient(baseUrl);
  }

  async getUsers() {
    try {
      return await this.client.get('/users');
    } catch (error) {
      logger.error('Failed to get users:', error.message);
      throw error;
    }
  }

  async createUser(userData) {
    try {
      return await this.client.post('/users', userData);
    } catch (error) {
      logger.error('Failed to create user:', error.message);
      throw error;
    }
  }

  async updateUser(userId, userData) {
    try {
      return await this.client.put(`/users/${userId}`, userData);
    } catch (error) {
      logger.error('Failed to update user:', error.message);
      throw error;
    }
  }

  async deleteUser(userId) {
    try {
      return await this.client.delete(`/users/${userId}`);
    } catch (error) {
      logger.error('Failed to delete user:', error.message);
      throw error;
    }
  }
}

// Usage in a controller
const externalApiService = new ExternalApiService('http://path_to_your_api/');

const exampleServiceUsage = catchAsync(async (req, res, next) => {
  try {
    // Use the service
    const users = await externalApiService.getUsers();

    res.status(200).json({
      success: true,
      data: users,
    });
  } catch (error) {
    logger.error('Service call failed:', error.message);
    next(new AppError('Failed to fetch data', 503));
  }
});

module.exports = {
  exampleGetToken,
  exampleMakeApiRequest,
  examplePostWithAuth,
  exampleParallelRequests,
  exampleUsingAuthHeader,
  ExternalApiService,
  exampleServiceUsage,
};
