const auth0Service = require('../services/auth0.service');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

/**
 * Auth0 M2M Token Verification Middleware
 * Ensures Auth0 token is available for service-to-service authentication
 * Add this middleware to routes that need to make authenticated external API calls
 */

const auth0TokenMiddleware = async (req, res, next) => {
  try {
    // Verify Auth0 token is available
    const isValid = await auth0Service.verifyToken();

    if (!isValid) {
      logger.warn('⚠️  Auth0 token verification failed');
      return next(
        new AppError('Service authentication failed. Auth0 token unavailable', 503)
      );
    }

    // Attach token info to request for logging/debugging
    req.auth0Token = {
      verified: true,
      timestamp: new Date().toISOString(),
    };

    logger.debug('✅ Auth0 token middleware passed');
    next();
  } catch (error) {
    logger.error('❌ Auth0 token middleware error:', error.message);
    next(new AppError('Service authentication error', 503));
  }
};

/**
 * Auth0 Token Refresh Middleware
 * Forces token refresh on each request (useful for long-running processes)
 * Use sparingly as it adds overhead
 */

const auth0TokenRefreshMiddleware = async (req, res, next) => {
  try {
    // Clear cached token and fetch fresh one
    auth0Service.clearToken();
    await auth0Service.getToken();

    req.auth0Token = {
      refreshed: true,
      timestamp: new Date().toISOString(),
    };

    logger.debug('✅ Auth0 token refreshed');
    next();
  } catch (error) {
    logger.error('❌ Auth0 token refresh middleware error:', error.message);
    next(new AppError('Service authentication error', 503));
  }
};

/**
 * Optional: Get Auth0 token status endpoint
 * Useful for debugging and health checks
 */

const getAuth0Status = async (req, res, next) => {
  try {
    const token = await auth0Service.getToken();
    const isValid = token ? true : false;

    res.status(200).json({
      success: true,
      auth0: {
        domain: process.env.AUTH0_DOMAIN,
        clientId: process.env.AUTH0_CLIENT_ID,
        audience: process.env.AUTH0_AUDIENCE,
        tokenActive: isValid,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('❌ Auth0 status check failed:', error.message);
    res.status(503).json({
      success: false,
      error: 'Auth0 service unavailable',
      message: error.message,
    });
  }
};

module.exports = {
  auth0TokenMiddleware,
  auth0TokenRefreshMiddleware,
  getAuth0Status,
};
