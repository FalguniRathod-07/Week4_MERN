import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import morgan from 'morgan'
import mongoose from 'mongoose'
import path from 'path'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import eventRoutes from './routes/events.js'
import bookingRoutes from './routes/bookings.js'
import reviewRoutes from './routes/reviews.js'
import adminRoutes from './routes/admin.js'
import { startReminderScheduler } from './reminders.js'

const app = express()
const port = process.env.PORT || 5000
const root = path.dirname(fileURLToPath(import.meta.url))
const allowedOrigins = new Set([
  process.env.CLIENT_URL,
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
])
app.use(cors({ origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)) }))
app.use(express.json())
app.use(morgan('dev'))
app.use('/uploads', express.static(path.join(root, 'uploads')))
app.get('/api/health', (_, res) => res.json({ status: 'ok' }))
app.use('/api/auth', authRoutes)
app.use('/api/events', eventRoutes)
app.use('/api/bookings', bookingRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/admin', adminRoutes)
app.use((error, _req, res, _next) => res.status(500).json({ message: error.message || 'Server error' }))

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/event-booking')
  .then(() => {
    startReminderScheduler()
    app.listen(port, () => console.log(`API running on http://localhost:${port}`))
  })
  .catch((error) => { console.error('MongoDB connection failed:', error.message); process.exit(1) })
