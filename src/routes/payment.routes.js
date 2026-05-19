// ─── payment.routes.js ────────────────────────────────────────────────────────
const express = require('express');
const payRouter = express.Router();
const payCtrl = require('../controllers/payment.controller');
const paystackService = require('../services/paystack.service');
const { protect, restrictTo } = require('../middlewares/auth.middleware');
const { body } = require('express-validator');
const validate = require('../middlewares/validate.middleware');
const logger = require('../utils/logger');
const { Order } = require('../models/index');

payRouter.post('/payments/checkout', protect, [body('courseId').notEmpty()], validate, payCtrl.createCheckout);

// ─── Verify Paystack Payment ──────────────────────────────────────────────────
payRouter.get('/payments/verify/:reference', protect, async (req, res, next) => {
  try {
    const verification = await paystackService.verifyTransaction(req.params.reference);
    
    res.json({ 
      success: verification.data.status === 'success',
      data: { 
        status: verification.data.status, 
        reference: req.params.reference,
        amount: verification.data.amount / 100, // Convert from kobo
      } 
    });
  } catch (error) {
    logger.error('Payment verification failed:', error.message);
    res.status(404).json({ success: false, message: 'Payment verification failed' });
  }
});

// ─── Paystack Webhook ─────────────────────────────────────────────────────────
payRouter.post('/payments/webhooks/paystack', payCtrl.paystackWebhook);

payRouter.get('/payments/orders', protect, payCtrl.getOrders);

payRouter.get('/payments/orders/:orderId', protect, async (req, res, next) => {
  try {
    const { Order } = require('../models/index');
    const order = await Order.findOne({ _id: req.params.orderId, student: req.user._id })
      .populate('courses.course', 'title thumbnail');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, data: order });
  } catch (err) { next(err); }
});

payRouter.post('/payments/orders/:orderId/refund', protect, payCtrl.requestRefund);
payRouter.get('/payments/orders/:orderId/invoice', protect, async (req, res, next) => {
  try {
    const { Order } = require('../models/index');
    const order = await Order.findOne({ _id: req.params.orderId, student: req.user._id })
      .populate('courses.course', 'title').populate('student', 'name email');
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    // Redirect to invoiceUrl or generate basic invoice
    res.json({ success: true, data: { invoiceUrl: order.invoiceUrl || null, order } });
  } catch (err) { next(err); }
});
payRouter.post('/coupons/validate', protect, payCtrl.validateCoupon);
payRouter.post('/admin/coupons', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { Coupon } = require('../models/index');
    const coupon = await Coupon.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, data: coupon });
  } catch (err) { next(err); }
});
payRouter.get('/admin/coupons', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { Coupon } = require('../models/index');
    const coupons = await Coupon.find().sort('-createdAt');
    res.json({ success: true, data: coupons });
  } catch (err) { next(err); }
});
payRouter.get('/instructor/earnings', protect, restrictTo('instructor', 'admin'), payCtrl.getEarnings);
payRouter.get('/instructor/earnings/history', protect, restrictTo('instructor', 'admin'), async (req, res, next) => {
  try {
    const { Order } = require('../models/index');
    const Course = require('../models/Course.model');
    const courses = await Course.find({ instructor: req.user._id }).select('_id');
    const orders = await Order.find({ 'courses.course': { $in: courses.map(c => c._id) }, status: 'completed' })
      .populate('courses.course', 'title').populate('student', 'name email').sort('-createdAt');
    res.json({ success: true, data: orders });
  } catch (err) { next(err); }
});
payRouter.post('/instructor/payouts/request', protect, restrictTo('instructor', 'admin'), payCtrl.requestPayout);
payRouter.get('/instructor/payouts', protect, restrictTo('instructor', 'admin'), async (req, res, next) => {
  try {
    const { Payout } = require('../models/index');
    const payouts = await Payout.find({ instructor: req.user._id }).sort('-createdAt');
    res.json({ success: true, data: payouts });
  } catch (err) { next(err); }
});
payRouter.post('/admin/payouts/:payoutId/approve', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { Payout } = require('../models/index');
    const payout = await Payout.findByIdAndUpdate(req.params.payoutId,
      { status: 'approved', processedBy: req.user._id, processedAt: new Date() }, { new: true });
    res.json({ success: true, data: payout });
  } catch (err) { next(err); }
});
payRouter.post('/admin/payouts/:payoutId/reject', protect, restrictTo('admin'), async (req, res, next) => {
  try {
    const { Payout } = require('../models/index');
    const payout = await Payout.findByIdAndUpdate(req.params.payoutId,
      { status: 'rejected', rejectionReason: req.body.reason, processedBy: req.user._id, processedAt: new Date() }, { new: true });
    res.json({ success: true, data: payout });
  } catch (err) { next(err); }
});

module.exports = payRouter;
