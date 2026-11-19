// Comprehensive End-to-End Test Suite for Janatha Garage
const http = require('http');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
require('dotenv').config({ path: './.env' });
const bcrypt = require('bcryptjs');
const { spawnSync } = require('child_process');

// Tests never use the real JWT secret or database
process.env.JWT_SECRET = 'test-only-jwt-secret';
// Emails go to an in-memory outbox instead of SMTP
process.env.NODE_ENV = 'test';

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

  // Always use an isolated in-memory MongoDB so tests never write to a real database
  console.log('ℹ️ Starting isolated MongoDB Memory Server for test execution...');
  const mongod = await MongoMemoryServer.create();
  const activeUri = mongod.getUri();

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

    // Admin accounts cannot self-register, so create one directly (as `npm run create-admin` does)
    const User = require('./models/Users');
    const adminCreds = { email: `admin_${timestamp}@example.com`, password: 'AdminPass123!' };
    await User.create({ name: 'Test Admin', email: adminCreds.email, password: await bcrypt.hash(adminCreds.password, 10), role: 'admin' });
    const adminLogin = await request('/api/auth/login', { method: 'POST', body: adminCreds });
    const adminToken = adminLogin.data?.token;
    const adminHeaders = { Authorization: `Bearer ${adminToken}` };
    const testUser = {
      name: 'Tester Alpha',
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
      name: 'Collector Bravo',
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

    // [P0-2] Approving without a token is refused
    const approveNoAuth = await request(`/api/users/approve-collector/${collectorId}`, {
      method: 'PUT',
      body: { isApproved: true }
    });
    assert(approveNoAuth.status === 401, '[P0-2] Approve collector without token returns 401', `got ${approveNoAuth.status}`);

    // [P0-2] A normal user cannot approve collectors
    const approveAsUser = await request(`/api/users/approve-collector/${collectorId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${userToken}` },
      body: { isApproved: true }
    });
    assert(approveAsUser.status === 403, '[P0-2] Approve collector as normal user returns 403', `got ${approveAsUser.status}`);

    // Admin approves collector
    const approveRes = await request(`/api/users/approve-collector/${collectorId}`, {
      method: 'PUT',
      headers: adminHeaders,
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
      price: 60,
      coinsRequired: 60,
      category: 'Lifestyle',
      stockQuantity: 25,
      productImage: 'https://images.unsplash.com/photo-1514432324607-a09d9b4aefdd?w=500'
    };

    const prodNoAuth = await request('/api/products', { method: 'POST', body: productPayload });
    assert(prodNoAuth.status === 401, '[P0-2] Create product without token returns 401', `got ${prodNoAuth.status}`);

    const prodRes = await request('/api/products', { method: 'POST', headers: adminHeaders, body: productPayload });
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

    // ================= REGRESSION TESTS FOR QA FIXES =================
    console.log('\n--- TEST 18: Regression tests for QA report fixes ---');
    const authHeader = (t) => ({ Authorization: `Bearer ${t}` });

    // [P0-2] Admin-only endpoints refuse anonymous and normal users
    const coinsNoAuth = await request(`/api/users/${userId}/coins`, { method: 'PATCH', body: { coinsChange: 100000 } });
    assert(coinsNoAuth.status === 401, '[P0-2] Change coins without token returns 401', `got ${coinsNoAuth.status}`);
    const coinsAsUser = await request(`/api/users/${userId}/coins`, { method: 'PATCH', headers: authHeader(userToken), body: { coinsChange: 100000 } });
    assert(coinsAsUser.status === 403, '[P0-2] Change coins as normal user returns 403', `got ${coinsAsUser.status}`);
    const delNoAuth = await request(`/api/products/delete/${createdProductId}`, { method: 'DELETE' });
    assert(delNoAuth.status === 401, '[P0-2] Delete product without token returns 401', `got ${delNoAuth.status}`);
    const adminListNoAuth = await request('/api/admin/collector-requests');
    assert(adminListNoAuth.status === 401, '[P0-2] Admin collector list without token returns 401', `got ${adminListNoAuth.status}`);
    const partnerNoAuth = await request('/api/partners', { method: 'POST', body: { companyName: 'X', establishingYear: 2000, type: 'x', location: 'x', contact: 'x', wasteProcessed: 'x' } });
    assert(partnerNoAuth.status === 401, '[P0-2] Create partner without token returns 401', `got ${partnerNoAuth.status}`);
    const notifNoAuth = await request(`/api/notifications?userId=${userId}`);
    assert(notifNoAuth.status === 401, '[P0-2] Read notifications without token returns 401', `got ${notifNoAuth.status}`);
    const notifCreate = await request('/api/notifications', { method: 'POST', headers: adminHeaders, body: { userId, message: 'Hello from admin' } });
    assert(notifCreate.status === 201, '[P0-2] Admin can create a notification', `got ${notifCreate.status}`);
    const notifMine = await request('/api/notifications', { headers: authHeader(userToken) });
    assert(notifMine.status === 200 && notifMine.data?.items?.some(n => n.message === 'Hello from admin'), '[P1-10] User reads own notifications via token', JSON.stringify(notifMine.data));
    assert(notifMine.data?.items?.some(n => /accepted/.test(n.message)) && notifMine.data?.items?.some(n => /earned 60 coins/.test(n.message)), '[Re-audit P2-4] Accept and complete created notifications for the user', JSON.stringify(notifMine.data));
    const notifOther = await request('/api/notifications', { headers: authHeader(collectorToken) });
    assert(notifOther.status === 200 && notifOther.data?.items?.length === 0, '[P0-2] Another user cannot see those notifications', JSON.stringify(notifOther.data));

    // [P0-3] Self-registration as admin is refused
    const adminReg = await request('/api/auth/register', { method: 'POST', body: { name: 'Evil', email: `evil_${timestamp}@example.com`, password: 'Password123!', role: 'admin' } });
    assert(adminReg.status === 400, '[P0-3] Register with role admin returns 400', `got ${adminReg.status}`);
    assert((await db.collection('users').countDocuments({ email: `evil_${timestamp}@example.com` })) === 0, '[P0-3] No admin account was created');

    // [P0-4] Client-sent prices are ignored; a negative price cannot mint coins
    const pointsBeforeEvil = (await db.collection('users').findOne({ email: testUser.email })).points;
    const evilOrder = await request('/api/orders', {
      method: 'POST', headers: authHeader(userToken),
      body: { ...orderPayload, items: [{ id: createdProductId, name: 'x', price: -100000, qty: 1 }] }
    });
    const pointsAfterEvil = (await db.collection('users').findOne({ email: testUser.email })).points;
    assert(evilOrder.status === 400, '[P0-4] Negative-price order is refused (real price 60 > balance)', `got ${evilOrder.status} ${JSON.stringify(evilOrder.data)}`);
    assert(pointsAfterEvil === pointsBeforeEvil, `[P0-4] Balance unchanged by negative-price order (${pointsBeforeEvil} -> ${pointsAfterEvil})`);
    const negQty = await request('/api/orders', {
      method: 'POST', headers: authHeader(userToken),
      body: { ...orderPayload, items: [{ id: createdProductId, qty: -5 }] }
    });
    assert(negQty.status === 400, '[P0-4] Negative quantity is refused', `got ${negQty.status}`);
    const fakeProduct = await request('/api/orders', {
      method: 'POST', headers: authHeader(userToken),
      body: { ...orderPayload, items: [{ id: 'not-a-product', price: 0, qty: 1 }] }
    });
    assert(fakeProduct.status === 400, '[P0-4] Order with an unknown product ID is refused', `got ${fakeProduct.status}`);

    // [P0-4] Atomic deduction: two simultaneous orders cannot both spend the same coins
    await db.collection('users').updateOne({ email: testUser.email }, { $set: { points: 60 } });
    const raceItems = { ...orderPayload, items: [{ id: createdProductId, qty: 1 }] };
    const [raceA, raceB] = await Promise.all([
      request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: raceItems }),
      request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: raceItems })
    ]);
    const raceOk = [raceA, raceB].filter(r => r.status === 201).length;
    const pointsAfterRace = (await db.collection('users').findOne({ email: testUser.email })).points;
    assert(raceOk === 1 && pointsAfterRace === 0, `[P0-4] Only one of two simultaneous orders succeeds (successes=${raceOk}, balance=${pointsAfterRace})`);

    // [P0-5] Server refuses to start without JWT_SECRET
    const envNoSecret = { ...process.env };
    delete envNoSecret.JWT_SECRET;
    const noSecret = spawnSync(process.execPath, ['-e', "require('./middleware/auth')"], { cwd: __dirname, env: envNoSecret, encoding: 'utf8' });
    assert(noSecret.status !== 0 && /JWT_SECRET must be set/.test(noSecret.stderr), '[P0-5] Loading auth without JWT_SECRET fails loudly', noSecret.stderr);

    // [P1-1] A user cannot read another user's order
    const user2 = { name: 'Second User', email: `second_${timestamp}@example.com`, password: 'Password123!', role: 'user' };
    const user2Reg = await request('/api/auth/register', { method: 'POST', body: user2 });
    const user2Token = user2Reg.data?.token;
    const otherOrder = await request(`/api/orders/${orderRes.data.orderId}`, { headers: authHeader(user2Token) });
    assert(otherOrder.status === 404, "[P1-1] Reading another user's order returns 404", `got ${otherOrder.status}`);
    const ownOrder = await request(`/api/orders/${orderRes.data.orderId}`, { headers: authHeader(userToken) });
    assert(ownOrder.status === 200, '[P1-1] Owner can still read their order', `got ${ownOrder.status}`);

    // [P1-2] Leaderboard does not expose emails
    const lb2 = await request('/api/users/leaderboard');
    assert(lb2.data.leaderboard.length > 0 && lb2.data.leaderboard.every(u => u.email === undefined), '[P1-2] Leaderboard entries have no email field');

    // [P1-4] Server-side validation returns 400, not 500
    const reg = (body) => request('/api/auth/register', { method: 'POST', body: { name: 'Valid Name', password: 'Password123!', role: 'user', ...body } });
    const shortPw = await reg({ email: `pw_${timestamp}@example.com`, password: '1' });
    assert(shortPw.status === 400, '[P1-4] Password "1" is refused with 400', `got ${shortPw.status}`);
    const blankName = await reg({ email: `nm_${timestamp}@example.com`, name: '   ' });
    assert(blankName.status === 400, '[P1-4] Whitespace-only name returns 400 (was 500)', `got ${blankName.status}`);
    const longName = await reg({ email: `ln_${timestamp}@example.com`, name: 'x'.repeat(60) });
    assert(longName.status === 400, '[P1-4] 60-character name returns 400 (was 500)', `got ${longName.status}`);
    const badPhone = await reg({ email: `ph_${timestamp}@example.com`, phone: 'abc' });
    assert(badPhone.status === 400, '[P1-4] Invalid phone returns 400 (was 500)', `got ${badPhone.status}`);
    const objEmail = await request('/api/auth/login', { method: 'POST', body: { email: { $ne: null }, password: 'x' } });
    assert(objEmail.status === 400, '[P1-4] Login with an object as email returns 400', `got ${objEmail.status}`);
    const pickup = (overrides) => request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, ...overrides } });
    const badDate = await pickup({ pickupDate: 'garbage' });
    assert(badDate.status === 400, '[P1-4] Pickup date "garbage" returns 400 (was 500)', `got ${badDate.status}`);
    const pastDate = await pickup({ pickupDate: '1990-01-01' });
    assert(pastDate.status === 400, '[P1-4] Past pickup date returns 400 (was accepted)', `got ${pastDate.status}`);
    const longAddr = await pickup({ pickupAddress: 'x'.repeat(10000) });
    assert(longAddr.status === 400, '[P1-4] 10,000-character address returns 400 (was accepted)', `got ${longAddr.status}`);
    const orgBadDate = await request('/api/waste-requests/organisation', { method: 'POST', body: { ...orgPayload, pickupDate: 'garbage' } });
    assert(orgBadDate.status === 400, '[P1-4] Organisation request with bad date returns 400', `got ${orgBadDate.status}`);

    // [P1-5] Valid emails are accepted, invalid ones refused, and ReDoS inputs return instantly
    for (const email of [`first+tag_${timestamp}@gmail.com`, `x_${timestamp}@college.info`, `y_${timestamp}@x.technology`]) {
      const r = await reg({ email });
      assert(r.status === 201, `[P1-5] Valid email ${email} is accepted`, `got ${r.status} ${JSON.stringify(r.data)}`);
    }
    for (const email of ['a@b', '_@_.__', 'a@b.c1']) {
      const r = await reg({ email });
      assert(r.status === 400, `[P1-5] Invalid email ${email} is refused with 400`, `got ${r.status}`);
    }
    const redosStart = Date.now();
    const redos = await reg({ email: 'a'.repeat(40) + '!' });
    const redosMs = Date.now() - redosStart;
    assert(redos.status === 400 && redosMs < 1000, `[P1-5] 41-character ReDoS email answered in ${redosMs} ms with 400`);
    const redos2Start = Date.now();
    const redos2 = await reg({ email: 'a'.repeat(40) + `+${timestamp}@example.com` });
    const redos2Ms = Date.now() - redos2Start;
    assert(redos2.status === 201 && redos2Ms < 1000, `[P1-5] Email that froze the old schema regex now saves in ${redos2Ms} ms (status ${redos2.status})`);

    // [P1-7] Admin accept assigns an approved collector, who can then see and start the request
    const orgId = orgReqInDb._id.toString();
    const acceptNoCollector = await request(`/api/admin/organisation-requests/${orgId}/accept`, { method: 'POST', headers: adminHeaders, body: {} });
    assert(acceptNoCollector.status === 400, '[P1-7] Accept without a collector returns 400', `got ${acceptNoCollector.status}`);
    const acceptOrg = await request(`/api/admin/organisation-requests/${orgId}/accept`, { method: 'POST', headers: adminHeaders, body: { collectorId } });
    assert(acceptOrg.status === 200, '[P1-7] Accept with an approved collector returns 200', `got ${acceptOrg.status} ${JSON.stringify(acceptOrg.data)}`);
    const collectorList = await request('/api/waste-requests', { headers: authHeader(collectorToken) });
    assert(Array.isArray(collectorList.data) && collectorList.data.some(r => r._id === orgId), '[P1-7] Assigned collector sees the accepted organisation request');
    const startOrg = await request(`/api/waste-requests/${orgId}/start`, { method: 'PUT', headers: authHeader(collectorToken) });
    assert(startOrg.status === 200, '[P1-7] Assigned collector can start the organisation pickup', `got ${startOrg.status}`);

    // [P1-8] A rejected collector stays rejected after a refresh
    const rejCollector = { name: 'Rejected Collector', email: `rej_${timestamp}@example.com`, password: 'Password123!', role: 'collector', collectorInfo: { ...testCollector.collectorInfo, vehicleNumberPlate: `KA02RJ${timestamp.toString().slice(-4)}` } };
    const rejReg = await request('/api/auth/register', { method: 'POST', body: rejCollector });
    await request(`/api/users/approve-collector/${rejReg.data?.collectorId}`, { method: 'PUT', headers: adminHeaders, body: { isApproved: false } });
    const collectorsAfter = await request('/api/admin/collector-requests', { headers: adminHeaders });
    const rejEntry = collectorsAfter.data.find(c => c._id === rejReg.data?.collectorId);
    assert(rejEntry?.collectorInfo?.status === 'rejected', '[P1-8] Rejected collector is reported as rejected, not pending', JSON.stringify(rejEntry?.collectorInfo));

    // [P1-9] Product active toggle persists (the endpoint the admin UI now calls)
    const toggle = await request(`/api/products/status/${createdProductId}`, { method: 'PATCH', headers: adminHeaders, body: { isActive: false } });
    const prodAfter = await db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(createdProductId) });
    assert(toggle.status === 200 && prodAfter.isActive === false, '[P1-9] Deactivating a product is saved in the database');

    // ================= RE-AUDIT REGRESSION TESTS =================
    console.log('\n--- TEST 19: Regression tests for re-audit fixes ---');
    const tomorrowDate = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const newPickup = async (overrides = {}) => (await request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, pickupDate: tomorrowDate, ...overrides } })).data?.request?.id;
    const makeCollector = async (tag) => {
      const reg = await request('/api/auth/register', { method: 'POST', body: { name: `Collector ${tag}`, email: `${tag}_${timestamp}@example.com`, password: 'Password123!', role: 'collector', collectorInfo: { ...testCollector.collectorInfo, vehicleNumberPlate: `KA09${tag.slice(0, 2).toUpperCase()}${timestamp.toString().slice(-4)}` } } });
      await request(`/api/users/approve-collector/${reg.data.collectorId}`, { method: 'PUT', headers: adminHeaders, body: { isApproved: true } });
      const login = await request('/api/auth/login', { method: 'POST', body: { email: `${tag}_${timestamp}@example.com`, password: 'Password123!' } });
      return { id: reg.data.collectorId, token: login.data.token, email: `${tag}_${timestamp}@example.com` };
    };
    const c2 = await makeCollector('ctwo');
    const c3 = await makeCollector('cthree');

    // [Re-audit P1-1] A revoked collector's existing token stops working immediately
    const revokeTarget = await newPickup();
    await request(`/api/users/approve-collector/${c3.id}`, { method: 'PUT', headers: adminHeaders, body: { isApproved: false } });
    const revokedAccept = await request(`/api/waste-requests/${revokeTarget}/accept`, { method: 'PUT', headers: authHeader(c3.token) });
    assert(revokedAccept.status === 401, '[Re-audit P1-1] Revoked collector with old token gets 401', `got ${revokedAccept.status}`);

    // [Re-audit P1-6] Login does not reveal collector accounts without the right password
    const revokedWrongPw = await request('/api/auth/login', { method: 'POST', body: { email: c3.email, password: 'wrong-password' } });
    assert(revokedWrongPw.status === 401, '[Re-audit P1-6] Revoked collector + wrong password returns 401, not 403', `got ${revokedWrongPw.status}`);
    const revokedRightPw = await request('/api/auth/login', { method: 'POST', body: { email: c3.email, password: 'Password123!' } });
    assert(revokedRightPw.status === 403 && /rejected/.test(revokedRightPw.data?.error), '[Re-audit P1-6] Rejected collector with right password is told they were rejected', JSON.stringify(revokedRightPw.data));

    // [Re-audit P1-2] Absurd weights are refused
    const hugeWeight = await request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, estimatedWeight: 1000000 } });
    assert(hugeWeight.status === 400, '[Re-audit P1-2] Pickup of 1,000,000 kg returns 400', `got ${hugeWeight.status}`);

    // [Re-audit P1-3] Simultaneous "complete" calls pay out exactly once
    const raceId = await newPickup();
    await request(`/api/waste-requests/${raceId}/accept`, { method: 'PUT', headers: authHeader(c2.token) });
    await request(`/api/waste-requests/${raceId}/start`, { method: 'PUT', headers: authHeader(c2.token) });
    const coinsBeforeRace = (await db.collection('users').findOne({ email: testUser.email })).points;
    const completes = await Promise.all([1, 2, 3].map(() => request(`/api/waste-requests/${raceId}/complete`, { method: 'PUT', headers: authHeader(c2.token) })));
    const coinsAfterRace = (await db.collection('users').findOne({ email: testUser.email })).points;
    const okCompletes = completes.filter(r => r.status === 200).length;
    const completeActivities = await db.collection('collectoractivities').countDocuments({ wasteRequestId: new mongoose.Types.ObjectId(raceId), status: 'completed' });
    assert(okCompletes === 1 && coinsAfterRace - coinsBeforeRace === 60 && completeActivities === 1, `[Re-audit P1-3] 3 simultaneous completes: ${okCompletes} success, +${coinsAfterRace - coinsBeforeRace} coins, ${completeActivities} activity record`);

    // [Re-audit P1-4] Reject works (200) and only hides the request from that collector
    const rejectId = await newPickup();
    const rejectRes = await request(`/api/waste-requests/${rejectId}/reject`, { method: 'PUT', headers: authHeader(c2.token) });
    assert(rejectRes.status === 200, '[Re-audit P1-4] Collector reject returns 200 (was 500)', `got ${rejectRes.status} ${JSON.stringify(rejectRes.data).slice(0, 120)}`);
    const rejectedDoc = await db.collection('wasterequests').findOne({ _id: new mongoose.Types.ObjectId(rejectId) });
    assert(rejectedDoc.collectorStatus === 'pending', '[Re-audit P1-4] Request stays pending for other collectors', rejectedDoc.collectorStatus);
    const c2List = await request('/api/waste-requests', { headers: authHeader(c2.token) });
    const c1List = await request('/api/waste-requests', { headers: authHeader(collectorToken) });
    assert(!c2List.data.some(r => r._id === rejectId) && c1List.data.some(r => r._id === rejectId), '[Re-audit P1-4] Hidden from the rejecting collector, visible to others');

    // [Re-audit P1-5] ?status= cannot show another collector's requests
    const c1Accepted = await request('/api/waste-requests?status=completed', { headers: authHeader(collectorToken) });
    assert(!c1Accepted.data.some(r => r._id === raceId), "[Re-audit P1-5] Collector 1 cannot list collector 2's completed request via ?status=");

    // [Re-audit P1-7] Bad input returns 4xx with a readable message, never 500
    const expect4xx = (label, res, expected, id = 'P1-7') => assert(
      res.status >= 400 && res.status < 500 && !/Cast to|validation failed|Cannot read/.test(JSON.stringify(res.data)) && (!expected || expected.test(JSON.stringify(res.data))),
      `[Re-audit ${id}] ${label} -> ${res.status} ${JSON.stringify(res.data).slice(0, 90)}`);
    // An active, in-stock product so order tests reach the address checks
    const addrProd = await request('/api/products', { method: 'POST', headers: adminHeaders, body: { ...productPayload, productName: `Addr ${timestamp}`, stockQuantity: 50 } });
    const addrItems = [{ id: addrProd.data.product._id, qty: 1 }];
    expect4xx('Pickup wasteType "gold"', await request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, wasteType: 'gold' } }));
    expect4xx('Organisation type "army"', await request('/api/waste-requests/organisation', { method: 'POST', body: { ...orgPayload, organisationType: 'army' } }));
    expect4xx('Product price -10', await request('/api/products', { method: 'POST', headers: adminHeaders, body: { ...productPayload, productName: `Neg ${timestamp}`, price: -10 } }));
    expect4xx('Product without name', await request('/api/products', { method: 'POST', headers: adminHeaders, body: { ...productPayload, productName: undefined } }));
    expect4xx('Order with object as fullName', await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: addrItems, address: { ...orderPayload.address, fullName: { a: 1 } } } }), /address fields must be provided/);
    expect4xx('Accept with bad ID "abc"', await request('/api/waste-requests/abc/accept', { method: 'PUT', headers: authHeader(collectorToken) }));
    expect4xx('Approve collector with bad ID "abc"', await request('/api/users/approve-collector/abc', { method: 'PUT', headers: adminHeaders, body: { isApproved: true } }));
    expect4xx('Delete product with bad ID "abc"', await request('/api/products/delete/abc', { method: 'DELETE', headers: adminHeaders }));
    expect4xx('Partner with bad ID "abc"', await request('/api/partners/abc'));
    expect4xx('Admin coins change "abc"', await request(`/api/users/${userId}/coins`, { method: 'PATCH', headers: adminHeaders, body: { coinsChange: 'abc' } }));
    const twinEmail = `twin_${timestamp}@example.com`;
    const twins = await Promise.all([1, 2].map(() => request('/api/auth/register', { method: 'POST', body: { name: 'Twin', email: twinEmail, password: 'Password123!', role: 'user' } })));
    const twinStatuses = twins.map(t => t.status).sort().join(',');
    assert(twinStatuses === '201,409', `[Re-audit P1-7] Double-click signup gives 201 + 409 (got ${twinStatuses})`);

    // [Re-audit P1-8] Remaining bad data is refused
    expect4xx('Organisation weight -50', await request('/api/waste-requests/organisation', { method: 'POST', body: { ...orgPayload, estimatedWeight: -50 } }), null, 'P1-8');
    expect4xx('Pickup time "lol"', await request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, pickupTime: 'lol' } }), null, 'P1-8');
    expect4xx('Pickup date 9999-12-31', await request('/api/waste-requests', { method: 'POST', headers: authHeader(userToken), body: { ...pickupPayload, pickupDate: '9999-12-31' } }), null, 'P1-8');
    expect4xx('Order phone "1"', await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: addrItems, address: { ...orderPayload.address, phone: '1' } } }), /valid phone/, 'P1-8');
    expect4xx('Order pincode "1"', await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: addrItems, address: { ...orderPayload.address, pincode: '1' } } }), /6-digit pincode/, 'P1-8');
    expect4xx('Order 10,000-character address', await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: addrItems, address: { ...orderPayload.address, address: 'x'.repeat(10000) } } }), /too long/, 'P1-8');
    expect4xx('Avatar of 50,000 characters', await request('/api/auth/profile', { method: 'PUT', headers: authHeader(userToken), body: { avatar: 'x'.repeat(50000) } }), null, 'P1-8');
    expect4xx('Avatar "javascript:alert(1)"', await request('/api/auth/profile', { method: 'PUT', headers: authHeader(userToken), body: { avatar: 'javascript:alert(1)' } }), null, 'P1-8');

    // [Re-audit P1-10] Out-of-stock and deactivated products cannot be ordered; stock goes down after an order
    await db.collection('users').updateOne({ email: testUser.email }, { $set: { points: 1000 } });
    const stockProd = await request('/api/products', { method: 'POST', headers: adminHeaders, body: { ...productPayload, productName: `Stock ${timestamp}`, stockQuantity: 2 } });
    const stockId = stockProd.data.product._id;
    const order2 = await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: [{ id: stockId, qty: 2 }] } });
    const stockLeft = (await db.collection('products').findOne({ _id: new mongoose.Types.ObjectId(stockId) })).stockQuantity;
    assert(order2.status === 201 && stockLeft === 0, `[Re-audit P1-10] Ordering 2 of 2 succeeds and stock drops to ${stockLeft}`);
    const soldOut = await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: [{ id: stockId, qty: 1 }] } });
    assert(soldOut.status === 400 && /out of stock/.test(soldOut.data?.message), '[Re-audit P1-10] Ordering an out-of-stock product returns 400', `got ${soldOut.status}`);
    const inactiveOrder = await request('/api/orders', { method: 'POST', headers: authHeader(userToken), body: { ...orderPayload, items: [{ id: createdProductId, qty: 1 }] } });
    assert(inactiveOrder.status === 400 && /no longer available/.test(inactiveOrder.data?.message), '[Re-audit P1-10] Ordering a deactivated product returns 400', `got ${inactiveOrder.status}`);

    // [Re-audit P2-5] Admins see every request, including accepted organisation requests
    const adminAll = await request('/api/waste-requests', { headers: adminHeaders });
    assert(adminAll.data.some(r => r._id === orgReqInDb._id.toString() && r.status === 'in-progress'), '[Re-audit P2-5] Admin list still shows the accepted organisation request');

    // [Re-audit P2-6] A collector only sees a user's requests that are assigned to them
    const c2View = await request(`/api/waste-requests/user/${userId}`, { headers: authHeader(c2.token) });
    assert(c2View.status === 200 && c2View.data.requests.length > 0 && c2View.data.requests.every(r => r.assignedCollector?._id === c2.id), `[Re-audit P2-6] Collector 2 sees only their ${c2View.data.requests.length} assigned request(s) for this user`);

    // [Re-audit P2-7] Repeated wrong passwords get rate limited
    const limitEmail = `limit_${timestamp}@example.com`;
    await request('/api/auth/register', { method: 'POST', body: { name: 'Limit Test', email: limitEmail, password: 'Password123!', role: 'user' } });
    const wrongTries = [];
    for (let i = 0; i < 11; i++) wrongTries.push((await request('/api/auth/login', { method: 'POST', body: { email: limitEmail, password: 'nope' } })).status);
    assert(wrongTries.slice(0, 10).every(st => st === 401) && wrongTries[10] === 429, `[Re-audit P2-7] 10 wrong passwords -> 401, 11th -> ${wrongTries[10]}`);

    // [Re-audit P2-10] create-admin refuses to run with default credentials
    const noArgsAdmin = spawnSync(process.execPath, ['createAdmin.js'], { cwd: __dirname, env: { ...process.env, MONGO_URI: activeUri }, encoding: 'utf8' });
    assert(noArgsAdmin.status === 1 && /Usage/.test(noArgsAdmin.stderr), '[Re-audit P2-10] create-admin without arguments prints usage and exits');

    // ================= SIGN-UP / LOGIN FIELD VALIDATION =================
    console.log('\n--- TEST 20: Sign-up and login field validation ---');
    let seq = 0;
    const freshEmail = () => `field_${timestamp}_${++seq}@example.com`;
    const signup = (overrides) => request('/api/auth/register', { method: 'POST', body: { name: 'Valid Name', email: freshEmail(), password: 'Password123!', role: 'user', ...overrides } });
    const collectorSignup = (info) => request('/api/auth/register', { method: 'POST', body: { name: 'Field Collector', email: freshEmail(), password: 'Password123!', role: 'collector', collectorInfo: { phone: '9876543210', address: '12 Recycle Road, Bengaluru', vehicleType: 'Truck', vehicleNumberPlate: 'KA01AB1234', experience: '2 years', ...info } } });
    const expectField = async (label, promise, field) => {
      const r = await promise;
      assert(r.status === 400 && r.data?.field === field, `[Field] ${label} -> ${r.status} field=${r.data?.field} "${r.data?.error}"`);
    };

    // Phone: only real 10-digit mobile numbers
    for (const bad of ['-----', '((((', '1', '0000000000', '12', '5876543210', '98765432101', '123456789012345678901234567890', 'abcdefghij']) {
      await expectField(`Phone ${JSON.stringify(bad)} rejected (sign-up)`, signup({ phone: bad }), 'phone');
      await expectField(`Phone ${JSON.stringify(bad)} rejected (collector)`, collectorSignup({ phone: bad }), 'phone');
    }
    const goodPhone = await collectorSignup({ phone: '+91 98765 43210' });
    const goodPhoneDoc = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(goodPhone.data?.collectorId) });
    assert(goodPhone.status === 201 && goodPhoneDoc?.collectorInfo?.phone === '9876543210', `[Field] "+91 98765 43210" accepted and stored as ${goodPhoneDoc?.collectorInfo?.phone}`);

    // Email: tightened format
    for (const bad of ['<script>@x.com', 'a..b@gmail.com', '.abc@gmail.com', 'abc.@gmail.com', 'a"b(c)@x.com', 'user@-gmail.com', 'user@gmail-.com', 'user@xn--.com', '\u202Eabc@x.com', 'a@b', 'plainaddress', 'a b@x.com']) {
      await expectField(`Email ${JSON.stringify(bad)} rejected (sign-up)`, signup({ email: bad }), 'email');
    }
    const loginBadEmail = await request('/api/auth/login', { method: 'POST', body: { email: '<script>@x.com', password: 'Password123!' } });
    assert(loginBadEmail.status === 400 && loginBadEmail.data?.field === 'email', `[Field] Login with malformed email -> ${loginBadEmail.status}`);
    const okEmail = await signup({ email: `John.Doe_99+eco_${timestamp}@College.AC.IN` });
    const okEmailDoc = await db.collection('users').findOne({ email: `john.doe_99+eco_${timestamp}@college.ac.in` });
    assert(okEmail.status === 201 && okEmailDoc, '[Field] Valid email "John.Doe_99+eco@College.AC.IN" accepted and stored in lower case');

    // Name: letters only (any language)
    for (const bad of ['12345', '<script>', '!!!!', 'R2D2', 'a', '-Ravi']) {
      await expectField(`Name ${JSON.stringify(bad)} rejected`, signup({ name: bad }), 'name');
    }
    const telugu = await signup({ name: 'రాము   కుమార్' });
    const teluguDoc = await db.collection('users').findOne({ email: `field_${timestamp}_${seq}@example.com` });
    assert(telugu.status === 201 && teluguDoc?.name === 'రాము కుమార్', `[Field] Telugu name accepted, extra spaces collapsed: "${teluguDoc?.name}"`);

    // Password: needs a letter and a number
    for (const bad of ['aaaaaaaa', '12345678', '        ', 'Pass1']) {
      await expectField(`Password ${JSON.stringify(bad)} rejected`, signup({ password: bad }), 'password');
    }

    // Collector details
    await expectField('Vehicle number "XYZ" rejected', collectorSignup({ vehicleNumberPlate: 'XYZ' }), 'vehicleNumberPlate');
    await expectField('Vehicle number "1234" rejected', collectorSignup({ vehicleNumberPlate: '1234' }), 'vehicleNumberPlate');
    await expectField('Vehicle type "Rocket" rejected', collectorSignup({ vehicleType: 'Rocket' }), 'vehicleType');
    await expectField('Address "   " rejected', collectorSignup({ address: '   ' }), 'address');
    await expectField('Address "12345" (no letters) rejected', collectorSignup({ address: '12345' }), 'address');
    await expectField('Experience "   " rejected', collectorSignup({ experience: '   ' }), 'experience');
    const plateOk = await collectorSignup({ vehicleNumberPlate: 'ka 01 ab 9876' });
    const plateDoc = await db.collection('users').findOne({ _id: new mongoose.Types.ObjectId(plateOk.data?.collectorId) });
    assert(plateOk.status === 201 && plateDoc?.collectorInfo?.vehicleNumberPlate === 'KA01AB9876', `[Field] Vehicle "ka 01 ab 9876" stored as ${plateDoc?.collectorInfo?.vehicleNumberPlate}`);

    // Same phone rule on profile, checkout and organisation forms
    const profilePhone = await request('/api/auth/profile', { method: 'PUT', headers: authHeader(userToken), body: { phone: '-----' } });
    assert(profilePhone.status === 400, `[Field] Profile phone "-----" -> ${profilePhone.status}`);
    const orgPhone = await request('/api/waste-requests/organisation', { method: 'POST', body: { ...orgPayload, contactPhone: '((((' } });
    assert(orgPhone.status === 400, `[Field] Organisation phone "((((" -> ${orgPhone.status}`);

    // ================= FORGOT / RESET PASSWORD =================
    console.log('\n--- TEST 21: Forgot and reset password ---');
    const { outbox } = require('./utils/mailer');
    const resetUser = { name: 'Reset Tester', email: `reset_${timestamp}@example.com`, password: 'OldPass123', role: 'user' };
    const resetReg = await request('/api/auth/register', { method: 'POST', body: resetUser });
    const oldSession = resetReg.data.token;
    const forgot = (email) => request('/api/auth/forgot-password', { method: 'POST', body: { email } });
    const resetWith = (token, password) => request('/api/auth/reset-password', { method: 'POST', body: { token, password } });
    const wait = (ms) => new Promise(r => setTimeout(r, ms));

    const unknownReply = await forgot(`nobody_${timestamp}@example.com`);
    const knownReply = await forgot(resetUser.email.toUpperCase());
    assert(unknownReply.status === 200 && knownReply.status === 200 && unknownReply.data.message === knownReply.data.message,
      '[Reset] Same reply for unknown and known emails (no account enumeration)');
    const badEmailReply = await forgot('not-an-email');
    assert(badEmailReply.status === 400 && badEmailReply.data.field === 'email', '[Reset] Malformed email rejected with 400');

    await wait(200); // the email is sent in the background
    const mail = outbox.filter(m => m.to === resetUser.email).pop();
    const linkToken = mail && (mail.text.match(/reset-password\?token=([a-f0-9]{64})/) || [])[1];
    assert(Boolean(linkToken), '[Reset] Reset email sent containing a single-use link');
    assert(!outbox.some(m => m.to === `nobody_${timestamp}@example.com`), '[Reset] No email sent for an unknown address');
    const storedReset = await db.collection('users').findOne({ email: resetUser.email });
    assert(storedReset.resetPasswordTokenHash && storedReset.resetPasswordTokenHash !== linkToken && storedReset.resetPasswordExpires > new Date(),
      '[Reset] Only a SHA-256 hash of the token is stored, with an expiry');
    const meBefore = await request('/api/auth/me', { headers: authHeader(oldSession) });
    assert(meBefore.status === 200 && !JSON.stringify(meBefore.data).includes('resetPassword'), '[Reset] Token hash is never returned by the API');

    const weakReset = await resetWith(linkToken, 'weakpass');
    assert(weakReset.status === 400 && weakReset.data.field === 'password', '[Reset] Weak new password rejected', JSON.stringify(weakReset.data));
    const badFormat = await resetWith('abc', 'NewPass456');
    assert(badFormat.status === 400 && badFormat.data.field === 'token', '[Reset] Malformed token rejected');
    const wrongToken = await resetWith('a'.repeat(64), 'NewPass456');
    assert(wrongToken.status === 400 && wrongToken.data.field === 'token', '[Reset] Unknown token rejected');

    const goodReset = await resetWith(linkToken, 'NewPass456');
    assert(goodReset.status === 200, '[Reset] Valid token + strong password resets the password', JSON.stringify(goodReset.data));
    const reuse = await resetWith(linkToken, 'Another789');
    assert(reuse.status === 400 && reuse.data.field === 'token', '[Reset] The same link cannot be used twice');

    const oldPwLogin = await request('/api/auth/login', { method: 'POST', body: { email: resetUser.email, password: 'OldPass123' } });
    const newPwLogin = await request('/api/auth/login', { method: 'POST', body: { email: resetUser.email, password: 'NewPass456' } });
    assert(oldPwLogin.status === 401 && newPwLogin.status === 200, `[Reset] Old password stops working (${oldPwLogin.status}), new one works (${newPwLogin.status})`);
    const meOldSession = await request('/api/auth/me', { headers: authHeader(oldSession) });
    assert(meOldSession.status === 401, `[Reset] Sessions from before the reset are signed out (${meOldSession.status} "${meOldSession.data?.error}")`);
    const meNewSession = await request('/api/auth/me', { headers: authHeader(newPwLogin.data.token) });
    assert(meNewSession.status === 200, '[Reset] A session started after the reset works');
    const clearedDoc = await db.collection('users').findOne({ email: resetUser.email });
    assert(!clearedDoc.resetPasswordTokenHash && !clearedDoc.resetPasswordExpires, '[Reset] Token fields are cleared after use');

    // Expired link
    await forgot(resetUser.email);
    await wait(200);
    const expiredToken = (outbox.filter(m => m.to === resetUser.email).pop().text.match(/token=([a-f0-9]{64})/) || [])[1];
    await db.collection('users').updateOne({ email: resetUser.email }, { $set: { resetPasswordExpires: new Date(Date.now() - 1000) } });
    const expiredReset = await resetWith(expiredToken, 'Expired123');
    assert(expiredReset.status === 400 && expiredReset.data.field === 'token', '[Reset] An expired link is rejected');

    // Request limit: 5 reset emails per address per 15 minutes
    const limitStatuses = [];
    for (let i = 0; i < 5; i++) limitStatuses.push((await forgot(resetUser.email)).status);
    assert(limitStatuses.includes(429), `[Reset] Repeated link requests are rate limited (${limitStatuses.join(',')})`);

    // Admin overview numbers come from the database, not hardcoded values
    const statsAsUser = await request('/api/admin/stats', { headers: authHeader(userToken) });
    assert(statsAsUser.status === 403, '[Real stats] Normal user cannot read admin stats', `got ${statsAsUser.status}`);
    const adminStats = await request('/api/admin/stats', { headers: adminHeaders });
    const realUsers = await db.collection('users').countDocuments({ role: 'user' });
    const realCompleted = await db.collection('wasterequests').countDocuments({ collectorStatus: 'completed' });
    assert(adminStats.status === 200 && adminStats.data.stats.totalUsers === realUsers && adminStats.data.stats.completedPickups === realCompleted,
      `[Real stats] Admin stats match the database (users ${adminStats.data?.stats?.totalUsers}/${realUsers}, completed ${adminStats.data?.stats?.completedPickups}/${realCompleted})`);

    console.log('\n====================================================');
    console.log(`🏁 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('ℹ️ Tests executed against isolated in-memory MongoDB');
    console.log('====================================================\n');

  } finally {
    server.close();
    await mongoose.disconnect();
    await mongod.stop();
  }

  process.exit(failed > 0 ? 1 : 0);
};

runAllTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
