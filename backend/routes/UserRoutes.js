const express = require('express');
const router = express.Router();
const User = require('../models/Users');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendError } = require('../utils/sendError');

const adminOnly = [authMiddleware, requireRole(['admin'])];

// PUT /api/users/approve-collector/:id
router.put('/approve-collector/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    // Validate request
    if (typeof isApproved !== 'boolean') {
      return res.status(400).json({ success: false, message: '`isApproved` must be a boolean value.' });
    }

    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role !== 'collector') {
      return res.status(400).json({ success: false, message: 'This user is not a collector' });
    }

    if (!user.collectorInfo) {
      user.collectorInfo = {};
    }

    user.collectorInfo.isApproved = isApproved;
    user.collectorInfo.status = isApproved ? 'approved' : 'rejected';

    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: isApproved ? 'Collector approved successfully' : 'Collector approval revoked',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        collectorInfo: user.collectorInfo
      }
    });

  } catch (error) {
    sendError(res, error, 'Server error');
  }
});

// PATCH /api/users/:id/coins (and points)
const updatePointsHandler = async (req, res) => {
  try {
    const change = Number(req.body.coinsChange ?? req.body.pointsChange ?? req.body.amount ?? 0);
    if (!Number.isFinite(change)) {
      return res.status(400).json({ success: false, message: 'coinsChange must be a number' });
    }
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.points = (user.points || 0) + change;
    if (user.points < 0) user.points = 0; // Prevent negative points

    await user.save({ validateBeforeSave: false });

    res.json({
      success: true,
      message: 'Points updated successfully',
      points: user.points,
      coins: user.points
    });
  } catch (error) {
    sendError(res, error, 'Server error');
  }
};

router.patch('/:id/coins', adminOnly, updatePointsHandler);
router.patch('/:id/points', adminOnly, updatePointsHandler);

// GET /api/users/leaderboard - all users sorted by points (descending)
router.get('/leaderboard', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('name points createdAt')
      .sort({ points: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      leaderboard: users
    });
  } catch (error) {
    sendError(res, error, 'Server error');
  }
});

module.exports = router;
