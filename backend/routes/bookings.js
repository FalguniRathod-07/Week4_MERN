import express from 'express'
import { randomUUID } from 'crypto'
import Booking from '../models/Booking.js'
import Event from '../models/Event.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

function getCancellationEligibility(booking, now = new Date()) {
  if (booking.status !== 'confirmed') return { canCancel: false, cancelReason: 'Only confirmed bookings can be cancelled' }
  if (!booking.event?.date) return { canCancel: false, cancelReason: 'The event date is unavailable' }
  const eventDate = new Date(booking.event.date)
  if (eventDate < now) return { canCancel: false, cancelReason: 'This event has already ended.' }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const eventDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate())
  if (eventDay.getTime() === today.getTime()) {
    return { canCancel: false, cancelReason: 'Cancellation is unavailable because the event is today.' }
  }
  if (eventDate.getTime() - now.getTime() <= 7 * 24 * 60 * 60 * 1000) {
    return { canCancel: false, cancelReason: 'Cancellation is unavailable because the event is within 7 days.' }
  }
  return { canCancel: true, cancelReason: '' }
}

router.get('/mine', protect, async (req, res) => {
  const bookings = await Booking.find({ user: req.user._id, status: { $ne: 'cancelled' } }).populate('event').sort({ createdAt: -1 })
  const now = new Date()
  res.json(bookings.map((booking) => {
    const bookingData = booking.toObject()
    if (!bookingData.event && bookingData.eventSnapshot) bookingData.event = bookingData.eventSnapshot
    return { ...bookingData, ...getCancellationEligibility({ ...bookingData, event: bookingData.event }, now) }
  }))
})
router.get('/all', protect, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' })
  res.json(await Booking.find().populate('event user').sort({ createdAt: -1 }))
})
router.post('/', protect, async (req, res) => {
  try {
    const { eventId, quantity } = req.body
    const count = Number(quantity)
    if (req.body.paymentMethod && req.body.paymentMethod !== 'cash') {
      return res.status(400).json({ message: 'Only cash at the venue is available' })
    }
    const event = await Event.findById(eventId)
    if (!event) return res.status(404).json({ message: 'Event not found' })
    if (event.status === 'cancelled') return res.status(409).json({ message: 'This event was cancelled by the organizer' })
    if (!Number.isInteger(count) || count < 1) return res.status(400).json({ message: 'Choose at least one ticket' })
    const reservation = await Event.updateOne(
      { _id: event._id, status: { $ne: 'cancelled' }, $expr: { $lte: [{ $add: ['$bookedSeats', count] }, '$capacity'] } },
      { $inc: { bookedSeats: count } },
    )
    if (!reservation.modifiedCount) return res.status(400).json({ message: 'Not enough tickets available' })
    let booking
    try {
      booking = await Booking.create({
        user: req.user._id,
        event: event._id,
        eventSnapshot: {
          _id: event._id,
          title: event.title,
          description: event.description,
          category: event.category,
          location: event.location,
          date: event.date,
          price: event.price,
          currency: event.currency,
          capacity: event.capacity,
          bookedSeats: event.bookedSeats + count,
          image: event.image,
          status: event.status,
        },
        quantity: count,
        totalPrice: event.price * count,
        currency: event.currency,
        status: 'confirmed',
        paymentStatus: 'cash_due',
        paymentMethod: 'cash',
        paymentExpiresAt: null,
        ticketToken: randomUUID(),
        reminderOptIn: req.body.reminderOptIn !== false,
        reminderAt: new Date(new Date(event.date).getTime() - 24 * 60 * 60 * 1000),
      })
      const eventStillActive = await Event.exists({ _id: event._id, status: { $ne: 'cancelled' } })
      if (!eventStillActive) {
        await Booking.updateOne({ _id: booking._id }, { $set: { status: 'event_cancelled' } })
        return res.status(409).json({ message: 'This event was cancelled by the organizer' })
      }
      res.status(201).json({ paymentMethod: 'cash', booking: await booking.populate('event') })
    } catch (error) {
      if (booking) await Booking.deleteOne({ _id: booking._id })
      await Event.updateOne({ _id: event._id }, { $inc: { bookedSeats: -count } })
      throw error
    }
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.post('/:bookingId/cancel', protect, async (req, res) => {
  try {
    const booking = await Booking.findOne({ _id: req.params.bookingId, user: req.user._id, status: 'confirmed' }).populate('event')
    if (!booking) return res.status(404).json({ message: 'Confirmed booking not found' })
    const eligibility = getCancellationEligibility(booking)
    if (!eligibility.canCancel) return res.status(400).json({ message: eligibility.cancelReason })
    const locked = await Booking.findOneAndUpdate(
      { _id: booking._id, user: req.user._id, status: 'confirmed' },
      { $set: { status: 'cancellation_pending' } },
      { new: true },
    )
    if (!locked) return res.status(409).json({ message: 'This booking is already being changed' })

    const cancelled = await Booking.findOneAndUpdate(
      { _id: locked._id, status: 'cancellation_pending' },
      { $set: { status: 'cancelled' } },
      { new: true },
    )
    if (booking.event) await Event.updateOne({ _id: booking.event._id }, { $inc: { bookedSeats: -booking.quantity } })
    res.json({ booking: cancelled, message: 'Booking cancelled' })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.get('/check-in/:token', protect, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' })
  try {
    const booking = await Booking.findOne({ ticketToken: req.params.token }).populate('event user')
    if (!booking) return res.status(404).json({ message: 'Ticket not found' })
    if (booking.status === 'event_cancelled' || booking.event?.status === 'cancelled') {
      return res.status(400).json({ message: 'This event was cancelled by the organizer' })
    }
    if (booking.status !== 'confirmed') return res.status(400).json({ message: 'Ticket is not valid for entry' })
    if (booking.checkedInAt) return res.status(409).json({ message: 'Ticket has already been used' })
    res.json({ booking })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.post('/check-in/:token', protect, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Admin access required' })
  try {
    const booking = await Booking.findOne({ ticketToken: req.params.token }).populate('event user')
    if (!booking) return res.status(404).json({ message: 'Ticket not found' })
    if (booking.status === 'event_cancelled' || booking.event?.status === 'cancelled') {
      return res.status(400).json({ message: 'This event was cancelled by the organizer' })
    }
    if (booking.status !== 'confirmed') return res.status(400).json({ message: 'Ticket is not valid for entry' })
    if (booking.checkedInAt) return res.status(409).json({ message: 'Ticket has already been used' })
    const checkedIn = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'confirmed', checkedInAt: null },
      { $set: { checkedInAt: new Date() } },
      { new: true },
    ).populate('event user')
    if (!checkedIn) return res.status(409).json({ message: 'Ticket has already been used' })
    res.json({ message: 'Ticket checked in successfully.', booking: checkedIn })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

export default router
