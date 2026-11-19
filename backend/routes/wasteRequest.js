const express = require('express');
const router = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');
const WasteRequest = require('../models/WasteRequest');
const User = require('../models/Users');
const CollectorActivity = require('../models/CollectorActivity');
const Notification = require('../models/Notification');
const { sendError } = require('../utils/sendError');
const { isValidEmail } = require('../utils/validation');

// Validates a pickup date: must parse, must not be before today and must be within 90 days.
// Returns an error message or null.
function pickupDateError(pickupDate) {
  const when = new Date(pickupDate);
  if (Number.isNaN(when.getTime())) return 'Invalid pickup date';
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  // Date-only strings parse as UTC midnight; compare on the calendar date
  const day = new Date(when.getUTCFullYear(), when.getUTCMonth(), when.getUTCDate());
  if (day < startOfToday) return 'Pickup date cannot be in the past';
  if (day > new Date(startOfToday.getTime() + MAX_DAYS_AHEAD * 86400000)) {
    return `Pickup date must be within ${MAX_DAYS_AHEAD} days`;
  }
  return null;
}

const MAX_DAYS_AHEAD = 90;
const MAX_ADDRESS_LENGTH = 300;
const MAX_INSTRUCTIONS_LENGTH = 500;
const MAX_PICKUP_WEIGHT_KG = 100;
const MAX_ORGANISATION_WEIGHT_KG = 10000;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

// Helper function to calculate coins value
function calculateCoinsValue(weight, wasteType) {
  const baseValue = weight * 10;
  let multiplier = 1;

  switch (wasteType.toLowerCase()) {
    case 'electronics':
      multiplier = 1.5;
      break;
    case 'metal':
      multiplier = 1.3;
      break;
    case 'plastic':
      multiplier = 1.2;
      break;
    case 'paper':
      multiplier = 1.1;
      break;
    default:
      multiplier = 1;
  }

  return Math.round(baseValue * multiplier);
}

// Notifications are a nice-to-have: never fail the main action because one could not be stored
async function notifyUser(userId, message, type = 'info') {
  if (!userId) return;
  try {
    await Notification.create({ userId, message, type });
  } catch (err) {
    console.error('Could not create notification:', err.message);
  }
}

// Shape used by the user-facing request lists
function formatUserRequest(request) {
  return {
    _id: request._id,
    userId: {
      _id: request.user._id,
      name: request.user.name,
      email: request.user.email,
      phone: request.user.phone || 'Not provided'
    },
    pickupAddress: request.pickupAddress,
    wasteType: request.wasteType,
    estimatedWeight: request.estimatedWeight,
    pickupDate: request.pickupDate.toISOString().split('T')[0],
    pickupTime: request.pickupTime,
    status: request.collectorStatus,
    priority: request.priority || 'medium',
    instructions: request.instructions,
    coinsValue: calculateCoinsValue(request.estimatedWeight, request.wasteType),
    createdAt: request.createdAt,
    collectorId: request.assignedCollector?._id,
    assignedCollector: request.assignedCollector ? {
      _id: request.assignedCollector._id,
      name: request.assignedCollector.name,
      email: request.assignedCollector.email
    } : undefined
  };
}

