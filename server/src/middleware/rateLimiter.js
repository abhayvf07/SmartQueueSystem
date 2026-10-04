const rateLimit = require('express-rate-limit');

/**
 * Key generator: use authenticated userId when available, fall back to IP.
 * This ensures per-user rate limiting instead of per-IP (which breaks behind proxies/NAT).
 */
const keyGenerator = (req) => {
  return req.user?._id?.toString() || req.ip;
};

// General API rate limiter (per-user when authenticated)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 600,
  keyGenerator,
  message: {
    success: false,
    message: 'Too many requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for auth routes (prevent brute force — uses IP since user isn't authenticated yet)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: {
    success: false,
    message: 'Too many login attempts. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limiter for chatbot (paid API protection — per-user)
const chatbotLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator,
  message: {
    success: false,
    message: 'Too many chatbot requests. Please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { apiLimiter, authLimiter, chatbotLimiter };
