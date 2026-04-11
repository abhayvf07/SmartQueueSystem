const express = require('express');
const {
  getServices,
  createService,
  updateService,
  deleteService,
} = require('../controllers/service.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

// Public: Get all active services
router.get('/', getServices);

// Admin only: Create, update, delete services
router.post('/', protect, requireRole('admin'), createService);
router.put('/:id', protect, requireRole('admin'), updateService);
router.delete('/:id', protect, requireRole('admin'), deleteService);

module.exports = router;
