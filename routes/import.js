const express = require('express');
const router = express.Router();
const { requireManagerOrAdmin } = require('../middleware/roles');
const { uploadLeadsCsv } = require('../middleware/upload');
const importController = require('../controllers/importController');

router.get('/history', requireManagerOrAdmin, importController.getHistory);
router.post('/leads/upload', requireManagerOrAdmin, uploadLeadsCsv, importController.uploadLeadsCsv);
router.post('/leads', requireManagerOrAdmin, importController.importLeadsBody);

module.exports = router;
