const express = require('express');
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const Product = require('../models/Products.js');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { sendError } = require('../utils/sendError');

const adminOnly = [authMiddleware, requireRole(['admin'])];

const router = express.Router();

// Configure Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Images only, up to 5 MB, kept in memory until uploaded to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) return cb(null, true);
    const err = new Error('Only image files are allowed');
    err.status = 400;
    cb(err);
  }
});

const DEFAULT_PRODUCT_IMAGE = 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?w=500';

function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { resource_type: 'image', folder: 'products' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

/**
 * POST /products
 * Creates a new product, optionally with an image upload (multipart/form-data).
 */
router.post('/', adminOnly, upload.single('productImage'), async (req, res) => {
  try {
    if (!String(req.body.productName || '').trim()) {
      return res.status(400).json({ success: false, message: 'Product name is required' });
    }

    const uploadResult = req.file ? await uploadToCloudinary(req.file.buffer) : null;

    const newProduct = new Product({
      productName: req.body.productName,
      category: req.body.category,
      description: req.body.description,
      price: req.body.price,
      coinsRequired: req.body.coinsRequired,
      stockQuantity: req.body.stockQuantity,
      productImage: uploadResult ? uploadResult.secure_url : (req.body.productImage || DEFAULT_PRODUCT_IMAGE),
      cloudinaryId: uploadResult ? uploadResult.public_id : null,
      isActive: true
    });

    const savedProduct = await newProduct.save();

    res.status(201).json({
      message: 'Product created successfully!',
      product: savedProduct
    });
  } catch (error) {
    sendError(res, error, 'An error occurred while creating the product.');
  }
});

router.put('/update/:id', adminOnly, upload.single('productImage'), async (req, res) => {
  try {
    const { id } = req.params;

    // Upload image to Cloudinary if a new file is provided
    const uploadResult = req.file ? await uploadToCloudinary(req.file.buffer) : null;

    // Build update object
    const updateData = {
      productName: req.body.productName,
      description: req.body.description,
      price: req.body.price,
      coinsRequired: req.body.coinsRequired,
      category: req.body.category,
      stockQuantity: req.body.stockQuantity,
    };

    // Add image fields only if a new image is uploaded
    if (uploadResult) {
      updateData.productImage = uploadResult.secure_url;
      updateData.cloudinaryId = uploadResult.public_id;
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      message: 'Product updated successfully',
      product: updatedProduct,
    });
  } catch (error) {
    sendError(res, error, 'Server error while updating product');
  }
});

router.get('/', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json({
      message: 'Products fetched successfully',
      products
    });
  } catch (error) {
    sendError(res, error, 'Server error while fetching products');
  }
});

// DELETE — Delete product by ID
router.delete('/delete/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;

    const deletedProduct = await Product.findByIdAndDelete(id);

    if (!deletedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      message: 'Product deleted successfully',
      deletedProduct
    });
  } catch (error) {
    sendError(res, error, 'Server error while deleting product');
  }
});

router.patch('/status/:id', adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;

    // Validate input
    if (typeof isActive !== 'boolean') {
      return res.status(400).json({ message: '`isActive` must be a boolean value (true or false).' });
    }

    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { isActive },
      { new: true, runValidators: true }
    );

    if (!updatedProduct) {
      return res.status(404).json({ message: 'Product not found' });
    }

    res.status(200).json({
      message: isActive ? 'Product activated successfully' : 'Product deactivated successfully',
      product: updatedProduct
    });
  } catch (error) {
    sendError(res, error, 'Server error while updating product status');
  }
});

module.exports = router;
