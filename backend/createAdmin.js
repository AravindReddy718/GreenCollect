// Script to create or promote an admin account in Janatha Garage
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/Users');
const { isValidEmail } = require('./utils/validation');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10');

const createOrPromoteAdmin = async () => {
  const args = process.argv.slice(2);
  if (!args[0] || !args[1]) {
    console.error('Usage: npm run create-admin -- <email> <password> [name]');
    process.exit(1);
  }
  const email = args[0].toLowerCase().trim();
  const password = args[1];
  const name = args[2] || 'Admin User';

  if (!isValidEmail(email)) {
    console.error('❌ Please give a valid email address');
    process.exit(1);
  }
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters');
    process.exit(1);
  }

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
      existingUser.password = await bcrypt.hash(password, SALT_ROUNDS);
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

    console.log(`🔑 Admin login: ${email} (use the password you just entered)`);
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

