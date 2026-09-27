import mongoose from 'mongoose'

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true },
  category: { type: String, required: true, trim: true },
  location: { type: String, required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['scheduled', 'cancelled'], default: 'scheduled' },
  cancelledAt: { type: Date, default: null },
  price: { type: Number, required: true, min: 0 },
  currency: { type: String, enum: ['USD', 'INR'], default: 'USD' },
  capacity: { type: Number, required: true, min: 1 },
  bookedSeats: { type: Number, default: 0 },
  image: { type: String, default: '' },
}, { timestamps: true })

export default mongoose.model('Event', eventSchema)
