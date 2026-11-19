const express = require('express');
const Notification = require('../models/Notification');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendError } = require('../utils/sendError');
const router = express.Router();

// List latest notifications for the logged-in user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const items = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    res.json({ items });
  } catch (err) {
    sendError(res, err, 'Internal server error', 'error');
  }
});

// Mark all as read for the logged-in user
router.post('/clear', authMiddleware, async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.user.id, read: false }, { $set: { read: true } });
    res.json({ ok: true });
  } catch (err) {
    sendError(res, err, 'Internal server error', 'error');
  }
});

// Create a notification for a user (admin only)
router.post('/', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { userId, message, type, meta } = req.body || {};
    if (!userId || !message) return res.status(400).json({ error: 'userId and message are required' });
    const doc = await Notification.create({ userId, message, type, meta });
    res.status(201).json({ item: doc });
  } catch (err) {
    sendError(res, err, 'Internal server error', 'error');
  }
});

module.exports = router;
