const Counter = require('../models/Counter');

/**
 * Generate an atomic, unique token number for a given service.
 * Uses findOneAndUpdate with $inc to prevent race conditions.
 * Format: PREFIX-NNN (e.g., A-001, B-042)
 * Uses IST date for counter so the token numbering resets at IST midnight.
 */
const generateTokenNumber = async (serviceId, prefix = 'T') => {
  // Use IST date string for counter (not UTC)
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // "2026-04-10"

  const counter = await Counter.findOneAndUpdate(
    { serviceId, date: today },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );

  const paddedSeq = String(counter.seq).padStart(3, '0');
  return `${prefix}-${paddedSeq}`;
};

module.exports = { generateTokenNumber };
