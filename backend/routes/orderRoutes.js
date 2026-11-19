const express = require('express');
const crypto = require('crypto');
const mongoose = require('mongoose');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/Users');
const Product = require('../models/Products');
const { authMiddleware } = require('../middleware/auth');
const { sendError } = require('../utils/sendError');
const { isValidEmail } = require('../utils/validation');

const ADDRESS_FIELDS = ['fullName', 'phone', 'address', 'city', 'state', 'pincode'];

// Returns an error message for an invalid delivery address, or null
function addressError(address) {
  if (!address || ADDRESS_FIELDS.some(f => typeof address[f] !== 'string' || !address[f].trim())) {
    return 'All required delivery address fields must be provided';
  }
  if (!/^\+?\d{10,13}$/.test(address.phone.replace(/[\s()-]/g, ''))) {
    return 'Enter a valid phone number (10-13 digits)';
  }
  if (!/^\d{6}$/.test(address.pincode.trim())) {
    return 'Enter a valid 6-digit pincode';
  }
  if (address.address.length > 300 || address.fullName.length > 100 || address.city.length > 100 || address.state.length > 100) {
    return 'Address fields are too long';
  }
  if (address.email && !isValidEmail(address.email)) {
    return 'Enter a valid email address';
  }
  return null;
}

// Puts stock back for items already reserved by a failed order
async function restoreStock(items) {
  for (const it of items) {
    await Product.updateOne({ _id: it.productId }, { $inc: { stockQuantity: it.qty } });
  }
}

/**
 * POST /api/orders
 * Place a new redemption order using reward points
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items, product, address, deliveryOption } = req.body;

    // Only product IDs and quantities come from the client; names and prices come from the database
    const rawItems = Array.isArray(items) && items.length > 0
      ? items
      : (product ? [{ ...product, qty: 1 }] : []);

    if (rawItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items provided for order'
      });
    }

    const orderItems = [];
    for (const it of rawItems) {
      const qty = Number(it && it.qty !== undefined ? it.qty : 1);
      if (!it || !mongoose.isValidObjectId(it.id) || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        return res.status(400).json({ success: false, message: 'Invalid item in order' });
      }
      const dbProduct = await Product.findById(it.id).lean();
      if (!dbProduct || dbProduct.isActive === false) {
        return res.status(400).json({ success: false, message: 'A product in your order is no longer available' });
      }
      if (dbProduct.stockQuantity < qty) {
        return res.status(400).json({ success: false, message: `${dbProduct.productName} is out of stock` });
      }
      orderItems.push({
        productId: dbProduct._id,
        name: dbProduct.productName,
        price: Number(dbProduct.price) || 0,
        qty,
        image: dbProduct.productImage || ''
      });
    }

    const invalidAddress = addressError(address);
    if (invalidAddress) {
      return res.status(400).json({ success: false, message: invalidAddress });
    }

    const deliveryCost = deliveryOption === 'express' ? 25 : 0;
    const itemsTotal = orderItems.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const totalCost = itemsTotal + deliveryCost;

    // Fetch user and check balance
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Atomic deduction: only succeeds if the balance still covers the total (no double-spend)
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, points: { $gte: totalCost } },
      { $inc: { points: -totalCost } },
      { new: true }
    );
    if (!updatedUser) {
      const userPoints = Number(user.points || 0);
      return res.status(400).json({
        success: false,
        message: `Insufficient coins balance. You have ${userPoints} coins, but order requires ${totalCost} coins.`
      });
    }

    // Atomic stock reservation: never sells more than is in stock, even with simultaneous orders
    const reserved = [];
    for (const it of orderItems) {
      const result = await Product.updateOne(
        { _id: it.productId, stockQuantity: { $gte: it.qty } },
        { $inc: { stockQuantity: -it.qty } }
      );
      if (result.modifiedCount !== 1) {
        await restoreStock(reserved);
        await User.updateOne({ _id: userId }, { $inc: { points: totalCost } });
        return res.status(400).json({ success: false, message: `${it.name} just went out of stock` });
      }
      reserved.push(it);
    }

    // Unique order ID: timestamp plus random suffix, so two orders in the same millisecond cannot collide
    const orderId = `GC-${Date.now().toString().slice(-8)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    const newOrder = new Order({
      orderId,
      user: userId,
      items: orderItems,
      totalCoins: totalCost,
      deliveryOption: deliveryOption === 'express' ? 'express' : 'standard',
      deliveryCost,
      address: {
        fullName: address.fullName.trim(),
        phone: address.phone.trim(),
        email: address.email || user.email,
        address: address.address.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        pincode: address.pincode.trim(),
        country: address.country || 'India'
      },
      status: 'processing'
    });

    let savedOrder;
    try {
      savedOrder = await newOrder.save();
    } catch (saveErr) {
      // Give the coins and stock back if the order could not be stored
      await restoreStock(reserved);
      await User.updateOne({ _id: userId }, { $inc: { points: totalCost } });
      throw saveErr;
    }

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order: savedOrder,
      orderId: savedOrder.orderId,
      remainingCoins: updatedUser.points
    });
  } catch (error) {
    sendError(res, error, 'Server error while placing order');
  }
});

/**
 * GET /api/orders/my-orders
 * Get orders placed by current user
 */
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching orders');
  }
});

/**
 * GET /api/orders/:orderId
 * Get specific order by orderId (only the owner can read it)
 */
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, user: req.user.id }).lean();
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    res.status(200).json({
      success: true,
      order
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching order');
  }
});

module.exports = router;