// @route   GET /api/waste-requests
// @desc    Collectors: pending requests (minus ones they rejected) and their own requests.
//          Admins: every request.
// @access  Private (Collectors and admins)
router.get('/', authMiddleware, requireRole(['collector', 'admin']), async (req, res) => {
  try {
    const { status } = req.query;
    const collectorId = req.user.id;
    const isAdmin = req.user.role === 'admin';

    const query = {};
    if (status && status !== 'all') {
      query.collectorStatus = String(status);
      // Collectors only see other collectors' requests while they are still pending
      if (!isAdmin && status !== 'pending') query.assignedCollector = collectorId;
    } else if (!isAdmin) {
      query.$or = [
        { collectorStatus: 'pending' },
        { assignedCollector: collectorId }
      ];
    }

    if (!isAdmin) {
      // A collector's rejection hides the request from that collector only
      const rejectedIds = await CollectorActivity.distinct('wasteRequestId', { collectorId, status: 'rejected' });
      if (rejectedIds.length) query._id = { $nin: rejectedIds };
    }

    const requests = await WasteRequest.find(query)
      .populate('user', 'name email phone')
      .populate('assignedCollector', 'name email')
      .sort({ createdAt: -1 });

    const formattedRequests = requests.map(request => {
      // If the request has a linked user, use that. Otherwise fall back to organisation info.
      const userInfo = request.user ? {
        _id: request.user._id,
        name: request.user.name,
        email: request.user.email,
        phone: request.user.phone || 'Not provided'
      } : {
        _id: null,
        name: request.organisationName || 'Organisation Request',
        email: request.contactEmail || 'Not provided',
        phone: request.organisationContactPhone || 'Not provided'
      };

      return {
        _id: request._id,
        userId: userInfo,
        pickupAddress: request.pickupAddress,
        wasteType: request.wasteType || (request.wasteTypes ? request.wasteTypes.join(', ') : 'mixed'),
        estimatedWeight: request.estimatedWeight,
        pickupDate: request.pickupDate ? request.pickupDate.toISOString().split('T')[0] : null,
        pickupTime: request.pickupTime,
        status: request.collectorStatus,
        priority: request.priority || 'medium',
        instructions: request.instructions,
        coinsValue: calculateCoinsValue(request.estimatedWeight || 0, request.wasteType || 'mixed'),
        createdAt: request.createdAt,
        collectorId: request.assignedCollector?._id
      };
    });

    res.status(200).json(formattedRequests);
  } catch (error) {
    sendError(res, error, 'Server error while fetching requests');
  }
});

// @route   GET /api/waste-requests/my-requests
// @desc    Get current user's waste requests
// @access  Private
router.get('/my-requests', authMiddleware, async (req, res) => {
  try {
    const userRequests = await WasteRequest.find({ user: req.user.id })
      .populate('user', 'name email phone')
      .populate('assignedCollector', 'name email')
      .sort({ createdAt: -1 });

    const formattedRequests = userRequests.map(formatUserRequest);

    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching requests');
  }
});

// @route   POST /api/waste-requests
// @desc    Create a new waste pickup request
// @access  Private
router.post('/', authMiddleware, async (req, res) => {
  try {
    const {
      pickupDate,
      pickupTime,
      wasteType,
      estimatedWeight,
      pickupAddress,
      contactNumber,
      instructions
    } = req.body;

    const userId = req.user.id;

    // Validation
    if (!pickupDate || !pickupTime || !wasteType || !estimatedWeight || !pickupAddress) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be filled'
      });
    }

    const weight = parseFloat(estimatedWeight);
    if (isNaN(weight) || weight <= 0 || weight > MAX_PICKUP_WEIGHT_KG) {
      return res.status(400).json({
        success: false,
        message: `Estimated weight must be between 0 and ${MAX_PICKUP_WEIGHT_KG} kg`
      });
    }

    const dateError = pickupDateError(pickupDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    if (!TIME_RE.test(String(pickupTime))) {
      return res.status(400).json({ success: false, message: 'Invalid pickup time' });
    }

    if (typeof pickupAddress !== 'string' || !pickupAddress.trim() || pickupAddress.length > MAX_ADDRESS_LENGTH) {
      return res.status(400).json({ success: false, message: `Pickup address must be 1-${MAX_ADDRESS_LENGTH} characters` });
    }

    if (instructions && String(instructions).length > MAX_INSTRUCTIONS_LENGTH) {
      return res.status(400).json({ success: false, message: `Instructions must be at most ${MAX_INSTRUCTIONS_LENGTH} characters` });
    }

    const user = await User.findById(userId).select('name email');
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const newRequest = new WasteRequest({
      user: userId,
      pickupDate: new Date(pickupDate),
      pickupTime,
      wasteType,
      estimatedWeight: weight,
      pickupAddress,
      contactNumber: contactNumber || 'Not provided',
      instructions: instructions || 'None',
      collectorStatus: 'pending',
      collectionStatus: 'not_collected'
    });

    const savedRequest = await newRequest.save();

    // Add to user's wasteRequests array
    await User.updateOne({ _id: userId }, { $push: { wasteRequests: savedRequest._id } });

    res.status(201).json({
      success: true,
      message: 'Waste pickup scheduled successfully!',
      request: {
        id: savedRequest._id,
        pickupDate: savedRequest.pickupDate,
        pickupTime: savedRequest.pickupTime,
        wasteType: savedRequest.wasteType,
        estimatedWeight: savedRequest.estimatedWeight,
        pickupAddress: savedRequest.pickupAddress,
        contactNumber: savedRequest.contactNumber,
        instructions: savedRequest.instructions,
        status: savedRequest.collectorStatus,
        userName: user.name,
        userEmail: user.email,
        coinsValue: calculateCoinsValue(savedRequest.estimatedWeight, savedRequest.wasteType)
      }
    });
  } catch (error) {
    sendError(res, error, 'Server error while scheduling pickup');
  }
});

