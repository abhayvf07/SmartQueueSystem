/**
 * Integration tests for the Smart Queue Management System.
 * Uses supertest + mongodb-memory-server for real HTTP + DB testing.
 *
 * Tests: Auth flow, token booking, queue operations, admin actions.
 */
const request = require('supertest');
const { setupDB, clearDB, teardownDB } = require('./setup');
const createApp = require('./testApp');

let app;

// ── Setup & Teardown ──
beforeAll(async () => {
  await setupDB();
  app = createApp();
});

afterEach(async () => {
  await clearDB();
});

afterAll(async () => {
  await teardownDB();
});

// ── Helpers ──
const registerUser = async (data = {}) => {
  const defaults = { name: 'Test User', email: 'test@example.com', password: 'password123' };
  const res = await request(app).post('/api/auth/register').send({ ...defaults, ...data });
  return res;
};

const registerAdmin = async () => {
  // Create user first, then manually set role to admin
  const User = require('../src/models/User');
  const user = await User.create({
    name: 'Admin',
    email: 'admin@test.com',
    password: 'admin123',
    role: 'admin',
  });
  // Login to get JWT
  const res = await request(app).post('/api/auth/login').send({ email: 'admin@test.com', password: 'admin123' });
  return res;
};

const createService = async (adminToken) => {
  const Service = require('../src/models/Service');
  const service = await Service.create({
    name: 'General OPD',
    description: 'General outpatient department',
    prefix: 'A',
    capacityPerHour: 20,
    active: true,
  });
  return service;
};

