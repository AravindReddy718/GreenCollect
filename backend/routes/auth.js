const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/Users');

const router = express.Router();

const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET must be set in backend/.env');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

const { authMiddleware } = require('../middleware/auth');

const {
  isValidEmail,
  normalizePhone,
  PHONE_MESSAGE,
  normalizeName,
  isValidName,
  NAME_MESSAGE,
  passwordError,
  VEHICLE_TYPES,
  normalizeVehicleNumber
} = require('../utils/validation');
const { validationMessage } = require('../utils/sendError');
const { createLimiter } = require('../utils/rateLimit');
const { sendMail } = require('../utils/mailer');

// Failed-login limit: 10 attempts per IP + email in 15 minutes, then 429
const loginLimiter = createLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });
// Password-reset limits: 5 link requests per IP + email, 20 reset attempts per IP, per 15 minutes
const forgotLimiter = createLimiter({ limit: 5, windowMs: 15 * 60 * 1000 });
const resetLimiter = createLimiter({ limit: 20, windowMs: 15 * 60 * 1000 });
// Change-password limit: 10 attempts per signed-in user per 15 minutes (stops guessing the current password)
const changeLimiter = createLimiter({ limit: 10, windowMs: 15 * 60 * 1000 });

const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * POST /register
 * Body: { name, email, password, role, collectorInfo? }
 * collectorInfo only used when role === 'collector'
 */
