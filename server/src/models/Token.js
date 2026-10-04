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
      type: Number,
      enum: [0, 1], // 0 = normal, 1 = emergency
      default: 0,
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

// Virtual getter for human-readable priority label
tokenSchema.virtual('priorityLabel').get(function () {
  return this.priority === 1 ? 'emergency' : 'normal';
});

// Include virtuals in JSON and Object output
tokenSchema.set('toJSON', { virtuals: true });
tokenSchema.set('toObject', { virtuals: true });

// Compound indexes for fast queue queries
tokenSchema.index({ serviceId: 1, status: 1, priority: -1, createdAt: 1 });
tokenSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('Token', tokenSchema);
