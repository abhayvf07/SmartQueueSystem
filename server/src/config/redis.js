const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;
let isRedisAvailable = false;

const connectRedis = () => {
  try {
    redis = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) {
          logger.warn('Redis: Max retries reached. Running without cache.');
          return null; // Stop retrying
        }
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    redis.on('connect', () => {
      isRedisAvailable = true;
      logger.info('Redis connected');
    });

    redis.on('error', (err) => {
      isRedisAvailable = false;
      logger.warn(`Redis error: ${err.message}. Falling back to DB.`);
    });

    redis.on('close', () => {
      isRedisAvailable = false;
    });

    redis.connect().catch(() => {
      logger.warn('Redis: Could not connect. Running without cache.');
    });
  } catch (err) {
    logger.warn(`Redis init failed: ${err.message}. Running without cache.`);
  }
};

// Graceful cache helpers
const cacheGet = async (key) => {
  if (!isRedisAvailable || !redis) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch {
    return null;
  }
};

const cacheSet = async (key, value, ttlSeconds = 10) => {
  if (!isRedisAvailable || !redis) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Silently fail — cache is optional
  }
};

const cacheDel = async (key) => {
  if (!isRedisAvailable || !redis) return;
  try {
    await redis.del(key);
  } catch {
    // Silently fail
  }
};

module.exports = { connectRedis, redis, cacheGet, cacheSet, cacheDel };