// @route   POST /api/waste-requests/organisation
// @desc    Public endpoint for organisations to request a dedicated collection
// @access  Public
router.post('/organisation', async (req, res) => {
  try {
    const {
      organisationName,
      organisationType,
      contactName,
      contactEmail,
      contactPhone,
      pickupAddress,
      wasteTypes,
      estimatedWeight,
      pickupDate,
      pickupTime,
      instructions
    } = req.body;

    // Basic validation
    if (!organisationName || !pickupAddress || !wasteTypes || !pickupDate || !pickupTime) {
      return res.status(400).json({ success: false, message: 'Missing required organisation fields' });
    }

    const dateError = pickupDateError(pickupDate);
    if (dateError) {
      return res.status(400).json({ success: false, message: dateError });
    }

    if (typeof pickupAddress !== 'string' || pickupAddress.length > MAX_ADDRESS_LENGTH) {
      return res.status(400).json({ success: false, message: `Pickup address must be at most ${MAX_ADDRESS_LENGTH} characters` });
    }

    if (contactEmail && !isValidEmail(contactEmail)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid contact email' });
    }

    const weight = parseFloat(estimatedWeight) || 0;
    if (weight < 0 || weight > MAX_ORGANISATION_WEIGHT_KG) {
      return res.status(400).json({ success: false, message: `Estimated weight must be 0-${MAX_ORGANISATION_WEIGHT_KG} kg` });
    }

    // Normalize wasteTypes and pick a primary wasteType compatible with schema enum
    const normalizedWasteTypes = Array.isArray(wasteTypes)
      ? wasteTypes.map(s => String(s).trim().toLowerCase())
      : String(wasteTypes).split(',').map(s => s.trim().toLowerCase());

    const allowedTypes = ['plastic', 'paper', 'electronics', 'metal', 'glass', 'organic', 'mixed'];
    const primaryType = normalizedWasteTypes.find(w => allowedTypes.includes(w)) || 'mixed';

    const newRequest = new WasteRequest({
      isOrganisationRequest: true,
      organisationName,
      organisationType,
      organisationContactName: contactName,
      contactEmail,
      organisationContactPhone: contactPhone,
      pickupAddress,
      wasteTypes: normalizedWasteTypes,
      wasteType: primaryType,
      estimatedWeight: weight,
      pickupDate: new Date(pickupDate),
      pickupTime,
      instructions: instructions || 'None',
      collectorStatus: 'pending',
      collectionStatus: 'not_collected'
    });

    const savedRequest = await newRequest.save();

    res.status(201).json({
      success: true,
      message: 'Organisation collection request submitted successfully',
      request: savedRequest
    });
  } catch (error) {
    sendError(res, error, 'Server error while submitting organisation request');
  }
});

// @route   PUT /api/waste-requests/:requestId/accept
// @desc    Collector accepts a waste request
// @access  Private (Collectors only)
router.put('/:requestId/accept', authMiddleware, requireRole(['collector']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const collectorId = req.user.id;

    // Atomic: only one collector can move a request out of "pending"
    const updatedRequest = await WasteRequest.findOneAndUpdate(
      { _id: requestId, collectorStatus: 'pending' },
      { $set: { collectorStatus: 'accepted', assignedCollector: collectorId, collectionStatus: 'not_collected' } },
      { new: true }
    )
      .populate('user', 'name email phone')
      .populate('assignedCollector', 'name email');

    if (!updatedRequest) {
      const existing = await WasteRequest.findById(requestId).select('collectorStatus');
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Waste request not found' });
      }
      return res.status(400).json({ success: false, message: `Request already ${existing.collectorStatus}` });
    }

    await CollectorActivity.create({
      collectorId,
      wasteRequestId: requestId,
      status: 'accepted'
    });

    await notifyUser(updatedRequest.user?._id, `Your pickup request was accepted by ${req.user.name}.`, 'success');

    res.status(200).json({
      success: true,
      message: 'Waste request accepted successfully',
      request: updatedRequest
    });
  } catch (error) {
    sendError(res, error, 'Server error while accepting request');
  }
});

