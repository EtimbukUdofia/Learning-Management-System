require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const passport = require('passport');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const logger = require('./utils/logger');
const { errorHandler, notFound } = require('./middlewares/errorHandler');
const { authLimiter, publicLimiter } = require('./middlewares/rateLimiter');

// ─── Passport OAuth Config (inline — no config/ folder needed) ────────────────
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { Strategy: GitHubStrategy } = require('passport-github2');
const User = require('./models/User.model');

passport.use(new GoogleStrategy(
  { clientID: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, callbackURL: process.env.GOOGLE_CALLBACK_URL },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        user = await User.findOne({ email: profile.emails[0].value });
        if (user) { user.googleId = profile.id; await user.save({ validateBeforeSave: false }); }
        else user = await User.create({ googleId: profile.id, name: profile.displayName, email: profile.emails[0].value, isEmailVerified: true, avatar: profile.photos?.[0]?.value ? { url: profile.photos[0].value } : undefined, role: 'student' });
      }
      if (user.status === 'banned') return done(null, false);
      done(null, user);
    } catch (err) { done(err, null); }
  }
));

passport.use(new GitHubStrategy(
  { clientID: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET, callbackURL: process.env.GITHUB_CALLBACK_URL, scope: ['user:email'] },
  async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value;
      let user = await User.findOne({ githubId: profile.id });
      if (!user) {
        if (email) user = await User.findOne({ email });
        if (user) { user.githubId = profile.id; await user.save({ validateBeforeSave: false }); }
        else user = await User.create({ githubId: profile.id, name: profile.displayName || profile.username, email: email || `gh_${profile.id}@noemail.lms`, isEmailVerified: !!email, role: 'student' });
      }
      if (user.status === 'banned') return done(null, false);
      done(null, user);
    } catch (err) { done(err, null); }
  }
));

// ─── Route Imports ─────────────────────────────────────────────────────────────
const authRoutes         = require('./routes/auth.routes');
const userRoutes         = require('./routes/user.routes');
const courseRoutes       = require('./routes/course.routes');
const curriculumRoutes   = require('./routes/curriculum.routes');
const enrollmentRoutes   = require('./routes/enrollment.routes');
const paymentRoutes      = require('./routes/payment.routes');
const reviewRoutes       = require('./routes/review.routes');
const categoryRoutes     = require('./routes/category.routes');
const searchRoutes       = require('./routes/search.routes');
const quizRoutes         = require('./routes/quiz.routes');
const certificateRoutes  = require('./routes/certificate.routes');
const wishlistRoutes     = require('./routes/wishlist.routes');
const cartRoutes         = require('./routes/cart.routes');
const notificationRoutes = require('./routes/notification.routes');
const qaRoutes           = require('./routes/qa.routes');
const analyticsRoutes    = require('./routes/analytics.routes');
const mediaRoutes        = require('./routes/media.routes');
const healthRoutes       = require('./routes/health.routes');
const adminRoutes        = require('./routes/admin.routes');
// ─── NEW: Advanced Features ────────────────────────────────────────────────
const discussionRoutes   = require('./routes/discussion.routes');
const gamificationRoutes = require('./routes/gamification.routes');
const personalizationRoutes = require('./routes/personalization.routes');

// ─── App & Server Setup ────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.io (Real-time notifications) ──────────────────────────────────────
const io = new Server(server, { cors: { origin: process.env.FRONTEND_URL, credentials: true } });
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next(new Error('Authentication required'));
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.userId = decoded.userId;
    next();
  } catch { next(new Error('Invalid token')); }
});
io.on('connection', (socket) => {
  socket.join(`user:${socket.userId}`);
  socket.on('join:course', (courseId) => socket.join(`course:${courseId}`));
  socket.on('leave:course', (courseId) => socket.leave(`course:${courseId}`));
  socket.on('disconnect', () => logger.info(`Socket disconnected: ${socket.userId}`));
});
app.set('io', io);

// ─── Security Middleware ───────────────────────────────────────────────────────
app.use(helmet({ crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true, methods: ['GET','POST','PUT','DELETE','PATCH','OPTIONS'] }));

// Paystack webhook needs raw body — MUST be before express.json()
app.use('/api/v1/payments/webhooks/paystack', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(mongoSanitize());
app.use(hpp());
app.use(compression());
app.use(passport.initialize());

// ─── Request Logging ──────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', { stream: { write: (msg) => logger.info(msg.trim()) } }));
}

