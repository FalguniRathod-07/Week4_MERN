import express from 'express'
import Booking from '../models/Booking.js'
import Event from '../models/Event.js'
import { adminOnly, protect } from '../middleware/auth.js'

const router = express.Router()
router.use(protect, adminOnly)

router.get('/analytics', async (_req, res) => {
  try {
    const [totals, topEvents, monthly, upcoming, bookingValues] = await Promise.all([
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: null, tickets: { $sum: '$quantity' }, bookings: { $sum: 1 } } },
      ]),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: '$event', bookingValue: { $sum: '$totalPrice' }, tickets: { $sum: '$quantity' }, bookings: { $sum: 1 } } },
        { $sort: { tickets: -1 } }, { $limit: 5 },
        { $lookup: { from: 'events', localField: '_id', foreignField: '_id', as: 'event' } },
        { $unwind: '$event' },
        { $project: { title: '$event.title', currency: '$event.currency', bookingValue: 1, tickets: 1, bookings: 1 } },
      ]),
      Booking.aggregate([
        { $match: { status: 'confirmed' } },
        { $group: { _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } }, tickets: { $sum: '$quantity' }, bookings: { $sum: 1 } } },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Event.find({ status: { $ne: 'cancelled' }, date: { $gte: new Date() } }).sort({ date: 1 }).limit(5).select('title date capacity bookedSeats currency price'),
      Booking.aggregate([
      { $match: { status: 'confirmed' } },
      { $lookup: { from: 'events', localField: 'event', foreignField: '_id', as: 'event' } },
      { $unwind: '$event' },
      { $group: { _id: '$event.currency', bookingValue: { $sum: '$totalPrice' }, tickets: { $sum: '$quantity' } } },
      ]),
    ])
    res.json({ totals: totals[0] || { tickets: 0, bookings: 0 }, bookingValues, topEvents, monthly, upcoming })
  } catch (error) { res.status(500).json({ message: error.message }) }
})

export default router