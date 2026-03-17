const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { JWT_SECRET } = require('../middleware/auth');

/** POST /api/auth/login — body: { email, password } */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select('+password');
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    const token = jwt.sign(
      { userId: user._id.toString(), role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    const userJson = user.toJSON();
    const profilePhotoUrl = user.profilePhoto
      ? `/api/uploads/profiles/${user.profilePhoto}`
      : null;
    res.json({
      token,
      user: {
        id: userJson.id,
        name: userJson.name,
        email: userJson.email,
        role: userJson.role,
        initials: userJson.initials,
        department: userJson.department,
        profilePhotoUrl,
        viewAll: userJson.viewAll,
        delete: userJson.delete,
        export: userJson.export,
        admin: userJson.admin,
        bulkImport: userJson.bulkImport,
        viewReports: userJson.viewReports,
        modules: userJson.modules,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Login failed' });
  }
});

module.exports = router;