// ─── Swagger API Docs ─────────────────────────────────────────────────────────
try {
  const swaggerUi = require('swagger-ui-express');
  const YAML = require('yamljs');
  const path = require('path');
  const swaggerDoc = YAML.load(path.join(__dirname, '../docs/swagger.yaml'));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
    customSiteTitle: 'LMS API Docs',
    customCss: '.swagger-ui .topbar { background-color: #0f172a; }',
  }));
} catch { logger.warn('Swagger docs not loaded (docs/swagger.yaml missing — optional)'); }

// ─── API Routes — /api/v1 ─────────────────────────────────────────────────────
const API = '/api/v1';

// Auth (rate limited)
app.use(`${API}/auth`, authLimiter, authRoutes);

// Users
app.use(`${API}/users`, userRoutes);

// Health Checks (must be before courses to avoid :courseId pattern catch)
app.use(API, healthRoutes);

// Courses (public endpoints rate limited) - must be under /courses prefix
app.use(`${API}/courses`, publicLimiter, courseRoutes);

// Curriculum (sections + lectures) — covers /instructor/* and /sections/* paths
app.use(API, curriculumRoutes);

// Enrollment + Progress
app.use(`${API}/enrollments`, enrollmentRoutes);
app.use(`${API}/progress`, enrollmentRoutes);

// Payments + Coupons + Payouts
app.use(API, paymentRoutes);

// Reviews
app.use(API, reviewRoutes);

// Categories + Tags
app.use(API, publicLimiter, categoryRoutes);

// Search
app.use(`${API}/search`, publicLimiter, searchRoutes);

// Quizzes + Assignments
app.use(API, quizRoutes);

// Certificates
app.use(`${API}/certificates`, certificateRoutes);

// Wishlist
app.use(`${API}/wishlist`, wishlistRoutes);

// Cart
app.use(`${API}/cart`, cartRoutes);

// Notifications
app.use(`${API}/notifications`, notificationRoutes);

// Q&A / Discussion
app.use(API, qaRoutes);
app.use(`${API}/discussions`, discussionRoutes);

// ─── Gamification (Achievements, Leaderboards, Streaks) ──────────────────────
app.use(`${API}/gamification`, gamificationRoutes);

// ─── Personalization (Recommendations, Learning Paths, Advanced Analytics) ───
app.use(`${API}/personalization`, personalizationRoutes);

// Analytics
app.use(API, analyticsRoutes);

// Media / File Management
app.use(`${API}/media`, mediaRoutes);

// Admin Settings & Audit
app.use(`${API}/admin`, adminRoutes);

// ─── 404 + Error Handler ──────────────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

// ─── Database + Server Start ──────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  logger.error('❌ MongoDB URI not configured. Set MONGO_URI or MONGODB_URI in .env file');
  process.exit(1);
}

// Mongoose client options with Stable API version
const clientOptions = { 
  serverApi: { 
    version: '1', 
    strict: true, 
    deprecationErrors: true 
  },
  maxPoolSize: 10,
  minPoolSize: 2,
  maxIdleTimeMS: 45000,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
};

mongoose.connect(mongoUri, clientOptions)
  .then(async (conn) => {
    // Ping deployment to verify connection
    await mongoose.connection.db.admin().command({ ping: 1 });
    logger.info('✅ MongoDB connected successfully');
    logger.info('✅ Pinged your deployment. You successfully connected to MongoDB!');
    logger.info(`📊 Database: ${conn.connection.db.databaseName}`);
    logger.info(`🔗 Host: ${conn.connection.host}`);
    
    server.listen(PORT, () => {
      logger.info(`🚀 LMS API running → http://localhost:${PORT}`);
      logger.info(`📚 API Docs      → http://localhost:${PORT}/api/docs`);
      logger.info(`❤️  Health check  → http://localhost:${PORT}/api/v1/health`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  })
  .catch((err) => {
    logger.error('❌ MongoDB connection failed:', err.message);
    logger.error('📝 Full error details:', {
      name: err.name,
      message: err.message,
      code: err.code,
    });
    process.exit(1);
  });

// Connection event listeners
mongoose.connection.on('disconnected', () => {
  logger.warn('⚠️  MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  logger.info('✅ MongoDB reconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('❌ MongoDB connection error:', err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => mongoose.connection.close(() => process.exit(0)));
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});

module.exports = { app, server };
