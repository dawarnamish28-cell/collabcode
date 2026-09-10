/**
 * MongoDB Connection Configuration
 * 
 * Handles database connection with retry logic and graceful shutdown.
 * Uses Mongoose ODM for MongoDB interactions.
 */

const mongoose = require('mongoose');

const MONGO_OPTIONS = {
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

let isConnected = false;

/**
 * Connect to MongoDB with retry logic
 */
async function connectDB() {
  if (isConnected) {
    console.log('[DB] Already connected to MongoDB');
    return;
  }

  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collabcode';

  try {
    await mongoose.connect(uri, MONGO_OPTIONS);
    isConnected = true;
    console.log(`[DB] Connected to MongoDB: ${uri.replace(/\/\/.*@/, '//***@')}`);

    mongoose.connection.on('error', (err) => {
      console.error('[DB] MongoDB connection error:', err.message);
      isConnected = false;
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('[DB] MongoDB disconnected. Attempting reconnection...');
      isConnected = false;
    });

  } catch (err) {
    console.error('[DB] MongoDB connection failed:', err.message);
    console.warn('[DB] Running in memory-only mode (no persistence)');
    isConnected = false;
  }
}

/**
 * Graceful shutdown
 */
async function disconnectDB() {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    isConnected = false;
    console.log('[DB] MongoDB connection closed');
  }
}

function getConnectionStatus() {
  return isConnected && mongoose.connection.readyState === 1;
}

module.exports = { connectDB, disconnectDB, getConnectionStatus };
