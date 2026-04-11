const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  serviceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Service',
    required: true,
  },
  date: {
    type: String, // "2026-04-10" format
    required: true,
  },
  seq: {
    type: Number,
    default: 0,
  },
});

// Compound unique index — one counter per service per day
counterSchema.index({ serviceId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Counter', counterSchema);
