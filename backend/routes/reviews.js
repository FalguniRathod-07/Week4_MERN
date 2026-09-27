import express from 'express'
import Booking from '../models/Booking.js'
import Event from '../models/Event.js'
import Review from '../models/Review.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

router.get('/:eventId', async (req, res) => {
  try {
    const event = await Event.findById(req.params.eventId)
    if (!event) return res.status(404).json({ message: 'Event not found' })
    if (event.status === 'cancelled') return res.status(400).json({ message: 'This event was cancelled by the organizer' })
    const reviews = await Review.find({ event: req.params.eventId }).populate('user', 'name').sort({ createdAt: -1 })
    const summary = await Review.aggregate([
      { $match: { event: event._id } },
      { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
    ])
    res.json({ reviews, average: summary[0]?.average || 0, count: summary[0]?.count || 0 })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.post('/:eventId', protect, async (req, res) => {
  try {
    const { rating, comment = '' } = req.body
    if (!Number.isInteger(Number(rating)) || Number(rating) < 1 || Number(rating) > 5) {
      return res.status(400).json({ message: 'Rating must be between 1 and 5' })
    }
    const event = await Event.findById(req.params.eventId)
    if (!event) return res.status(404).json({ message: 'Event not found' })
    if (event.date > new Date()) return res.status(403).json({ message: 'Reviews can be submitted after the event' })
    const eligible = await Booking.exists({ user: req.user._id, event: event._id, status: 'confirmed' })
    if (!eligible) return res.status(403).json({ message: 'A confirmed booking is required to review this event' })
    const review = await Review.findOneAndUpdate(
      { event: event._id, user: req.user._id },
      { rating: Number(rating), comment },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
    ).populate('user', 'name')
    res.status(201).json(review)
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ message: error.code === 11000 ? 'You already reviewed this event' : error.message })
  }
})

export default router