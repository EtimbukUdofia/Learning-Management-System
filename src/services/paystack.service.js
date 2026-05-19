const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Paystack Payment Service
 * Handles payment processing, verification, and refunds
 */

class PaystackService {
  constructor() {
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;
    this.baseUrl = 'https://api.paystack.co';

    if (!this.secretKey) {
      throw new Error('PAYSTACK_SECRET_KEY not configured in environment');
    }

    // Create axios instance with Paystack auth
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        const message = error.response?.data?.message || error.message;
        logger.error('❌ Paystack API error:', message);
        throw new Error(`Paystack Error: ${message}`);
      }
    );
  }

  /**
   * Initialize payment transaction
   * @param {Object} options - Transaction options
   * @returns {Promise<Object>} Transaction response with authorization URL
   */
  async initializeTransaction(options) {
    try {
      logger.info('💳 Initializing Paystack transaction...');

      const {
        email,
        amount, // in kobo (1 NGN = 100 kobo)
        reference,
        metadata = {},
        currency = 'NGN',
      } = options;

      if (!email || !amount || !reference) {
        throw new Error('Missing required fields: email, amount, reference');
      }

      const response = await this.client.post('/transaction/initialize', {
        email,
        amount: Math.round(amount * 100), // Convert to kobo
        reference,
        metadata,
        currency,
      });

      logger.info('✅ Transaction initialized successfully');
      logger.debug(`Authorization URL: ${response.data.authorization_url}`);

      return response.data;
    } catch (error) {
      logger.error('❌ Transaction initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify payment transaction
   * @param {string} reference - Transaction reference
   * @returns {Promise<Object>} Verification response with payment status
   */
  async verifyTransaction(reference) {
    try {
      logger.info(`🔍 Verifying transaction: ${reference}`);

      const response = await this.client.get(`/transaction/verify/${reference}`);

      if (response.data.status === 'success') {
        logger.info(`✅ Transaction verified successfully: ${reference}`);
      } else {
        logger.warn(`⚠️  Transaction status: ${response.data.status}`);
      }

      return response.data;
    } catch (error) {
      logger.error(`❌ Transaction verification failed: ${reference}`, error.message);
      throw error;
    }
  }

  /**
   * Create transfer recipient (for payouts)
   * @param {Object} options - Recipient options
   * @returns {Promise<Object>} Recipient response
   */
  async createTransferRecipient(options) {
    try {
      logger.info('👥 Creating transfer recipient...');

      const { type, name, account_number, bank_code, currency = 'NGN' } = options;

      if (!type || !name || !account_number || !bank_code) {
        throw new Error('Missing required fields for recipient creation');
      }

      const response = await this.client.post('/transferrecipient', {
        type,
        name,
        account_number,
        bank_code,
        currency,
      });

      logger.info('✅ Transfer recipient created successfully');
      return response.data;
    } catch (error) {
      logger.error('❌ Transfer recipient creation failed:', error.message);
      throw error;
    }
  }

  /**
   * Initiate transfer (payout to instructor)
   * @param {Object} options - Transfer options
   * @returns {Promise<Object>} Transfer response
   */
  async initializeTransfer(options) {
    try {
      logger.info('💸 Initiating transfer...');

      const { source = 'balance', recipient, amount, reason = 'Instructor Payout' } = options;

      if (!recipient || !amount) {
        throw new Error('Missing required fields: recipient, amount');
      }

      const response = await this.client.post('/transfer', {
        source,
        recipient,
        amount: Math.round(amount * 100), // Convert to kobo
        reason,
      });

      logger.info('✅ Transfer initiated successfully');
      return response.data;
    } catch (error) {
      logger.error('❌ Transfer initiation failed:', error.message);
      throw error;
    }
  }

  /**
   * Refund payment
   * @param {string} reference - Transaction reference
   * @param {Object} options - Refund options
   * @returns {Promise<Object>} Refund response
   */
  async refundPayment(reference, options = {}) {
    try {
      logger.info(`🔄 Processing refund for transaction: ${reference}`);

      // First verify the transaction
      const transaction = await this.verifyTransaction(reference);

      if (transaction.data.status !== 'success') {
        throw new Error('Can only refund successful transactions');
      }

      // Create refund request
      const response = await this.client.post('/refund', {
        transaction: transaction.data.id,
        amount: options.amount ? Math.round(options.amount * 100) : null,
        ...options,
      });

      logger.info(`✅ Refund processed successfully: ${reference}`);
      return response.data;
    } catch (error) {
      logger.error(`❌ Refund failed: ${reference}`, error.message);
      throw error;
    }
  }

  /**
   * Get list of banks for transfers
   * @returns {Promise<Array>} Bank list
   */
  async getBanks() {
    try {
      logger.info('🏦 Fetching bank list...');

      const response = await this.client.get('/bank?perPage=50');

      logger.info(`✅ Retrieved ${response.data.length} banks`);
      return response.data;
    } catch (error) {
      logger.error('❌ Failed to fetch banks:', error.message);
      throw error;
    }
  }

  /**
   * Resolve bank account
   * @param {string} account_number - Account number
   * @param {string} bank_code - Bank code
   * @returns {Promise<Object>} Account details
   */
  async resolveBankAccount(account_number, bank_code) {
    try {
      logger.info(`🔍 Resolving account: ${account_number}`);

      const response = await this.client.get('/bank/resolve', {
        params: { account_number, bank_code },
      });

      logger.info('✅ Account resolved successfully');
      return response.data;
    } catch (error) {
      logger.error('❌ Account resolution failed:', error.message);
      throw error;
    }
  }

  /**
   * Verify transaction details (webhook safe)
   * @param {Object} transaction - Transaction object from webhook
   * @returns {boolean} Is valid transaction
   */
  isValidTransaction(transaction) {
    return (
      transaction &&
      transaction.status === 'success' &&
      transaction.amount > 0 &&
      transaction.customer &&
      transaction.reference
    );
  }

  /**
   * Get transaction status
   * @param {string} reference - Transaction reference
   * @returns {Promise<string>} Status (success, pending, failed)
   */
  async getTransactionStatus(reference) {
    try {
      const transaction = await this.verifyTransaction(reference);
      return transaction.data.status;
    } catch (error) {
      logger.error(`❌ Failed to get transaction status: ${reference}`);
      throw error;
    }
  }

  /**
   * Create virtual account (for future feature)
   * @param {Object} options - Account options
   * @returns {Promise<Object>} Virtual account response
   */
  async createVirtualAccount(options) {
    try {
      logger.info('🏧 Creating virtual account...');

      const { first_name, last_name, email, phone, preferred_bank = '' } = options;

      if (!first_name || !last_name || !email) {
        throw new Error('Missing required fields for virtual account');
      }

      const response = await this.client.post('/dedicated_account', {
        first_name,
        last_name,
        email,
        phone,
        preferred_bank,
      });

      logger.info('✅ Virtual account created successfully');
      return response.data;
    } catch (error) {
      logger.error('❌ Virtual account creation failed:', error.message);
      throw error;
    }
  }
}

module.exports = new PaystackService();