// ══════════════════════════════════════════════
// AUTH TESTS
// ══════════════════════════════════════════════
describe('Auth API', () => {
  describe('POST /api/auth/register', () => {
    it('should register a new user and return JWT', async () => {
      const res = await registerUser();
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('test@example.com');
      expect(res.body.data.user.role).toBe('user');
    });

    it('should reject duplicate email', async () => {
      await registerUser();
      const res = await registerUser();
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already exists/i);
    });

    it('should reject missing fields', async () => {
      const res = await request(app).post('/api/auth/register').send({ email: 'a@b.com' });
      expect(res.status).toBe(400);
    });

    it('should reject short password', async () => {
      const res = await registerUser({ password: '123' });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login with correct credentials', async () => {
      await registerUser();
      const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });

    it('should reject wrong password', async () => {
      await registerUser();
      const res = await request(app).post('/api/auth/login').send({ email: 'test@example.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });

    it('should reject non-existent email', async () => {
      const res = await request(app).post('/api/auth/login').send({ email: 'nobody@test.com', password: 'pass123' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user when authenticated', async () => {
      const regRes = await registerUser();
      const token = regRes.body.data.token;

      const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });
  });
});

// ══════════════════════════════════════════════
// TOKEN BOOKING TESTS
// ══════════════════════════════════════════════
describe('Token API', () => {
  let userToken;
  let serviceId;

  beforeEach(async () => {
    const regRes = await registerUser();
    userToken = regRes.body.data.token;
    const service = await createService();
    serviceId = service._id.toString();
  });

  describe('POST /api/tokens/book', () => {
    it('should book a token for a service', async () => {
      const res = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token.tokenNumber).toMatch(/^A-\d{3}$/);
      expect(res.body.data.token.priority).toBe(0); // normal = 0
    });

    it('should reject duplicate booking for same service', async () => {
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/already have/i);
    });

    it('should reject booking without serviceId', async () => {
      const res = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(400);
    });

    it('should not allow non-admin to set emergency priority', async () => {
      const res = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId, priority: 'emergency' });

      expect(res.status).toBe(201);
      expect(res.body.data.token.priority).toBe(0); // forced to normal
    });
  });

  describe('GET /api/tokens/my-tokens', () => {
    it('should return empty array when no tokens', async () => {
      const res = await request(app)
        .get('/api/tokens/my-tokens')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(0);
    });

    it('should return booked tokens with position', async () => {
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .get('/api/tokens/my-tokens')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(1);
      expect(res.body.data.tokens[0].position).toBe(1);
    });
  });

  describe('PUT /api/tokens/cancel/:id', () => {
    it('should cancel a waiting token', async () => {
      const bookRes = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const tokenId = bookRes.body.data.token._id;

      const res = await request(app)
        .put(`/api/tokens/cancel/${tokenId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.token.status).toBe('cancelled');
    });
  });

  describe('GET /api/tokens/queue-status/:serviceId', () => {
    it('should return public queue status', async () => {
      // Book a token first
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .get(`/api/tokens/queue-status/${serviceId}`)
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.queue).toHaveLength(1);
      expect(res.body.data.stats.waiting).toBe(1);
      // Should have redacted name (no email exposed)
      expect(res.body.data.queue[0].userId.name).toBeDefined();
    });
  });

  describe('GET /api/tokens/history', () => {
    it('should return paginated token history', async () => {
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .get('/api/tokens/history')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(1);
      expect(res.body.data.pagination).toBeDefined();
      expect(res.body.data.pagination.total).toBe(1);
    });
  });
});

// ══════════════════════════════════════════════
// ADMIN TESTS
// ══════════════════════════════════════════════
describe('Admin API', () => {
  let adminToken;
  let userToken;
  let serviceId;

  beforeEach(async () => {
    const adminRes = await registerAdmin();
    adminToken = adminRes.body.data.token;

    const userRes = await registerUser();
    userToken = userRes.body.data.token;

    const service = await createService();
    serviceId = service._id.toString();
  });

  describe('POST /api/admin/emergency-token', () => {
    it('should create an emergency token with priority 1', async () => {
      const res = await request(app)
        .post('/api/admin/emergency-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ serviceId });

      expect(res.status).toBe(201);
      expect(res.body.data.token.priority).toBe(1); // emergency = 1
    });

    it('should reject non-admin users', async () => {
      const res = await request(app)
        .post('/api/admin/emergency-token')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/admin/call-next/:serviceId', () => {
    it('should call the next waiting token', async () => {
      // Book a token as user
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      // Call next as admin
      const res = await request(app)
        .put(`/api/admin/call-next/${serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.token.status).toBe('serving');
    });

    it('should return 404 when queue is empty', async () => {
      const res = await request(app)
        .put(`/api/admin/call-next/${serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    it('should prioritize emergency tokens over normal', async () => {
      // Book normal token as user
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      // Book emergency token as admin
      await request(app)
        .post('/api/admin/emergency-token')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ serviceId });

      // Call next — should pick emergency (priority 1) first
      const res = await request(app)
        .put(`/api/admin/call-next/${serviceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.token.priority).toBe(1);
    });
  });

  describe('PUT /api/admin/update-status/:tokenId', () => {
    it('should update token status', async () => {
      const bookRes = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const tokenId = bookRes.body.data.token._id;

      const res = await request(app)
        .put(`/api/admin/update-status/${tokenId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'skipped' });

      expect(res.status).toBe(200);
      expect(res.body.data.token.status).toBe('skipped');
    });

    it('should reject invalid status', async () => {
      const bookRes = await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .put(`/api/admin/update-status/${bookRes.body.data.token._id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'invalid_status' });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/admin/analytics', () => {
    it('should return analytics data', async () => {
      const res = await request(app)
        .get('/api/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveProperty('totalCompleted');
      expect(res.body.data).toHaveProperty('avgWaitMinutes');
      expect(res.body.data).toHaveProperty('peakHours');
    });
  });

  describe('GET /api/admin/tokens', () => {
    it('should return all tokens with pagination', async () => {
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      const res = await request(app)
        .get('/api/admin/tokens')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(1);
      expect(res.body.data.pagination).toBeDefined();
    });

    it('should filter by numeric priority', async () => {
      // Book a normal token
      await request(app)
        .post('/api/tokens/book')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ serviceId });

      // Filter for emergency (1) — should return 0
      const res = await request(app)
        .get('/api/admin/tokens?priority=1')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.tokens).toHaveLength(0);
    });
  });
});

// ══════════════════════════════════════════════
// SERVICE TESTS
// ══════════════════════════════════════════════
describe('Service API', () => {
  let adminToken;
  let userToken;

  beforeEach(async () => {
    const adminRes = await registerAdmin();
    adminToken = adminRes.body.data.token;

    const userRes = await registerUser();
    userToken = userRes.body.data.token;
  });

  describe('GET /api/services', () => {
    it('should return empty services list initially', async () => {
      const res = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.services).toHaveLength(0);
    });

    it('should return services after creation', async () => {
      await createService();

      const res = await request(app)
        .get('/api/services')
        .set('Authorization', `Bearer ${userToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.services).toHaveLength(1);
      expect(res.body.data.services[0].name).toBe('General OPD');
    });
  });
});

// ══════════════════════════════════════════════
// HEALTH CHECK
// ══════════════════════════════════════════════
describe('Health Check', () => {
  it('GET /api/health should return 200', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('GET /api/nonexistent should return 404', async () => {
    const res = await request(app).get('/api/nonexistent');
    expect(res.status).toBe(404);
  });
});
