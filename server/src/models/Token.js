const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    serviceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Service',
      required: true,
    },
    tokenNumber: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ['waiting', 'serving', 'completed', 'skipped', 'cancelled'],
      default: 'waiting',
    },
    priority: {
      type: String,
      enum: ['normal', 'emergency'],
      default: 'normal',
    },
    // NO position field — computed dynamically
    calledAt: {
      type: Date,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true, // adds createdAt and updatedAt
  }
);

// Compound indexes for fast queue queries
tokenSchema.index({ serviceId: 1, status: 1, priority: -1, createdAt: 1 });
tokenSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Token', tokenSchema);
