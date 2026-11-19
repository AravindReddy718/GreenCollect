const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const User = require('../models/Users');
const { authMiddleware } = require('../middleware/auth');

/**
 * POST /api/orders
 * Place a new redemption order using reward points
 */
router.post('/', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { items, product, address, deliveryOption } = req.body;

    // Normalise items list
    let orderItems = [];
    if (Array.isArray(items) && items.length > 0) {
      orderItems = items.map(it => ({
        productId: it.id && it.id.length === 24 ? it.id : undefined,
        name: it.name || 'Eco Item',
        price: Number(it.price) || 0,
        qty: Number(it.qty) || 1,
        image: it.image || ''
      }));
    } else if (product) {
      orderItems = [{
        productId: product.id && String(product.id).length === 24 ? product.id : undefined,
        name: product.name || 'Eco Item',
        price: Number(product.price) || 0,
        qty: 1,
        image: product.image || ''
      }];
    }

    if (orderItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items provided for order'
      });
    }

    // Validate address
    if (!address || !address.fullName || !address.phone || !address.address || !address.city || !address.state || !address.pincode) {
      return res.status(400).json({
        success: false,
        message: 'All required delivery address fields must be provided'
      });
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

    const userPoints = Number(user.points || 0);
    if (userPoints < totalCost) {
      return res.status(400).json({
        success: false,
        message: `Insufficient coins balance. You have ${userPoints} coins, but order requires ${totalCost} coins.`
      });
    }

    // Deduct coins from user
    user.points = userPoints - totalCost;
    await user.save({ validateBeforeSave: false });

    // Generate unique order ID
    const orderId = `GC-${Date.now().toString().slice(-8)}`;

    const newOrder = new Order({
      orderId,
      user: userId,
      items: orderItems,
      totalCoins: totalCost,
      deliveryOption: deliveryOption === 'express' ? 'express' : 'standard',
      deliveryCost,
      address: {
        fullName: address.fullName,
        phone: address.phone,
        email: address.email || user.email,
        address: address.address,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country || 'India'
      },
      status: 'processing'
    });

    const savedOrder = await newOrder.save();

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      order: savedOrder,
      orderId: savedOrder.orderId,
      remainingCoins: user.points
    });

  } catch (error) {
    console.error('Error creating order:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while placing order',
      error: error.message
    });
  }
});

/**
 * GET /api/orders/my-orders
 * Get orders placed by current user
 */
router.get('/my-orders', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const orders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      orders
    });
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching orders',
      error: error.message
    });
  }
});

/**
 * GET /api/orders/:orderId
 * Get specific order by orderId
 */
router.get('/:orderId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId }).lean();
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
    console.error('Error fetching order:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;

