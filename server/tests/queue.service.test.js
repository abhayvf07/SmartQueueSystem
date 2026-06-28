/**
 * Unit tests for queue.service.js — pure logic functions.
 * Tests position calculation, wait time estimation, and priority ordering.
 */

// Mock mongoose before requiring anything
jest.mock('mongoose', () => {
  const actualMongoose = jest.requireActual('mongoose');
  return {
    ...actualMongoose,
    Types: actualMongoose.Types,
  };
});

// Mock the Token model
const mockTokenFind = jest.fn();
const mockTokenCountDocuments = jest.fn();
const mockTokenFindOne = jest.fn();
const mockTokenFindOneAndUpdate = jest.fn();
const mockTokenUpdateMany = jest.fn();
const mockTokenCreate = jest.fn();
const mockTokenAggregate = jest.fn();

jest.mock('../src/models/Token', () => {
  const mock = jest.fn();
  mock.find = (...args) => {
    const result = mockTokenFind(...args);
    // Chain .sort(), .select(), .populate(), .lean()
    const chain = {
      sort: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue(result || []),
      ...result,
    };
    return chain;
  };
  mock.countDocuments = mockTokenCountDocuments;
  mock.findOne = mockTokenFindOne;
  mock.findOneAndUpdate = mockTokenFindOneAndUpdate;
  mock.updateMany = mockTokenUpdateMany;
  mock.create = mockTokenCreate;
  mock.aggregate = mockTokenAggregate;
  return mock;
});

jest.mock('../src/models/Service', () => {
  const mock = jest.fn();
  mock.findById = jest.fn();
  return mock;
});

jest.mock('../src/utils/tokenGenerator', () => ({
  generateTokenNumber: jest.fn().mockResolvedValue('GEN-001'),
}));

jest.mock('../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
}));

describe('queue.service', () => {
  let queueService;

  beforeEach(() => {
    jest.clearAllMocks();
    queueService = require('../src/services/queue.service');
  });

  describe('getTokenPosition', () => {
    it('should return 0 for non-waiting tokens', async () => {
      const token = { status: 'serving', serviceId: 'svc1', priority: 'normal', createdAt: new Date() };
      const position = await queueService.getTokenPosition(token);
      expect(position).toBe(0);
    });

    it('should return 1 for the first normal token with no one ahead', async () => {
      mockTokenCountDocuments.mockResolvedValue(0);
      const token = { status: 'waiting', serviceId: 'svc1', priority: 'normal', createdAt: new Date() };
      const position = await queueService.getTokenPosition(token);
      expect(position).toBe(1);
    });

    it('should return correct position when there are tokens ahead', async () => {
      mockTokenCountDocuments.mockResolvedValue(3);
      const token = { status: 'waiting', serviceId: 'svc1', priority: 'normal', createdAt: new Date() };
      const position = await queueService.getTokenPosition(token);
      expect(position).toBe(4); // 3 ahead + 1
    });

    it('should count only emergency tokens ahead for an emergency token', async () => {
      mockTokenCountDocuments.mockResolvedValue(1);
      const token = { status: 'waiting', serviceId: 'svc1', priority: 'emergency', createdAt: new Date() };
      const position = await queueService.getTokenPosition(token);
      expect(position).toBe(2); // 1 emergency ahead + 1

      // Verify the query only looks for emergency tokens
      const queryArg = mockTokenCountDocuments.mock.calls[0][0];
      expect(queryArg.priority).toBe('emergency');
    });
  });

  describe('getEstimatedWaitTime', () => {
    it('should return 0 for non-waiting tokens', async () => {
      const token = { status: 'serving', serviceId: 'svc1' };
      const result = await queueService.getEstimatedWaitTime(token);
      expect(result.estimatedMinutes).toBe(0);
      expect(result.estimatedCalledAt).toBeNull();
    });

    it('should return 0 wait time for position 1 (next in line)', async () => {
      // Mock getTokenPosition to return 1
      mockTokenCountDocuments.mockResolvedValue(0); // position = 1

      // Mock getQueueStats
      mockTokenAggregate.mockResolvedValue([{ avgWait: 300000 }]); // 5 min avg
      mockTokenCountDocuments
        .mockResolvedValueOnce(0) // for getTokenPosition
        .mockResolvedValueOnce(5) // waiting count (getQueueStats)
        .mockResolvedValueOnce(10); // completedToday

      mockTokenFindOne.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue(null),
        }),
      });

      const token = { status: 'waiting', serviceId: 'svc1', priority: 'normal', createdAt: new Date() };
      const service = { capacityPerHour: 12 };
      const stats = { avgWaitMinutes: 5 };

      const result = await queueService.getEstimatedWaitTime(token, service, stats);
      // position 1 => (1-1) * 5 = 0 minutes
      expect(result.estimatedMinutes).toBe(0);
    });
  });

  describe('redactName (via getQueueForServicePublic)', () => {
    // Test the redaction logic through the exported public function
    // We need to test that the queue service properly redacts names

    it('should export getQueueForServicePublic', () => {
      expect(queueService.getQueueForServicePublic).toBeDefined();
      expect(typeof queueService.getQueueForServicePublic).toBe('function');
    });
  });
});
