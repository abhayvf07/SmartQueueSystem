const express = require('express');
const {
  getAllTokens,
  callNext,
  updateTokenStatus,
  createEmergencyToken,
  getAnalytics,
} = require('../controllers/admin.controller');
const { protect, requireRole } = require('../middleware/auth');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(protect, requireRole('admin'));

router.get('/tokens', getAllTokens);
router.put('/call-next/:serviceId', callNext);
router.put('/update-status/:tokenId', updateTokenStatus);
router.post('/emergency-token', createEmergencyToken);
router.get('/analytics', getAnalytics);

module.exports = router;
