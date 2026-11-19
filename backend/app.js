// server.js
require('dotenv').config();
const cors = require('cors');
const express = require('express');
const mongoose = require('mongoose');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const companyRoutes = require('./routes/companyRoutes');
const User = require('./models/Users');

const app = express();
const httpServer = http.createServer(app);
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
  'https://janatha-garage.onrender.com',
  'https://greencollect.onrender.com'
];

if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL);
}

const corsOptions = {
  origin: function (origin, callback) {
    // allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) return callback(null, true);
    // Unknown origins get no CORS headers, so the browser blocks them (no server error)
    return callback(null, allowedOrigins.includes(origin));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
};

const io = new Server(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST']
  }
});

// Only logged-in users can open a socket; the room comes from the verified token, not the client
io.use(async (socket, next) => {
  try {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    // Same session check as the API: tokens from before a password reset are rejected
    const user = await User.findById(decoded.id).select('tokenVersion');
    if (!user || (decoded.tv || 0) !== (user.tokenVersion || 0)) return next(new Error('Unauthorized'));
    socket.userId = decoded.id;
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

app.use(express.json());
app.use(cors(corsOptions));

// Connect to MongoDB
const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/janathagarage';
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ MongoDB connected successfully to', mongoose.connection.name))
  .catch(err => {
    console.error('❌ MongoDB connection error:', err?.message || err);
    console.warn('Continuing to start server without database connection (dev mode).');
  });

// Import routes
const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/product');
const userRoutes = require('./routes/UserRoutes');
const notificationRoutes = require('./routes/notifications');
const adminRoutes = require('./routes/admin');
const wasteRequestRoutes = require('./routes/wasteRequest');
const orderRoutes = require('./routes/orderRoutes');

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/users', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/waste-requests', wasteRequestRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api', companyRoutes);

// Health check route
app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatusMap = {
    0: 'Disconnected',
    1: 'Connected',
    2: 'Connecting',
    3: 'Disconnecting'
  };

  res.json({ 
    success: true,
    status: 'OK',
    server: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: `${Math.floor(process.uptime())}s`,
    database: {
      status: dbStatusMap[dbState] || 'Unknown',
      readyState: dbState,
      name: mongoose.connection.name || 'none'
    }
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    success: true,
    message: '🚀 Janatha Garage Backend Server is Running!',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      products: '/api/products',
      users: '/api/users',
      admin: '/api/admin',
      notifications: '/api/notifications',
      wasteRequests: '/api/waste-requests',
      orders: '/api/orders',
      partners: '/api/partners',
      health: '/api/health'
    }
  });
});

// 404 handler for API routes
app.use('/api', (req, res) => {
  res.status(404).json({
    success: false,
    message: `API route not found: ${req.method} ${req.originalUrl}`
  });
});

// Centralized error handling middleware
app.use((err, req, res, next) => {
  // Upload limit / file type errors are the client's fault
  const status = err.name === 'MulterError' ? 400 : (err.statusCode || err.status || 500);
  if (status >= 500) console.error('Unhandled server error:', err);
  res.status(status).json({
    success: false,
    // Never send internal error details to the client
    message: status < 500 ? err.message : 'Internal Server Error'
  });
});

const PORT = Number(process.env.PORT || 4000);
const server = httpServer.listen(PORT, () => {
  console.log(`🎯 Server running on port ${PORT}`);
  console.log(`🔗 http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    const alt = PORT + 1;
    console.warn(`Port ${PORT} in use. Retrying on ${alt}...`);
    httpServer.listen(alt, () => {
      console.log(`Server running on port ${alt}`);
    });
  } else {
    console.error('Server error:', err);
  }
});

// Socket authentication
io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
});

// MongoDB change stream for real-time notifications
const Notification = require('./models/Notification');
mongoose.connection.once('open', () => {
  try {
    const changeStream = Notification.watch([], { fullDocument: 'updateLookup' });
    // Standalone MongoDB (local installs) has no change streams; log it instead of crashing the server
    changeStream.on('error', (err) => {
      console.warn('❌ Change stream unavailable (real-time notifications disabled):', err?.message || err);
      changeStream.close().catch(() => {});
    });
    changeStream.on('change', (change) => {
      if (change.operationType === 'insert') {
        const doc = change.fullDocument;
        const room = `user:${doc.userId?.toString?.() || doc.userId}`;
        io.to(room).emit('notification:new', {
          _id: doc._id,
          message: doc.message,
          type: doc.type,
          read: doc.read,
          createdAt: doc.createdAt,
          meta: doc.meta,
        });
      }
    });
    console.log('✅ MongoDB change stream activated for real-time notifications');
  } catch (err) {
    console.warn('❌ Change stream unavailable (likely standalone MongoDB):', err?.message || err);
  }
});