router.post('/register', async (req, res) => {
  try {
    const { name, password, role, collectorInfo, phone } = req.body;
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    // Every error names the field, so the form can show it next to the right input
    const fail = (field, error) => res.status(400).json({ success: false, field, error });

    // Admin accounts are created only with `npm run create-admin`
    if (!['user', 'collector'].includes(role)) {
      return fail('role', 'Please choose Community Member or Eco Collector');
    }
    if (!isValidName(name)) return fail('name', NAME_MESSAGE);
    if (!isValidEmail(email)) return fail('email', 'Please enter a valid email address');
    const invalidPassword = passwordError(password);
    if (invalidPassword) return fail('password', invalidPassword);

    // Optional phone for community members
    let userPhone = '';
    if (phone !== undefined && phone !== null && phone !== '') {
      userPhone = normalizePhone(phone);
      if (!userPhone) return fail('phone', PHONE_MESSAGE);
    }

    // Collectors must give valid contact and vehicle details
    let collectorData = null;
    if (role === 'collector') {
      const info = collectorInfo && typeof collectorInfo === 'object' ? collectorInfo : {};
      const collectorPhone = normalizePhone(info.phone);
      if (!collectorPhone) return fail('phone', PHONE_MESSAGE);
      const address = typeof info.address === 'string' ? info.address.trim() : '';
      if (address.length < 5 || address.length > 200 || !/\p{L}/u.test(address)) {
        return fail('address', 'Address must be 5-200 characters and include letters');
      }
      if (!VEHICLE_TYPES.includes(info.vehicleType)) return fail('vehicleType', 'Please choose a vehicle type');
      const plate = normalizeVehicleNumber(info.vehicleNumberPlate);
      if (!plate) return fail('vehicleNumberPlate', 'Enter a valid vehicle number, e.g. KA01AB1234');
      const experience = typeof info.experience === 'string' ? info.experience.trim() : '';
      if (experience.length < 2 || experience.length > 500) {
        return fail('experience', 'Experience must be 2-500 characters');
      }
      collectorData = {
        phone: collectorPhone,
        address,
        vehicleType: info.vehicleType,
        vehicleNumberPlate: plate,
        experience,
        isApproved: false,
        status: 'pending'
      };
    }

    // Check existing email
    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({
        success: false,
        field: 'email',
        error: 'Email already in use'
      });
    }

    // Hash password
    const hashed = await bcrypt.hash(password, SALT_ROUNDS);

    const userData = {
      name: normalizeName(name),
      email,
      password: hashed,
      role,
      phone: userPhone,
      points: 0, // NEW USERS START WITH 0 COINS
      memberSince: new Date()
    };

    // Collectors start unapproved; an admin reviews them
    if (collectorData) {
      userData.collectorInfo = collectorData;
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
    const token = jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    const userSafe = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points || 0,
      phone: user.phone,
      memberSince: user.memberSince || user.createdAt
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
      return res.status(409).json({ success: false, field: 'email', error: 'Email already in use' });
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
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, field: 'email', error: 'Please enter a valid email address' });
    }

    const limitKey = `${req.ip}|${email}`;
    if (loginLimiter.isBlocked(limitKey)) {
      return res.status(429).json({
        success: false,
        error: 'Too many failed login attempts. Please try again in 15 minutes.'
      });
    }
    // Count the attempt before any await, so a burst of parallel guesses is limited too;
    // a successful login clears it below
    loginLimiter.hit(limitKey);

    const user = await User.findOne({ email });
    const ok = user ? await bcrypt.compare(password, user.password) : false;
    if (!ok) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }
    loginLimiter.reset(limitKey);

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
        
    const token = jwt.sign({ id: user._id, role: user.role, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    
    const userSafe = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      points: user.points || 0,
      phone: user.phone,
      memberSince: user.memberSince || user.createdAt,
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

/**
 * POST /api/auth/forgot-password
 * Body: { email }
 * Always answers the same way, so it never reveals whether an account exists.
 */
const FORGOT_REPLY = 'If an account exists for that email, a password reset link has been sent.';

router.post('/forgot-password', async (req, res) => {
  try {
    const email = typeof req.body.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    if (!isValidEmail(email)) {
      return res.status(400).json({ success: false, field: 'email', error: 'Please enter a valid email address' });
    }

    const limitKey = `${req.ip}|${email}`;
    if (forgotLimiter.isBlocked(limitKey)) {
      return res.status(429).json({ success: false, error: 'Too many reset requests. Please try again in 15 minutes.' });
    }
    forgotLimiter.hit(limitKey);

    const user = await User.findOne({ email }).select('_id name email');
    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      await User.updateOne(
        { _id: user._id },
        { $set: { resetPasswordTokenHash: hashToken(token), resetPasswordExpires: new Date(Date.now() + RESET_TOKEN_TTL_MS) } }
      );

      const appUrl = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
      const link = `${appUrl}/reset-password?token=${token}`;
      // Sent in the background so the reply time is the same whether or not the account exists
      sendMail({
        to: user.email,
        subject: 'Reset your Janatha Garage password',
        text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 30 minutes):\n${link}\n\nIf you did not ask for this, you can ignore this email; your password stays the same.`,
        html: `<p>Hi ${user.name.replace(/[<>&"']/g, '')},</p>
<p>Use the button below to choose a new password. The link is valid for 30 minutes.</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#ffcc00;color:#000;border-radius:8px;text-decoration:none;font-weight:600">Reset password</a></p>
<p>If you did not ask for this, you can ignore this email; your password stays the same.</p>`
      }).catch(err => console.error('Password reset email failed:', err.message));
    }

    res.json({ success: true, message: FORGOT_REPLY });
  } catch (err) {
    console.error('Forgot password error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/reset-password
 * Body: { token, password }
 * The token is single-use and expires 30 minutes after it was requested.
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (resetLimiter.isBlocked(req.ip)) {
      return res.status(429).json({ success: false, error: 'Too many attempts. Please try again in 15 minutes.' });
    }
    resetLimiter.hit(req.ip);

    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      return res.status(400).json({ success: false, field: 'token', error: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    const invalidPassword = passwordError(password);
    if (invalidPassword) return res.status(400).json({ success: false, field: 'password', error: invalidPassword });

    const hashed = await bcrypt.hash(password, SALT_ROUNDS);
    // Atomic: the token is consumed in the same step that sets the new password, so it works only once
    const user = await User.findOneAndUpdate(
      { resetPasswordTokenHash: hashToken(token), resetPasswordExpires: { $gt: new Date() } },
      {
        $set: { password: hashed },
        $inc: { tokenVersion: 1 },
        $unset: { resetPasswordTokenHash: '', resetPasswordExpires: '' }
      },
      { new: true }
    ).select('email');

    if (!user) {
      return res.status(400).json({ success: false, field: 'token', error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    loginLimiter.reset(`${req.ip}|${user.email}`);
    res.json({ success: true, message: 'Your password has been reset. Please log in with your new password.' });
  } catch (err) {
    console.error('Reset password error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

/**
 * PUT /api/auth/change-password
 * Body: { currentPassword, newPassword }
 * Signed-in users change their password. Other devices are signed out; this device gets a fresh token.
 */
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    // 400 (not 401) for a wrong current password, so the app does not treat it as an expired session
    const fail = (field, error) => res.status(400).json({ success: false, field, error });

    if (changeLimiter.isBlocked(req.userId)) {
      return res.status(429).json({ success: false, error: 'Too many attempts. Please try again in 15 minutes.' });
    }
    if (typeof currentPassword !== 'string' || !currentPassword) {
      return fail('currentPassword', 'Please enter your current password');
    }
    const invalidPassword = passwordError(newPassword);
    if (invalidPassword) return fail('newPassword', invalidPassword);

    const user = await User.findById(req.userId).select('password');
    changeLimiter.hit(req.userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return fail('currentPassword', 'Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return fail('newPassword', 'New password must be different from your current password');
    }

    const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      {
        $set: { password: hashed },
        $inc: { tokenVersion: 1 },
        $unset: { resetPasswordTokenHash: '', resetPasswordExpires: '' }
      },
      { new: true }
    ).select('role tokenVersion');

    changeLimiter.reset(req.userId);
    const token = jwt.sign({ id: updated._id, role: updated.role, tv: updated.tokenVersion || 0 }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ success: true, message: 'Password changed. Any other devices have been signed out.', token });
  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
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
        memberSince: user.memberSince || user.createdAt,
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
        memberSince: user.memberSince || user.createdAt,
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
      if (!isValidName(name)) return res.status(400).json({ success: false, field: 'name', message: NAME_MESSAGE });
      user.name = normalizeName(name);
    }
    if (phone !== undefined && phone !== '') {
      const normalizedPhone = normalizePhone(phone);
      if (!normalizedPhone) return res.status(400).json({ success: false, field: 'phone', message: PHONE_MESSAGE });
      user.phone = normalizedPhone;
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
        memberSince: user.memberSince || user.createdAt,
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