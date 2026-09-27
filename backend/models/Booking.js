import mongoose from 'mongoose'

const bookingSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },

  eventSnapshot: {
   _id: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
   title: { type: String },
   description: { type: String },
   category: { type: String },
   location: { type: String },
   date: { type: Date },
   price: { type: Number },
   currency: { type: String },
   capacity: { type: Number },
   bookedSeats: { type: Number },
   image: { type: String },
   status: { type: String },
  },
  totalPrice: { type: Number, required: true, min: 1 },
  currency: { type: String, enum: ['USD', 'INR'], default: 'USD' },
  status: { type: String, enum: ['pending', 'confirmed', 'cancellation_pending', 'cancelled', 'event_cancelled'], default: 'pending' },
  paymentStatus: { type: String, enum: ['unpaid', 'cash_due', 'paid', 'refunded'], default: 'unpaid' },
  paymentMethod: { type: String, required: true, default: 'cash' },
  paymentExpiresAt: { type: Date, default: null },
  ticketToken: { type: String, required: true, unique: true },
  checkedInAt: { type: Date, default: null },
  reminderOptIn: { type: Boolean, default: true },
  reminderAt: { type: Date, default: null },
  reminderSentAt: { type: Date, default: null },
}, { timestamps: true })

export default mongoose.model('Booking', bookingSchema)
