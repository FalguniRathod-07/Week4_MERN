import 'dotenv/config'
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import User from './models/User.js'
import Event from './models/Event.js'

await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/event-booking')
const password = await bcrypt.hash('admin123', 10)
await User.findOneAndUpdate(
  { email: 'admin@eventbird.local' },
  { name: 'Eventbird Admin', email: 'admin@eventbird.local', password, role: 'admin' },
  { upsert: true, new: true, setDefaultsOnInsert: true },
)
if (!await Event.countDocuments()) {
  await Event.insertMany([
    { title: 'Afterglow: An Evening of Live Music', description: 'A warm, late-night set from the city\'s most exciting new voices.', category: 'Music', location: 'The Lantern Room', date: new Date('2026-11-14T19:30:00'), price: 38, capacity: 120 },
    { title: 'Clay, Coffee & Quiet Morning', description: 'A hands-on ceramics workshop for curious beginners, with coffee included.', category: 'Workshop', location: 'Northside Studio', date: new Date('2026-10-18T10:00:00'), price: 54, capacity: 16 },
    { title: 'Golden Hour Kayak Club', description: 'A relaxed paddle along the river as the city turns gold.', category: 'Outdoors', location: 'Riverside Launch', date: new Date('2026-10-25T17:00:00'), price: 42, capacity: 24 },
  ])
}
console.log('Seed complete. Admin login: admin@eventbird.local / admin123')
await mongoose.disconnect()
