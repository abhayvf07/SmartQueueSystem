const Token = require('../models/Token');
const Service = require('../models/Service');
const { generateTokenNumber } = require('../utils/tokenGenerator');
const { cacheGet, cacheSet, cacheDel } = require('../config/redis');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/**
 * Get queue for a service — with Redis caching (TTL 10s)
 */
const getQueueForService = async (serviceId) => {
  const cacheKey = `queue:${serviceId}`;

  // Try cache first
  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  // Fetch from DB — emergency first, then by creation time
  const queue = await Token.find({
    serviceId,
    status: { $in: ['waiting', 'serving'] },
  })
    .sort({ status: 1, priority: -1, createdAt: 1 }) // serving first, then emergency, then FIFO
    .populate('userId', 'name email')
    .populate('serviceId', 'name prefix')
    .lean();

  // Cache for 10 seconds
  await cacheSet(cacheKey, queue, 10);

  return queue;
};

/**
 * Get queue stats for a service — with Redis caching (TTL 5s)
 */
const getQueueStats = async (serviceId) => {
  const cacheKey = `stats:${serviceId}`;

  const cached = await cacheGet(cacheKey);
  if (cached) return cached;

  const [waitingCount, servingToken, completedToday] = await Promise.all([
    Token.countDocuments({ serviceId, status: 'waiting' }),
    Token.findOne({ serviceId, status: 'serving' }).populate('userId', 'name').lean(),
    Token.countDocuments({
      serviceId,
      status: 'completed',
      completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
    }),
  ]);

  // Calculate average wait time (completed tokens today)
  const avgWaitResult = await Token.aggregate([
    {
      $match: {
        serviceId: require('mongoose').Types.ObjectId.createFromHexString(serviceId.toString()),
        status: 'completed',
        calledAt: { $ne: null },
        completedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      },
    },
    {
      $group: {
        _id: null,
        avgWait: { $avg: { $subtract: ['$calledAt', '$createdAt'] } },
      },
    },
  ]);

  const stats = {
    waiting: waitingCount,
    currentToken: servingToken,
    completedToday,
    avgWaitMinutes: avgWaitResult[0]
      ? Math.round(avgWaitResult[0].avgWait / 60000)
      : 0,
  };

  await cacheSet(cacheKey, stats, 5);
  return stats;
};

/**
 * Compute dynamic position for a token in its service queue.
 * Position = count of waiting tokens ahead (emergency tokens first).
 */
const getTokenPosition = async (token) => {
  if (token.status !== 'waiting') return 0;

  // Count tokens ahead: emergency first, then by createdAt
  const aheadCount = await Token.countDocuments({
    serviceId: token.serviceId,
    status: 'waiting',
    $or: [
      { priority: 'emergency', createdAt: { $lt: token.createdAt } },
      {
        priority: 'emergency',
        ...(token.priority !== 'emergency' ? {} : { createdAt: { $lt: token.createdAt } }),
      },
      ...(token.priority !== 'emergency'
        ? [
            { priority: 'emergency' }, // All emergency tokens are ahead of normal
            {
              priority: 'normal',
              createdAt: { $lt: token.createdAt },
            },
          ]
        : []),
    ],
  });

  return aheadCount + 1; // 1-based position
};

/**
 * Book a new token — with duplicate prevention and atomic counter
 */
const bookToken = async (userId, serviceId, priority = 'normal') => {
  // Check service exists and is active
  const service = await Service.findById(serviceId);
  if (!service || !service.active) {
    throw new ApiError(400, 'Service not available.');
  }

  // Prevent duplicate booking
  const existingToken = await Token.findOne({
    userId,
    serviceId,
    status: { $in: ['waiting', 'serving'] },
  });
  if (existingToken) {
    throw new ApiError(400, 'You already have an active token for this service.');
  }

  // Generate atomic token number
  const tokenNumber = await generateTokenNumber(serviceId, service.prefix);

  // Set expiry (30 minutes from now)
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  const token = await Token.create({
    userId,
    serviceId,
    tokenNumber,
    priority,
    expiresAt,
  });

  // Invalidate cache
  await cacheDel(`queue:${serviceId}`);
  await cacheDel(`stats:${serviceId}`);

  logger.info(`Token booked: ${tokenNumber} by user ${userId} for service ${service.name}`);

  return token;
};

/**
 * Call next token — finds the next waiting token (emergency first)
 */
const callNextToken = async (serviceId) => {
  // Complete current serving token first
  await Token.updateMany(
    { serviceId, status: 'serving' },
    { status: 'completed', completedAt: new Date() }
  );

  // Find next: emergency first, then FIFO
  const nextToken = await Token.findOneAndUpdate(
    { serviceId, status: 'waiting' },
    { status: 'serving', calledAt: new Date() },
    {
      new: true,
      sort: { priority: -1, createdAt: 1 }, // -1 means 'emergency' > 'normal'
    }
  )
    .populate('userId', 'name email')
    .populate('serviceId', 'name prefix');

  if (!nextToken) {
    throw new ApiError(404, 'No waiting tokens in queue.');
  }

  // Invalidate cache
  await cacheDel(`queue:${serviceId}`);
  await cacheDel(`stats:${serviceId}`);

  logger.info(`Token called: ${nextToken.tokenNumber} for service ${serviceId}`);

  return nextToken;
};

/**
 * Skip a token
 */
const skipToken = async (tokenId) => {
  const token = await Token.findByIdAndUpdate(
    tokenId,
    { status: 'skipped' },
    { new: true }
  );

  if (!token) throw new ApiError(404, 'Token not found.');

  await cacheDel(`queue:${token.serviceId}`);
  await cacheDel(`stats:${token.serviceId}`);

  logger.info(`Token skipped: ${token.tokenNumber}`);
  return token;
};

/**
 * Cancel a token (by user)
 */
const cancelToken = async (tokenId, userId) => {
  const token = await Token.findOne({
    _id: tokenId,
    userId,
    status: { $in: ['waiting'] },
  });

  if (!token) {
    throw new ApiError(404, 'Token not found or cannot be cancelled.');
  }

  token.status = 'cancelled';
  await token.save();

  await cacheDel(`queue:${token.serviceId}`);
  await cacheDel(`stats:${token.serviceId}`);

  logger.info(`Token cancelled: ${token.tokenNumber} by user ${userId}`);
  return token;
};

/**
 * Get analytics — avg wait time, throughput, peak hours
 */
const getAnalytics = async (serviceId) => {
  const today = new Date(new Date().setHours(0, 0, 0, 0));
  const matchStage = {
    status: 'completed',
    completedAt: { $gte: today },
  };
  if (serviceId) {
    matchStage.serviceId = require('mongoose').Types.ObjectId.createFromHexString(serviceId.toString());
  }

  const [metrics, peakHours] = await Promise.all([
    Token.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: null,
          totalCompleted: { $sum: 1 },
          avgWaitMs: { $avg: { $subtract: ['$calledAt', '$createdAt'] } },
        },
      },
    ]),
    Token.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $hour: '$createdAt' },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
  ]);

  return {
    totalCompleted: metrics[0]?.totalCompleted || 0,
    avgWaitMinutes: metrics[0] ? Math.round(metrics[0].avgWaitMs / 60000) : 0,
    peakHours: peakHours.map((h) => ({
      hour: h._id,
      count: h.count,
    })),
  };
};

module.exports = {
  getQueueForService,
  getQueueStats,
  getTokenPosition,
  bookToken,
  callNextToken,
  skipToken,
  cancelToken,
  getAnalytics,
};
