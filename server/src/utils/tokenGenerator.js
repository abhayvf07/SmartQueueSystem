const Counter = require('../models/Counter');

/**
 * Generate an atomic, unique token number for a given service.
 * Uses findOneAndUpdate with $inc to prevent race conditions.
 * Format: PREFIX-NNN (e.g., A-001, B-042)
 */
const generateTokenNumber = async (serviceId, prefix = 'T') => {
  const today = new Date().toISOString().split('T')[0]; // "2026-04-10"

  const counter = await Counter.findOneAndUpdate(
    { serviceId, date: today },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const paddedSeq = String(counter.seq).padStart(3, '0');
  return `${prefix}-${paddedSeq}`;
};

module.exports = { generateTokenNumber };