// @route   PUT /api/waste-requests/:requestId/reject
// @desc    Collector declines a pending request. It stays pending for other collectors.
// @access  Private (Collectors only)
router.put('/:requestId/reject', authMiddleware, requireRole(['collector']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const collectorId = req.user.id;

    const request = await WasteRequest.findById(requestId).populate('user', 'name email phone');
    if (!request) {
      return res.status(404).json({
        success: false,
        message: 'Waste request not found'
      });
    }

    if (request.collectorStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Request already ${request.collectorStatus}`
      });
    }

    const alreadyRejected = await CollectorActivity.exists({ collectorId, wasteRequestId: requestId, status: 'rejected' });
    if (!alreadyRejected) {
      await CollectorActivity.create({
        collectorId,
        wasteRequestId: requestId,
        status: 'rejected'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Waste request rejected successfully',
      request
    });
  } catch (error) {
    sendError(res, error, 'Server error while rejecting request');
  }
});

// @route   PUT /api/waste-requests/:requestId/start
// @desc    Collector starts a pickup
// @access  Private (Collectors only)
router.put('/:requestId/start', authMiddleware, requireRole(['collector']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const collectorId = req.user.id;

    const updatedRequest = await WasteRequest.findOneAndUpdate(
      { _id: requestId, assignedCollector: collectorId, collectorStatus: 'accepted' },
      { $set: { collectorStatus: 'in-progress', collectionStatus: 'in_progress' } },
      { new: true }
    )
      .populate('user', 'name email phone')
      .populate('assignedCollector', 'name email');

    if (!updatedRequest) {
      const existing = await WasteRequest.findById(requestId).select('assignedCollector collectorStatus');
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Waste request not found' });
      }
      if (!existing.assignedCollector || existing.assignedCollector.toString() !== collectorId) {
        return res.status(403).json({ success: false, message: 'Not authorized to start this pickup' });
      }
      return res.status(400).json({
        success: false,
        message: `Cannot start pickup - request status is "${existing.collectorStatus}" but should be "accepted"`
      });
    }

    await CollectorActivity.create({
      collectorId,
      wasteRequestId: requestId,
      status: 'in-progress'
    });

    res.status(200).json({
      success: true,
      message: 'Pickup started successfully',
      request: {
        _id: updatedRequest._id,
        collectorStatus: updatedRequest.collectorStatus,
        collectionStatus: updatedRequest.collectionStatus,
        user: updatedRequest.user,
        assignedCollector: updatedRequest.assignedCollector
      }
    });
  } catch (error) {
    sendError(res, error, 'Server error while starting pickup');
  }
});

// @route   PUT /api/waste-requests/:requestId/complete
// @desc    Collector completes a pickup and awards coins to user
// @access  Private (Collectors only)
router.put('/:requestId/complete', authMiddleware, requireRole(['collector']), async (req, res) => {
  try {
    const { requestId } = req.params;
    const collectorId = req.user.id;

    // Atomic: a pickup can only be completed (and paid) once, even on a double-click
    const updatedRequest = await WasteRequest.findOneAndUpdate(
      { _id: requestId, assignedCollector: collectorId, collectorStatus: 'in-progress' },
      { $set: { collectorStatus: 'completed', collectionStatus: 'collected', collectedAt: new Date() } },
      { new: true }
    );

    if (!updatedRequest) {
      const existing = await WasteRequest.findById(requestId).select('assignedCollector collectorStatus');
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Waste request not found' });
      }
      if (!existing.assignedCollector || existing.assignedCollector.toString() !== collectorId) {
        return res.status(403).json({ success: false, message: 'Not authorized to complete this pickup' });
      }
      return res.status(400).json({
        success: false,
        message: `Cannot complete pickup - request is ${existing.collectorStatus}`
      });
    }

    const coinsEarned = calculateCoinsValue(updatedRequest.estimatedWeight, updatedRequest.wasteType);

    await CollectorActivity.create({
      collectorId,
      wasteRequestId: requestId,
      status: 'completed'
    });

    if (updatedRequest.user) {
      // $inc is atomic, so simultaneous completions for the same user never lose coins
      await User.updateOne({ _id: updatedRequest.user }, {
        $inc: { points: coinsEarned },
        $push: {
          completedPickups: {
            requestId: updatedRequest._id,
            completedAt: new Date(),
            coinsEarned,
            wasteType: updatedRequest.wasteType,
            weight: updatedRequest.estimatedWeight
          }
        }
      });
      await notifyUser(updatedRequest.user, `Pickup completed! You earned ${coinsEarned} coins.`, 'success');
    }

    res.status(200).json({
      success: true,
      message: 'Pickup completed successfully',
      request: updatedRequest,
      coinsEarned
    });
  } catch (error) {
    sendError(res, error, 'Server error while completing pickup');
  }
});

// @route   PUT /api/waste-requests/:requestId/cancel
// @desc    User cancels their own pickup request
// @access  Private
router.put('/:requestId/cancel', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.params;
    const userId = req.user.id;

    // Atomic: cannot overwrite a request a collector accepted at the same moment
    const updatedRequest = await WasteRequest.findOneAndUpdate(
      { _id: requestId, user: userId, collectorStatus: 'pending' },
      { $set: { collectorStatus: 'cancelled' } },
      { new: true }
    );

    if (!updatedRequest) {
      const existing = await WasteRequest.findById(requestId).select('user collectorStatus');
      if (!existing) {
        return res.status(404).json({ success: false, message: 'Waste request not found' });
      }
      if (!existing.user) {
        return res.status(403).json({ success: false, message: 'Cannot cancel organisation requests from user account' });
      }
      if (existing.user.toString() !== userId) {
        return res.status(403).json({ success: false, message: 'Not authorized to cancel this request' });
      }
      return res.status(400).json({
        success: false,
        message: `Cannot cancel request - request is already ${existing.collectorStatus}`
      });
    }

    res.status(200).json({
      success: true,
      message: 'Pickup request cancelled successfully',
      request: updatedRequest
    });
  } catch (error) {
    sendError(res, error, 'Server error while cancelling request');
  }
});

// @route   GET /api/waste-requests/user/:userId
// @desc    Get waste requests for a specific user
// @access  Private (the user themselves, admins, or collectors for requests assigned to them)
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const currentUserId = req.user.id;
    const currentUserRole = req.user.role;

    if (currentUserId !== userId && currentUserRole !== 'admin' && currentUserRole !== 'collector') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. You can only view your own requests.'
      });
    }

    const filter = { user: userId };
    // Collectors only see the requests they are handling for this user
    if (currentUserRole === 'collector' && currentUserId !== userId) {
      filter.assignedCollector = currentUserId;
    }

    const userRequests = await WasteRequest.find(filter)
      .populate('user', 'name email phone')
      .populate('assignedCollector', 'name email')
      .sort({ createdAt: -1 });

    const formattedRequests = userRequests.map(formatUserRequest);

    res.status(200).json({
      success: true,
      count: formattedRequests.length,
      requests: formattedRequests
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching user requests');
  }
});

// @route   GET /api/waste-requests/collector/stats
// @desc    Get collector statistics
// @access  Private (Collectors only)
router.get('/collector/stats', authMiddleware, requireRole(['collector']), async (req, res) => {
  try {
    const collectorId = req.user.id;

    const totalRequests = await WasteRequest.countDocuments({
      assignedCollector: collectorId
    });

    const pendingRequests = await WasteRequest.countDocuments({
      assignedCollector: collectorId,
      collectorStatus: 'accepted'
    });

    const inProgressRequests = await WasteRequest.countDocuments({
      assignedCollector: collectorId,
      collectorStatus: 'in-progress'
    });

    const completedRequests = await WasteRequest.countDocuments({
      assignedCollector: collectorId,
      collectorStatus: 'completed'
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayRequests = await WasteRequest.countDocuments({
      assignedCollector: collectorId,
      pickupDate: {
        $gte: today
      }
    });

    res.status(200).json({
      success: true,
      stats: {
        total: totalRequests,
        pending: pendingRequests,
        inProgress: inProgressRequests,
        completed: completedRequests,
        today: todayRequests
      }
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching collector stats');
  }
});

module.exports = router;
