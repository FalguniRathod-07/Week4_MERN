import express from 'express'
import multer from 'multer'
import path from 'path'
import { fileURLToPath } from 'url'
import Event from '../models/Event.js'
import Booking from '../models/Booking.js'
import { adminOnly, protect } from '../middleware/auth.js'

const router = express.Router()
const uploadDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'uploads')
const storage = multer.diskStorage({ destination: uploadDir, filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9.]/gi, '-')}`) })
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } })

router.get('/', async (req, res) => {
  try {
    const { search, category, date } = req.query
    const query = { status: { $ne: 'cancelled' } }
    if (search) query.$or = [{ title: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }, { location: new RegExp(search, 'i') }]
    if (category) query.category = category
    if (date === 'upcoming') query.date = { $gte: new Date() }
    res.json(await Event.find(query).sort({ date: 1 }))
  } catch (error) { res.status(500).json({ message: error.message }) }
})

router.get('/admin', protect, adminOnly, async (_req, res) => {
  try { res.json(await Event.find().sort({ date: 1 })) }
  catch (error) { res.status(500).json({ message: error.message }) }
})

router.get('/:id/cancellation-impact', protect, adminOnly, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id).select('status')
    if (!event) return res.status(404).json({ message: 'Event not found' })
    const affectedBookings = await Booking.countDocuments({
      event: event._id,
      status: { $ne: 'event_cancelled' },
    })
    res.json({ affectedBookings, alreadyCancelled: event.status === 'cancelled' })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.post('/:id/cancel', protect, adminOnly, async (req, res) => {
  try {
    const event = await Event.findOneAndUpdate(
      { _id: req.params.id, status: { $ne: 'cancelled' } },
      { $set: { status: 'cancelled', cancelledAt: new Date() } },
      { new: true },
    )
    if (!event) {
      const existingEvent = await Event.findById(req.params.id)
      if (!existingEvent) return res.status(404).json({ message: 'Event not found' })
      return res.status(409).json({ message: 'Event is already cancelled' })
    }
    const result = await Booking.updateMany(
      { event: event._id, status: { $ne: 'event_cancelled' } },
      { $set: { status: 'event_cancelled' } },
    )
    res.json({ event, affectedBookings: result.modifiedCount })
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.get('/:id', async (req, res) => {
  try { const event = await Event.findById(req.params.id); if (!event || event.status === 'cancelled') return res.status(404).json({ message: 'Event not found' }); res.json(event) }
  catch (error) { res.status(400).json({ message: 'Invalid event id' }) }
})

router.post('/', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body, price: Number(req.body.price), capacity: Number(req.body.capacity) }
    delete data.status
    delete data.cancelledAt
    if (req.file) data.image = `/uploads/${req.file.filename}`
    res.status(201).json(await Event.create(data))
  } catch (error) { res.status(400).json({ message: error.message }) }
})

router.put('/:id', protect, adminOnly, upload.single('image'), async (req, res) => {
  try {
    const data = { ...req.body, price: Number(req.body.price), capacity: Number(req.body.capacity) }
    delete data.status
    delete data.cancelledAt
    if (req.file) data.image = `/uploads/${req.file.filename}`
    const event = await Event.findByIdAndUpdate(req.params.id, data, { new: true, runValidators: true })
    if (!event) return res.status(404).json({ message: 'Event not found' })
    res.json(event)
  } catch (error) { res.status(400).json({ message: error.message }) }
})

export default router
