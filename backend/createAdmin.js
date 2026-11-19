// Script to create or promote an admin account in Janatha Garage
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/Users');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10');

const createOrPromoteAdmin = async () => {
  const args = process.argv.slice(2);
  const email = (args[0] || 'admin@janathagarage.com').toLowerCase().trim();
  const password = args[1] || 'Admin@123';
  const name = args[2] || 'Admin User';

  if (!MONGO_URI) {
    console.error('❌ MONGO_URI is missing in .env');
    process.exit(1);
  }

  try {
    console.log('Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB Atlas');

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      existingUser.role = 'admin';
      if (args[1]) {
        // If password was explicitly provided, update it
        existingUser.password = await bcrypt.hash(password, SALT_ROUNDS);
      }
      await existingUser.save({ validateBeforeSave: false });
      console.log(`\n🎉 User ${email} has been updated to role "admin"!`);
    } else {
      const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
      const newAdmin = new User({
        name,
        email,
        password: hashedPassword,
        role: 'admin',
        points: 1000,
        phone: '9999999999'
      });
      await newAdmin.save({ validateBeforeSave: false });
      console.log(`\n🎉 New Admin account created successfully!`);
    }

    console.log('------------------------------------------------');
    console.log('🔑 ADMIN LOGIN CREDENTIALS:');
    console.log(`   Email:    ${email}`);
    console.log(`   Password: ${password}`);
    console.log(`   Role:     admin`);
    console.log('------------------------------------------------');
    console.log('\nYou can now log in at: http://localhost:5173/login\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error creating admin:', err.message);
    if (mongoose.connection.readyState === 1) await mongoose.disconnect();
    process.exit(1);
  }
};

createOrPromoteAdmin();

