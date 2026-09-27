import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import User from '../models/User.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()
const signToken = (user) => jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' })
const publicUser = (user) => ({ id: user._id, name: user.name, email: user.email, role: user.role })

router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ message: 'Name, email, and password are required' })
    if (password.length < 6) return res.status(400).json({ message: 'Password must be at least 6 characters' })
    if (await User.findOne({ email })) return res.status(409).json({ message: 'An account with that email already exists' })
    const user = await User.create({ name, email, password: await bcrypt.hash(password, 10) })
    res.status(201).json({ token: signToken(user), user: publicUser(user) })
  } catch (error) { res.status(500).json({ message: error.message }) }
})

router.post('/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email })
    if (!user || !(await bcrypt.compare(req.body.password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password' })
    res.json({ token: signToken(user), user: publicUser(user) })
  } catch (error) { res.status(500).json({ message: error.message }) }
})

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }))

export default router
