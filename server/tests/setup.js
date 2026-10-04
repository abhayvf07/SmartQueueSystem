/**
 * Test setup helper for integration tests.
 * Uses mongodb-memory-server for an isolated in-memory MongoDB instance.
 */
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Start in-memory MongoDB and connect mongoose.
 */
const setupDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
};

/**
 * Drop all collections (clean slate between tests).
 */
const clearDB = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
};

/**
 * Disconnect mongoose and stop the in-memory server.
 */
const teardownDB = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  if (mongoServer) {
    await mongoServer.stop();
  }
};

module.exports = { setupDB, clearDB, teardownDB };
