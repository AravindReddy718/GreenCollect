// routes/admin.js
const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const User = require('../models/Users');
const WasteRequest = require('../models/WasteRequest');
const Order = require('../models/Order');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendError } = require('../utils/sendError');

// Every /api/admin route requires a logged-in admin
router.use(authMiddleware, requireRole(['admin']));

// Real platform numbers for the admin overview
router.get('/stats', async (req, res) => {
  try {
    const [totalUsers, approvedCollectors, completedPickups, wasteAgg, coinsAgg, topCollectors] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'collector', 'collectorInfo.isApproved': true }),
      WasteRequest.countDocuments({ collectorStatus: 'completed' }),
      WasteRequest.aggregate([
        { $match: { collectorStatus: 'completed' } },
        { $group: { _id: null, kg: { $sum: '$estimatedWeight' } } }
      ]),
      Order.aggregate([{ $group: { _id: null, coins: { $sum: '$totalCoins' } } }]),
      WasteRequest.aggregate([
        { $match: { collectorStatus: 'completed', assignedCollector: { $ne: null } } },
        { $group: { _id: '$assignedCollector', completedPickups: { $sum: 1 } } },
        { $sort: { completedPickups: -1 } },
        { $limit: 5 },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'collector' } },
        { $unwind: '$collector' },
        { $project: { _id: 0, id: '$_id', name: '$collector.name', completedPickups: 1 } }
      ])
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        approvedCollectors,
        completedPickups,
        wasteRecycledKg: Math.round(wasteAgg[0]?.kg || 0),
        coinsRedeemed: coinsAgg[0]?.coins || 0,
        topCollectors
      }
    });
  } catch (err) {
    sendError(res, err, 'Server error while loading stats');
  }
});

// Get all collector requests
router.get('/collector-requests', async (req, res) => {
  try {
    const collectors = await User.find({ 
      role: 'collector'
    }).select('name email role collectorInfo createdAt').lean();
    
    // Transform the data for frontend
    const transformedData = collectors.map(user => ({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      collectorInfo: {
        phone: user.collectorInfo?.phone || 'N/A',
        address: user.collectorInfo?.address || 'N/A',
        vehicleType: user.collectorInfo?.vehicleType || 'N/A',
        vehicleNumberPlate: user.collectorInfo?.vehicleNumberPlate || 'N/A',
        experience: user.collectorInfo?.experience || 'No experience provided',
        isApproved: user.collectorInfo?.isApproved || false,
        status: user.collectorInfo?.status || (user.collectorInfo?.isApproved ? 'approved' : 'pending')
      }
    }));
    
    res.json(transformedData);
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

// Approve collector request (supports both POST and PUT)
const approveCollectorHandler = async (req, res) => {
  try {
    const collector = await User.findById(req.params.id);
    if (!collector) {
      return res.status(404).json({ success: false, error: 'Collector not found' });
    }

    if (!collector.collectorInfo) {
      collector.collectorInfo = {};
    }

    collector.collectorInfo.isApproved = true;
    collector.collectorInfo.status = 'approved';
    
    await collector.save({ validateBeforeSave: false });

    res.json({ 
      success: true,
      message: 'Collector approved successfully', 
      collector: {
        id: collector._id,
        name: collector.name,
        email: collector.email,
        status: 'approved'
      }
    });
  } catch (err) {
    sendError(res, err, 'Server error');
  }
};

router.post('/approve-collector/:id', approveCollectorHandler);
router.put('/approve-collector/:id', approveCollectorHandler);

// Reject collector request (supports both POST and PUT)
const rejectCollectorHandler = async (req, res) => {
  try {
    const collector = await User.findById(req.params.id);
    if (!collector) {
      return res.status(404).json({ success: false, error: 'Collector not found' });
    }

    if (!collector.collectorInfo) {
      collector.collectorInfo = {};
    }

    collector.collectorInfo.isApproved = false;
    collector.collectorInfo.status = 'rejected';
    
    await collector.save({ validateBeforeSave: false });

    res.json({ 
      success: true,
      message: 'Collector rejected successfully',
      collector: {
        id: collector._id,
        name: collector.name,
        email: collector.email,
        status: 'rejected'
      }
    });
  } catch (err) {
    sendError(res, err, 'Server error');
  }
};

router.post('/reject-collector/:id', rejectCollectorHandler);
router.put('/reject-collector/:id', rejectCollectorHandler);

module.exports = router;

// Admin endpoints for organisation requests
// Accept organisation request
router.post('/organisation-requests/:id/accept', async (req, res) => {
  try {
    const reqId = req.params.id;
    const wr = await WasteRequest.findById(reqId);
    if (!wr) return res.status(404).json({ success: false, message: 'Organisation request not found' });

    if (wr.collectorStatus !== 'pending') {
      return res.status(400).json({ success: false, message: `Request already ${wr.collectorStatus}` });
    }

    // Accepting assigns the request to an approved collector so it appears in their dashboard
    const { collectorId } = req.body || {};
    const collector = mongoose.isValidObjectId(collectorId)
      ? await User.findOne({ _id: collectorId, role: 'collector', 'collectorInfo.isApproved': true })
      : null;
    if (!collector) {
      return res.status(400).json({ success: false, message: 'Choose an approved collector to assign' });
    }

    wr.collectorStatus = 'accepted';
    wr.assignedCollector = collector._id;
    await wr.save();

    res.json({ success: true, message: `Organisation request assigned to ${collector.name}`, request: wr });
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});

// Reject organisation request
router.post('/organisation-requests/:id/reject', async (req, res) => {
  try {
    const reqId = req.params.id;
    const wr = await WasteRequest.findById(reqId);
    if (!wr) return res.status(404).json({ success: false, message: 'Organisation request not found' });

    wr.collectorStatus = 'rejected';
    await wr.save();

    res.json({ success: true, message: 'Organisation request rejected', request: wr });
  } catch (err) {
    sendError(res, err, 'Server error');
  }
});
