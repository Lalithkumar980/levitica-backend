const express = require('express');
const router = express.Router();
const { adminOnly } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(adminOnly);

router.get('/users', adminController.listUsers);
router.put('/users/:id/role', adminController.updateUserRole);
router.get('/users/:id/stats', adminController.getUserStats);

module.exports = router;
