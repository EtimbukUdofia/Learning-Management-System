const mongoose = require('mongoose');
const logger = require('../src/utils/logger');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  
  if (!mongoUri) {
    logger.error('❌ MongoDB URI not configured. Set MONGO_URI or MONGODB_URI in .env file');
    process.exit(1);
  }

  try {
    logger.info('🔗 Attempting MongoDB connection...');
    logger.info(`📍 Connection string configured (credentials hidden for security)`);
    
    // Mongoose client options with Stable API version
    const clientOptions = { 
      serverApi: { 
        version: '1', 
        strict: true, 
        deprecationErrors: true 
      },
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 45000,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    };
    
    const conn = await mongoose.connect(mongoUri, clientOptions);
    
    // Ping deployment to verify connection
    await mongoose.connection.db.admin().command({ ping: 1 });

    logger.info('✅ MongoDB connected successfully');
    logger.info('✅ Pinged your deployment. You successfully connected to MongoDB!');
    logger.info(`📊 Database: ${conn.connection.db.databaseName}`);
    logger.info(`🔗 Host: ${conn.connection.host}`);

    // Connection event listeners
    mongoose.connection.on('disconnected', () => {
      logger.warn('⚠️  MongoDB disconnected');
    });

    mongoose.connection.on('error', (err) => {
      logger.error('❌ MongoDB connection error:', err.message);
    });

    return conn;
  } catch (err) {
    logger.error('❌ MongoDB connection failed:', err.message);
    logger.error('📝 Full error:', {
      name: err.name,
      message: err.message,
      code: err.code,
    });
    process.exit(1);
  }
};

module.exports = connectDB;