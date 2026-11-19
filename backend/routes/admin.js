// routes/admin.js
const express = require('express');
const router = express.Router();
const User = require('../models/Users');
const WasteRequest = require('../models/WasteRequest');

// Get all collector requests
router.get('/collector-requests', async (req, res) => {
  try {
    console.log('Fetching collector requests...');
    
    const collectors = await User.find({ 
      role: 'collector'
    }).select('name email role collectorInfo createdAt').lean();
    
    console.log(`Found ${collectors.length} collectors`);
    
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
        status: user.collectorInfo?.isApproved ? 'approved' : 'pending'
      }
    }));
    
    res.json(transformedData);
  } catch (err) {
    console.error('Error fetching collector requests:', err);
    res.status(500).json({ error: 'Server error' });
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
    console.error('Error approving collector:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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
    console.error('Error rejecting collector:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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

    wr.collectorStatus = 'accepted';
    await wr.save();

    res.json({ success: true, message: 'Organisation request accepted', request: wr });
  } catch (err) {
    console.error('Error accepting organisation request:', err);
    res.status(500).json({ success: false, message: 'Server error' });
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
    console.error('Error rejecting organisation request:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});
