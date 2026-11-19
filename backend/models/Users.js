const mongoose = require('mongoose');
const { isValidEmail, isValidName, normalizePhone, normalizeVehicleNumber, PHONE_MESSAGE, NAME_MESSAGE } = require('../utils/validation');

// Phones are stored as the bare 10-digit mobile number (routes normalise before saving)
const phoneValidator = {
  validator: (v) => v == null || v === '' || normalizePhone(v) === v,
  message: PHONE_MESSAGE
};

const collectorInfoSchema = new mongoose.Schema({
  phone: { 
    type: String, 
    required: function() {
      return this.parent && typeof this.parent === 'function' && this.parent() ? this.parent().role === 'collector' : false;
    },
    validate: phoneValidator
  },
  address: { 
    type: String, 
    required: function() {
      return this.parent && typeof this.parent === 'function' && this.parent() ? this.parent().role === 'collector' : false;
    },
    maxlength: [200, 'Address cannot exceed 200 characters']
  },
  vehicleType: { 
    type: String, 
    required: function() {
      return this.parent && typeof this.parent === 'function' && this.parent() ? this.parent().role === 'collector' : false;
    },
    enum: ['Three-wheeler', 'Pickup Truck', 'Mini Truck', 'Truck', 'Car', 'Van', 'Motorcycle', 'Bicycle', 'Other']
  },
  vehicleNumberPlate: { 
    type: String, 
    required: function() {
      return this.parent && typeof this.parent === 'function' && this.parent() ? this.parent().role === 'collector' : false;
    },
    uppercase: true,
    trim: true,
    validate: {
      validator: (v) => v == null || v === '' || normalizeVehicleNumber(v) === v,
      message: 'Enter a valid vehicle number, e.g. KA01AB1234'
    }
  },
  experience: { 
    type: String, 
    required: function() {
      return this.parent && typeof this.parent === 'function' && this.parent() ? this.parent().role === 'collector' : false;
    },
    maxlength: [500, 'Experience description too long']
  },
  isApproved: { 
    type: Boolean, 
    default: false 
  },
  status: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected'], 
    default: 'pending' 
  },
  rejectionReason: {
    type: String,
    maxlength: [200, 'Rejection reason too long']
  }
});

const userSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, 'Name is required'],
    trim: true,
    maxlength: [50, 'Name cannot exceed 50 characters'],
    validate: { validator: isValidName, message: NAME_MESSAGE }
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    maxlength: [254, 'Email too long'],
    validate: { validator: isValidEmail, message: 'Please enter a valid email address' }
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [6, 'Password must be at least 6 characters']
  },
  // Password reset: only a SHA-256 hash of the emailed token is stored, and it is single-use
  resetPasswordTokenHash: {
    type: String,
    select: false
  },
  resetPasswordExpires: {
    type: Date,
    select: false
  },
  // Session version: every login token carries it; a password reset increases it,
  // so all tokens issued before the reset stop working
  tokenVersion: {
    type: Number,
    default: 0
  },
  phone: {
    type: String,
    validate: phoneValidator
  },
  role: { 
    type: String, 
    enum: ['user', 'collector', 'admin'], 
    default: 'user' 
  },
  points: { 
    type: Number, 
    default: 250,
    min: [0, 'Points cannot be negative']
  },
  isActive: {
    type: Boolean,
    default: true
  },
  avatar: {
    type: String,
    default: ''
  },
  completedPickups: [{
    requestId: { type: mongoose.Schema.Types.ObjectId, ref: 'WasteRequest' },
    completedAt: { type: Date, default: Date.now },
    coinsEarned: { type: Number, default: 0 },
    wasteType: { type: String },
    weight: { type: Number }
  }],
  wasteRequests: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WasteRequest',
    default: []
  }],
  collectorInfo: {
    type: collectorInfoSchema,
    required: false // Make it optional for all users
  }
}, { 
  timestamps: true
});

// Virtual for checking if user is a collector
userSchema.virtual('isCollector').get(function() {
  return this.role === 'collector';
});

// Virtual for checking if collector is approved
userSchema.virtual('isApprovedCollector').get(function() {
  return this.role === 'collector' && 
         this.collectorInfo && 
         this.collectorInfo.isApproved;
});

// Index for better query performance
userSchema.index({ role: 1 });
userSchema.index({ 'collectorInfo.status': 1 });

// Pre-save middleware to sync isApproved with status
userSchema.pre('save', function(next) {
  if (this.collectorInfo) {
    if (this.collectorInfo.status === 'approved') {
      this.collectorInfo.isApproved = true;
    } else if (['pending', 'rejected'].includes(this.collectorInfo.status)) {
      this.collectorInfo.isApproved = false;
    }
    
    if (this.collectorInfo.status !== 'rejected') {
      this.collectorInfo.rejectionReason = undefined;
    }
  }
  
  if (!this.wasteRequests) {
    this.wasteRequests = [];
  }
  
  next();
});

module.exports = mongoose.model('User', userSchema);