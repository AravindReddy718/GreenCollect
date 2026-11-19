// Adds demo data for local testing. Safe to re-run: it only creates records that are missing and never deletes anything.
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/Users');
const Product = require('./models/Products');
const WasteRequest = require('./models/WasteRequest');

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;
const SALT_ROUNDS = parseInt(process.env.SALT_ROUNDS || '10');

const demoUsers = [
  { name: 'Demo User', email: 'user@demo.com', password: 'DemoUser@123', role: 'user', phone: '9876543210', points: 500 },
  {
    name: 'Demo Collector', email: 'collector@demo.com', password: 'DemoCollector@123', role: 'collector', phone: '9988776655', points: 0,
    collectorInfo: {
      phone: '9988776655', address: '12 Recycle Road, Bengaluru', vehicleType: 'Three-wheeler',
      vehicleNumberPlate: 'KA01AB1234', experience: '2 years of e-waste collection', isApproved: true, status: 'approved'
    }
  }
];

const demoProducts = [
  { productName: 'Bamboo Toothbrush Set', productImage: '/products/toothbrush.svg', category: 'Personal Care', description: 'Pack of 4 biodegradable bamboo toothbrushes.', price: 80, coinsRequired: 80, stockQuantity: 50 },
  { productName: 'Steel Water Bottle', productImage: '/products/bottle.svg', category: 'Kitchen', description: '750 ml insulated stainless steel bottle.', price: 250, coinsRequired: 250, stockQuantity: 30 },
  { productName: 'Jute Shopping Bag', productImage: '/products/bag.svg', category: 'Fashion', description: 'Reusable jute tote bag.', price: 60, coinsRequired: 60, stockQuantity: 100 },
  { productName: 'Solar Power Bank', productImage: '/products/powerbank.svg', category: 'Electronics', description: '10000 mAh power bank with solar panel.', price: 450, coinsRequired: 450, stockQuantity: 15 },
  { productName: 'Coconut Shell Bowl', productImage: '/products/bowl.svg', category: 'Home', description: 'Handmade bowl from upcycled coconut shell.', price: 120, coinsRequired: 120, stockQuantity: 40 },
  { productName: 'Beeswax Food Wraps', productImage: '/products/wraps.svg', category: 'Kitchen', description: 'Set of 3 reusable food wraps.', price: 150, coinsRequired: 150, stockQuantity: 25 }
];

const run = async () => {
  if (!MONGO_URI) {
    console.error('MONGO_URI is missing in backend/.env');
    process.exit(1);
  }
  await mongoose.connect(MONGO_URI);

  let demoUser;
  for (const u of demoUsers) {
    let doc = await User.findOne({ email: u.email });
    if (!doc) {
      doc = await User.create({ ...u, password: await bcrypt.hash(u.password, SALT_ROUNDS) });
      console.log(`Created ${u.role}: ${u.email} / ${u.password}`);
    } else {
      console.log(`Exists, skipped: ${u.email}`);
    }
    if (u.role === 'user') demoUser = doc;
  }

  for (const p of demoProducts) {
    if (await Product.exists({ productName: p.productName })) continue;
    await Product.create(p);
    console.log(`Created product: ${p.productName}`);
  }

  if (demoUser && !(await WasteRequest.exists({ user: demoUser._id }))) {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const req = await WasteRequest.create({
      user: demoUser._id, pickupDate: tomorrow, pickupTime: '10:00', wasteType: 'electronics',
      estimatedWeight: 4, pickupAddress: '45 Green Boulevard, Bengaluru', contactNumber: '9876543210'
    });
    await User.updateOne({ _id: demoUser._id }, { $push: { wasteRequests: req._id } });
    console.log('Created a pending pickup request for the demo user');
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
};

run().catch(async (err) => {
  console.error('Seed failed:', err.message);
  await mongoose.disconnect();
  process.exit(1);
});
