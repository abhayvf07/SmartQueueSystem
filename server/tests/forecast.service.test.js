/**
 * Unit tests for forecast.service.js
 * Tests EWMA calculation and fallback behavior.
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

describe('forecast.service', () => {
  let forecastService;

  beforeEach(() => {
    jest.clearAllMocks();
    forecastService = require('../src/services/forecast.service');
  });

  describe('getForecast', () => {
    it('should return fallback flat forecast when no historical data exists', async () => {
      mockTokenAggregate.mockResolvedValueOnce([]); // No data
      
      const result = await forecastService.getForecast('507f1f77bcf86cd799439011', new Date());
      
      expect(result.forecast.length).toBe(24);
      expect(result.forecast[0].predictedTokens).toBe(0); // Default fallback
    });

    it('should generate forecast based on historical data using EWMA-like logic', async () => {
      // Mock some historical data for different hours across 2 matching days
      mockTokenAggregate.mockResolvedValueOnce([
        { _id: '2023-01-01', hours: [{ hour: 9, count: 10 }, { hour: 10, count: 5 }] },
        { _id: '2023-01-08', hours: [{ hour: 9, count: 15 }, { hour: 10, count: 2 }] }
      ]);
      
      const result = await forecastService.getForecast('507f1f77bcf86cd799439011', new Date());
      
      expect(result.forecast.length).toBe(24);
      
      // Verify hours that had data
      const hour9 = result.forecast.find(r => r.hour === 9);
      expect(hour9.predictedTokens).toBeGreaterThan(0);
      expect(result.confidence).toBeDefined();
    });
  });
});
