const express = require('express');
const router = express.Router();
const { requireManagerOrAdmin } = require('../middleware/roles');
const reportController = require('../controllers/reportController');

router.get('/dashboard', reportController.dashboard);
router.get('/pipeline', reportController.pipeline);
router.get('/rep-performance', requireManagerOrAdmin, reportController.repPerformance);
router.get('/forecast', requireManagerOrAdmin, reportController.forecast);
router.get('/leads-by-source', reportController.leadsBySource);
router.get('/activities', reportController.activities);

module.exports = router;
