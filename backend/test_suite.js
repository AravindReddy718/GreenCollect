// Comprehensive End-to-End Test Suite for Janatha Garage
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config({ path: './.env' });

const TEST_PORT = 4001;
const BASE_URL = `http://localhost:${TEST_PORT}`;

const request = async (endpoint, options = {}) => {
  const url = `${BASE_URL}${endpoint}`;
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  let data = null;
  const text = await res.text();
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, ok: res.ok, data };
};

const runAllTests = async () => {
  console.log('====================================================');
  console.log('🚀 JANATHA GARAGE E2E INTEGRATION TEST SUITE');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  const assert = (condition, title, details = '') => {
    if (condition) {
      console.log(`✅ PASS: ${title}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${title} -> ${details}`);
      failed++;
    }
  };

  let mongod = null;
  let activeUri = process.env.MONGO_URI;
  let usingAtlas = false;

  // Step A: Test if MongoDB Atlas is reachable from current IP
  console.log('--- Checking MongoDB Atlas Connection ---');
  try {
    await mongoose.connect(activeUri, { serverSelectionTimeoutMS: 4000 });
    console.log(`✅ Connected directly to MongoDB Atlas cluster: ${mongoose.connection.name}`);
    usingAtlas = true;
    await mongoose.disconnect();
  } catch (atlasErr) {
    console.warn(`⚠️ MongoDB Atlas blocked by IP whitelist: ${atlasErr.message}`);
    console.log('ℹ️ Spinning up isolated MongoDB Memory Server for test execution...');
    mongod = await MongoMemoryServer.create();
    activeUri = mongod.getUri();
  }

  // Step B: Set MONGO_URI and PORT for backend test server
  process.env.MONGO_URI = activeUri;
  process.env.PORT = String(TEST_PORT);

  // Connect mongoose and import Express app
  await mongoose.connect(activeUri);
  console.log(`📡 Database connected: ${mongoose.connection.name}`);
  const db = mongoose.connection.db;

  // Start Express server on TEST_PORT
  const express = require('express');
  const cors = require('cors');
  const authRoutes = require('./routes/auth');
  const productRoutes = require('./routes/product');
  const userRoutes = require('./routes/UserRoutes');
  const notificationRoutes = require('./routes/notifications');
  const adminRoutes = require('./routes/admin');
  const wasteRequestRoutes = require('./routes/wasteRequest');
  const orderRoutes = require('./routes/orderRoutes');
  const companyRoutes = require('./routes/companyRoutes');
  const { authMiddleware } = require('./middleware/auth');

  const app = express();
  app.use(express.json());
  app.use(cors({ origin: true, credentials: true }));

  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/waste-requests', wasteRequestRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api', companyRoutes);

  app.get('/api/protected', authMiddleware, (req, res) => {
    res.json({ success: true, message: 'You accessed a protected route', user: req.user });
  });

  app.get('/api/health', (req, res) => {
    const dbState = mongoose.connection.readyState;
    res.json({
      success: true,
      status: 'OK',
      server: 'healthy',
      timestamp: new Date().toISOString(),
      database: {
        status: dbState === 1 ? 'Connected' : 'Disconnected',
        readyState: dbState,
        name: mongoose.connection.name
      }
    });
  });

  const server = await new Promise((resolve) => {
    const s = app.listen(TEST_PORT, () => resolve(s));
  });
  console.log(`🎯 Test backend server running on port ${TEST_PORT}\n`);

  try {
    // 1. Health Check
    console.log('--- TEST 1: Health Check Endpoint ---');
    const healthRes = await request('/api/health');
    assert(healthRes.status === 200, 'Health check responds with 200');
    assert(healthRes.data?.status === 'OK', 'Health check status is OK');
    assert(healthRes.data?.database?.status === 'Connected', 'Database status is Connected');

    // Unique test identifiers
    const timestamp = Date.now();
    const testUser = {
      name: `Tester ${timestamp}`,
      email: `test_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'user',
      phone: '9876543210'
    };

    // 2. User Registration
    console.log('\n--- TEST 2: User Registration ---');
    const regRes = await request('/api/auth/register', { method: 'POST', body: testUser });
    assert(regRes.status === 201, 'Registration returns 201 Created');
    assert(regRes.data?.success === true, 'Registration reports success');
    assert(Boolean(regRes.data?.token), 'Registration returns JWT token');
    const userToken = regRes.data?.token;
    const userId = regRes.data?.user?.id;

    // 3. User Persistence in MongoDB
    console.log('\n--- TEST 3: User Persistence in MongoDB ---');
    const userInDb = await db.collection('users').findOne({ email: testUser.email });
    assert(userInDb !== null, 'User document exists in MongoDB');
    assert(userInDb.name === testUser.name, 'Stored user name matches');
    assert(userInDb.password !== testUser.password, 'Password is secure bcrypt hash, NOT plaintext');
    assert(userInDb.points >= 0, `User points balance initialized (${userInDb.points})`);

    // 4. Duplicate Registration Rejection
    console.log('\n--- TEST 4: Duplicate Registration Rejection ---');
    const dupRes = await request('/api/auth/register', { method: 'POST', body: testUser });
    assert(dupRes.status === 409, 'Duplicate registration returns 409 Conflict');

    // 5. User Login (Valid Credentials)
    console.log('\n--- TEST 5: User Login (Valid Credentials) ---');
    const loginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testUser.email, password: testUser.password }
    });
    assert(loginRes.status === 200, 'Login returns 200 OK');
    assert(Boolean(loginRes.data?.token), 'Login returns valid JWT token');
    assert(loginRes.data?.user?.email === testUser.email, 'Login returns matching user info');

    // 6. User Login (Invalid Credentials)
    console.log('\n--- TEST 6: User Login (Invalid Credentials) ---');
    const badLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testUser.email, password: 'WrongPassword999' }
    });
    assert(badLoginRes.status === 401, 'Invalid login returns 401 Unauthorized');

    // 7. JWT Authentication & Protected Routes
    console.log('\n--- TEST 7: JWT Authentication & Protected Routes ---');
    const protectedRes = await request('/api/protected', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(protectedRes.status === 200, 'Protected route accessible with valid token');
    assert(protectedRes.data?.user?.id === userId, 'Protected route extracts correct user ID');

    const unauthRes = await request('/api/protected');
    assert(unauthRes.status === 401, 'Protected route without token returns 401');

    // 8. Profile Retrieval from MongoDB
    console.log('\n--- TEST 8: Profile Data Loading ---');
    const profileRes = await request('/api/auth/profile', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(profileRes.status === 200, 'Profile endpoint returns 200');
    assert(profileRes.data?.user?.email === testUser.email, 'Profile data matches registered user');

    // 9. Profile Update Persistence
    console.log('\n--- TEST 9: Profile Update Persistence ---');
    const updatedPhone = '9123456789';
    const updatedAvatar = 'https://example.com/avatar.png';
    const updateRes = await request('/api/auth/profile', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { phone: updatedPhone, avatar: updatedAvatar }
    });
    assert(updateRes.status === 200, 'Profile update returns 200');
    assert(updateRes.data?.user?.phone === updatedPhone, 'Profile update returns updated phone');

    const updatedUserInDb = await db.collection('users').findOne({ email: testUser.email });
    assert(updatedUserInDb.phone === updatedPhone, 'Updated phone persisted in MongoDB');
    assert(updatedUserInDb.avatar === updatedAvatar, 'Updated avatar persisted in MongoDB');

    // 10. Collector Registration & Admin Approval Workflow
    console.log('\n--- TEST 10: Collector Registration & Admin Approval ---');
    const testCollector = {
      name: `Collector ${timestamp}`,
      email: `collector_${timestamp}@example.com`,
      password: 'Password123!',
      role: 'collector',
      collectorInfo: {
        phone: '9988776655',
        address: '123 Green Way, Eco City',
        vehicleType: 'Pickup Truck',
        vehicleNumberPlate: `KA01EC${timestamp.toString().slice(-4)}`,
        experience: '5 years in waste recycling'
      }
    };

    const colRegRes = await request('/api/auth/register', { method: 'POST', body: testCollector });
    assert(colRegRes.status === 201, 'Collector registration submitted with 201');
    assert(colRegRes.data?.status === 'pending', 'Collector initial status is pending');
    const collectorId = colRegRes.data?.collectorId;

    // Verify collector cannot login before approval
    const unapprovedLogin = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testCollector.email, password: testCollector.password }
    });
    assert(unapprovedLogin.status === 403, 'Unapproved collector login returns 403 Forbidden');

    // Admin approves collector
    const approveRes = await request(`/api/users/approve-collector/${collectorId}`, {
      method: 'PUT',
      body: { isApproved: true }
    });
    assert(approveRes.status === 200, 'Collector approved successfully by admin');

    // Collector can now login
    const colLoginRes = await request('/api/auth/login', {
      method: 'POST',
      body: { email: testCollector.email, password: testCollector.password }
    });
    assert(colLoginRes.status === 200, 'Approved collector logs in successfully');
    const collectorToken = colLoginRes.data?.token;

    // 11. Waste Pickup Request Scheduling
    console.log('\n--- TEST 11: Waste Pickup Scheduling ---');
    const pickupPayload = {
      pickupDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
      pickupTime: '10:00:00',
      wasteType: 'plastic',
      estimatedWeight: 5,
      pickupAddress: '45 Green Boulevard, Bangalore',
      contactNumber: '9876543210',
      instructions: 'Please call before arrival'
    };

    const pickupRes = await request('/api/waste-requests', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: pickupPayload
    });
    assert(pickupRes.status === 201, 'Pickup scheduled successfully with 201');
    const requestId = pickupRes.data?.request?.id;
    assert(Boolean(requestId), 'Pickup request ID returned');

    // 12. Fetch User Pickups
    console.log('\n--- TEST 12: User Pickups Retrieval ---');
    const myRequestsRes = await request('/api/waste-requests/my-requests', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(myRequestsRes.status === 200, 'My requests returned with 200');
    assert(myRequestsRes.data?.requests?.length > 0, 'User pickup request appears in list');

    // 13. Collector Workflow (Accept -> Start -> Complete & Award Coins)
    console.log('\n--- TEST 13: Collector Lifecycle (Accept -> Start -> Complete) ---');
    const acceptRes = await request(`/api/waste-requests/${requestId}/accept`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${collectorToken}` }
    });
    assert(acceptRes.status === 200, 'Collector accepts pickup request');

    const startRes = await request(`/api/waste-requests/${requestId}/start`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${collectorToken}` }
    });
    assert(startRes.status === 200, 'Collector starts pickup');

    const userPointsBefore = (await db.collection('users').findOne({ email: testUser.email })).points;

    const completeRes = await request(`/api/waste-requests/${requestId}/complete`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${collectorToken}` }
    });
    assert(completeRes.status === 200, 'Collector completes pickup');
    assert(completeRes.data?.coinsEarned > 0, `Coins awarded to user (${completeRes.data?.coinsEarned})`);

    const userPointsAfter = (await db.collection('users').findOne({ email: testUser.email })).points;
    assert(userPointsAfter > userPointsBefore, `User points incremented in MongoDB: ${userPointsBefore} -> ${userPointsAfter}`);

    // 14. Organisation Collection Request
    console.log('\n--- TEST 14: Organisation Collection Request ---');
    const orgPayload = {
      organisationName: 'EcoTech Green Campus',
      organisationType: 'school',
      contactName: 'Principal Green',
      contactEmail: 'green@ecotech.edu',
      contactPhone: '9845123456',
      pickupAddress: 'Sector 5, Electronics City',
      wasteTypes: ['electronics', 'plastic'],
      estimatedWeight: 50,
      pickupDate: new Date(Date.now() + 172800000).toISOString().split('T')[0],
      pickupTime: '11:00 AM',
      instructions: 'Gate 2 security entrance'
    };

    const orgRes = await request('/api/waste-requests/organisation', { method: 'POST', body: orgPayload });
    assert(orgRes.status === 201, 'Organisation request submitted with 201');
    const orgReqInDb = await db.collection('wasterequests').findOne({ organisationName: orgPayload.organisationName });
    assert(orgReqInDb !== null, 'Organisation request persisted in MongoDB');

    // 15. Product Creation & Listing
    console.log('\n--- TEST 15: Product CRUD in MongoDB ---');
    const productPayload = {
      productName: `Reusable Bamboo Cup ${timestamp}`,
      description: 'Zero-waste bamboo fibre travel mug',
      price: 120,
      coinsRequired: 60,
      category: 'Lifestyle',
      stockQuantity: 25,
      productImage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500'
    };

    const prodRes = await request('/api/products', { method: 'POST', body: productPayload });
    assert(prodRes.status === 201, 'Product created successfully');
    const createdProductId = prodRes.data?.product?._id;

    const listProdsRes = await request('/api/products');
    assert(listProdsRes.status === 200, 'Products fetched successfully');
    const foundProduct = listProdsRes.data?.products?.find(p => p._id.toString() === createdProductId.toString());
    assert(Boolean(foundProduct), 'Created product found in products collection');

    // 16. Order / Redemption Placement with MongoDB Persistence
    console.log('\n--- TEST 16: Order / Redemption with MongoDB Persistence ---');
    const orderPayload = {
      items: [{
        id: createdProductId,
        name: productPayload.productName,
        price: 60,
        qty: 1,
        image: productPayload.productImage
      }],
      address: {
        fullName: testUser.name,
        phone: '9876543210',
        email: testUser.email,
        address: 'Flat 402, Green Meadows',
        city: 'Bangalore',
        state: 'Karnataka',
        pincode: '560100',
        country: 'India'
      },
      deliveryOption: 'standard'
    };

    const orderRes = await request('/api/orders', {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}` },
      body: orderPayload
    });
    assert(orderRes.status === 201, 'Order created successfully with 201');
    assert(Boolean(orderRes.data?.orderId), `Order ID generated: ${orderRes.data?.orderId}`);

    // Verify order in MongoDB
    const orderInDb = await db.collection('orders').findOne({ orderId: orderRes.data.orderId });
    assert(orderInDb !== null, 'Order document exists in MongoDB');
    assert(orderInDb.totalCoins === 60, 'Order totalCoins matches expected value');

    // Verify user balance deducted in MongoDB
    const userPointsAfterOrder = (await db.collection('users').findOne({ email: testUser.email })).points;
    assert(userPointsAfterOrder === userPointsAfter - 60, `Points balance properly deducted in DB: ${userPointsAfter} -> ${userPointsAfterOrder}`);

    // Fetch user order history
    const myOrdersRes = await request('/api/orders/my-orders', {
      headers: { Authorization: `Bearer ${userToken}` }
    });
    assert(myOrdersRes.status === 200, 'User orders fetched with 200');
    assert(myOrdersRes.data?.orders?.length > 0, 'Placed order appears in user order history');

    // 17. Leaderboard
    console.log('\n--- TEST 17: Leaderboard Retrieval ---');
    const lbRes = await request('/api/users/leaderboard');
    assert(lbRes.status === 200, 'Leaderboard responds with 200');
    assert(Array.isArray(lbRes.data?.leaderboard), 'Leaderboard is array of users');

    console.log('\n====================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    if (usingAtlas) {
      console.log('🌐 Tests executed against live MongoDB Atlas cluster');
    } else {
      console.log('ℹ️ Tests executed against isolated MongoDB Engine (Atlas IP whitelist required for production cluster)');
    }
    console.log('====================================================\n');

  } finally {
    server.close();
    await mongoose.disconnect();
    if (mongod) await mongod.stop();
  }

  process.exit(failed > 0 ? 1 : 0);
};

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
