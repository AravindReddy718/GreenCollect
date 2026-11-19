const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/Users');

const router = express.Router();

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in backend/.env');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const { authMiddleware } = require('../middleware/auth');

const { EMAIL_RE } = require('../utils/validation');
const { validationMessage } = require('../utils/sendError');

// Failed-login limit: 10 wrong attempts per IP + email in 15 minutes, then 429
const FAILED_LOGIN_LIMIT = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map();

const isLoginBlocked = (key) => {
  const entry = failedLogins.get(key);
  if (!entry) return false;
  if (Date.now() - entry.first > FAILED_LOGIN_WINDOW_MS) {
    failedLogins.delete(key);
    return false;
  }
  return entry.count >= FAILED_LOGIN_LIMIT;
};

const recordFailedLogin = (key) => {
  const entry = failedLogins.get(key);
  if (!entry || Date.now() - entry.first > FAILED_LOGIN_WINDOW_MS) {
    failedLogins.set(key, { count: 1, first: Date.now() });
  } else {
    entry.count += 1;
  }
};

// Drop expired entries so the map cannot grow without limit
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of failedLogins) {
    if (now - entry.first > FAILED_LOGIN_WINDOW_MS) failedLogins.delete(key);
  }
}, FAILED_LOGIN_WINDOW_MS).unref();

/**
 * POST /register
 * Body: { name, email, password, role, collectorInfo? }
 * collectorInfo only used when role === 'collector'
 */
router.post('/register', async (req, res) => {
  try {
    const { name, password, role, collectorInfo, phone } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';

    if (typeof name !== 'string' || !email || typeof password !== 'string' || !password || !role) {
      return res.status(400).json({ 
        success: false,
        error: 'name, email, password and role are required' 
      });
    }

    // Admin accounts are created only with `npm run create-admin`
    if (!['user', 'collector'].includes(role)) {
      return res.status(400).json({ 
        success: false,
        error: 'role must be user or collector' 
      });
    }

    if (email.length > 254 || !EMAIL_RE.test(email)) {
      return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
    }

    const trimmedName = name.trim();
    if (trimmedName.length < 2 || trimmedName.length > 50) {
      return res.status(400).json({ success: false, error: 'Name must be 2-50 characters' });
    }

    // bcrypt ignores bytes after 72, so cap there
    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({ success: false, error: 'Password must be 8-72 characters' });
    }

    // If collector, ensure required collector fields exist
    if (role === 'collector') {
      const required = ['phone', 'address', 'vehicleType', 'vehicleNumberPlate'];
      const missing = required.filter(f => !collectorInfo || !collectorInfo[f]);
      if (missing.length) {
        return res.status(400).json({ 
          success: false,
          error: `collectorInfo missing fields: ${missing.join(', ')}` 
        });
      }
    }

    // Check existing email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ 
        success: false,
        error: 'Email already in use' 
      });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const userData = {
      name: trimmedName,
      email,
      password: hashed,
      role,
      phone: phone || '',
      points: 0, // NEW USERS START WITH 0 COINS
      memberSince: new Date()
    };

    // ✅ If role is collector, mark as unapproved initially
    if (role === 'collector') {
      userData.collectorInfo = {
        phone: collectorInfo.phone,
        address: collectorInfo.address,
        vehicleType: collectorInfo.vehicleType,
        vehicleNumberPlate: collectorInfo.vehicleNumberPlate,
        experience: collectorInfo.experience || '',
        isApproved: false, // 🔥 Key line
        status: 'pending'  // 🔥 For admin UI clarity
      };
    }

    const user = new User(userData);
    await user.save();

    // ✅ For collectors, don't auto-login
    if (role === 'collector') {
      return res.status(201).json({
        success: true,
        message: 'Collector registration submitted for admin approval.',
        collectorId: user._id,
        status: 'pending'
      });
    }

    // ✅ For users/admins, generate JWT immediately
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const userSafe = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points || 0,
      phone: user.phone,
      memberSince: user.memberSince
    };

    return res.status(201).json({ 
      success: true,
      message: 'User registered successfully',
      user: userSafe, 
      token 
    });

  } catch (err) {
    const invalid = validationMessage(err);
    if (invalid) {
      return res.status(400).json({ success: false, error: invalid });
    }
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'Email already in use' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

/**
 * POST /login
 * Body: { email, password }
 */
router.post('/login', async (req, res) => {
  try {
    const { password } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!email || typeof password !== 'string' || !password) {
      return res.status(400).json({ 
        success: false,
        error: 'Email and password required' 
      });
    }

    const limitKey = `${req.ip}|${email}`;
    if (isLoginBlocked(limitKey)) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed login attempts. Please try again in 15 minutes.'
      });
    }
    // Count the attempt before any await, so a burst of parallel guesses is limited too;
    // a successful login clears it below
    recordFailedLogin(limitKey);

    const user = await User.findOne({ email });
    const ok = user ? await bcrypt.compare(password, user.password) : false;
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    failedLogins.delete(limitKey);

    // Approval is checked only after the password, so it never reveals which accounts exist
    if (user.role === 'collector' && !user.collectorInfo?.isApproved) {
      const rejected = user.collectorInfo?.status === 'rejected';
      return res.status(403).json({
        success: false,
        error: rejected
          ? 'Your collector application was rejected. Please contact support.'
          : 'Collector not yet approved by admin. Please wait for approval.'
      });
    }
        
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    const userSafe = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points || 0,
      phone: user.phone,
      memberSince: user.memberSince,
      avatar: user.avatar,
      collectorInfo: user.collectorInfo
    };

    return res.json({ 
      success: true,
      message: 'Login successful',
      user: userSafe, 
      token 
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// GET /api/auth/profile
router.get('/profile', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    if (!user) {
      return res.status(404).json({ 
        success: false,
        error: 'User not found' 
      });
    }

    res.json({ 
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points || 0,
        phone: user.phone,
        memberSince: user.memberSince,
        avatar: user.avatar,
        collectorInfo: user.collectorInfo,
        wasteRequests: user.wasteRequests,
        completedPickups: user.completedPickups || []
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// GET /api/auth/me - Get current user data
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points || 0,
        phone: user.phone,
        memberSince: user.memberSince,
        avatar: user.avatar,
        collectorInfo: user.collectorInfo
      }
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching user data'
    });
  }
});

