const express = require('express');
const router = express.Router();
const financeReportController = require('../controllers/financeReportController');

router.get('/dashboard', financeReportController.dashboard);
router.get('/pl', financeReportController.plReport);

module.exports = router;
