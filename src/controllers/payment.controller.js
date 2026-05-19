const paystackService = require('../services/paystack.service');
const Course = require('../models/Course.model');
const { Order, Coupon, Enrollment, Payout } = require('../models/index');
const { AppError } = require('../utils/AppError');
const catchAsync = require('../utils/catchAsync');
const notificationService = require('../services/notification.service');
const emailService = require('../services/email.service');
const { v4: uuidv4 } = require('uuid');

const INSTRUCTOR_SHARE = parseFloat(process.env.INSTRUCTOR_REVENUE_SHARE || 70) / 100;

// ─── Create Checkout Session ───────────────────────────────────────────────────
exports.createCheckout = catchAsync(async (req, res) => {
  const { courseId, couponCode } = req.body;

  const course = await Course.findOne({ _id: courseId, status: 'published' })
    .populate('instructor', 'name');
  if (!course) throw new AppError('Course not found', 404);

  // Check if already enrolled
  const alreadyEnrolled = await Enrollment.exists({ student: req.user._id, course: courseId });
  if (alreadyEnrolled) throw new AppError('You are already enrolled in this course', 400);

  let finalPrice = course.price;
  let discount = 0;
  let appliedCoupon = null;

  // Apply coupon
  if (couponCode) {
    const coupon = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true });
    if (!coupon) throw new AppError('Invalid or expired coupon code', 400);
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new AppError('Coupon has expired', 400);
    if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) throw new AppError('Coupon usage limit reached', 400);
    if (coupon.courses.length > 0 && !coupon.courses.includes(courseId)) {
      throw new AppError('Coupon is not valid for this course', 400);
    }

    discount = coupon.type === 'percentage'
      ? (course.price * coupon.value) / 100
      : Math.min(coupon.value, course.price);

    finalPrice = Math.max(0, course.price - discount);
    appliedCoupon = coupon;
  }

  // Free course enrollment — bypass Paystack
  if (finalPrice === 0) {
    const order = await Order.create({
      student: req.user._id,
      courses: [{ course: courseId, price: 0, instructorShare: 0 }],
      subtotal: course.price,
      discount,
      total: 0,
      coupon: appliedCoupon?._id,
      couponCode: appliedCoupon?.code,
      status: 'completed',
      paymentProvider: 'free',
    });

    await Enrollment.create({ student: req.user._id, course: courseId, order: order._id });
    if (appliedCoupon) await Coupon.findByIdAndUpdate(appliedCoupon._id, { $inc: { usedCount: 1 } });

    return res.json({ success: true, message: 'Enrolled for free!', data: { order, enrolled: true } });
  }

  // Initialize Paystack transaction
  const reference = `ORDER-${req.user._id}-${uuidv4()}`;

  const paystackResponse = await paystackService.initializeTransaction({
    email: req.user.email,
    amount: finalPrice,
    reference,
    metadata: {
      userId: req.user._id.toString(),
      courseId: courseId.toString(),
      courseTitle: course.title,
      instructorId: course.instructor._id.toString(),
      couponId: appliedCoupon?._id?.toString() || '',
      discount: discount.toString(),
    },
  });

  // Pre-create pending order
  await Order.create({
    student: req.user._id,
    courses: [{ course: courseId, price: finalPrice, instructorShare: finalPrice * INSTRUCTOR_SHARE }],
    subtotal: course.price,
    discount,
    total: finalPrice,
    coupon: appliedCoupon?._id,
    couponCode: appliedCoupon?.code,
    status: 'pending',
    paystackReference: reference,
    paymentProvider: 'paystack',
  });

  res.json({ 
    success: true, 
    data: { 
      reference,
      authorizationUrl: paystackResponse.data.authorization_url,
      accessCode: paystackResponse.data.access_code,
    } 
  });
});

