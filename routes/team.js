const express = require('express');
const router = express.Router();
const { requireManagerOrAdmin } = require('../middleware/roles');
const adminController = require('../controllers/adminController');

/** GET /api/v1/team/users — list users for assignment (Manager or Admin). Returns id, name, email. */
router.get('/users', requireManagerOrAdmin, adminController.listUsers);

module.exports = router;
