const { detectAnomaly } = require('./anomaly.service');
const Service = require('../models/Service');
const logger = require('../utils/logger');

/**
 * In-memory anomaly cache — stores the latest anomaly detection result per service.
 * Populated by a scheduled interval (every 2 minutes) instead of running
 * expensive aggregation queries inline on every booking/call-next/emergency request.
 */
const anomalyCache = new Map();

/**
 * Get cached anomaly result for a service.
 * Returns a safe default if the cache has not been populated yet.
 */
const getCachedAnomaly = (serviceId) => {
  const key = serviceId.toString();
  return anomalyCache.get(key) || {
    isAnomaly: false,
    currentWaitMinutes: 0,
    rollingMean: 0,
    stdDev: 0,
    zScore: 0,
    threshold: 0,
    waitingCount: 0,
    dataPoints: 0,
    method: 'cache_miss',
  };
};

/**
 * Refresh anomaly detection for all active services and update the cache.
 * Called on a scheduled interval from index.js.
 */
const refreshAnomalyCache = async () => {
  try {
    const services = await Service.find({ active: true }).select('_id').lean();

    await Promise.all(
      services.map(async (s) => {
        try {
          const result = await detectAnomaly(s._id.toString());
          anomalyCache.set(s._id.toString(), result);
        } catch (err) {
          logger.error(`Anomaly cache refresh failed for service ${s._id}: ${err.message}`);
        }
      })
    );

    logger.debug(`Anomaly cache refreshed for ${services.length} service(s)`);
  } catch (error) {
    logger.error(`Anomaly cache refresh error: ${error.message}`);
  }
};

module.exports = { getCachedAnomaly, refreshAnomalyCache };