// PUT /api/auth/profile - Update user profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, avatar } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Update fields
    if (name !== undefined) {
      if (typeof name !== 'string') return res.status(400).json({ success: false, message: 'Name must be text' });
      user.name = name;
    }
    if (phone !== undefined && phone !== '') {
      if (typeof phone !== 'string') return res.status(400).json({ success: false, message: 'Phone must be text' });
      user.phone = phone;
    }
    if (avatar !== undefined && avatar !== '') {
      if (typeof avatar !== 'string' || avatar.length > 500 || !/^https?:\/\//i.test(avatar.trim())) {
        return res.status(400).json({ success: false, message: 'Avatar must be an http(s) image URL under 500 characters' });
      }
      user.avatar = avatar.trim();
    }

    // Validate only what changed, so older accounts are never blocked by newer rules on untouched fields
    await user.save({ validateModifiedOnly: true });

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        points: user.points || 0,
        phone: user.phone,
        memberSince: user.memberSince,
        avatar: user.avatar,
        collectorInfo: user.collectorInfo
      }
    });
  } catch (error) {
    const invalid = validationMessage(error);
    if (invalid) {
      return res.status(400).json({ success: false, message: invalid });
    }
    console.error('Error updating profile:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// GET /api/auth/coins - Get user's coin balance
router.get('/coins', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('points');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      coins: user.points || 0
    });
  } catch (error) {
    console.error('Error fetching coins:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching coins'
    });
  }
});

// GET /api/auth/pickup-history - Get user's completed pickups
router.get('/pickup-history', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId)
      .select('completedPickups')
      .populate('completedPickups.requestId', 'wasteType estimatedWeight pickupDate');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.status(200).json({
      success: true,
      completedPickups: user.completedPickups || []
    });
  } catch (error) {
    console.error('Error fetching pickup history:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching pickup history'
    });
  }
});

module.exports = router;