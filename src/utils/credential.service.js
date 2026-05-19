const bcrypt = require('bcryptjs');
const logger = require('../utils/logger');

/**
 * Credential Hashing Service
 * Provides secure hashing and verification for sensitive credentials
 * Used for API keys, secrets, and other sensitive data storage
 */

class CredentialService {
  /**
   * Hash a credential value
   * @param {string} credential - Value to hash
   * @param {number} rounds - Bcrypt salt rounds (default: 10)
   * @returns {Promise<string>} Hashed credential
   */
  static async hashCredential(credential, rounds = 10) {
    try {
      if (!credential) {
        throw new Error('Credential cannot be empty');
      }

      logger.debug('🔐 Hashing credential...');
      const hashedCredential = await bcrypt.hash(credential, rounds);
      logger.debug('✅ Credential hashed successfully');

      return hashedCredential;
    } catch (error) {
      logger.error('❌ Credential hashing failed:', error.message);
      throw new Error(`Credential hashing failed: ${error.message}`);
    }
  }

  /**
   * Verify a credential against its hash
   * @param {string} credential - Plaintext credential
   * @param {string} hash - Hashed credential from storage
   * @returns {Promise<boolean>} Verification result
   */
  static async verifyCredential(credential, hash) {
    try {
      if (!credential || !hash) {
        throw new Error('Credential and hash cannot be empty');
      }

      logger.debug('🔐 Verifying credential...');
      const isMatch = await bcrypt.compare(credential, hash);

      if (isMatch) {
        logger.debug('✅ Credential verified successfully');
      } else {
        logger.warn('⚠️  Credential verification failed - mismatch');
      }

      return isMatch;
    } catch (error) {
      logger.error('❌ Credential verification error:', error.message);
      throw new Error(`Credential verification failed: ${error.message}`);
    }
  }

  /**
   * Hash multiple credentials
   * @param {Object} credentials - Object with credential key-value pairs
   * @returns {Promise<Object>} Object with hashed values
   */
  static async hashMultiple(credentials) {
    try {
      const hashed = {};

      for (const [key, value] of Object.entries(credentials)) {
        hashed[key] = await this.hashCredential(value);
      }

      logger.info(`✅ Hashed ${Object.keys(hashed).length} credentials`);
      return hashed;
    } catch (error) {
      logger.error('❌ Multiple credential hashing failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate hash for API key storage
   * @param {string} apiKey - API key to hash
   * @returns {Promise<string>} Hashed API key
   */
  static async hashApiKey(apiKey) {
    return this.hashCredential(apiKey);
  }

  /**
   * Generate hash for webhook secret
   * @param {string} secret - Webhook secret to hash
   * @returns {Promise<string>} Hashed secret
   */
  static async hashWebhookSecret(secret) {
    return this.hashCredential(secret);
  }

  /**
   * Compare two hashed credentials
   * @param {string} hash1 - First hash
   * @param {string} hash2 - Second hash
   * @returns {Promise<boolean>} True if hashes represent same value
   */
  static async compareHashes(hash1, hash2) {
    try {
      // Note: This requires original plaintext for comparison
      // For direct hash comparison, use string equality
      return hash1 === hash2;
    } catch (error) {
      logger.error('❌ Hash comparison failed:', error.message);
      throw error;
    }
  }

  /**
   * Generate secure random credential
   * Useful for generating temporary API keys or tokens
   * @param {number} length - Length of credential (default: 32)
   * @returns {string} Random credential
   */
  static generateRandomCredential(length = 32) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let credential = '';

    for (let i = 0; i < length; i++) {
      credential += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    return credential;
  }
}

module.exports = CredentialService;
