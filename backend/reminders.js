import nodemailer from 'nodemailer'
import Booking from './models/Booking.js'
import Event from './models/Event.js'

const configured = process.env.SMTP_HOST && process.env.SMTP_FROM
const transporter = configured ? nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',
  auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
}) : null

export function startReminderScheduler() {
  const releaseExpiredReservations = async () => {
    const expired = await Booking.find({
      status: 'pending', paymentStatus: 'unpaid', paymentExpiresAt: { $lte: new Date() },
    }).select('_id event quantity')
    for (const booking of expired) {
      const released = await Booking.findOneAndUpdate(
        { _id: booking._id, status: 'pending', paymentStatus: 'unpaid' },
        { $set: { status: 'cancelled' } },
        { new: true },
      )
      if (released) await Event.updateOne({ _id: booking.event }, { $inc: { bookedSeats: -booking.quantity } })
    }
  }
  setInterval(() => releaseExpiredReservations().catch((error) => console.error('Reservation cleanup failed:', error.message)), 60 * 1000)
  if (!transporter) {
    console.log('Event reminders disabled: configure SMTP_HOST and SMTP_FROM to enable email delivery')
    return
  }
  const sendDueReminders = async () => {
    const now = new Date()
    await releaseExpiredReservations()
    const bookings = await Booking.find({
      status: 'confirmed', paymentStatus: { $in: ['paid', 'cash_due'] }, reminderOptIn: true,
      reminderSentAt: null, reminderAt: { $lte: now },
    }).populate('event user')
    for (const booking of bookings) {
      if (!booking.event || booking.event.date <= now) continue
      try {
        await transporter.sendMail({
          from: process.env.SMTP_FROM,
          to: booking.user.email,
          subject: `Tomorrow: ${booking.event.title}`,
          text: `A reminder that ${booking.event.title} is coming up on ${new Date(booking.event.date).toLocaleString()} at ${booking.event.location}. Your booking includes ${booking.quantity} ticket(s).`,
        })
        booking.reminderSentAt = now
        await booking.save()
      } catch (error) { console.error(`Could not send reminder for booking ${booking.id}:`, error.message) }
    }
  }
  sendDueReminders().catch((error) => console.error('Reminder scheduler failed:', error.message))
  setInterval(() => sendDueReminders().catch((error) => console.error('Reminder scheduler failed:', error.message)), 10 * 60 * 1000)
}