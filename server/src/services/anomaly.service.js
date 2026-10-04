const Token = require('../models/Token');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * AI Feature 2: Z-score based anomaly detection for queue congestion.
 * Replaces hardcoded threshold = capacityPerHour / 2 with adaptive statistical detection.
 *
 * Computes rolling mean and standard deviation of wait times over the last 7 days per service.
 * EXCLUDES today's data from the baseline so current conditions don't pollute the reference.
 * Uses σ/√n (standard error of the mean) for comparing today's average wait.
 */

// Helper: get IST "start of today" as a Date object
const getISTStartOfDay = () => {
  const now = new Date();
  const istDateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [y, m, d] = istDateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0) - (5.5 * 60 * 60 * 1000));
};

/**
 * Detect anomalous congestion for a service.
 * @param {string} serviceId
 * @returns {{ isAnomaly: boolean, currentWaitMinutes: number, rollingMean: number, stdDev: number, zScore: number, threshold: number }}
 */
const detectAnomaly = async (serviceId) => {
  try {
    const sId = new mongoose.Types.ObjectId(serviceId);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const todayIST = getISTStartOfDay();

    // Get historical wait times EXCLUDING today (baseline should not include current day)
    const historicalWaits = await Token.aggregate([
      {
        $match: {
          serviceId: sId,
          status: 'completed',
          calledAt: { $ne: null },
          completedAt: { $gte: sevenDaysAgo, $lt: todayIST },
        },
      },
      {
        $project: {
          waitTimeMs: { $subtract: ['$calledAt', '$createdAt'] },
        },
      },
    ]);

    // Get current average wait time (today's completed tokens) with count
    const currentWaitResult = await Token.aggregate([
      {
        $match: {
          serviceId: sId,
          status: 'completed',
          calledAt: { $ne: null },
          completedAt: { $gte: todayIST },
        },
      },
      {
        $group: {
          _id: null,
          avgWait: { $avg: { $subtract: ['$calledAt', '$createdAt'] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Also consider currently waiting tokens' expected wait
    const waitingCount = await Token.countDocuments({ serviceId: sId, status: 'waiting' });

    // Not enough historical data for statistical analysis
    if (historicalWaits.length < 10) {
      return {
        isAnomaly: false,
        currentWaitMinutes: 0,
        rollingMean: 0,
        stdDev: 0,
        zScore: 0,
        threshold: 0,
        waitingCount,
        dataPoints: historicalWaits.length,
        method: 'insufficient_data',
      };
    }

    // Compute rolling mean and standard deviation from historical data (excluding today)
    const waitMinutes = historicalWaits.map(t => t.waitTimeMs / 60000).filter(w => w >= 0 && w < 480);
    const n = waitMinutes.length;
    const mean = waitMinutes.reduce((s, v) => s + v, 0) / n;
    const variance = waitMinutes.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdDev = Math.sqrt(variance);

    // Current average wait in minutes
    const currentWaitMinutes = currentWaitResult[0]
      ? currentWaitResult[0].avgWait / 60000
      : 0;
    const todaySampleCount = currentWaitResult[0]?.count || 0;

    // Use σ/√n (standard error of the mean) for more accurate comparison
    // This accounts for the fact that today's mean is based on n samples
    const standardError = todaySampleCount > 1 ? stdDev / Math.sqrt(todaySampleCount) : stdDev;
    const zScore = standardError > 0 ? (currentWaitMinutes - mean) / standardError : 0;

    // Anomaly if Z-score > 2 (current wait is 2+ standard errors above the rolling average)
    const isAnomaly = zScore > 2;

    return {
      isAnomaly,
      currentWaitMinutes: Math.round(currentWaitMinutes * 10) / 10,
      rollingMean: Math.round(mean * 10) / 10,
      stdDev: Math.round(stdDev * 10) / 10,
      zScore: Math.round(zScore * 100) / 100,
      threshold: Math.round((mean + 2 * standardError) * 10) / 10,
      waitingCount,
      dataPoints: n,
      todaySamples: todaySampleCount,
      method: 'z_score_sem',
    };
  } catch (error) {
    logger.error(`Anomaly detection error for service ${serviceId}: ${error.message}`);
    return {
      isAnomaly: false,
      currentWaitMinutes: 0,
      rollingMean: 0,
      stdDev: 0,
      zScore: 0,
      threshold: 0,
      waitingCount: 0,
      dataPoints: 0,
      method: 'error',
    };
  }
};

/**
 * Get anomaly status for all active services.
 */
const getAnomalyStatusAll = async () => {
  const Service = require('../models/Service');
  const services = await Service.find({ active: true }).lean();

  const results = await Promise.all(
    services.map(async (s) => ({
      serviceId: s._id,
      serviceName: s.name,
      prefix: s.prefix,
      ...await detectAnomaly(s._id.toString()),
    }))
  );

  return results;
};

module.exports = { detectAnomaly, getAnomalyStatusAll };
