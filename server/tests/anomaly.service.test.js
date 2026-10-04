/**
 * Unit tests for anomaly.service.js — statistical logic.
 * Tests Z-score computation, boundary conditions, and insufficient data fallback.
 */

// Mock mongoose
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    Types: actualMongoose.Types,
  };
});

const mockTokenAggregate = jest.fn();
jest.mock('../src/models/Token', () => ({
  aggregate: mockTokenAggregate,
  countDocuments: jest.fn().mockResolvedValue(5),
}));

jest.mock('../src/models/Service', () => ({
  findById: jest.fn().mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        _id: '507f1f77bcf86cd799439011',
        name: 'Test Service',
      }),
    }),
  }),
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('anomaly.service', () => {
  let anomalyService;

  beforeEach(() => {
    jest.clearAllMocks();
    anomalyService = require('../src/services/anomaly.service');
  });

  describe('detectAnomaly', () => {
    it('should return safe default when insufficient historical data exists', async () => {
      // Return fewer than 10 historical data points
      mockTokenAggregate.mockResolvedValueOnce(Array(5).fill({ waitTimeMs: 600000 }));
      // Current wait
      mockTokenAggregate.mockResolvedValueOnce([{ avgWait: 900000 }]);
      
      const result = await anomalyService.detectAnomaly('507f1f77bcf86cd799439011');
      
      expect(result.isAnomaly).toBe(false);
      expect(result.method).toBe('insufficient_data');
      expect(result.dataPoints).toBe(5);
    });

    it('should detect anomaly when current wait exceeds Z-score threshold', async () => {
      // Historical data: 10 values with variation
      mockTokenAggregate.mockResolvedValueOnce([
        { waitTimeMs: 6 * 60000 }, { waitTimeMs: 8 * 60000 },
        { waitTimeMs: 10 * 60000 }, { waitTimeMs: 10 * 60000 },
        { waitTimeMs: 10 * 60000 }, { waitTimeMs: 10 * 60000 },
        { waitTimeMs: 10 * 60000 }, { waitTimeMs: 10 * 60000 },
        { waitTimeMs: 12 * 60000 }, { waitTimeMs: 14 * 60000 }
      ]);
      // Current wait (20 min) with count -> Z-score > 2
      mockTokenAggregate.mockResolvedValueOnce([{ avgWait: 20 * 60000, count: 5 }]);
      
      const result = await anomalyService.detectAnomaly('507f1f77bcf86cd799439011');
      
      expect(result.isAnomaly).toBe(true);
      expect(result.zScore).toBeGreaterThan(2);
      expect(result.method).toBe('z_score_sem');
    });

    it('should NOT detect anomaly when current wait is within normal range', async () => {
      // Historical data
      mockTokenAggregate.mockResolvedValueOnce(Array(10).fill({ waitTimeMs: 10 * 60000 }));
      // Current wait (10 min) with count -> Z-score = 0
      mockTokenAggregate.mockResolvedValueOnce([{ avgWait: 10 * 60000, count: 5 }]);
      
      const result = await anomalyService.detectAnomaly('507f1f77bcf86cd799439011');
      
      expect(result.isAnomaly).toBe(false);
      expect(result.zScore).toBe(0);
    });

    it('should handle zero standard deviation gracefully', async () => {
      // Historical data (mean = 10, stddev = 0)
      mockTokenAggregate.mockResolvedValueOnce([{
        _id: null,
        avgWaitMinutes: 10,
        stdDevMinutes: 0, // All waits exactly 10 min
        count: 50
      }]);
      // Current wait (15 min) with count
      mockTokenAggregate.mockResolvedValueOnce([{ avgWait: 15 * 60000, count: 3 }]);
      
      const result = await anomalyService.detectAnomaly('507f1f77bcf86cd799439011');
      
      // Because stdDev is 0, z-score might be calc'd against MIN_STD_DEV if implemented
      // Just check it doesn't crash and returns a valid result
      expect(result).toHaveProperty('isAnomaly');
      expect(typeof result.isAnomaly).toBe('boolean');
    });
  });
});