// ─── Paystack Webhook ─────────────────────────────────────────────────────────
exports.paystackWebhook = catchAsync(async (req, res) => {
  const event = req.body;

  // Verify webhook signature (Paystack sends as query param)
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = require('crypto')
    .createHmac('sha512', secret)
    .update(JSON.stringify(event))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    logger.warn('⚠️  Invalid Paystack webhook signature');
    return res.status(401).json({ error: 'Invalid signature' });
  }

  // Handle payment.success event
  if (event.event === 'charge.success') {
    const { reference, amount, customer } = event.data;

    const order = await Order.findOneAndUpdate(
      { paystackReference: reference },
      { 
        status: 'completed', 
        paystackTransactionId: event.data.id,
        paidAt: new Date(),
      },
      { new: true }
    ).populate('courses.course');

    if (order && order.status === 'completed') {
      const courseId = order.courses[0].course._id;
      const userId = order.student;

      // Create enrollment
      const existingEnrollment = await Enrollment.findOne({ student: userId, course: courseId });
      if (!existingEnrollment) {
        await Enrollment.create({ student: userId, course: courseId, order: order._id });
      }

      // Apply coupon usage
      if (order.coupon) {
        await Coupon.findByIdAndUpdate(order.coupon, { $inc: { usedCount: 1 } });
      }

      const user = await require('../models/User.model').findById(userId);
      const course = await Course.findById(courseId).populate('instructor');

      // Send notifications
      await notificationService.send({
        userId,
        type: 'payment',
        title: 'Enrollment Confirmed!',
        message: `You're now enrolled in "${course.title}"`,
        data: { courseId, orderId: order._id },
      });

      await emailService.sendEnrollmentConfirmation(user.email, user.name, course.title);

      logger.info(`✅ Payment confirmed for order: ${order._id}`);
    }
  }

  // Handle charge.dispute event (refund/dispute)
  if (event.event === 'charge.dispute.create') {
    const { reference } = event.data;
    const order = await Order.findOne({ paystackReference: reference });
    
    if (order) {
      order.status = 'disputed';
      await order.save();
      logger.warn(`⚠️  Payment dispute created for order: ${order._id}`);
    }
  }

  res.json({ success: true, message: 'Webhook received' });
});

// ─── Order History ────────────────────────────────────────────────────────────
exports.getOrders = catchAsync(async (req, res) => {
  const orders = await Order.find({ student: req.user._id })
    .populate('courses.course', 'title thumbnail slug')
    .sort('-createdAt');

  res.json({ success: true, data: orders });
});

// ─── Refund Request ───────────────────────────────────────────────────────────
exports.requestRefund = catchAsync(async (req, res) => {
  const order = await Order.findOne({ _id: req.params.orderId, student: req.user._id });
  if (!order) throw new AppError('Order not found', 404);
  if (order.status !== 'completed') throw new AppError('Order cannot be refunded in current state', 400);

  // 30-day refund window
  const daysSincePurchase = (Date.now() - order.createdAt) / (1000 * 60 * 60 * 24);
  if (daysSincePurchase > 30) throw new AppError('Refund window has expired (30 days)', 400);

  // Process refund via Paystack
  if (order.paystackReference) {
    await paystackService.refundPayment(order.paystackReference, {
      amount: order.total,
    });
  }

  order.status = 'refunded';
  order.refundedAt = new Date();
  order.refundReason = req.body.reason;
  await order.save();

  // Remove enrollment
  await Enrollment.deleteOne({ student: req.user._id, course: order.courses[0].course });

  res.json({ success: true, message: 'Refund processed successfully', data: order });
});

// ─── Validate Coupon ───────────────────────────────────────────────────────────
exports.validateCoupon = catchAsync(async (req, res) => {
  const { code, courseId } = req.body;
  const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

  if (!coupon || (coupon.expiresAt && coupon.expiresAt < new Date())) {
    throw new AppError('Invalid or expired coupon', 400);
  }
  if (coupon.maxUses && coupon.usedCount >= coupon.maxUses) {
    throw new AppError('Coupon usage limit reached', 400);
  }
  if (coupon.courses.length > 0 && !coupon.courses.includes(courseId)) {
    throw new AppError('Coupon not valid for this course', 400);
  }

  const course = await Course.findById(courseId);
  const discount = coupon.type === 'percentage'
    ? (course.price * coupon.value) / 100
    : Math.min(coupon.value, course.price);

  res.json({
    success: true,
    data: {
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      discount: Math.round(discount * 100) / 100,
      finalPrice: Math.max(0, course.price - discount),
    },
  });
});

// ─── Instructor: Earnings Summary ─────────────────────────────────────────────
exports.getEarnings = catchAsync(async (req, res) => {
  const orders = await Order.find({
    'courses.course': { $in: await Course.find({ instructor: req.user._id }).select('_id') },
    status: 'completed',
  });

  const total = orders.reduce((sum, o) => sum + (o.courses[0]?.instructorShare || 0), 0);
  const payouts = await Payout.find({ instructor: req.user._id });
  const paid = payouts.filter(p => p.status === 'paid').reduce((sum, p) => sum + p.amount, 0);

  res.json({
    success: true,
    data: {
      total: Math.round(total * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      pending: Math.round((total - paid) * 100) / 100,
      currency: 'USD',
    },
  });
});

// ─── Instructor: Request Payout ────────────────────────────────────────────────
exports.requestPayout = catchAsync(async (req, res) => {
  const { amount, method } = req.body;
  if (!['bank', 'paypal'].includes(method)) throw new AppError('Invalid payout method', 400);

  const payout = await Payout.create({
    instructor: req.user._id,
    amount,
    method,
    status: 'pending',
  });

  res.status(201).json({ success: true, message: 'Payout request submitted', data: payout });
});
